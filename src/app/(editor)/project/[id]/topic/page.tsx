'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { ApprovalGate } from '@/components/editor/approval-gate'
import { Lightbulb, Sparkles, Check, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TopicPageProps {
  params: Promise<{ id: string }>
}

interface HookAngle {
  angle: string
  description: string
}

interface TopicData {
  id: string
  raw_input: string | null
  refined_statement: string | null
  selected_title: string | null
  hook_angles: HookAngle[] | null
  approved_at: string | null
}

interface ProjectSettings {
  llm_model?: string
  [key: string]: unknown
}

export default function TopicPage({ params }: TopicPageProps) {
  const { id: projectId } = use(params)
  const [rawInput, setRawInput] = useState('')
  const [topic, setTopic] = useState<TopicData | null>(null)
  const [alternatives, setAlternatives] = useState<string[]>([])
  const [selectedTitle, setSelectedTitle] = useState('')
  const [selectedHook, setSelectedHook] = useState<number | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isApproving, setIsApproving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refinementFeedback, setRefinementFeedback] = useState('')
  const [projectSettings, setProjectSettings] = useState<ProjectSettings | null>(null)
  const router = useRouter()
  const supabase = createClient()

  // Load existing topic and project settings
  useEffect(() => {
    async function loadData() {
      // Load project settings
      const { data: projectData } = await supabase
        .from('projects')
        .select('settings')
        .eq('id', projectId)
        .single()
      
      if (projectData?.settings) {
        setProjectSettings(projectData.settings as ProjectSettings)
      }

      // Load topic
      const { data } = await supabase
        .from('topics')
        .select('*')
        .eq('project_id', projectId)
        .single()

      if (data) {
        setTopic(data)
        setRawInput(data.raw_input || '')
        setSelectedTitle(data.selected_title || '')
        if (data.hook_angles && data.hook_angles.length > 0) {
          setSelectedHook(0)
        }
      }
    }
    loadData()
  }, [projectId, supabase])

  const handleGenerate = async () => {
    if (!rawInput.trim()) {
      setError('Please enter your documentary idea')
      return
    }

    setIsGenerating(true)
    setError(null)

    // Ensure we only send valid model values
    const validModels = ['gpt-4-turbo', 'claude-sonnet-4-5'] as const
    const model = validModels.includes(projectSettings?.llm_model as typeof validModels[number])
      ? projectSettings?.llm_model
      : 'claude-sonnet-4-5'

    try {
      const response = await fetch('/api/generate/topic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          rawInput,
          refinementFeedback: refinementFeedback || undefined,
          model,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Generation failed')
      }

      setTopic(data.topic)
      setAlternatives(data.alternatives || [])
      setSelectedTitle(data.topic.selected_title)
      if (data.topic.hook_angles?.length > 0) {
        setSelectedHook(0)
      }
      setRefinementFeedback('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleApprove = async () => {
    if (!topic || !selectedTitle) return

    setIsApproving(true)

    try {
      // Update topic with selected values
      await supabase
        .from('topics')
        .update({
          selected_title: selectedTitle,
          approved_at: new Date().toISOString(),
        })
        .eq('id', topic.id)

      // Update project title and advance step
      await supabase
        .from('projects')
        .update({
          title: selectedTitle,
          current_step: 2,
        })
        .eq('id', projectId)

      router.push(`/project/${projectId}/script`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve')
    } finally {
      setIsApproving(false)
    }
  }

  const allTitles = topic?.selected_title
    ? [topic.selected_title, ...alternatives.filter(t => t !== topic.selected_title)]
    : alternatives

  return (
    <div className="flex flex-col h-full">
      {/* Main content */}
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-3xl mx-auto space-y-8">
          {/* Header */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-purple-500/10 mb-4">
              <Lightbulb className="w-8 h-8 text-purple-400" />
            </div>
            <h1 className="text-2xl font-bold text-white">Step 1: Generate Topic</h1>
            <p className="text-gray-400 mt-2">
              Enter your rough idea and let AI refine it into a compelling documentary topic
            </p>
          </div>

          {/* Input section */}
          <div className="space-y-4">
            <label className="block text-sm font-medium text-gray-300">
              Your Documentary Idea
            </label>
            <textarea
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              placeholder="e.g., I want to make a video about how social media algorithms affect mental health..."
              className="w-full h-32 px-4 py-3 rounded-xl border border-[rgb(45,45,55)] bg-[rgb(18,18,22)] text-white placeholder:text-gray-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none"
              disabled={isGenerating}
            />

            {topic && !topic.approved_at && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300">
                  Refinement Feedback (optional)
                </label>
                <textarea
                  value={refinementFeedback}
                  onChange={(e) => setRefinementFeedback(e.target.value)}
                  placeholder="e.g., Make it more focused on teenagers, add a hook about addiction..."
                  className="w-full h-20 px-4 py-3 rounded-xl border border-[rgb(45,45,55)] bg-[rgb(18,18,22)] text-white placeholder:text-gray-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none"
                  disabled={isGenerating}
                />
              </div>
            )}

            {error && (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/50 text-red-400">
                {error}
              </div>
            )}

            <Button
              onClick={handleGenerate}
              isLoading={isGenerating}
              className="w-full"
              size="lg"
            >
              <Sparkles className="w-5 h-5 mr-2" />
              {topic ? 'Regenerate Topic' : 'Generate Topic'}
            </Button>
          </div>

          {/* Generated content */}
          {topic && (
            <div className="space-y-8 animate-slide-up">
              {/* Refined statement */}
              <div className="space-y-3">
                <h2 className="text-lg font-semibold text-white">Refined Topic</h2>
                <div className="p-4 rounded-xl bg-[rgb(18,18,22)] border border-[rgb(45,45,55)]">
                  <p className="text-gray-300 leading-relaxed">
                    {topic.refined_statement}
                  </p>
                </div>
              </div>

              {/* Title selection */}
              {allTitles.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-lg font-semibold text-white">Select Title</h2>
                  <div className="grid gap-2">
                    {allTitles.map((title, index) => (
                      <button
                        key={index}
                        onClick={() => setSelectedTitle(title)}
                        className={cn(
                          'p-4 rounded-xl border text-left transition-all duration-200',
                          selectedTitle === title
                            ? 'border-purple-500 bg-purple-500/10'
                            : 'border-[rgb(45,45,55)] bg-[rgb(18,18,22)] hover:border-gray-600'
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className={cn(
                            'font-medium',
                            selectedTitle === title ? 'text-white' : 'text-gray-300'
                          )}>
                            {title}
                          </span>
                          {selectedTitle === title && (
                            <Check className="w-5 h-5 text-purple-400" />
                          )}
                        </div>
                        {index === 0 && (
                          <span className="text-xs text-purple-400 mt-1 block">Recommended</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Hook angles */}
              {topic.hook_angles && topic.hook_angles.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-lg font-semibold text-white">Hook Angles</h2>
                  <p className="text-sm text-gray-500">
                    Select the primary hook angle for your documentary
                  </p>
                  <div className="grid gap-2">
                    {topic.hook_angles.map((hook, index) => (
                      <button
                        key={index}
                        onClick={() => setSelectedHook(index)}
                        className={cn(
                          'p-4 rounded-xl border text-left transition-all duration-200',
                          selectedHook === index
                            ? 'border-purple-500 bg-purple-500/10'
                            : 'border-[rgb(45,45,55)] bg-[rgb(18,18,22)] hover:border-gray-600'
                        )}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className={cn(
                              'font-medium',
                              selectedHook === index ? 'text-white' : 'text-gray-300'
                            )}>
                              {hook.angle}
                            </p>
                            <p className="text-sm text-gray-500 mt-1">
                              {hook.description}
                            </p>
                          </div>
                          {selectedHook === index && (
                            <Check className="w-5 h-5 text-purple-400 shrink-0" />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Approval gate */}
      {topic && (
        <ApprovalGate
          onRegenerate={handleGenerate}
          onApprove={handleApprove}
          isRegenerating={isGenerating}
          isApproving={isApproving}
          canApprove={!!selectedTitle}
        />
      )}
    </div>
  )
}
