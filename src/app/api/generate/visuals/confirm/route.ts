import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const requestSchema = z.object({
  projectId: z.string().uuid(),
  phase: z.enum(['first_image', 'all_images', 'first_video', 'all_videos']),
  videoStyle: z.string().optional(), // Required when confirming first_video
})

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
    const { projectId, phase, videoStyle } = requestSchema.parse(body)

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

    // Get all scenes
    const { data: scenes } = await supabase
      .from('scenes')
      .select('id, order_index')
      .eq('shot_list_id', shotList.id)
      .order('order_index')

    if (!scenes || scenes.length === 0) {
      return NextResponse.json({ error: 'No scenes found' }, { status: 404 })
    }

    // Get all assets for these scenes
    const { data: assets } = await supabase
      .from('assets')
      .select('scene_id, type, status')
      .in('scene_id', scenes.map(s => s.id))

    const now = new Date().toISOString()

    switch (phase) {
      case 'first_image': {
        // Validate: first scene must have a complete image
        const firstScene = scenes.find(s => s.order_index === 1)
        if (!firstScene) {
          return NextResponse.json({ error: 'First scene not found' }, { status: 400 })
        }

        const firstImageComplete = assets?.some(
          a => a.scene_id === firstScene.id && a.type === 'image' && a.status === 'complete'
        )

        if (!firstImageComplete) {
          return NextResponse.json({ error: 'First image is not complete' }, { status: 400 })
        }

        // Update shot_list to mark first image as confirmed
        await supabase
          .from('shot_lists')
          .update({ first_image_confirmed_at: now })
          .eq('id', shotList.id)

        return NextResponse.json({ 
          success: true, 
          message: 'First image confirmed',
          nextPhase: 'remaining_images'
        })
      }

      case 'all_images': {
        // Validate: all scenes must have complete images
        const allImagesComplete = scenes.every(scene =>
          assets?.some(a => a.scene_id === scene.id && a.type === 'image' && a.status === 'complete')
        )

        if (!allImagesComplete) {
          const incomplete = scenes.filter(scene =>
            !assets?.some(a => a.scene_id === scene.id && a.type === 'image' && a.status === 'complete')
          )
          return NextResponse.json({ 
            error: 'Not all images are complete',
            incompleteScenes: incomplete.map(s => s.order_index)
          }, { status: 400 })
        }

        // Update shot_list to mark all images as confirmed
        await supabase
          .from('shot_lists')
          .update({ all_images_confirmed_at: now })
          .eq('id', shotList.id)

        return NextResponse.json({ 
          success: true, 
          message: 'All images confirmed',
          nextPhase: 'first_video'
        })
      }

      case 'first_video': {
        // Validate: videoStyle is required
        if (!videoStyle || videoStyle.trim() === '') {
          return NextResponse.json({ error: 'videoStyle is required' }, { status: 400 })
        }

        // Validate: first scene must have a complete video
        const firstScene = scenes.find(s => s.order_index === 1)
        if (!firstScene) {
          return NextResponse.json({ error: 'First scene not found' }, { status: 400 })
        }

        const firstVideoComplete = assets?.some(
          a => a.scene_id === firstScene.id && a.type === 'video' && a.status === 'complete'
        )

        if (!firstVideoComplete) {
          return NextResponse.json({ error: 'First video is not complete' }, { status: 400 })
        }

        // Update shot_list to mark first video as confirmed and store video_style
        await supabase
          .from('shot_lists')
          .update({ 
            first_video_confirmed_at: now,
            video_style: videoStyle.trim()
          })
          .eq('id', shotList.id)

        return NextResponse.json({ 
          success: true, 
          message: 'First video confirmed',
          nextPhase: 'remaining_videos'
        })
      }

      case 'all_videos': {
        // Validate: all scenes must have complete videos
        const allVideosComplete = scenes.every(scene =>
          assets?.some(a => a.scene_id === scene.id && a.type === 'video' && a.status === 'complete')
        )

        if (!allVideosComplete) {
          const incomplete = scenes.filter(scene =>
            !assets?.some(a => a.scene_id === scene.id && a.type === 'video' && a.status === 'complete')
          )
          return NextResponse.json({ 
            error: 'Not all videos are complete',
            incompleteScenes: incomplete.map(s => s.order_index)
          }, { status: 400 })
        }

        // Mark step 4 as complete and advance to step 5
        await supabase
          .from('projects')
          .update({ current_step: 5 })
          .eq('id', projectId)

        return NextResponse.json({ 
          success: true, 
          message: 'All videos confirmed - Step 4 complete',
          nextStep: 5
        })
      }
    }
  } catch (error) {
    console.error('Confirm error:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Confirmation failed' },
      { status: 500 }
    )
  }
}

/**
 * DELETE endpoint to reset phases (e.g., when regenerating the first image from Phase B)
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const resetTo = searchParams.get('resetTo') // 'first_image' | 'first_video'

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

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

    // Get all scenes
    const { data: scenes } = await supabase
      .from('scenes')
      .select('id, order_index')
      .eq('shot_list_id', shotList.id)
      .order('order_index')

    if (!scenes || scenes.length === 0) {
      return NextResponse.json({ error: 'No scenes found' }, { status: 404 })
    }

    if (resetTo === 'first_image') {
      // Reset to Phase A: Clear all confirmations and delete all images except first
      const scenesToClear = scenes.filter(s => s.order_index > 1)
      
      if (scenesToClear.length > 0) {
        // Delete image assets for scenes other than the first
        await supabase
          .from('assets')
          .delete()
          .in('scene_id', scenesToClear.map(s => s.id))
          .eq('type', 'image')

        // Reset scene statuses
        await supabase
          .from('scenes')
          .update({ status: 'pending' })
          .in('id', scenesToClear.map(s => s.id))
      }

      // Clear all confirmations
      await supabase
        .from('shot_lists')
        .update({
          first_image_confirmed_at: null,
          all_images_confirmed_at: null,
          first_video_confirmed_at: null,
          video_style: null,
        })
        .eq('id', shotList.id)

      // Delete all videos
      await supabase
        .from('assets')
        .delete()
        .in('scene_id', scenes.map(s => s.id))
        .eq('type', 'video')

      return NextResponse.json({ 
        success: true, 
        message: 'Reset to Phase A - first image generation',
        clearedScenes: scenesToClear.length
      })
    }

    if (resetTo === 'first_video') {
      // Reset to Phase C: Clear video confirmations and delete all videos
      await supabase
        .from('shot_lists')
        .update({
          first_video_confirmed_at: null,
          video_style: null,
        })
        .eq('id', shotList.id)

      // Delete all video assets
      await supabase
        .from('assets')
        .delete()
        .in('scene_id', scenes.map(s => s.id))
        .eq('type', 'video')

      // Reset scene statuses to image_complete
      await supabase
        .from('scenes')
        .update({ status: 'image_complete' })
        .in('id', scenes.map(s => s.id))

      return NextResponse.json({ 
        success: true, 
        message: 'Reset to Phase C - first video generation'
      })
    }

    return NextResponse.json({ error: 'Invalid resetTo parameter' }, { status: 400 })
  } catch (error) {
    console.error('Reset error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Reset failed' },
      { status: 500 }
    )
  }
}

