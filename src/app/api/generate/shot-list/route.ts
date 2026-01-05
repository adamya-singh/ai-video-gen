import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateWithLLM, LLMModel } from '@/lib/ai/llm'
import { SHOT_LIST_SYSTEM_PROMPT } from '@/lib/ai/prompts'
import { z } from 'zod'

const requestSchema = z.object({
  projectId: z.string().uuid(),
  model: z.enum(['gpt-4-turbo', 'claude-sonnet-4-5']).optional().default('claude-sonnet-4-5'),
})

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { projectId, model } = requestSchema.parse(body)

    // Get project
    const { data: project } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single()

    if (!project || project.user_id !== user.id) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Get script directly (more reliable than join)
    const { data: script } = await supabase
      .from('scripts')
      .select('*')
      .eq('project_id', projectId)
      .single()

    if (!script || !script.approved_at) {
      return NextResponse.json({ error: 'Script not approved yet' }, { status: 400 })
    }

    // Build the prompt
    const userPrompt = `Create a shot list for this documentary script:

${script.full_script}

Create approximately ${Math.ceil((script.word_count || 1500) / 150)} scenes to cover the entire script.
Each scene should be 10-20 seconds of video content.
`

    // Generate with LLM
    const response = await generateWithLLM(
      [
        { role: 'system', content: SHOT_LIST_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      model as LLMModel
    )

    // Parse the JSON response
    let parsed
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('No JSON found in response')
      }
    } catch {
      return NextResponse.json(
        { error: 'Failed to parse LLM response', raw: response },
        { status: 500 }
      )
    }

    // Delete existing shot list and scenes
    await supabase
      .from('shot_lists')
      .delete()
      .eq('project_id', projectId)

    // Create shot list
    const { data: shotList, error: shotListError } = await supabase
      .from('shot_lists')
      .insert({ project_id: projectId })
      .select()
      .single()

    if (shotListError) {
      return NextResponse.json({ error: shotListError.message }, { status: 500 })
    }

    // Create scenes
    const scenesData = parsed.scenes.map((scene: {
      order_index: number
      script_segment: string
      image_prompt: string
      video_prompt: string
      motion_type: string
      duration_seconds: number
    }, index: number) => ({
      shot_list_id: shotList.id,
      order_index: scene.order_index || index + 1,
      script_segment: scene.script_segment,
      image_prompt: scene.image_prompt,
      video_prompt: scene.video_prompt,
      motion_type: scene.motion_type || 'ken_burns',
      duration_seconds: scene.duration_seconds || 15,
      status: 'pending',
    }))

    const { data: scenes, error: scenesError } = await supabase
      .from('scenes')
      .insert(scenesData)
      .select()

    if (scenesError) {
      return NextResponse.json({ error: scenesError.message }, { status: 500 })
    }

    return NextResponse.json({ shotList, scenes })
  } catch (error) {
    console.error('Shot list generation error:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Generation failed' },
      { status: 500 }
    )
  }
}

