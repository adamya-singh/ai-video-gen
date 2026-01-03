import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateWithLLM, LLMModel } from '@/lib/ai/llm'
import { SCRIPT_SYSTEM_PROMPT } from '@/lib/ai/prompts'
import { z } from 'zod'

const requestSchema = z.object({
  projectId: z.string().uuid(),
  model: z.enum(['gpt-4-turbo', 'claude-3.5-sonnet']).optional().default('gpt-4-turbo'),
  refinementFeedback: z.string().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { projectId, model, refinementFeedback } = requestSchema.parse(body)

    // Get project and topic
    const { data: project } = await supabase
      .from('projects')
      .select('*, topics(*)')
      .eq('id', projectId)
      .single()

    if (!project || project.user_id !== user.id) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const topic = project.topics?.[0]
    if (!topic || !topic.approved_at) {
      return NextResponse.json({ error: 'Topic not approved yet' }, { status: 400 })
    }

    // Build the prompt
    let userPrompt = `Create a documentary script for the following topic:

Topic: ${topic.refined_statement}
Title: ${topic.selected_title}

Hook Angles:
${topic.hook_angles?.map((h: { angle: string }) => `- ${h.angle}`).join('\n') || 'None specified'}

Target length: 1,500-2,500 words (5-15 minute video)
Aspect ratio: ${project.aspect_ratio}
`

    if (refinementFeedback) {
      userPrompt += `\n\nAdditional feedback:\n${refinementFeedback}`
    }

    // Generate with LLM
    const response = await generateWithLLM(
      [
        { role: 'system', content: SCRIPT_SYSTEM_PROMPT },
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

    // Get existing script to increment revision count
    const { data: existingScript } = await supabase
      .from('scripts')
      .select('revision_count')
      .eq('project_id', projectId)
      .single()

    const revisionCount = (existingScript?.revision_count || 0) + 1

    // Upsert script
    const { data: script, error } = await supabase
      .from('scripts')
      .upsert({
        project_id: projectId,
        outline: parsed.outline,
        full_script: parsed.full_script,
        word_count: parsed.word_count || parsed.full_script?.split(/\s+/).length || 0,
        revision_count: revisionCount,
      }, {
        onConflict: 'project_id',
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ script })
  } catch (error) {
    console.error('Script generation error:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Generation failed' },
      { status: 500 }
    )
  }
}

