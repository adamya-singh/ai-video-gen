'use client'

import { useState, useEffect, use, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { getCostEstimate } from '@/lib/ai/mock-services'
import { 
  Image as ImageIcon, 
  Play, 
  RefreshCw, 
  AlertCircle, 
  Check, 
  Loader2, 
  DollarSign,
  ChevronRight,
  AlertTriangle,
  Video
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface VisualsPageProps {
  params: Promise<{ id: string }>
}

interface Scene {
  id: string
  order_index: number
  script_segment: string | null
  image_prompt: string | null
  video_prompt: string | null
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

interface ShotList {
  id: string
  project_id: string
  video_style: string | null
  first_image_confirmed_at: string | null
  all_images_confirmed_at: string | null
  first_video_confirmed_at: string | null
}

type Phase = 'phase_a' | 'phase_b' | 'phase_c' | 'phase_d' | 'complete'

function deriveCurrentPhase(
  scenes: Scene[],
  assets: Asset[],
  shotList: ShotList | null,
  projectCurrentStep: number
): Phase {
  if (!shotList || scenes.length === 0) return 'phase_a'

  const scene1 = scenes.find(s => s.order_index === 1)
  if (!scene1) return 'phase_a'

  const scene1Image = assets.find(a => a.scene_id === scene1.id && a.type === 'image' && a.status === 'complete')
  const scene1Video = assets.find(a => a.scene_id === scene1.id && a.type === 'video' && a.status === 'complete')

  const allImagesComplete = scenes.every(s =>
    assets.some(a => a.scene_id === s.id && a.type === 'image' && a.status === 'complete')
  )
  const allVideosComplete = scenes.every(s =>
    assets.some(a => a.scene_id === s.id && a.type === 'video' && a.status === 'complete')
  )

  // Phase A: No confirmed first image
  if (!scene1Image || !shotList.first_image_confirmed_at) return 'phase_a'

  // Phase B: First image confirmed, not all images complete OR not confirmed
  if (!allImagesComplete || !shotList.all_images_confirmed_at) return 'phase_b'

  // Phase C: All images confirmed, no confirmed first video
  if (!scene1Video || !shotList.first_video_confirmed_at) return 'phase_c'

  // Phase D: First video confirmed, not all videos complete OR project hasn't moved to step 5+
  // (User needs to click "Complete & Continue" to move from phase_d to complete)
  if (!allVideosComplete || projectCurrentStep < 5) return 'phase_d'

  return 'complete'
}

const PHASE_LABELS: Record<Phase, { title: string; description: string }> = {
  phase_a: { 
    title: 'Step 4A: Generate First Image', 
    description: 'Create and refine the first scene\'s image to establish the visual style' 
  },
  phase_b: { 
    title: 'Step 4B: Generate Remaining Images', 
    description: 'Generate images for all other scenes using the first image as a style reference' 
  },
  phase_c: { 
    title: 'Step 4C: Generate First Video', 
    description: 'Create and refine the first scene\'s video to establish the motion style' 
  },
  phase_d: { 
    title: 'Step 4D: Generate Remaining Videos', 
    description: 'Generate videos for all other scenes using the confirmed video style' 
  },
  complete: { 
    title: 'Step 4: Visuals Complete', 
    description: 'All images and videos have been generated' 
  },
}

export default function VisualsPage({ params }: VisualsPageProps) {
  const { id: projectId } = use(params)
  const [scenes, setScenes] = useState<Scene[]>([])
  const [assets, setAssets] = useState<Asset[]>([])
  const [shotList, setShotList] = useState<ShotList | null>(null)
  const [projectCurrentStep, setProjectCurrentStep] = useState<number>(4)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatingSceneId, setGeneratingSceneId] = useState<string | null>(null)
  const [isConfirming, setIsConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCostModal, setShowCostModal] = useState(false)
  const [showResetWarning, setShowResetWarning] = useState(false)
  
  // Editable prompts
  const [editingImagePrompt, setEditingImagePrompt] = useState<string>('')
  const [editingVideoPrompt, setEditingVideoPrompt] = useState<string>('')
  const [videoStyle, setVideoStyle] = useState<string>('')
  
  const router = useRouter()
  const supabase = createClient()

  const currentPhase = deriveCurrentPhase(scenes, assets, shotList, projectCurrentStep)

  // Load data
  const loadData = useCallback(async () => {
    // Fetch project to get current_step
    const { data: projectData } = await supabase
      .from('projects')
      .select('current_step')
      .eq('id', projectId)
      .single()

    if (projectData) {
      setProjectCurrentStep(projectData.current_step || 4)
    }

    const { data: shotListData } = await supabase
      .from('shot_lists')
      .select('*')
      .eq('project_id', projectId)
      .single()

    if (!shotListData) return

    setShotList(shotListData)
    setVideoStyle(shotListData.video_style || '')

      const { data: scenesData } = await supabase
        .from('scenes')
        .select('*')
      .eq('shot_list_id', shotListData.id)
        .order('order_index')

      if (scenesData) {
        setScenes(scenesData)

      // Initialize editing prompts with first scene data
      const firstScene = scenesData.find(s => s.order_index === 1)
      if (firstScene) {
        setEditingImagePrompt(firstScene.image_prompt || '')
        setEditingVideoPrompt(firstScene.video_prompt || '')
      }

        const { data: assetsData } = await supabase
          .from('assets')
          .select('*')
          .in('scene_id', scenesData.map(s => s.id))

        if (assetsData) {
        setAssets(assetsData.map(a => ({
          ...a,
          type: a.type as 'image' | 'video' | 'voice',
        })))
      }
    }
  }, [projectId, supabase])

  useEffect(() => {
    loadData()
  }, [loadData])

  const getSceneAssets = (sceneId: string) => {
    return {
      image: assets.find(a => a.scene_id === sceneId && a.type === 'image'),
      video: assets.find(a => a.scene_id === sceneId && a.type === 'video'),
    }
  }

  const firstScene = scenes.find(s => s.order_index === 1)

  // Generation handlers
  const handleGenerateFirstImage = async () => {
    if (!firstScene) return
    setShowCostModal(false)
    setIsGenerating(true)
    setError(null)

    try {
      const response = await fetch('/api/generate/visuals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          phase: 'first_image',
          imagePrompt: editingImagePrompt || undefined,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Generation failed')
      }

      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleGenerateRemainingImages = async () => {
    setShowCostModal(false)
    setIsGenerating(true)
    setError(null)

    try {
      const response = await fetch('/api/generate/visuals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          phase: 'remaining_images',
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Generation failed')
      }

      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleRegenerateImage = async (sceneId: string, prompt?: string) => {
    setGeneratingSceneId(sceneId)
    setError(null)

    try {
      const scene = scenes.find(s => s.id === sceneId)
      const phase = scene?.order_index === 1 ? 'first_image' : 'remaining_images'

      const response = await fetch('/api/generate/visuals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          sceneId,
          phase,
          imagePrompt: prompt,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Generation failed')
      }

      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setGeneratingSceneId(null)
    }
  }

  const handleGenerateFirstVideo = async () => {
    if (!firstScene || !videoStyle.trim()) {
      setError('Please enter a video style description')
      return
    }
    setShowCostModal(false)
    setIsGenerating(true)
    setError(null)

    try {
      const response = await fetch('/api/generate/visuals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          phase: 'first_video',
          videoStyle: videoStyle.trim(),
          videoPrompt: editingVideoPrompt || undefined,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Generation failed')
      }

      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleGenerateRemainingVideos = async () => {
    setShowCostModal(false)
    setIsGenerating(true)
    setError(null)

    try {
      const response = await fetch('/api/generate/visuals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          phase: 'remaining_videos',
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Generation failed')
      }

      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleRegenerateVideo = async (sceneId: string, prompt?: string) => {
    setGeneratingSceneId(sceneId)
    setError(null)

    try {
      const scene = scenes.find(s => s.id === sceneId)
      const phase = scene?.order_index === 1 ? 'first_video' : 'remaining_videos'

      const response = await fetch('/api/generate/visuals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          sceneId,
          phase,
          videoStyle: scene?.order_index === 1 ? videoStyle : undefined,
          videoPrompt: prompt,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Generation failed')
      }

      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setGeneratingSceneId(null)
    }
  }

  // Confirmation handlers
  const handleConfirmPhase = async () => {
    setIsConfirming(true)
    setError(null)

    try {
      const phaseMap: Record<Phase, string> = {
        phase_a: 'first_image',
        phase_b: 'all_images',
        phase_c: 'first_video',
        phase_d: 'all_videos',
        complete: '',
      }

      const response = await fetch('/api/generate/visuals/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          phase: phaseMap[currentPhase],
          videoStyle: currentPhase === 'phase_c' ? videoStyle : undefined,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Confirmation failed')
      }

      if (data.nextStep === 5) {
      router.push(`/project/${projectId}/voice`)
      router.refresh()
      } else {
        await loadData()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Confirmation failed')
    } finally {
      setIsConfirming(false)
    }
  }

  const handleResetToFirstImage = async () => {
    setShowResetWarning(false)
    setIsGenerating(true)
    setError(null)

    try {
      const response = await fetch(
        `/api/generate/visuals/confirm?projectId=${projectId}&resetTo=first_image`,
        { method: 'DELETE' }
      )

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Reset failed')
      }

      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed')
    } finally {
      setIsGenerating(false)
    }
  }

  // Calculate progress
  const imagesComplete = scenes.filter(s =>
    assets.some(a => a.scene_id === s.id && a.type === 'image' && a.status === 'complete')
  ).length
  const videosComplete = scenes.filter(s =>
    assets.some(a => a.scene_id === s.id && a.type === 'video' && a.status === 'complete')
  ).length

  const phaseInfo = PHASE_LABELS[currentPhase]

  // Cost estimate based on current phase
  const getCostForPhase = () => {
    const estimate = getCostEstimate(scenes.length)
    switch (currentPhase) {
      case 'phase_a':
        return { label: '1 image', cost: estimate.images.unitCost }
      case 'phase_b':
        return { label: `${scenes.length - 1} images`, cost: (scenes.length - 1) * estimate.images.unitCost }
      case 'phase_c':
        return { label: '1 video', cost: estimate.videos.costPerSecond * 5 }
      case 'phase_d':
        return { label: `${scenes.length - 1} videos`, cost: (scenes.length - 1) * estimate.videos.costPerSecond * 5 }
      default:
        return { label: '', cost: 0 }
    }
  }

  const phaseCost = getCostForPhase()

  const canConfirm = () => {
    switch (currentPhase) {
      case 'phase_a':
        return firstScene && assets.some(
          a => a.scene_id === firstScene.id && a.type === 'image' && a.status === 'complete'
        )
      case 'phase_b':
        return imagesComplete === scenes.length
      case 'phase_c':
        return firstScene && assets.some(
          a => a.scene_id === firstScene.id && a.type === 'video' && a.status === 'complete'
        ) && videoStyle.trim().length > 0
      case 'phase_d':
        return videosComplete === scenes.length
      default:
        return false
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-6xl mx-auto space-y-8">
          {/* Header */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-purple-500/10 mb-4">
              {currentPhase === 'phase_a' || currentPhase === 'phase_b' ? (
              <ImageIcon className="w-8 h-8 text-purple-400" />
              ) : (
                <Video className="w-8 h-8 text-purple-400" />
              )}
            </div>
            <h1 className="text-2xl font-bold text-white">{phaseInfo.title}</h1>
            <p className="text-gray-400 mt-2">{phaseInfo.description}</p>
          </div>

          {/* Phase Progress */}
          <div className="flex items-center justify-center gap-2">
            {(['phase_a', 'phase_b', 'phase_c', 'phase_d'] as Phase[]).map((phase, idx) => (
              <div key={phase} className="flex items-center">
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium',
                  currentPhase === phase 
                    ? 'bg-purple-500 text-white' 
                    : (currentPhase === 'complete' || 
                       (['phase_a', 'phase_b', 'phase_c', 'phase_d'].indexOf(currentPhase) > idx))
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-gray-700 text-gray-400'
                )}>
                  {(currentPhase === 'complete' || 
                    (['phase_a', 'phase_b', 'phase_c', 'phase_d'].indexOf(currentPhase) > idx)) 
                    ? <Check className="w-4 h-4" /> 
                    : String.fromCharCode(65 + idx)}
                </div>
                {idx < 3 && (
                  <ChevronRight className="w-4 h-4 text-gray-600 mx-1" />
              )}
            </div>
            ))}
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/50 text-red-400">
              {error}
            </div>
          )}

          {/* Phase A: First Image */}
          {currentPhase === 'phase_a' && firstScene && (
            <div className="space-y-6">
              <div className="rounded-xl border border-[rgb(45,45,55)] bg-[rgb(18,18,22)] overflow-hidden">
                <div className="aspect-video bg-gradient-to-br from-[rgb(30,30,36)] to-[rgb(40,40,48)] relative">
                  {getSceneAssets(firstScene.id).image?.storage_path ? (
                    <img
                      src={getSceneAssets(firstScene.id).image!.storage_path!}
                      alt="Scene 1"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      {isGenerating ? (
                        <Loader2 className="w-12 h-12 text-purple-400 animate-spin" />
                      ) : (
                        <ImageIcon className="w-12 h-12 text-gray-600" />
                      )}
                    </div>
                  )}
                  <div className="absolute top-4 left-4 px-3 py-1.5 rounded-lg bg-black/50 text-sm text-white font-medium">
                    Scene 1 - Reference Image
                  </div>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Image Prompt
                    </label>
                    <Textarea
                      value={editingImagePrompt}
                      onChange={(e) => setEditingImagePrompt(e.target.value)}
                      placeholder="Describe the visual style and content for this scene..."
                      rows={4}
                    />
                  </div>
                  <p className="text-sm text-gray-500">
                    {firstScene.script_segment}
                  </p>
                </div>
              </div>

              <div className="flex justify-center">
                <Button
                  onClick={() => setShowCostModal(true)}
                  isLoading={isGenerating}
                  size="lg"
                >
                  <Play className="w-4 h-4 mr-2" />
                  {getSceneAssets(firstScene.id).image ? 'Regenerate Image' : 'Generate Image'}
                </Button>
              </div>
            </div>
          )}

          {/* Phase B: Remaining Images */}
          {currentPhase === 'phase_b' && (
            <div className="space-y-6">
              {/* First scene with warning */}
              {firstScene && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                  <div className="flex items-start gap-4">
                    <div className="w-32 h-20 rounded-lg overflow-hidden bg-[rgb(30,30,36)] flex-shrink-0">
                      {getSceneAssets(firstScene.id).image?.storage_path && (
                        <img
                          src={getSceneAssets(firstScene.id).image!.storage_path!}
                          alt="Scene 1"
                          className="w-full h-full object-cover"
                        />
                      )}
                      </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-white">Scene 1 - Reference Image</span>
                        <span className="px-2 py-0.5 rounded text-xs bg-green-500/20 text-green-400">Confirmed</span>
                      </div>
                      <p className="text-sm text-gray-400 mb-2">This image is used as the style reference for all other images.</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowResetWarning(true)}
                        className="text-amber-400 hover:text-amber-300"
                      >
                        <AlertTriangle className="w-3 h-3 mr-1" />
                        Regenerate First Image
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Progress */}
                      <div className="flex items-center justify-between">
                <div className="text-sm">
                  <span className="text-gray-400">Images:</span>
                  <span className="text-white ml-2 font-medium">
                    {imagesComplete} / {scenes.length} complete
                        </span>
                </div>
                          <Button
                  onClick={() => setShowCostModal(true)}
                  isLoading={isGenerating}
                  disabled={imagesComplete === scenes.length}
                >
                  <Play className="w-4 h-4 mr-2" />
                  Generate Remaining Images
                          </Button>
              </div>

              {/* Scene grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {scenes.filter(s => s.order_index > 1).map((scene) => {
                  const sceneAssets = getSceneAssets(scene.id)
                  const isCurrentlyGenerating = generatingSceneId === scene.id

                  return (
                    <SceneCard
                      key={scene.id}
                      scene={scene}
                      asset={sceneAssets.image}
                      type="image"
                      isGenerating={isCurrentlyGenerating || (isGenerating && !sceneAssets.image)}
                      onRegenerate={(prompt) => handleRegenerateImage(scene.id, prompt)}
                    />
                  )
                })}
              </div>
            </div>
          )}

          {/* Phase C: First Video */}
          {currentPhase === 'phase_c' && firstScene && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* First scene image (locked) */}
                <div className="rounded-xl border border-[rgb(45,45,55)] bg-[rgb(18,18,22)] overflow-hidden">
                  <div className="aspect-video bg-gradient-to-br from-[rgb(30,30,36)] to-[rgb(40,40,48)] relative">
                    {getSceneAssets(firstScene.id).image?.storage_path && (
                      <img
                        src={getSceneAssets(firstScene.id).image!.storage_path!}
                        alt="Scene 1"
                        className="w-full h-full object-cover"
                      />
                    )}
                    <div className="absolute top-4 left-4 px-3 py-1.5 rounded-lg bg-black/50 text-sm text-white font-medium">
                      Scene 1 Image
                    </div>
                  </div>
                </div>

                {/* First video preview */}
                <div className="rounded-xl border border-[rgb(45,45,55)] bg-[rgb(18,18,22)] overflow-hidden">
                  <div className="aspect-video bg-gradient-to-br from-[rgb(30,30,36)] to-[rgb(40,40,48)] relative">
                    {getSceneAssets(firstScene.id).video?.storage_path ? (
                      <video
                        src={getSceneAssets(firstScene.id).video!.storage_path!}
                        crossOrigin="anonymous"
                        className="w-full h-full object-cover"
                        controls
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        {isGenerating ? (
                          <Loader2 className="w-12 h-12 text-purple-400 animate-spin" />
                        ) : (
                          <Video className="w-12 h-12 text-gray-600" />
                        )}
                      </div>
                    )}
                    <div className="absolute top-4 left-4 px-3 py-1.5 rounded-lg bg-black/50 text-sm text-white font-medium">
                      Scene 1 Video
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-[rgb(45,45,55)] bg-[rgb(18,18,22)] p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Video Style <span className="text-purple-400">(applied to all videos)</span>
                  </label>
                  <Textarea
                    value={videoStyle}
                    onChange={(e) => setVideoStyle(e.target.value)}
                    placeholder="e.g., Slow cinematic camera movement, dramatic lighting, 8K quality, film grain..."
                    rows={3}
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    This style will be used as a prefix for all video generation prompts.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Scene 1 Video Prompt (optional)
                  </label>
                  <Textarea
                    value={editingVideoPrompt}
                    onChange={(e) => setEditingVideoPrompt(e.target.value)}
                    placeholder="Additional motion or content details for this scene..."
                    rows={2}
                  />
                </div>
              </div>

              <div className="flex justify-center">
                <Button
                  onClick={() => setShowCostModal(true)}
                  isLoading={isGenerating}
                  size="lg"
                  disabled={!videoStyle.trim()}
                >
                  <Play className="w-4 h-4 mr-2" />
                  {getSceneAssets(firstScene.id).video ? 'Regenerate Video' : 'Generate Video'}
                </Button>
              </div>
            </div>
          )}

          {/* Phase D: Remaining Videos */}
          {currentPhase === 'phase_d' && (
            <div className="space-y-6">
              {/* Video style display */}
              <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-4">
                <div className="flex items-start gap-3">
                  <Video className="w-5 h-5 text-purple-400 mt-0.5" />
                  <div>
                    <span className="text-sm font-medium text-white">Confirmed Video Style</span>
                    <p className="text-sm text-gray-400 mt-1">{shotList?.video_style}</p>
                  </div>
                </div>
              </div>

              {/* Progress */}
              <div className="flex items-center justify-between">
                <div className="text-sm">
                  <span className="text-gray-400">Videos:</span>
                  <span className="text-white ml-2 font-medium">
                    {videosComplete} / {scenes.length} complete
                  </span>
                </div>
                <Button
                  onClick={() => setShowCostModal(true)}
                  isLoading={isGenerating}
                  disabled={videosComplete === scenes.length}
                >
                  <Play className="w-4 h-4 mr-2" />
                  Generate Remaining Videos
                </Button>
              </div>

              {/* Scene grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {scenes.map((scene) => {
                  const sceneAssets = getSceneAssets(scene.id)
                  const isCurrentlyGenerating = generatingSceneId === scene.id

                  return (
                    <SceneCard
                      key={scene.id}
                      scene={scene}
                      asset={sceneAssets.video}
                      type="video"
                      isGenerating={isCurrentlyGenerating || (isGenerating && !sceneAssets.video)}
                      onRegenerate={(prompt) => handleRegenerateVideo(scene.id, prompt)}
                      isFirst={scene.order_index === 1}
                    />
                  )
                })}
              </div>
            </div>
          )}

          {/* Complete state - show all generated scenes */}
          {currentPhase === 'complete' && (
            <div className="space-y-6">
              {/* Success banner */}
              <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                      <Check className="w-5 h-5 text-green-400" />
                    </div>
                    <div>
                      <h3 className="text-white font-medium">All Visuals Complete!</h3>
                      <p className="text-sm text-gray-400">
                        {scenes.length} images and {scenes.length} videos generated
                      </p>
                    </div>
                  </div>
                  <Button onClick={() => router.push(`/project/${projectId}/voice`)}>
                    Continue to Voice
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>

              {/* Video style display */}
              {shotList?.video_style && (
                <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-4">
                  <div className="flex items-start gap-3">
                    <Video className="w-5 h-5 text-purple-400 mt-0.5" />
                    <div>
                      <span className="text-sm font-medium text-white">Video Style</span>
                      <p className="text-sm text-gray-400 mt-1">{shotList.video_style}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* All scenes grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {scenes.map((scene) => {
                  const sceneAssets = getSceneAssets(scene.id)

                  return (
                    <div
                      key={scene.id}
                      className={cn(
                        "rounded-xl border bg-[rgb(18,18,22)] overflow-hidden",
                        scene.order_index === 1 ? "border-purple-500/30" : "border-[rgb(45,45,55)]"
                      )}
                    >
                      {/* Video/Image preview */}
                      <div className="aspect-video bg-gradient-to-br from-[rgb(30,30,36)] to-[rgb(40,40,48)] relative">
                        {sceneAssets.video?.storage_path ? (
                          <video
                            src={sceneAssets.video.storage_path}
                            crossOrigin="anonymous"
                            className="w-full h-full object-cover"
                            controls
                            poster={sceneAssets.image?.storage_path || undefined}
                          />
                        ) : sceneAssets.image?.storage_path ? (
                          <img
                            src={sceneAssets.image.storage_path}
                            alt={`Scene ${scene.order_index}`}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ImageIcon className="w-8 h-8 text-gray-600" />
                          </div>
                        )}

                        {/* Scene number */}
                        <div className="absolute top-2 left-2 px-2 py-1 rounded bg-black/50 text-xs text-white">
                          Scene {scene.order_index}
                          {scene.order_index === 1 && <span className="ml-1 text-purple-400">(Reference)</span>}
                        </div>

                        {/* Complete badge */}
                        <div className="absolute top-2 right-2 px-2 py-1 rounded text-xs font-medium bg-green-500/20 text-green-400">
                          <Check className="w-3 h-3 inline mr-1" />
                          complete
                        </div>
                      </div>

                      {/* Scene info */}
                      <div className="p-4 space-y-2">
                        <p className="text-sm text-gray-300 line-clamp-2">
                          {scene.script_segment}
                        </p>
                        <div className="text-xs text-gray-500">
                          {scene.duration_seconds}s • {scene.motion_type}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
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
                <span className="text-gray-400">{phaseCost.label}</span>
                <span className="text-white">${phaseCost.cost.toFixed(2)}</span>
              </div>
              <div className="border-t border-[rgb(45,45,55)] pt-3 flex justify-between">
                <span className="font-medium text-white">Total</span>
                <span className="font-medium text-purple-400">${phaseCost.cost.toFixed(2)}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="ghost" className="flex-1" onClick={() => setShowCostModal(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  setShowCostModal(false)
                  if (currentPhase === 'phase_a') handleGenerateFirstImage()
                  else if (currentPhase === 'phase_b') handleGenerateRemainingImages()
                  else if (currentPhase === 'phase_c') handleGenerateFirstVideo()
                  else if (currentPhase === 'phase_d') handleGenerateRemainingVideos()
                }}
              >
                Generate
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Warning Modal */}
      {showResetWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowResetWarning(false)} />
          <div className="relative w-full max-w-md rounded-2xl border border-[rgb(45,45,55)] bg-[rgb(18,18,22)] p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Reset to First Image?</h2>
                <p className="text-sm text-gray-400">This action cannot be undone</p>
              </div>
            </div>

            <p className="text-sm text-gray-300 mb-6">
              Regenerating the first image will <strong className="text-white">delete all other generated images</strong> since they use it as a style reference. You'll need to regenerate all images again.
            </p>

            <div className="flex gap-3">
              <Button variant="ghost" className="flex-1" onClick={() => setShowResetWarning(false)}>
                Cancel
              </Button>
              <Button
                variant="secondary"
                className="flex-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400"
                onClick={handleResetToFirstImage}
              >
                Reset & Regenerate
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Approval Footer */}
      {currentPhase !== 'complete' && scenes.length > 0 && (
        <div className="flex items-center justify-between p-4 border-t border-[rgb(45,45,55)] bg-[rgb(14,14,18)]">
          <div className="text-sm text-gray-400">
            {currentPhase === 'phase_a' && 'Generate and approve the first image to continue'}
            {currentPhase === 'phase_b' && `${imagesComplete}/${scenes.length} images complete`}
            {currentPhase === 'phase_c' && 'Generate and approve the first video to continue'}
            {currentPhase === 'phase_d' && `${videosComplete}/${scenes.length} videos complete`}
          </div>

          <Button
            onClick={handleConfirmPhase}
            isLoading={isConfirming}
            disabled={!canConfirm() || isGenerating}
          >
            <Check className="w-4 h-4 mr-2" />
            {currentPhase === 'phase_d' ? 'Complete & Continue to Voice' : 'Confirm & Continue'}
            <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      )}
    </div>
  )
}

// Scene Card Component
interface SceneCardProps {
  scene: Scene
  asset: Asset | undefined
  type: 'image' | 'video'
  isGenerating: boolean
  onRegenerate: (prompt?: string) => void
  isFirst?: boolean
}

function SceneCard({ scene, asset, type, isGenerating, onRegenerate, isFirst }: SceneCardProps) {
  const [editingPrompt, setEditingPrompt] = useState(
    type === 'image' ? scene.image_prompt || '' : scene.video_prompt || ''
  )
  const [showEdit, setShowEdit] = useState(false)

  return (
    <div className={cn(
      "rounded-xl border bg-[rgb(18,18,22)] overflow-hidden",
      isFirst ? "border-purple-500/30" : "border-[rgb(45,45,55)]"
    )}>
      <div className="aspect-video bg-gradient-to-br from-[rgb(30,30,36)] to-[rgb(40,40,48)] relative">
        {asset?.storage_path ? (
          type === 'image' ? (
            <img
              src={asset.storage_path}
              alt={`Scene ${scene.order_index}`}
              className="w-full h-full object-cover"
            />
          ) : (
            <video
              src={asset.storage_path}
              crossOrigin="anonymous"
              className="w-full h-full object-cover"
              controls
            />
          )
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {isGenerating ? (
              <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
            ) : type === 'image' ? (
              <ImageIcon className="w-8 h-8 text-gray-600" />
            ) : (
              <Video className="w-8 h-8 text-gray-600" />
            )}
          </div>
        )}

        {/* Status badge */}
        <div className={cn(
          'absolute top-2 right-2 px-2 py-1 rounded text-xs font-medium',
          asset?.status === 'complete' && 'bg-green-500/20 text-green-400',
          !asset && 'bg-gray-500/20 text-gray-400',
          isGenerating && 'bg-purple-500/20 text-purple-400'
        )}>
          {asset?.status === 'complete' && <Check className="w-3 h-3 inline mr-1" />}
          {isGenerating && <Loader2 className="w-3 h-3 inline mr-1 animate-spin" />}
          {asset?.status === 'complete' ? 'complete' : isGenerating ? 'generating' : 'pending'}
        </div>

        {/* Scene number */}
        <div className="absolute top-2 left-2 px-2 py-1 rounded bg-black/50 text-xs text-white">
          Scene {scene.order_index}
          {isFirst && <span className="ml-1 text-purple-400">(Reference)</span>}
        </div>
      </div>

      <div className="p-4 space-y-3">
        <p className="text-sm text-gray-300 line-clamp-2">
          {scene.script_segment}
        </p>

        {showEdit ? (
          <div className="space-y-2">
            <Textarea
              value={editingPrompt}
              onChange={(e) => setEditingPrompt(e.target.value)}
              placeholder={`${type === 'image' ? 'Image' : 'Video'} prompt...`}
              rows={2}
              className="text-sm"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowEdit(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  onRegenerate(editingPrompt)
                  setShowEdit(false)
                }}
                isLoading={isGenerating}
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                Regenerate
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">
              {scene.duration_seconds}s • {scene.motion_type}
            </span>

            {asset?.status === 'complete' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowEdit(true)}
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                Edit & Regenerate
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
