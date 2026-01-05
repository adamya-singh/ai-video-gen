'use client'

import { useState, useEffect, use, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { SequentialVideoPlayer, VideoSource } from '@/components/video/sequential-player'
import { 
  concatenateVideos, 
  concatenateWithMusic,
  downloadVideo, 
  createPreviewUrl,
  cleanupFFmpeg,
  ProcessingProgress 
} from '@/lib/video/ffmpeg-processor'
import { Download, Play, Film, Music, Volume2, Check, Loader2, Clock, Settings, AlertCircle } from 'lucide-react'
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
  { id: 'none', name: 'No Music', duration: '0:00', url: null },
  { id: 'ambient', name: 'Ambient Documentary', duration: '3:45', url: '/audio/ambient.mp3' },
  { id: 'dramatic', name: 'Dramatic Tension', duration: '4:20', url: '/audio/dramatic.mp3' },
  { id: 'uplifting', name: 'Uplifting Discovery', duration: '3:30', url: '/audio/uplifting.mp3' },
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
  const [selectedMusic, setSelectedMusic] = useState('none')
  const [selectedQuality, setSelectedQuality] = useState('1080p')
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState<ProcessingProgress | null>(null)
  const [exportedVideoUrl, setExportedVideoUrl] = useState<string | null>(null)
  const [exportedBlob, setExportedBlob] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)
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
            assetsByScene[asset.scene_id].push({
              ...asset,
              type: asset.type as 'image' | 'video' | 'voice',
            })
          })
          setAssets(assetsByScene)
        }
      }
    }
    loadData()
  }, [projectId, supabase])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (exportedVideoUrl) {
        URL.revokeObjectURL(exportedVideoUrl)
      }
      cleanupFFmpeg()
    }
  }, [exportedVideoUrl])

  // Get video sources for sequential player
  const videoSources: VideoSource[] = scenes
    .map(scene => {
      const sceneAssets = assets[scene.id] || []
      const videoAsset = sceneAssets.find(a => a.type === 'video' && a.storage_path)
      const imageAsset = sceneAssets.find(a => a.type === 'image' && a.storage_path)
      
      if (videoAsset?.storage_path) {
        return {
          url: videoAsset.storage_path,
          duration: scene.duration_seconds || 8,
          order: scene.order_index,
          thumbnailUrl: imageAsset?.storage_path ?? undefined,
        } as VideoSource
      }
      return null
    })
    .filter((v): v is VideoSource => v !== null)

  const handleProgressUpdate = useCallback((progress: ProcessingProgress) => {
    setExportProgress(progress)
  }, [])

  const handleExport = async () => {
    setIsExporting(true)
    setError(null)
    setExportProgress({ stage: 'loading', progress: 0, message: 'Starting export...' })

    // Clean up any previous export
    if (exportedVideoUrl) {
      URL.revokeObjectURL(exportedVideoUrl)
      setExportedVideoUrl(null)
    }
    setExportedBlob(null)

    try {
      // Prepare video clips data
      const clips = videoSources.map(v => ({
        url: v.url,
        duration: v.duration,
        order: v.order,
      }))

      let blob: Blob

      // Get selected music track
      const musicTrack = MUSIC_TRACKS.find(t => t.id === selectedMusic)
      
      if (musicTrack?.url) {
        // Concatenate with background music
        blob = await concatenateWithMusic(
          clips,
          musicTrack.url,
          0.3, // Music volume at 30%
          handleProgressUpdate
        )
      } else {
        // Just concatenate videos
        blob = await concatenateVideos(clips, handleProgressUpdate)
      }

      // Create preview URL
      const url = createPreviewUrl(blob)
      setExportedVideoUrl(url)
      setExportedBlob(blob)
      
      setExportProgress({
        stage: 'complete',
        progress: 100,
        message: 'Export complete!',
      })
    } catch (err) {
      console.error('Export failed:', err)
      setError(err instanceof Error ? err.message : 'Export failed. Please try again.')
      setExportProgress(null)
    } finally {
      setIsExporting(false)
    }
  }

  const handleDownload = () => {
    if (exportedBlob) {
      const filename = `${project?.title || 'documentary'}_${selectedQuality}.mp4`
        .toLowerCase()
        .replace(/\s+/g, '_')
      downloadVideo(exportedBlob, filename)
    }
  }

  const totalDuration = scenes.reduce((acc, s) => acc + (s.duration_seconds || 0), 0)
  
  // Only require video assets - voice is optional since videos have audio
  const hasAllVideos = scenes.length > 0 && scenes.every(s => {
    const sceneAssets = assets[s.id] || []
    return sceneAssets.some(a => a.type === 'video' && a.storage_path)
  })

  const exportComplete = exportProgress?.stage === 'complete' && exportedVideoUrl

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
              'relative',
              project?.aspect_ratio === '9:16' && 'max-w-xs mx-auto'
            )}>
              {exportedVideoUrl ? (
                // Show exported video
                <div className={cn(
                  'bg-black',
                  project?.aspect_ratio === '9:16' ? 'aspect-[9/16]' : 'aspect-video'
                )}>
                  <video
                    src={exportedVideoUrl}
                    crossOrigin="anonymous"
                    className="w-full h-full object-contain"
                    controls
                    autoPlay
                    playsInline
                  />
                </div>
              ) : videoSources.length > 0 ? (
                // Show sequential player for preview
                <SequentialVideoPlayer
                  videos={videoSources}
                  aspectRatio={project?.aspect_ratio || '16:9'}
                />
              ) : (
                // No videos placeholder
                <div className={cn(
                  'bg-gradient-to-br from-[rgb(30,30,36)] to-[rgb(40,40,48)] flex items-center justify-center',
                  project?.aspect_ratio === '9:16' ? 'aspect-[9/16]' : 'aspect-video'
                )}>
                  <Film className="w-16 h-16 text-gray-600" />
                </div>
              )}
            </div>

            {/* Project info */}
            <div className="p-4 border-t border-[rgb(45,45,55)]">
              <div className="flex items-center justify-between">
                <div>
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
                {exportComplete && (
                  <div className="flex items-center gap-2 text-green-400">
                    <Check className="w-5 h-5" />
                    <span className="font-medium">Stitched Preview</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/50 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-red-400 font-medium">Export Failed</p>
                <p className="text-red-400/80 text-sm mt-1">{error}</p>
              </div>
            </div>
          )}

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
                  disabled={isExporting}
                  className={cn(
                    'p-4 rounded-xl border text-left transition-all duration-200',
                    selectedMusic === track.id
                      ? 'border-purple-500 bg-purple-500/10'
                      : 'border-[rgb(45,45,55)] bg-[rgb(18,18,22)] hover:border-gray-600',
                    isExporting && 'opacity-50 cursor-not-allowed'
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
            <p className="text-xs text-gray-500">
              Note: Background music will be mixed with the existing video audio.
            </p>
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
                  disabled={isExporting}
                  className={cn(
                    'p-4 rounded-xl border text-left transition-all duration-200',
                    selectedQuality === option.value
                      ? 'border-purple-500 bg-purple-500/10'
                      : 'border-[rgb(45,45,55)] bg-[rgb(18,18,22)] hover:border-gray-600',
                    isExporting && 'opacity-50 cursor-not-allowed'
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
          {exportProgress && (
            <div className="p-6 rounded-xl border border-[rgb(45,45,55)] bg-[rgb(18,18,22)]">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  {exportProgress.stage === 'complete' ? (
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
                      {exportProgress.stage === 'complete' ? 'Export Complete!' : exportProgress.message}
                    </p>
                    <p className="text-sm text-gray-400">
                      {exportProgress.stage === 'complete' 
                        ? 'Your video is ready to download'
                        : `Stage: ${exportProgress.stage}`}
                    </p>
                  </div>
                </div>
                <span className="text-2xl font-bold text-purple-400">
                  {exportProgress.progress}%
                </span>
              </div>

              <div className="h-2 rounded-full bg-[rgb(30,30,36)] overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-300',
                    exportProgress.stage === 'complete'
                      ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                      : 'bg-gradient-to-r from-purple-600 to-violet-600'
                  )}
                  style={{ width: `${exportProgress.progress}%` }}
                />
              </div>

              {exportProgress.stage === 'complete' && exportedBlob && (
                <Button className="w-full mt-4" onClick={handleDownload}>
                  <Download className="w-4 h-4 mr-2" />
                  Download Video ({(exportedBlob.size / (1024 * 1024)).toFixed(1)} MB)
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
                disabled={!hasAllVideos}
              >
                <Film className="w-5 h-5 mr-2" />
                Export Video
              </Button>
              {!hasAllVideos && (
                <p className="text-sm text-gray-500 mt-2">
                  Some videos are missing. Go back to Step 4 to generate all video assets.
                </p>
              )}
            </div>
          )}

          {/* Re-export button when complete */}
          {exportComplete && (
            <div className="text-center">
              <Button
                variant="secondary"
                onClick={() => {
                  setExportProgress(null)
                  if (exportedVideoUrl) {
                    URL.revokeObjectURL(exportedVideoUrl)
                  }
                  setExportedVideoUrl(null)
                  setExportedBlob(null)
                }}
              >
                <Play className="w-4 h-4 mr-2" />
                Export with Different Settings
              </Button>
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
                        <Film className={cn('w-3 h-3', hasVideo ? 'text-green-400' : 'text-red-400')} />
                        <span title="Voice (optional)">
                          <Volume2 className={cn('w-3 h-3', hasVoice ? 'text-green-400' : 'text-gray-500')} />
                        </span>
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
