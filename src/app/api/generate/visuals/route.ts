import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateImage, base64ToBlob } from '@/lib/ai/image-service'
import { generateVideo } from '@/lib/ai/video-service'
import { z } from 'zod'

const requestSchema = z.object({
  projectId: z.string().uuid(),
  sceneId: z.string().uuid().optional(), // If provided, regenerate only this scene
  phase: z.enum(['first_image', 'remaining_images', 'first_video', 'remaining_videos']),
  videoStyle: z.string().optional(), // Required for video phases
  imagePrompt: z.string().optional(), // Optional prompt override for regeneration
  videoPrompt: z.string().optional(), // Optional prompt override for regeneration
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

/**
 * Fetch the first scene's image as base64 for use as style reference
 */
async function getFirstImageBase64(
  supabase: Awaited<ReturnType<typeof createClient>>,
  shotListId: string
): Promise<string | null> {
  // Get the first scene
  const { data: firstScene } = await supabase
    .from('scenes')
    .select('id')
    .eq('shot_list_id', shotListId)
    .order('order_index')
    .limit(1)
    .single()

  if (!firstScene) return null

  // Get the image asset for the first scene
  const { data: imageAsset } = await supabase
    .from('assets')
    .select('storage_path')
    .eq('scene_id', firstScene.id)
    .eq('type', 'image')
    .eq('status', 'complete')
    .single()

  if (!imageAsset?.storage_path) return null

  // Fetch the image and convert to base64
  try {
    const response = await fetch(imageAsset.storage_path)
    if (!response.ok) return null
    const arrayBuffer = await response.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')
    return base64
  } catch (error) {
    console.error('Failed to fetch first image:', error)
    return null
  }
}

/**
 * Get the image base64 for a specific scene
 */
async function getSceneImageBase64(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sceneId: string
): Promise<string | null> {
  const { data: imageAsset } = await supabase
    .from('assets')
    .select('storage_path')
    .eq('scene_id', sceneId)
    .eq('type', 'image')
    .eq('status', 'complete')
    .single()

  if (!imageAsset?.storage_path) return null

  try {
    const response = await fetch(imageAsset.storage_path)
    if (!response.ok) return null
    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer).toString('base64')
  } catch (error) {
    console.error('Failed to fetch scene image:', error)
    return null
  }
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
    const { projectId, sceneId, phase, videoStyle, imagePrompt, videoPrompt } = requestSchema.parse(body)

    // Verify project ownership
    const { data: project } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single()

    if (!project || project.user_id !== user.id) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Get shot list
    const { data: shotList } = await supabase
      .from('shot_lists')
      .select('*')
      .eq('project_id', projectId)
      .single()

    if (!shotList) {
      return NextResponse.json({ error: 'Shot list not found' }, { status: 404 })
    }

    // Get all scenes ordered by index
    const { data: allScenes } = await supabase
      .from('scenes')
      .select('*')
      .eq('shot_list_id', shotList.id)
      .order('order_index')

    if (!allScenes || allScenes.length === 0) {
      return NextResponse.json({ error: 'No scenes found' }, { status: 404 })
    }

    const results = []

    // Handle different phases
    switch (phase) {
      case 'first_image': {
        // Generate only the first scene's image (no reference)
        const firstScene = allScenes[0]
        const targetScene = sceneId ? allScenes.find(s => s.id === sceneId) : firstScene
        
        if (!targetScene) {
          return NextResponse.json({ error: 'Scene not found' }, { status: 404 })
        }

        // For first_image phase, only allow scene 1 or explicit regeneration
        if (!sceneId && targetScene.order_index !== 1) {
          return NextResponse.json({ error: 'First image phase only supports scene 1' }, { status: 400 })
        }

        await supabase.from('scenes').update({ status: 'generating' }).eq('id', targetScene.id)

        try {
          const prompt = imagePrompt || targetScene.image_prompt || `Documentary scene 1`
          
          // Update the scene's image_prompt if a new one was provided
          if (imagePrompt) {
            await supabase.from('scenes').update({ image_prompt: imagePrompt }).eq('id', targetScene.id)
          }

          const imageResult = await retryWithBackoff(async () => {
            return generateImage(prompt)
          })

          if (!imageResult.success || !imageResult.imageData) {
            await supabase.from('scenes').update({ status: 'failed' }).eq('id', targetScene.id)
            return NextResponse.json({
              results: [{
                sceneId: targetScene.id,
                success: false,
                error: imageResult.error || 'Image generation failed',
              }]
            })
          }

          // Upload image to Supabase Storage
          const imageBlob = base64ToBlob(
            imageResult.imageData.base64,
            imageResult.imageData.mimeType
          )
          const imageFileName = `${user.id}/${projectId}/images/scene_01.png`

          const { error: imageUploadError } = await supabase.storage
            .from('assets')
            .upload(imageFileName, imageBlob, {
              contentType: imageResult.imageData.mimeType,
              upsert: true,
            })

          if (imageUploadError) {
            console.error('Image upload error:', imageUploadError)
            await supabase.from('scenes').update({ status: 'failed' }).eq('id', targetScene.id)
            return NextResponse.json({
              results: [{
                sceneId: targetScene.id,
                success: false,
                error: `Image upload failed: ${imageUploadError.message}`,
              }]
            })
          }

          const { data: { publicUrl: imageUrl } } = supabase.storage.from('assets').getPublicUrl(imageFileName)

          await supabase.from('assets').upsert(
            {
              scene_id: targetScene.id,
              type: 'image',
              storage_path: imageUrl,
              status: 'complete',
              generation_metadata: {
                prompt: prompt,
                model: 'gemini-2.5-flash-image',
                phase: 'first_image',
              },
            },
            { onConflict: 'scene_id,type', ignoreDuplicates: false }
          )

          // Mark scene as image_complete (not fully complete since no video yet)
          await supabase.from('scenes').update({ status: 'image_complete' }).eq('id', targetScene.id)

          results.push({
            sceneId: targetScene.id,
            success: true,
            imageUrl: imageUrl,
          })
        } catch (error) {
          console.error(`Error generating first image:`, error)
          await supabase.from('scenes').update({ status: 'failed' }).eq('id', targetScene.id)
          results.push({
            sceneId: targetScene.id,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
        break
      }

      case 'remaining_images': {
        // Generate images for all scenes except the first (or regenerate a specific scene)
        const referenceImageBase64 = await getFirstImageBase64(supabase, shotList.id)
        
        if (!referenceImageBase64) {
          return NextResponse.json({ error: 'First image not found. Please generate and confirm the first image first.' }, { status: 400 })
        }

        // If regenerating a specific scene, only process that one
        const scenesToProcess = sceneId 
          ? allScenes.filter(s => s.id === sceneId)
          : allScenes.filter(s => s.order_index > 1)

        for (const scene of scenesToProcess) {
          await supabase.from('scenes').update({ status: 'generating' }).eq('id', scene.id)

          try {
            const prompt = (sceneId && imagePrompt) 
              ? imagePrompt 
              : scene.image_prompt || `Documentary scene ${scene.order_index}`

            // Update the scene's image_prompt if a new one was provided
            if (sceneId && imagePrompt) {
              await supabase.from('scenes').update({ image_prompt: imagePrompt }).eq('id', scene.id)
            }

            const imageResult = await retryWithBackoff(async () => {
              return generateImage(prompt, referenceImageBase64)
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

            const imageBlob = base64ToBlob(
              imageResult.imageData.base64,
              imageResult.imageData.mimeType
            )
            const imageFileName = `${user.id}/${projectId}/images/scene_${String(scene.order_index).padStart(2, '0')}.png`

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

            const { data: { publicUrl: imageUrl } } = supabase.storage.from('assets').getPublicUrl(imageFileName)

            await supabase.from('assets').upsert(
              {
                scene_id: scene.id,
                type: 'image',
                storage_path: imageUrl,
                status: 'complete',
                generation_metadata: {
                  prompt: prompt,
                  model: 'gemini-2.5-flash-image',
                  phase: 'remaining_images',
                  used_reference: true,
                },
              },
              { onConflict: 'scene_id,type', ignoreDuplicates: false }
            )

            await supabase.from('scenes').update({ status: 'image_complete' }).eq('id', scene.id)

            results.push({
              sceneId: scene.id,
              success: true,
              imageUrl: imageUrl,
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
        break
      }

      case 'first_video': {
        // Generate video for the first scene only
        if (!videoStyle) {
          return NextResponse.json({ error: 'videoStyle is required for video generation' }, { status: 400 })
        }

        const firstScene = allScenes[0]
        
        // Get the first scene's image
        const imageBase64 = await getSceneImageBase64(supabase, firstScene.id)
        if (!imageBase64) {
          return NextResponse.json({ error: 'First scene image not found. Please generate and confirm images first.' }, { status: 400 })
        }

        await supabase.from('scenes').update({ status: 'generating' }).eq('id', firstScene.id)

        try {
          const sceneVideoPrompt = videoPrompt || firstScene.video_prompt || ''
          const fullPrompt = `${videoStyle}. ${sceneVideoPrompt}`.trim()

          // Update the scene's video_prompt if a new one was provided
          if (videoPrompt) {
            await supabase.from('scenes').update({ video_prompt: videoPrompt }).eq('id', firstScene.id)
          }

          const videoResult = await retryWithBackoff(async () => {
            return generateVideo(fullPrompt, imageBase64, firstScene.duration_seconds || 5)
          })

          if (!videoResult.success || !videoResult.videoBuffer) {
            await supabase.from('scenes').update({ status: 'failed' }).eq('id', firstScene.id)
            return NextResponse.json({
              results: [{
                sceneId: firstScene.id,
                success: false,
                error: videoResult.error || 'Video generation failed',
              }]
            })
          }

          const videoFileName = `${user.id}/${projectId}/video/scene_01.mp4`

          const { error: videoUploadError } = await supabase.storage
            .from('assets')
            .upload(videoFileName, videoResult.videoBuffer, {
              contentType: 'video/mp4',
              upsert: true,
            })

          if (videoUploadError) {
            console.error('Video upload error:', videoUploadError)
            await supabase.from('scenes').update({ status: 'failed' }).eq('id', firstScene.id)
            return NextResponse.json({
              results: [{
                sceneId: firstScene.id,
                success: false,
                error: `Video upload failed: ${videoUploadError.message}`,
              }]
            })
          }

          const { data: { publicUrl: videoUrl } } = supabase.storage.from('assets').getPublicUrl(videoFileName)

          await supabase.from('assets').upsert(
            {
              scene_id: firstScene.id,
              type: 'video',
              storage_path: videoUrl,
              status: 'complete',
              generation_metadata: {
                prompt: fullPrompt,
                video_style: videoStyle,
                model: 'veo-3.0-generate-preview',
                duration_seconds: firstScene.duration_seconds || 5,
                phase: 'first_video',
              },
            },
            { onConflict: 'scene_id,type', ignoreDuplicates: false }
          )

          await supabase.from('scenes').update({ status: 'complete' }).eq('id', firstScene.id)

          results.push({
            sceneId: firstScene.id,
            success: true,
            videoUrl: videoUrl,
          })
        } catch (error) {
          console.error(`Error generating first video:`, error)
          await supabase.from('scenes').update({ status: 'failed' }).eq('id', firstScene.id)
          results.push({
            sceneId: firstScene.id,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
        break
      }

      case 'remaining_videos': {
        // Generate videos for all scenes except the first (or regenerate a specific scene)
        // Use the confirmed video_style from shot_list
        const confirmedVideoStyle = shotList.video_style
        
        if (!confirmedVideoStyle) {
          return NextResponse.json({ error: 'Video style not confirmed. Please generate and confirm the first video first.' }, { status: 400 })
        }

        // If regenerating a specific scene, only process that one
        const scenesToProcess = sceneId 
          ? allScenes.filter(s => s.id === sceneId)
          : allScenes.filter(s => s.order_index > 1)

        for (const scene of scenesToProcess) {
          // Get this scene's image
          const imageBase64 = await getSceneImageBase64(supabase, scene.id)
          if (!imageBase64) {
            results.push({
              sceneId: scene.id,
              success: false,
              error: 'Scene image not found',
            })
            continue
          }

          await supabase.from('scenes').update({ status: 'generating' }).eq('id', scene.id)

          try {
            const sceneVideoPrompt = (sceneId && videoPrompt) 
              ? videoPrompt 
              : scene.video_prompt || ''
            const fullPrompt = `${confirmedVideoStyle}. ${sceneVideoPrompt}`.trim()

            // Update the scene's video_prompt if a new one was provided
            if (sceneId && videoPrompt) {
              await supabase.from('scenes').update({ video_prompt: videoPrompt }).eq('id', scene.id)
            }

            const videoResult = await retryWithBackoff(async () => {
              return generateVideo(fullPrompt, imageBase64, scene.duration_seconds || 5)
            })

            if (!videoResult.success || !videoResult.videoBuffer) {
              await supabase.from('scenes').update({ status: 'failed' }).eq('id', scene.id)
              results.push({
                sceneId: scene.id,
                success: false,
                error: videoResult.error || 'Video generation failed',
              })
              continue
            }

            const videoFileName = `${user.id}/${projectId}/video/scene_${String(scene.order_index).padStart(2, '0')}.mp4`

            const { error: videoUploadError } = await supabase.storage
              .from('assets')
              .upload(videoFileName, videoResult.videoBuffer, {
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
              })
              continue
            }

            const { data: { publicUrl: videoUrl } } = supabase.storage.from('assets').getPublicUrl(videoFileName)

            await supabase.from('assets').upsert(
              {
                scene_id: scene.id,
                type: 'video',
                storage_path: videoUrl,
                status: 'complete',
                generation_metadata: {
                  prompt: fullPrompt,
                  video_style: confirmedVideoStyle,
                  model: 'veo-3.0-generate-preview',
                  duration_seconds: scene.duration_seconds || 5,
                  phase: 'remaining_videos',
                },
              },
              { onConflict: 'scene_id,type', ignoreDuplicates: false }
            )

            await supabase.from('scenes').update({ status: 'complete' }).eq('id', scene.id)

            results.push({
              sceneId: scene.id,
              success: true,
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
        break
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
