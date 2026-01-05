'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { ApprovalGate } from '@/components/editor/approval-gate'
import { Mic, Play, Pause, Check, Loader2, Volume2, SkipForward, Video } from 'lucide-react'
import { cn } from '@/lib/utils'

interface VoicePageProps {
  params: Promise<{ id: string }>
}

interface Scene {
  id: string
  order_index: number
  script_segment: string | null
  duration_seconds: number | null
}

interface Asset {
  id: string
  scene_id: string
  type: 'image' | 'video' | 'voice'
  storage_path: string | null
  status: string | null
}

const VOICE_PRESETS = [
  { id: 'narrator', name: 'Narrator', description: 'Professional documentary voice' },
  { id: 'storyteller', name: 'Storyteller', description: 'Warm and engaging tone' },
  { id: 'journalist', name: 'Journalist', description: 'Clear and authoritative' },
]

export default function VoicePage({ params }: VoicePageProps) {
  const { id: projectId } = use(params)
  const [scenes, setScenes] = useState<Scene[]>([])
  const [assets, setAssets] = useState<Record<string, Asset>>({})
  const [selectedVoice, setSelectedVoice] = useState('narrator')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isApproving, setIsApproving] = useState(false)
  const [isSkipping, setIsSkipping] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [playingScene, setPlayingScene] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  // Load scenes and voice assets
  useEffect(() => {
    async function loadData() {
      const { data: shotList } = await supabase
        .from('shot_lists')
        .select('id')
        .eq('project_id', projectId)
        .single()

      if (!shotList) return

      const { data: scenesData } = await supabase
        .from('scenes')
        .select('*')
        .eq('shot_list_id', shotList.id)
        .order('order_index')

      if (scenesData) {
        setScenes(scenesData)

        const { data: assetsData } = await supabase
          .from('assets')
          .select('*')
          .in('scene_id', scenesData.map(s => s.id))
          .eq('type', 'voice')

        if (assetsData) {
          const assetsByScene: Record<string, Asset> = {}
          assetsData.forEach(asset => {
            assetsByScene[asset.scene_id] = asset
          })
          setAssets(assetsByScene)
        }
      }
    }
    loadData()
  }, [projectId, supabase])

  const handleGenerate = async () => {
    setIsGenerating(true)
    setError(null)

    try {
      const response = await fetch('/api/generate/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, voiceId: selectedVoice }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Generation failed')
      }

      // Reload data
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleApprove = async () => {
    setIsApproving(true)

    try {
      await supabase
        .from('projects')
        .update({ current_step: 6 })
        .eq('id', projectId)

      router.push(`/project/${projectId}/export`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to continue')
    } finally {
      setIsApproving(false)
    }
  }

  const handleSkipVoice = async () => {
    setIsSkipping(true)

    try {
      await supabase
        .from('projects')
        .update({ current_step: 6 })
        .eq('id', projectId)

      router.push(`/project/${projectId}/export`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to skip')
    } finally {
      setIsSkipping(false)
    }
  }

  const togglePlayScene = (sceneId: string) => {
    if (playingScene === sceneId) {
      setPlayingScene(null)
    } else {
      setPlayingScene(sceneId)
    }
  }

  const hasVoiceAssets = Object.keys(assets).length > 0
  const allComplete = scenes.every(s => assets[s.id]?.status === 'complete')
  const totalDuration = scenes.reduce((acc, s) => acc + (s.duration_seconds || 0), 0)

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Header */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-purple-500/10 mb-4">
              <Mic className="w-8 h-8 text-purple-400" />
            </div>
            <h1 className="text-2xl font-bold text-white">Step 5: Generate Voice</h1>
            <p className="text-gray-400 mt-2">
              Create AI voiceover for your documentary narration
            </p>
          </div>

          {/* Skip Voice Option */}
          <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0">
                  <Video className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-white font-medium">Videos include audio</h3>
                  <p className="text-sm text-gray-400 mt-1">
                    Your videos were generated with Veo 3 which includes native audio. 
                    You can skip this step if you don't need separate voiceover narration.
                  </p>
                </div>
              </div>
              <Button
                variant="secondary"
                onClick={handleSkipVoice}
                isLoading={isSkipping}
                className="shrink-0"
              >
                <SkipForward className="w-4 h-4 mr-2" />
                Skip to Export
              </Button>
            </div>
          </div>

          {/* Voice selection */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white">Select Voice</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {VOICE_PRESETS.map((voice) => (
                <button
                  key={voice.id}
                  onClick={() => setSelectedVoice(voice.id)}
                  className={cn(
                    'p-4 rounded-xl border text-left transition-all duration-200',
                    selectedVoice === voice.id
                      ? 'border-purple-500 bg-purple-500/10'
                      : 'border-[rgb(45,45,55)] bg-[rgb(18,18,22)] hover:border-gray-600'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'w-10 h-10 rounded-lg flex items-center justify-center',
                      selectedVoice === voice.id ? 'bg-purple-500' : 'bg-[rgb(30,30,36)]'
                    )}>
                      <Volume2 className={cn(
                        'w-5 h-5',
                        selectedVoice === voice.id ? 'text-white' : 'text-gray-400'
                      )} />
                    </div>
                    <div>
                      <p className={cn(
                        'font-medium',
                        selectedVoice === voice.id ? 'text-white' : 'text-gray-300'
                      )}>
                        {voice.name}
                      </p>
                      <p className="text-xs text-gray-500">{voice.description}</p>
                    </div>
                    {selectedVoice === voice.id && (
                      <Check className="w-5 h-5 text-purple-400 ml-auto" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Stats */}
          {scenes.length > 0 && (
            <div className="flex items-center justify-between p-4 rounded-xl bg-[rgb(18,18,22)] border border-[rgb(45,45,55)]">
              <div className="flex items-center gap-6">
                <div className="text-sm">
                  <span className="text-gray-400">Scenes:</span>
                  <span className="text-white ml-2 font-medium">{scenes.length}</span>
                </div>
                <div className="text-sm">
                  <span className="text-gray-400">Total duration:</span>
                  <span className="text-white ml-2 font-medium">
                    {Math.floor(totalDuration / 60)}:{(totalDuration % 60).toString().padStart(2, '0')}
                  </span>
                </div>
              </div>

              <Button
                onClick={handleGenerate}
                isLoading={isGenerating}
                variant={hasVoiceAssets ? 'secondary' : 'primary'}
              >
                <Mic className="w-4 h-4 mr-2" />
                {hasVoiceAssets ? 'Regenerate Voice' : 'Generate Voice'}
              </Button>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/50 text-red-400">
              {error}
            </div>
          )}

          {/* Scene list */}
          {scenes.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">Narration Segments</h2>
              <div className="space-y-3">
                {scenes.map((scene) => {
                  const voiceAsset = assets[scene.id]
                  const isPlaying = playingScene === scene.id

                  return (
                    <div
                      key={scene.id}
                      className="p-4 rounded-xl border border-[rgb(45,45,55)] bg-[rgb(18,18,22)]"
                    >
                      <div className="flex items-start gap-4">
                        {/* Play button */}
                        <button
                          onClick={() => voiceAsset && togglePlayScene(scene.id)}
                          disabled={!voiceAsset}
                          className={cn(
                            'w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-colors',
                            voiceAsset
                              ? 'bg-purple-500 hover:bg-purple-600 text-white'
                              : 'bg-[rgb(30,30,36)] text-gray-500'
                          )}
                        >
                          {voiceAsset ? (
                            isPlaying ? (
                              <Pause className="w-4 h-4" />
                            ) : (
                              <Play className="w-4 h-4 ml-0.5" />
                            )
                          ) : (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          )}
                        </button>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-medium text-purple-400">
                              Scene {scene.order_index}
                            </span>
                            <span className="text-xs text-gray-500">
                              {scene.duration_seconds}s
                            </span>
                            {voiceAsset?.status === 'complete' && (
                              <span className="text-xs text-green-400 flex items-center gap-1">
                                <Check className="w-3 h-3" /> Generated
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-300">
                            {scene.script_segment}
                          </p>
                        </div>
                      </div>

                      {/* Audio waveform placeholder */}
                      {voiceAsset && (
                        <div className="mt-4 h-8 rounded bg-[rgb(14,14,18)] flex items-center px-3">
                          <div className="flex items-center gap-0.5 flex-1">
                            {Array.from({ length: 50 }).map((_, i) => (
                              <div
                                key={i}
                                className={cn(
                                  'w-1 rounded-full transition-all',
                                  isPlaying ? 'bg-purple-400' : 'bg-gray-600'
                                )}
                                style={{
                                  height: `${8 + Math.random() * 16}px`,
                                  opacity: isPlaying ? 0.5 + Math.random() * 0.5 : 0.5,
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {scenes.length > 0 && (
        <ApprovalGate
          onRegenerate={handleGenerate}
          onApprove={handleApprove}
          isRegenerating={isGenerating}
          isApproving={isApproving}
          canApprove={allComplete}
          regenerateLabel="Regenerate Voice"
          approveLabel={allComplete ? 'Continue to Export' : 'Generate voice first'}
        />
      )}
    </div>
  )
}

