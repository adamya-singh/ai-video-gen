import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateWithLLM, LLMModel } from '@/lib/ai/llm'
import { TOPIC_SYSTEM_PROMPT } from '@/lib/ai/prompts'
import { z } from 'zod'

const requestSchema = z.object({
  projectId: z.string().uuid(),
  rawInput: z.string().min(10, 'Please provide at least 10 characters'),
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
    const { projectId, rawInput, model, refinementFeedback } = requestSchema.parse(body)

    // Verify project ownership
    const { data: project } = await supabase
      .from('projects')
      .select('id, user_id')
      .eq('id', projectId)
      .single()

    if (!project || project.user_id !== user.id) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Build the prompt
    let userPrompt = `Please refine this documentary idea:\n\n"${rawInput}"`
    
    if (refinementFeedback) {
      userPrompt += `\n\nAdditional feedback from the user:\n${refinementFeedback}`
    }

    // Generate with LLM
    const response = await generateWithLLM(
      [
        { role: 'system', content: TOPIC_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      model as LLMModel
    )

    // Parse the JSON response
    let parsed
    try {
      // Extract JSON from the response (handles markdown code blocks)
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

    // Upsert topic
    const { data: topic, error } = await supabase
      .from('topics')
      .upsert({
        project_id: projectId,
        raw_input: rawInput,
        refined_statement: parsed.refined_statement,
        selected_title: parsed.working_title,
        hook_angles: parsed.hook_angles,
      }, {
        onConflict: 'project_id',
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      topic,
      alternatives: parsed.alternative_titles,
    })
  } catch (error) {
    console.error('Topic generation error:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Generation failed' },
      { status: 500 }
    )
  }
}

