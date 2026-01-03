import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { mockGenerateVoice } from '@/lib/ai/mock-services'
import { z } from 'zod'

const requestSchema = z.object({
  projectId: z.string().uuid(),
})

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { projectId } = requestSchema.parse(body)

    // Verify project ownership
    const { data: project } = await supabase
      .from('projects')
      .select('*, shot_lists(*), scripts(*)')
      .eq('id', projectId)
      .single()

    if (!project || project.user_id !== user.id) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const shotList = project.shot_lists?.[0]
    if (!shotList) {
      return NextResponse.json({ error: 'Shot list not found' }, { status: 404 })
    }

    // Get all scenes
    const { data: scenes } = await supabase
      .from('scenes')
      .select('*')
      .eq('shot_list_id', shotList.id)
      .order('order_index')

    if (!scenes || scenes.length === 0) {
      return NextResponse.json({ error: 'No scenes found' }, { status: 404 })
    }

    const results = []

    for (const scene of scenes) {
      if (!scene.script_segment) continue

      const voiceResult = await mockGenerateVoice(scene.script_segment)

      if (!voiceResult.success) {
        results.push({
          sceneId: scene.id,
          success: false,
          error: voiceResult.error,
        })
        continue
      }

      // Update scene duration if we got timing info
      if (voiceResult.durationSeconds) {
        await supabase
          .from('scenes')
          .update({ duration_seconds: voiceResult.durationSeconds })
          .eq('id', scene.id)
      }

      // Create/update voice asset
      await supabase
        .from('assets')
        .upsert({
          scene_id: scene.id,
          type: 'voice',
          storage_path: voiceResult.url,
          status: 'complete',
          generation_metadata: { 
            text: scene.script_segment,
            duration: voiceResult.durationSeconds,
            mock: true 
          },
        }, {
          onConflict: 'scene_id,type',
          ignoreDuplicates: false,
        })

      results.push({
        sceneId: scene.id,
        success: true,
        url: voiceResult.url,
        durationSeconds: voiceResult.durationSeconds,
      })
    }

    return NextResponse.json({ results })
  } catch (error) {
    console.error('Voice generation error:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Generation failed' },
      { status: 500 }
    )
  }
}

