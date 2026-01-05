'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface VideoSource {
  url: string
  duration: number
  order: number
  thumbnailUrl?: string
}

interface SequentialVideoPlayerProps {
  videos: VideoSource[]
  aspectRatio?: string
  className?: string
  autoPlay?: boolean
}

export function SequentialVideoPlayer({
  videos,
  aspectRatio = '16:9',
  className,
  autoPlay = false,
}: SequentialVideoPlayerProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(autoPlay)
  const [isMuted, setIsMuted] = useState(false)
  const [progress, setProgress] = useState(0)
  const [totalDuration, setTotalDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)

  // Sort videos by order
  const sortedVideos = [...videos].sort((a, b) => a.order - b.order)
  const currentVideo = sortedVideos[currentIndex]

  // Calculate total duration
  useEffect(() => {
    const total = sortedVideos.reduce((acc, v) => acc + v.duration, 0)
    setTotalDuration(total)
  }, [sortedVideos])

  // Calculate elapsed time before current video
  const getElapsedBefore = useCallback((index: number) => {
    return sortedVideos.slice(0, index).reduce((acc, v) => acc + v.duration, 0)
  }, [sortedVideos])

  // Handle video end - move to next
  const handleVideoEnd = useCallback(() => {
    if (currentIndex < sortedVideos.length - 1) {
      setCurrentIndex(prev => prev + 1)
    } else {
      // Loop back to beginning or stop
      setCurrentIndex(0)
      setIsPlaying(false)
    }
  }, [currentIndex, sortedVideos.length])

  // Handle time update for progress bar
  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current && totalDuration > 0) {
      const elapsedBefore = getElapsedBefore(currentIndex)
      const currentVideoTime = videoRef.current.currentTime
      const totalElapsed = elapsedBefore + currentVideoTime
      
      setCurrentTime(totalElapsed)
      setProgress((totalElapsed / totalDuration) * 100)
    }
  }, [currentIndex, totalDuration, getElapsedBefore])

  // Play/pause control
  const togglePlay = useCallback(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause()
      } else {
        videoRef.current.play()
      }
      setIsPlaying(!isPlaying)
    }
  }, [isPlaying])

  // Skip to previous video
  const skipPrevious = useCallback(() => {
    if (videoRef.current && videoRef.current.currentTime > 2) {
      // If more than 2 seconds in, restart current video
      videoRef.current.currentTime = 0
    } else if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1)
    }
  }, [currentIndex])

  // Skip to next video
  const skipNext = useCallback(() => {
    if (currentIndex < sortedVideos.length - 1) {
      setCurrentIndex(prev => prev + 1)
    }
  }, [currentIndex, sortedVideos.length])

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted
      setIsMuted(!isMuted)
    }
  }, [isMuted])

  // Auto-play when video changes
  useEffect(() => {
    if (videoRef.current && isPlaying) {
      videoRef.current.play().catch(() => {
        // Auto-play might be blocked
        setIsPlaying(false)
      })
    }
  }, [currentIndex, isPlaying])

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Handle seeking via progress bar click
  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const percentage = clickX / rect.width
    const targetTime = percentage * totalDuration

    // Find which video this time falls into
    let accumulated = 0
    for (let i = 0; i < sortedVideos.length; i++) {
      if (accumulated + sortedVideos[i].duration > targetTime) {
        setCurrentIndex(i)
        // Set time within the video after it loads
        const timeInVideo = targetTime - accumulated
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.currentTime = timeInVideo
          }
        }, 100)
        break
      }
      accumulated += sortedVideos[i].duration
    }
  }, [totalDuration, sortedVideos])

  if (sortedVideos.length === 0) {
    return (
      <div className={cn(
        'bg-gradient-to-br from-[rgb(30,30,36)] to-[rgb(40,40,48)] flex items-center justify-center',
        aspectRatio === '9:16' ? 'aspect-[9/16]' : 'aspect-video',
        className
      )}>
        <p className="text-gray-500">No videos available</p>
      </div>
    )
  }

  return (
    <div className={cn('relative group', className)}>
      {/* Video container */}
      <div className={cn(
        'bg-black relative overflow-hidden',
        aspectRatio === '9:16' ? 'aspect-[9/16]' : 'aspect-video'
      )}>
        <video
          ref={videoRef}
          key={currentVideo.url}
          src={currentVideo.url}
          crossOrigin="anonymous"
          className="w-full h-full object-contain"
          onEnded={handleVideoEnd}
          onTimeUpdate={handleTimeUpdate}
          muted={isMuted}
          playsInline
          onClick={togglePlay}
        />

        {/* Play overlay when paused */}
        {!isPlaying && (
          <button
            onClick={togglePlay}
            className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors"
          >
            <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
              <Play className="w-8 h-8 text-white ml-1" />
            </div>
          </button>
        )}

        {/* Scene indicator */}
        <div className="absolute top-4 left-4 px-3 py-1.5 rounded-lg bg-black/50 text-sm text-white">
          Scene {currentIndex + 1} of {sortedVideos.length}
        </div>
      </div>

      {/* Controls - visible on hover */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity">
        {/* Progress bar */}
        <div 
          className="h-1 bg-white/20 rounded-full mb-3 cursor-pointer"
          onClick={handleSeek}
        >
          <div 
            className="h-full bg-purple-500 rounded-full relative"
            style={{ width: `${progress}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg" />
          </div>
          
          {/* Scene markers */}
          <div className="relative h-0">
            {sortedVideos.slice(0, -1).map((_, i) => {
              const markerPosition = (getElapsedBefore(i + 1) / totalDuration) * 100
              return (
                <div
                  key={i}
                  className="absolute top-[-4px] w-0.5 h-2 bg-white/40"
                  style={{ left: `${markerPosition}%` }}
                />
              )
            })}
          </div>
        </div>

        {/* Control buttons */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={skipPrevious}
              className="text-white/80 hover:text-white transition-colors"
            >
              <SkipBack className="w-5 h-5" />
            </button>
            
            <button
              onClick={togglePlay}
              className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 text-white" />
              ) : (
                <Play className="w-5 h-5 text-white ml-0.5" />
              )}
            </button>
            
            <button
              onClick={skipNext}
              className="text-white/80 hover:text-white transition-colors"
            >
              <SkipForward className="w-5 h-5" />
            </button>

            <button
              onClick={toggleMute}
              className="text-white/80 hover:text-white transition-colors"
            >
              {isMuted ? (
                <VolumeX className="w-5 h-5" />
              ) : (
                <Volume2 className="w-5 h-5" />
              )}
            </button>
          </div>

          <div className="text-sm text-white/80">
            {formatTime(currentTime)} / {formatTime(totalDuration)}
          </div>
        </div>
      </div>
    </div>
  )
}

