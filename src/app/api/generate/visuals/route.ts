import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { mockGenerateImage, mockGenerateVideo } from '@/lib/ai/mock-services'
import { z } from 'zod'

const requestSchema = z.object({
  projectId: z.string().uuid(),
  sceneId: z.string().uuid().optional(), // If provided, regenerate only this scene
})

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

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

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i]

      // Update status to generating
      await supabase
        .from('scenes')
        .update({ status: 'generating' })
        .eq('id', scene.id)

      // Generate image
      const imageResult = await mockGenerateImage(scene.image_prompt || '', i)
      
      if (!imageResult.success) {
        await supabase
          .from('scenes')
          .update({ status: 'failed' })
          .eq('id', scene.id)

        results.push({
          sceneId: scene.id,
          success: false,
          error: imageResult.error,
        })
        continue
      }

      // Create/update image asset
      await supabase
        .from('assets')
        .upsert({
          scene_id: scene.id,
          type: 'image',
          storage_path: imageResult.url,
          status: 'complete',
          generation_metadata: { prompt: scene.image_prompt, mock: true },
        }, {
          onConflict: 'scene_id,type',
          ignoreDuplicates: false,
        })

      // Generate video from image
      const videoResult = await mockGenerateVideo(imageResult.url!, scene.motion_type || 'ken_burns')

      if (!videoResult.success) {
        await supabase
          .from('scenes')
          .update({ status: 'failed' })
          .eq('id', scene.id)

        results.push({
          sceneId: scene.id,
          success: false,
          error: videoResult.error,
          imageUrl: imageResult.url,
        })
        continue
      }

      // Create/update video asset
      await supabase
        .from('assets')
        .upsert({
          scene_id: scene.id,
          type: 'video',
          storage_path: videoResult.url,
          status: 'complete',
          generation_metadata: { motion_type: scene.motion_type, mock: true },
        }, {
          onConflict: 'scene_id,type',
          ignoreDuplicates: false,
        })

      // Update scene status
      await supabase
        .from('scenes')
        .update({ status: 'complete' })
        .eq('id', scene.id)

      results.push({
        sceneId: scene.id,
        success: true,
        imageUrl: imageResult.url,
        videoUrl: videoResult.url,
      })
    }

    return NextResponse.json({ results })
  } catch (error) {
    console.error('Visual generation error:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Generation failed' },
      { status: 500 }
    )
  }
}

