'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { ApprovalGate } from '@/components/editor/approval-gate'
import { FileText, Sparkles, Edit3, Eye, Save } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ScriptPageProps {
  params: Promise<{ id: string }>
}

interface OutlineSection {
  section: string
  beats: string[]
}

interface ScriptData {
  id: string
  outline: OutlineSection[] | null
  full_script: string | null
  word_count: number | null
  revision_count: number | null
  approved_at: string | null
}

export default function ScriptPage({ params }: ScriptPageProps) {
  const { id: projectId } = use(params)
  const [script, setScript] = useState<ScriptData | null>(null)
  const [editedScript, setEditedScript] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isApproving, setIsApproving] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refinementFeedback, setRefinementFeedback] = useState('')
  const router = useRouter()
  const supabase = createClient()

  // Load existing script
  useEffect(() => {
    async function loadScript() {
      const { data } = await supabase
        .from('scripts')
        .select('*')
        .eq('project_id', projectId)
        .single()

      if (data) {
        setScript(data)
        setEditedScript(data.full_script || '')
      }
    }
    loadScript()
  }, [projectId, supabase])

  const handleGenerate = async () => {
    setIsGenerating(true)
    setError(null)

    try {
      const response = await fetch('/api/generate/script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          refinementFeedback: refinementFeedback || undefined,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Generation failed')
      }

      setScript(data.script)
      setEditedScript(data.script.full_script || '')
      setRefinementFeedback('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleSaveEdit = async () => {
    if (!script) return

    setIsSaving(true)
    try {
      const wordCount = editedScript.split(/\s+/).filter(Boolean).length

      await supabase
        .from('scripts')
        .update({
          full_script: editedScript,
          word_count: wordCount,
        })
        .eq('id', script.id)

      setScript({ ...script, full_script: editedScript, word_count: wordCount })
      setIsEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setIsSaving(false)
    }
  }

  const handleApprove = async () => {
    if (!script) return

    setIsApproving(true)

    try {
      // Approve script
      await supabase
        .from('scripts')
        .update({ approved_at: new Date().toISOString() })
        .eq('id', script.id)

      // Advance project step
      await supabase
        .from('projects')
        .update({ current_step: 3 })
        .eq('id', projectId)

      router.push(`/project/${projectId}/shot-list`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve')
    } finally {
      setIsApproving(false)
    }
  }

  const wordCount = editedScript.split(/\s+/).filter(Boolean).length

  return (
    <div className="flex flex-col h-full">
      {/* Main content */}
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Header */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-purple-500/10 mb-4">
              <FileText className="w-8 h-8 text-purple-400" />
            </div>
            <h1 className="text-2xl font-bold text-white">Step 2: Generate Script</h1>
            <p className="text-gray-400 mt-2">
              Create the narration script for your documentary
            </p>
          </div>

          {/* Generate button / Refinement */}
          {!script ? (
            <div className="text-center">
              <Button
                onClick={handleGenerate}
                isLoading={isGenerating}
                size="lg"
              >
                <Sparkles className="w-5 h-5 mr-2" />
                Generate Script
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-400">
                    {wordCount.toLocaleString()} words • Revision {script.revision_count}
                  </span>
                  {wordCount < 1500 && (
                    <span className="text-xs text-yellow-500">Below target (1,500+)</span>
                  )}
                  {wordCount > 2500 && (
                    <span className="text-xs text-yellow-500">Above target (2,500 max)</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditedScript(script.full_script || '')
                          setIsEditing(false)
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSaveEdit}
                        isLoading={isSaving}
                      >
                        <Save className="w-4 h-4 mr-2" />
                        Save Changes
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setIsEditing(true)}
                    >
                      <Edit3 className="w-4 h-4 mr-2" />
                      Edit
                    </Button>
                  )}
                </div>
              </div>

              {/* Refinement feedback */}
              {!isEditing && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-300">
                    Refinement Feedback (optional)
                  </label>
                  <textarea
                    value={refinementFeedback}
                    onChange={(e) => setRefinementFeedback(e.target.value)}
                    placeholder="e.g., Make the introduction more dramatic, add more statistics..."
                    className="w-full h-20 px-4 py-3 rounded-xl border border-[rgb(45,45,55)] bg-[rgb(18,18,22)] text-white placeholder:text-gray-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none"
                    disabled={isGenerating}
                  />
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/50 text-red-400">
              {error}
            </div>
          )}

          {/* Outline */}
          {script?.outline && script.outline.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-white">Script Outline</h2>
              <div className="p-4 rounded-xl bg-[rgb(18,18,22)] border border-[rgb(45,45,55)]">
                <div className="space-y-4">
                  {script.outline.map((section, index) => (
                    <div key={index}>
                      <h3 className="font-medium text-purple-400">{section.section}</h3>
                      <ul className="mt-1 space-y-1">
                        {section.beats.map((beat, beatIndex) => (
                          <li key={beatIndex} className="text-sm text-gray-400 pl-4">
                            • {beat}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Script content */}
          {script?.full_script && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Full Script</h2>
              </div>
              {isEditing ? (
                <textarea
                  value={editedScript}
                  onChange={(e) => setEditedScript(e.target.value)}
                  className="w-full min-h-[500px] px-4 py-4 rounded-xl border border-[rgb(45,45,55)] bg-[rgb(18,18,22)] text-white font-mono text-sm leading-relaxed focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 resize-y"
                />
              ) : (
                <div className="p-6 rounded-xl bg-[rgb(18,18,22)] border border-[rgb(45,45,55)]">
                  <div className="prose prose-invert prose-sm max-w-none">
                    {script.full_script.split('\n\n').map((paragraph, index) => {
                      if (paragraph.startsWith('[SCENE:')) {
                        return (
                          <div key={index} className="my-4 p-3 rounded-lg bg-purple-500/10 border border-purple-500/30">
                            <p className="text-purple-400 text-xs font-mono">{paragraph}</p>
                          </div>
                        )
                      }
                      return (
                        <p key={index} className="text-gray-300 leading-relaxed mb-4">
                          {paragraph}
                        </p>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Approval gate */}
      {script && (
        <ApprovalGate
          onRegenerate={handleGenerate}
          onApprove={handleApprove}
          isRegenerating={isGenerating}
          isApproving={isApproving}
          canApprove={!!script.full_script && !isEditing}
        />
      )}
    </div>
  )
}

