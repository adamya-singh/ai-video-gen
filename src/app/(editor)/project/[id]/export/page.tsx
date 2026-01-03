'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Download, Play, Pause, Film, Music, Volume2, Check, Loader2, Clock, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ExportPageProps {
  params: Promise<{ id: string }>
}

interface Scene {
  id: string
  order_index: number
  duration_seconds: number | null
}

interface Asset {
  id: string
  scene_id: string
  type: 'image' | 'video' | 'voice'
  storage_path: string | null
}

interface Project {
  id: string
  title: string
  aspect_ratio: string | null
}

const MUSIC_TRACKS = [
  { id: 'none', name: 'No Music', duration: '0:00' },
  { id: 'ambient', name: 'Ambient Documentary', duration: '3:45' },
  { id: 'dramatic', name: 'Dramatic Tension', duration: '4:20' },
  { id: 'uplifting', name: 'Uplifting Discovery', duration: '3:30' },
]

const QUALITY_OPTIONS = [
  { value: '1080p', label: '1080p HD', description: 'Standard quality, faster export' },
  { value: '4k', label: '4K Ultra HD', description: 'Best quality, slower export' },
]

export default function ExportPage({ params }: ExportPageProps) {
  const { id: projectId } = use(params)
  const [project, setProject] = useState<Project | null>(null)
  const [scenes, setScenes] = useState<Scene[]>([])
  const [assets, setAssets] = useState<Record<string, Asset[]>>({})
  const [selectedMusic, setSelectedMusic] = useState('ambient')
  const [selectedQuality, setSelectedQuality] = useState('1080p')
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [exportComplete, setExportComplete] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // Load project data
  useEffect(() => {
    async function loadData() {
      const { data: projectData } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single()

      if (projectData) {
        setProject(projectData)
      }

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

  const handleExport = async () => {
    setIsExporting(true)
    setExportProgress(0)

    // Simulate export progress
    const interval = setInterval(() => {
      setExportProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval)
          setExportComplete(true)
          setIsExporting(false)
          return 100
        }
        return prev + Math.random() * 15
      })
    }, 500)
  }

  const handleDownload = () => {
    // In a real implementation, this would download the exported video
    alert('Download would start here. Video rendering with ffmpeg.wasm is not yet implemented.')
  }

  const totalDuration = scenes.reduce((acc, s) => acc + (s.duration_seconds || 0), 0)
  const hasAllAssets = scenes.every(s => {
    const sceneAssets = assets[s.id] || []
    return sceneAssets.some(a => a.type === 'video') && sceneAssets.some(a => a.type === 'voice')
  })

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Header */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-purple-500/10 mb-4">
              <Download className="w-8 h-8 text-purple-400" />
            </div>
            <h1 className="text-2xl font-bold text-white">Step 6: Export Video</h1>
            <p className="text-gray-400 mt-2">
              Review and export your finished documentary
            </p>
          </div>

          {/* Preview */}
          <div className="rounded-xl border border-[rgb(45,45,55)] bg-[rgb(18,18,22)] overflow-hidden">
            <div className={cn(
              'aspect-video bg-gradient-to-br from-[rgb(30,30,36)] to-[rgb(40,40,48)] relative flex items-center justify-center',
              project?.aspect_ratio === '9:16' && 'aspect-[9/16] max-w-xs mx-auto'
            )}>
              <Film className="w-16 h-16 text-gray-600" />
              
              {/* Play overlay */}
              <button
                onClick={() => setIsPreviewPlaying(!isPreviewPlaying)}
                className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 hover:opacity-100 transition-opacity"
              >
                <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                  {isPreviewPlaying ? (
                    <Pause className="w-8 h-8 text-white" />
                  ) : (
                    <Play className="w-8 h-8 text-white ml-1" />
                  )}
                </div>
              </button>

              {/* Duration */}
              <div className="absolute bottom-4 right-4 px-3 py-1.5 rounded-lg bg-black/50 text-sm text-white">
                {Math.floor(totalDuration / 60)}:{(totalDuration % 60).toString().padStart(2, '0')}
              </div>
            </div>

            {/* Project info */}
            <div className="p-4 border-t border-[rgb(45,45,55)]">
              <h2 className="font-semibold text-white">{project?.title}</h2>
              <div className="flex items-center gap-4 mt-2 text-sm text-gray-400">
                <span className="flex items-center gap-1">
                  <Film className="w-4 h-4" />
                  {scenes.length} scenes
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {Math.floor(totalDuration / 60)}:{(totalDuration % 60).toString().padStart(2, '0')}
                </span>
                <span className="px-2 py-0.5 rounded bg-[rgb(30,30,36)]">
                  {project?.aspect_ratio}
                </span>
              </div>
            </div>
          </div>

          {/* Music selection */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Music className="w-5 h-5 text-purple-400" />
              <h2 className="text-lg font-semibold text-white">Background Music</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {MUSIC_TRACKS.map((track) => (
                <button
                  key={track.id}
                  onClick={() => setSelectedMusic(track.id)}
                  className={cn(
                    'p-4 rounded-xl border text-left transition-all duration-200',
                    selectedMusic === track.id
                      ? 'border-purple-500 bg-purple-500/10'
                      : 'border-[rgb(45,45,55)] bg-[rgb(18,18,22)] hover:border-gray-600'
                  )}
                >
                  <p className={cn(
                    'font-medium text-sm',
                    selectedMusic === track.id ? 'text-white' : 'text-gray-300'
                  )}>
                    {track.name}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">{track.duration}</p>
                  {selectedMusic === track.id && (
                    <Check className="w-4 h-4 text-purple-400 mt-2" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Quality selection */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-purple-400" />
              <h2 className="text-lg font-semibold text-white">Export Quality</h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {QUALITY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setSelectedQuality(option.value)}
                  className={cn(
                    'p-4 rounded-xl border text-left transition-all duration-200',
                    selectedQuality === option.value
                      ? 'border-purple-500 bg-purple-500/10'
                      : 'border-[rgb(45,45,55)] bg-[rgb(18,18,22)] hover:border-gray-600'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={cn(
                        'font-medium',
                        selectedQuality === option.value ? 'text-white' : 'text-gray-300'
                      )}>
                        {option.label}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">{option.description}</p>
                    </div>
                    {selectedQuality === option.value && (
                      <Check className="w-5 h-5 text-purple-400" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Export progress */}
          {(isExporting || exportComplete) && (
            <div className="p-6 rounded-xl border border-[rgb(45,45,55)] bg-[rgb(18,18,22)]">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  {exportComplete ? (
                    <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                      <Check className="w-5 h-5 text-green-400" />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                      <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-white">
                      {exportComplete ? 'Export Complete!' : 'Rendering video...'}
                    </p>
                    <p className="text-sm text-gray-400">
                      {exportComplete 
                        ? 'Your video is ready to download'
                        : `Processing ${selectedQuality} video...`}
                    </p>
                  </div>
                </div>
                <span className="text-2xl font-bold text-purple-400">
                  {Math.round(Math.min(exportProgress, 100))}%
                </span>
              </div>

              <div className="h-2 rounded-full bg-[rgb(30,30,36)] overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-300',
                    exportComplete
                      ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                      : 'bg-gradient-to-r from-purple-600 to-violet-600'
                  )}
                  style={{ width: `${Math.min(exportProgress, 100)}%` }}
                />
              </div>

              {exportComplete && (
                <Button className="w-full mt-4" onClick={handleDownload}>
                  <Download className="w-4 h-4 mr-2" />
                  Download Video
                </Button>
              )}
            </div>
          )}

          {/* Export button */}
          {!isExporting && !exportComplete && (
            <div className="text-center">
              <Button
                size="lg"
                onClick={handleExport}
                disabled={!hasAllAssets}
              >
                <Film className="w-5 h-5 mr-2" />
                Export Video
              </Button>
              {!hasAllAssets && (
                <p className="text-sm text-gray-500 mt-2">
                  Some assets are missing. Go back to generate all visual and voice assets.
                </p>
              )}
            </div>
          )}

          {/* Scene timeline */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white">Timeline</h2>
            <div className="rounded-xl border border-[rgb(45,45,55)] bg-[rgb(18,18,22)] p-4">
              <div className="flex gap-1 overflow-x-auto pb-2">
                {scenes.map((scene) => {
                  const sceneAssets = assets[scene.id] || []
                  const hasVideo = sceneAssets.some(a => a.type === 'video')
                  const hasVoice = sceneAssets.some(a => a.type === 'voice')
                  const imageAsset = sceneAssets.find(a => a.type === 'image')
                  const width = Math.max((scene.duration_seconds || 10) * 8, 80)

                  return (
                    <div
                      key={scene.id}
                      className="shrink-0 rounded-lg overflow-hidden border border-[rgb(45,45,55)]"
                      style={{ width }}
                    >
                      {/* Thumbnail */}
                      <div className="aspect-video bg-[rgb(30,30,36)] relative">
                        {imageAsset?.storage_path ? (
                          <img
                            src={imageAsset.storage_path}
                            alt={`Scene ${scene.order_index}`}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Film className="w-4 h-4 text-gray-600" />
                          </div>
                        )}
                        <span className="absolute top-1 left-1 px-1 py-0.5 text-[10px] bg-black/50 rounded text-white">
                          {scene.order_index}
                        </span>
                      </div>

                      {/* Asset indicators */}
                      <div className="flex items-center justify-center gap-1 py-1 bg-[rgb(14,14,18)]">
                        <Film className={cn('w-3 h-3', hasVideo ? 'text-green-400' : 'text-gray-600')} />
                        <Volume2 className={cn('w-3 h-3', hasVoice ? 'text-green-400' : 'text-gray-600')} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

