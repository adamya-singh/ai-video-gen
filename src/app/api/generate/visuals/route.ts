import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateImage, base64ToBlob } from '@/lib/ai/image-service'
import { generateVideo, downloadVideoFromUri } from '@/lib/ai/video-service'
import { z } from 'zod'

const requestSchema = z.object({
  projectId: z.string().uuid(),
  sceneId: z.string().uuid().optional(), // If provided, regenerate only this scene
})

// Retry configuration
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 2000

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retries: number = MAX_RETRIES
): Promise<T> {
  let lastError: Error | undefined
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (attempt < retries - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, RETRY_DELAY_MS * Math.pow(2, attempt))
        )
      }
    }
  }
  throw lastError
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { projectId, sceneId } = requestSchema.parse(body)

    // Verify project ownership
    const { data: project } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single()

    if (!project || project.user_id !== user.id) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Get shot list directly (more reliable than join)
    const { data: shotList } = await supabase
      .from('shot_lists')
      .select('*')
      .eq('project_id', projectId)
      .single()

    if (!shotList) {
      return NextResponse.json({ error: 'Shot list not found' }, { status: 404 })
    }

    // Get scenes to process
    let scenesQuery = supabase
      .from('scenes')
      .select('*')
      .eq('shot_list_id', shotList.id)
      .order('order_index')

    if (sceneId) {
      scenesQuery = scenesQuery.eq('id', sceneId)
    }

    const { data: scenes } = await scenesQuery

    if (!scenes || scenes.length === 0) {
      return NextResponse.json({ error: 'No scenes found' }, { status: 404 })
    }

    const results = []
    let referenceImageBase64: string | undefined

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i]

      // Update status to generating
      await supabase.from('scenes').update({ status: 'generating' }).eq('id', scene.id)

      try {
        // Generate image using Gemini 2.5 Flash Image
        const imageResult = await retryWithBackoff(async () => {
          return generateImage(
            scene.image_prompt || `Documentary scene ${i + 1}`,
            i === 0 ? undefined : referenceImageBase64 // Use first image as reference for consistency
          )
        })

        if (!imageResult.success || !imageResult.imageData) {
          await supabase.from('scenes').update({ status: 'failed' }).eq('id', scene.id)
          results.push({
            sceneId: scene.id,
            success: false,
            error: imageResult.error || 'Image generation failed',
          })
          continue
        }

        // Store first image as reference for subsequent generations
        if (i === 0) {
          referenceImageBase64 = imageResult.imageData.base64
        }

        // Upload image to Supabase Storage
        const imageBlob = base64ToBlob(
          imageResult.imageData.base64,
          imageResult.imageData.mimeType
        )
        const imageFileName = `${user.id}/${projectId}/images/scene_${String(i + 1).padStart(2, '0')}.png`

        const { error: imageUploadError } = await supabase.storage
          .from('assets')
          .upload(imageFileName, imageBlob, {
            contentType: imageResult.imageData.mimeType,
            upsert: true,
          })

        if (imageUploadError) {
          console.error('Image upload error:', imageUploadError)
          await supabase.from('scenes').update({ status: 'failed' }).eq('id', scene.id)
          results.push({
            sceneId: scene.id,
            success: false,
            error: `Image upload failed: ${imageUploadError.message}`,
          })
          continue
        }

        // Get public URL for the uploaded image
        const {
          data: { publicUrl: imageUrl },
        } = supabase.storage.from('assets').getPublicUrl(imageFileName)

        // Create/update image asset in database
        await supabase.from('assets').upsert(
          {
            scene_id: scene.id,
            type: 'image',
            storage_path: imageUrl,
            status: 'complete',
            generation_metadata: {
              prompt: scene.image_prompt,
              model: 'gemini-2.5-flash-preview-image-generation',
            },
          },
          {
            onConflict: 'scene_id,type',
            ignoreDuplicates: false,
          }
        )

        // Generate video from the image using Veo 3.1 Fast
        const videoPrompt = scene.video_prompt || 
          `${scene.motion_type || 'subtle'} camera movement: ${scene.image_prompt}`

        const videoResult = await retryWithBackoff(async () => {
          return generateVideo(
            videoPrompt,
            imageResult.imageData!.base64,
            scene.duration_seconds || 5
          )
        })

        if (!videoResult.success || !videoResult.videoUri) {
          await supabase.from('scenes').update({ status: 'failed' }).eq('id', scene.id)
          results.push({
            sceneId: scene.id,
            success: false,
            error: videoResult.error || 'Video generation failed',
            imageUrl: imageUrl,
          })
          continue
        }

        // Download the video from GCS
        const videoDownload = await downloadVideoFromUri(videoResult.videoUri)
        if (!videoDownload.success || !videoDownload.videoBuffer) {
          await supabase.from('scenes').update({ status: 'failed' }).eq('id', scene.id)
          results.push({
            sceneId: scene.id,
            success: false,
            error: videoDownload.error || 'Video download failed',
            imageUrl: imageUrl,
          })
          continue
        }

        // Upload video to Supabase Storage
        const videoFileName = `${user.id}/${projectId}/video/scene_${String(i + 1).padStart(2, '0')}.mp4`

        const { error: videoUploadError } = await supabase.storage
          .from('assets')
          .upload(videoFileName, videoDownload.videoBuffer, {
            contentType: 'video/mp4',
            upsert: true,
          })

        if (videoUploadError) {
          console.error('Video upload error:', videoUploadError)
          await supabase.from('scenes').update({ status: 'failed' }).eq('id', scene.id)
          results.push({
            sceneId: scene.id,
            success: false,
            error: `Video upload failed: ${videoUploadError.message}`,
            imageUrl: imageUrl,
          })
          continue
        }

        // Get public URL for the uploaded video
        const {
          data: { publicUrl: videoUrl },
        } = supabase.storage.from('assets').getPublicUrl(videoFileName)

        // Create/update video asset in database
        await supabase.from('assets').upsert(
          {
            scene_id: scene.id,
            type: 'video',
            storage_path: videoUrl,
            status: 'complete',
            generation_metadata: {
              prompt: videoPrompt,
              motion_type: scene.motion_type,
              model: 'veo-3.0-generate-preview',
              duration_seconds: scene.duration_seconds || 5,
            },
          },
          {
            onConflict: 'scene_id,type',
            ignoreDuplicates: false,
          }
        )

        // Update scene status to complete
        await supabase.from('scenes').update({ status: 'complete' }).eq('id', scene.id)

        results.push({
          sceneId: scene.id,
          success: true,
          imageUrl: imageUrl,
          videoUrl: videoUrl,
        })
      } catch (error) {
        console.error(`Error processing scene ${scene.id}:`, error)
        await supabase.from('scenes').update({ status: 'failed' }).eq('id', scene.id)
        results.push({
          sceneId: scene.id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    return NextResponse.json({ results })
  } catch (error) {
    console.error('Visual generation error:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Generation failed' },
      { status: 500 }
    )
  }
}
