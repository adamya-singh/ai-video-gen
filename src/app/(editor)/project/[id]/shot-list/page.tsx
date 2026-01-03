'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { ApprovalGate } from '@/components/editor/approval-gate'
import { LayoutGrid, Sparkles, GripVertical, Edit3, Trash2, Plus, Clock, Image as ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ShotListPageProps {
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

interface ShotListData {
  id: string
  approved_at: string | null
}

const MOTION_TYPES = [
  { value: 'ken_burns', label: 'Ken Burns', description: 'Slow pan & zoom' },
  { value: 'subtle', label: 'Subtle', description: 'Slight movement' },
  { value: 'cinematic', label: 'Cinematic', description: 'Camera moves' },
]

export default function ShotListPage({ params }: ShotListPageProps) {
  const { id: projectId } = use(params)
  const [shotList, setShotList] = useState<ShotListData | null>(null)
  const [scenes, setScenes] = useState<Scene[]>([])
  const [editingScene, setEditingScene] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isApproving, setIsApproving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const router = useRouter()
  const supabase = createClient()

  // Load existing shot list
  useEffect(() => {
    async function loadShotList() {
      const { data: shotListData } = await supabase
        .from('shot_lists')
        .select('*')
        .eq('project_id', projectId)
        .single()

      if (shotListData) {
        setShotList(shotListData)
        
        const { data: scenesData } = await supabase
          .from('scenes')
          .select('*')
          .eq('shot_list_id', shotListData.id)
          .order('order_index')

        if (scenesData) {
          setScenes(scenesData)
        }
      }
    }
    loadShotList()
  }, [projectId, supabase])

  const handleGenerate = async () => {
    setIsGenerating(true)
    setError(null)

    try {
      const response = await fetch('/api/generate/shot-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Generation failed')
      }

      setShotList(data.shotList)
      setScenes(data.scenes)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleDragStart = (index: number) => {
    setDraggedIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) return

    const newScenes = [...scenes]
    const draggedScene = newScenes[draggedIndex]
    newScenes.splice(draggedIndex, 1)
    newScenes.splice(index, 0, draggedScene)

    // Update order indices
    newScenes.forEach((scene, i) => {
      scene.order_index = i + 1
    })

    setScenes(newScenes)
    setDraggedIndex(index)
  }

  const handleDragEnd = async () => {
    setDraggedIndex(null)
    
    // Save new order to database
    for (const scene of scenes) {
      await supabase
        .from('scenes')
        .update({ order_index: scene.order_index })
        .eq('id', scene.id)
    }
  }

  const handleUpdateScene = async (sceneId: string, updates: Partial<Scene>) => {
    await supabase
      .from('scenes')
      .update(updates)
      .eq('id', sceneId)

    setScenes(scenes.map(s => s.id === sceneId ? { ...s, ...updates } : s))
    setEditingScene(null)
  }

  const handleDeleteScene = async (sceneId: string) => {
    if (!confirm('Delete this scene?')) return
    
    await supabase
      .from('scenes')
      .delete()
      .eq('id', sceneId)

    setScenes(scenes.filter(s => s.id !== sceneId))
  }

  const handleApprove = async () => {
    if (!shotList) return

    setIsApproving(true)

    try {
      await supabase
        .from('shot_lists')
        .update({ approved_at: new Date().toISOString() })
        .eq('id', shotList.id)

      await supabase
        .from('projects')
        .update({ current_step: 4 })
        .eq('id', projectId)

      router.push(`/project/${projectId}/visuals`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve')
    } finally {
      setIsApproving(false)
    }
  }

  const totalDuration = scenes.reduce((acc, s) => acc + (s.duration_seconds || 0), 0)

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-6xl mx-auto space-y-8">
          {/* Header */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-purple-500/10 mb-4">
              <LayoutGrid className="w-8 h-8 text-purple-400" />
            </div>
            <h1 className="text-2xl font-bold text-white">Step 3: Plan Shot List</h1>
            <p className="text-gray-400 mt-2">
              Plan your visual scenes with AI-generated prompts
            </p>
          </div>

          {/* Stats & Generate */}
          <div className="flex items-center justify-between">
            {scenes.length > 0 ? (
              <div className="flex items-center gap-6">
                <div className="text-sm">
                  <span className="text-gray-400">Scenes:</span>
                  <span className="text-white ml-2 font-medium">{scenes.length}</span>
                </div>
                <div className="text-sm flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-400">Duration:</span>
                  <span className="text-white font-medium">
                    {Math.floor(totalDuration / 60)}:{(totalDuration % 60).toString().padStart(2, '0')}
                  </span>
                </div>
              </div>
            ) : (
              <div />
            )}
            
            <Button
              onClick={handleGenerate}
              isLoading={isGenerating}
              variant={scenes.length > 0 ? 'secondary' : 'primary'}
            >
              <Sparkles className="w-4 h-4 mr-2" />
              {scenes.length > 0 ? 'Regenerate' : 'Generate Shot List'}
            </Button>
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/50 text-red-400">
              {error}
            </div>
          )}

          {/* Scene cards */}
          {scenes.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {scenes.map((scene, index) => (
                <div
                  key={scene.id}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  className={cn(
                    'group rounded-xl border bg-[rgb(18,18,22)] overflow-hidden transition-all duration-200',
                    draggedIndex === index
                      ? 'border-purple-500 ring-2 ring-purple-500/20'
                      : 'border-[rgb(45,45,55)] hover:border-gray-600'
                  )}
                >
                  {/* Thumbnail placeholder */}
                  <div className="aspect-video bg-gradient-to-br from-[rgb(30,30,36)] to-[rgb(40,40,48)] flex items-center justify-center relative">
                    <ImageIcon className="w-8 h-8 text-gray-600" />
                    <div className="absolute top-2 left-2 px-2 py-1 rounded bg-black/50 text-xs text-white">
                      Scene {scene.order_index}
                    </div>
                    <div className="absolute top-2 right-2 px-2 py-1 rounded bg-black/50 text-xs text-white">
                      {scene.duration_seconds}s
                    </div>
                    
                    {/* Drag handle */}
                    <div className="absolute left-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing">
                      <GripVertical className="w-5 h-5 text-white/70" />
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-4 space-y-3">
                    {editingScene === scene.id ? (
                      <SceneEditor
                        scene={scene}
                        onSave={(updates) => handleUpdateScene(scene.id, updates)}
                        onCancel={() => setEditingScene(null)}
                      />
                    ) : (
                      <>
                        <p className="text-sm text-gray-300 line-clamp-2">
                          {scene.script_segment}
                        </p>
                        
                        <div className="space-y-2">
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Image Prompt</p>
                            <p className="text-xs text-gray-400 line-clamp-2 font-mono bg-[rgb(14,14,18)] p-2 rounded">
                              {scene.image_prompt}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2">
                          <span className="text-xs px-2 py-1 rounded bg-purple-500/10 text-purple-400">
                            {MOTION_TYPES.find(m => m.value === scene.motion_type)?.label || 'Ken Burns'}
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setEditingScene(scene.id)}
                              className="p-1.5 rounded hover:bg-[rgb(30,30,36)] text-gray-500 hover:text-white"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteScene(scene.id)}
                              className="p-1.5 rounded hover:bg-red-500/10 text-gray-500 hover:text-red-400"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {shotList && scenes.length > 0 && (
        <ApprovalGate
          onRegenerate={handleGenerate}
          onApprove={handleApprove}
          isRegenerating={isGenerating}
          isApproving={isApproving}
          canApprove={scenes.length > 0}
        />
      )}
    </div>
  )
}

function SceneEditor({ 
  scene, 
  onSave, 
  onCancel 
}: { 
  scene: Scene
  onSave: (updates: Partial<Scene>) => void
  onCancel: () => void
}) {
  const [imagePrompt, setImagePrompt] = useState(scene.image_prompt || '')
  const [motionType, setMotionType] = useState(scene.motion_type || 'ken_burns')
  const [duration, setDuration] = useState(scene.duration_seconds || 15)

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-gray-500 mb-1 block">Image Prompt</label>
        <textarea
          value={imagePrompt}
          onChange={(e) => setImagePrompt(e.target.value)}
          className="w-full h-24 px-3 py-2 text-xs rounded border border-[rgb(45,45,55)] bg-[rgb(14,14,18)] text-white focus:border-purple-500 focus:outline-none resize-none"
        />
      </div>
      
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="text-xs text-gray-500 mb-1 block">Motion</label>
          <select
            value={motionType}
            onChange={(e) => setMotionType(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded border border-[rgb(45,45,55)] bg-[rgb(14,14,18)] text-white focus:border-purple-500 focus:outline-none"
          >
            {MOTION_TYPES.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
        <div className="w-20">
          <label className="text-xs text-gray-500 mb-1 block">Duration</label>
          <input
            type="number"
            value={duration}
            onChange={(e) => setDuration(parseInt(e.target.value))}
            className="w-full px-3 py-2 text-xs rounded border border-[rgb(45,45,55)] bg-[rgb(14,14,18)] text-white focus:border-purple-500 focus:outline-none"
            min={5}
            max={60}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button 
          size="sm" 
          onClick={() => onSave({ 
            image_prompt: imagePrompt, 
            motion_type: motionType,
            duration_seconds: duration 
          })}
        >
          Save
        </Button>
      </div>
    </div>
  )
}

