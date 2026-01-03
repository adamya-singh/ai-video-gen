'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { ApprovalGate } from '@/components/editor/approval-gate'
import { getMockCostEstimate } from '@/lib/ai/mock-services'
import { Image as ImageIcon, Play, RefreshCw, AlertCircle, Check, Loader2, DollarSign } from 'lucide-react'
import { cn } from '@/lib/utils'

interface VisualsPageProps {
  params: Promise<{ id: string }>
}

interface Scene {
  id: string
  order_index: number
  script_segment: string | null
  image_prompt: string | null
  motion_type: string | null
  duration_seconds: number | null
  status: string | null
}

interface Asset {
  id: string
  scene_id: string
  type: 'image' | 'video' | 'voice'
  storage_path: string | null
  status: string | null
}

export default function VisualsPage({ params }: VisualsPageProps) {
  const { id: projectId } = use(params)
  const [scenes, setScenes] = useState<Scene[]>([])
  const [assets, setAssets] = useState<Record<string, Asset[]>>({})
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatingSceneId, setGeneratingSceneId] = useState<string | null>(null)
  const [isApproving, setIsApproving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCostModal, setShowCostModal] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // Load scenes and assets
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

        // Load assets for each scene
        const { data: assetsData } = await supabase
          .from('assets')
          .select('*')
          .in('scene_id', scenesData.map(s => s.id))

        if (assetsData) {
          const assetsByScene: Record<string, Asset[]> = {}
          assetsData.forEach(asset => {
            if (!assetsByScene[asset.scene_id]) {
              assetsByScene[asset.scene_id] = []
            }
            assetsByScene[asset.scene_id].push(asset)
          })
          setAssets(assetsByScene)
        }
      }
    }
    loadData()
  }, [projectId, supabase])

  const handleGenerateAll = async () => {
    setShowCostModal(false)
    setIsGenerating(true)
    setError(null)

    try {
      const response = await fetch('/api/generate/visuals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
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

  const handleRegenerateScene = async (sceneId: string) => {
    setGeneratingSceneId(sceneId)
    setError(null)

    try {
      const response = await fetch('/api/generate/visuals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, sceneId }),
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
      setGeneratingSceneId(null)
    }
  }

  const handleApprove = async () => {
    setIsApproving(true)

    try {
      await supabase
        .from('projects')
        .update({ current_step: 5 })
        .eq('id', projectId)

      router.push(`/project/${projectId}/voice`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to continue')
    } finally {
      setIsApproving(false)
    }
  }

  const completedScenes = scenes.filter(s => s.status === 'complete').length
  const failedScenes = scenes.filter(s => s.status === 'failed').length
  const allComplete = completedScenes === scenes.length && scenes.length > 0
  const hasAnyAssets = Object.keys(assets).length > 0

  const costEstimate = getMockCostEstimate(scenes.length)

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-6xl mx-auto space-y-8">
          {/* Header */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-purple-500/10 mb-4">
              <ImageIcon className="w-8 h-8 text-purple-400" />
            </div>
            <h1 className="text-2xl font-bold text-white">Step 4: Generate Visuals</h1>
            <p className="text-gray-400 mt-2">
              Generate images and video clips for each scene
            </p>
          </div>

          {/* Progress & Actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="text-sm">
                <span className="text-gray-400">Progress:</span>
                <span className="text-white ml-2 font-medium">
                  {completedScenes} / {scenes.length} scenes
                </span>
              </div>
              {failedScenes > 0 && (
                <div className="text-sm text-red-400 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                  {failedScenes} failed
                </div>
              )}
            </div>

            <Button
              onClick={() => setShowCostModal(true)}
              isLoading={isGenerating}
              disabled={scenes.length === 0}
            >
              <Play className="w-4 h-4 mr-2" />
              {hasAnyAssets ? 'Regenerate All' : 'Generate All Visuals'}
            </Button>
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/50 text-red-400">
              {error}
            </div>
          )}

          {/* Scene grid */}
          {scenes.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {scenes.map((scene) => {
                const sceneAssets = assets[scene.id] || []
                const imageAsset = sceneAssets.find(a => a.type === 'image')
                const videoAsset = sceneAssets.find(a => a.type === 'video')
                const isCurrentlyGenerating = generatingSceneId === scene.id

                return (
                  <div
                    key={scene.id}
                    className="rounded-xl border border-[rgb(45,45,55)] bg-[rgb(18,18,22)] overflow-hidden"
                  >
                    {/* Visual preview */}
                    <div className="aspect-video bg-gradient-to-br from-[rgb(30,30,36)] to-[rgb(40,40,48)] relative">
                      {imageAsset?.storage_path ? (
                        <img
                          src={imageAsset.storage_path}
                          alt={`Scene ${scene.order_index}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          {isCurrentlyGenerating || (isGenerating && !imageAsset) ? (
                            <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
                          ) : (
                            <ImageIcon className="w-8 h-8 text-gray-600" />
                          )}
                        </div>
                      )}

                      {/* Status badge */}
                      <div className={cn(
                        'absolute top-2 right-2 px-2 py-1 rounded text-xs font-medium',
                        scene.status === 'complete' && 'bg-green-500/20 text-green-400',
                        scene.status === 'failed' && 'bg-red-500/20 text-red-400',
                        scene.status === 'generating' && 'bg-purple-500/20 text-purple-400',
                        scene.status === 'pending' && 'bg-gray-500/20 text-gray-400'
                      )}>
                        {scene.status === 'complete' && <Check className="w-3 h-3 inline mr-1" />}
                        {scene.status === 'failed' && <AlertCircle className="w-3 h-3 inline mr-1" />}
                        {scene.status === 'generating' && <Loader2 className="w-3 h-3 inline mr-1 animate-spin" />}
                        {scene.status || 'pending'}
                      </div>

                      {/* Scene number */}
                      <div className="absolute top-2 left-2 px-2 py-1 rounded bg-black/50 text-xs text-white">
                        Scene {scene.order_index}
                      </div>
                    </div>

                    {/* Info */}
                    <div className="p-4 space-y-3">
                      <p className="text-sm text-gray-300 line-clamp-2">
                        {scene.script_segment}
                      </p>

                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">
                          {scene.duration_seconds}s • {scene.motion_type}
                        </span>

                        {scene.status === 'failed' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRegenerateScene(scene.id)}
                            isLoading={isCurrentlyGenerating}
                          >
                            <RefreshCw className="w-4 h-4 mr-1" />
                            Retry
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Cost Modal */}
      {showCostModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowCostModal(false)} />
          <div className="relative w-full max-w-md rounded-2xl border border-[rgb(45,45,55)] bg-[rgb(18,18,22)] p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Cost Estimate</h2>
                <p className="text-sm text-gray-400">Review before generating</p>
              </div>
            </div>

            <div className="space-y-3 mb-6">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">{costEstimate.images.count} images (Nano Banana)</span>
                <span className="text-white">${costEstimate.images.total.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">{costEstimate.videos.count} video clips (Runway)</span>
                <span className="text-white">${costEstimate.videos.total.toFixed(2)}</span>
              </div>
              <div className="border-t border-[rgb(45,45,55)] pt-3 flex justify-between text-sm">
                <span className="text-gray-400">Subtotal</span>
                <span className="text-white">${costEstimate.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Platform fee (15%)</span>
                <span className="text-white">${costEstimate.platformFee.toFixed(2)}</span>
              </div>
              <div className="border-t border-[rgb(45,45,55)] pt-3 flex justify-between">
                <span className="font-medium text-white">Total</span>
                <span className="font-medium text-purple-400">${costEstimate.total.toFixed(2)}</span>
              </div>
            </div>

            <p className="text-xs text-gray-500 mb-6">
              Note: This is using mock services. Real costs will vary.
            </p>

            <div className="flex gap-3">
              <Button variant="ghost" className="flex-1" onClick={() => setShowCostModal(false)}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={handleGenerateAll}>
                Generate Assets
              </Button>
            </div>
          </div>
        </div>
      )}

      {scenes.length > 0 && (
        <ApprovalGate
          onRegenerate={() => setShowCostModal(true)}
          onApprove={handleApprove}
          isRegenerating={isGenerating}
          isApproving={isApproving}
          canApprove={allComplete}
          regenerateLabel="Regenerate All"
          approveLabel={allComplete ? 'Continue to Voice' : `${completedScenes}/${scenes.length} complete`}
        />
      )}
    </div>
  )
}

