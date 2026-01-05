'use client'

// FFmpeg WASM processor
// Uses FFmpeg 0.10.1 which is a simpler single-file build without code splitting issues

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ffmpeg: any = null
let isLoaded = false

export interface VideoClip {
  url: string
  duration: number
  order: number
}

export interface ProcessingProgress {
  stage: 'loading' | 'fetching' | 'processing' | 'encoding' | 'complete'
  progress: number // 0-100
  message: string
}

export type ProgressCallback = (progress: ProcessingProgress) => void

/**
 * Fetch a file and return as Uint8Array
 */
async function fetchFile(input: string | URL | File | Blob): Promise<Uint8Array> {
  if (input instanceof File || input instanceof Blob) {
    const arrayBuffer = await input.arrayBuffer()
    return new Uint8Array(arrayBuffer)
  }
  
  const response = await fetch(input.toString())
  const arrayBuffer = await response.arrayBuffer()
  return new Uint8Array(arrayBuffer)
}

/**
 * Initialize and load FFmpeg WASM using the older 0.10.1 version
 * This version doesn't have code splitting issues
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function initFFmpeg(onProgress?: ProgressCallback): Promise<any> {
  if (ffmpeg && isLoaded) {
    return ffmpeg
  }

  onProgress?.({
    stage: 'loading',
    progress: 0,
    message: 'Loading FFmpeg...',
  })

  // Use FFmpeg 0.10.1 - older but simpler, no code splitting
  const ffmpegUrl = 'https://unpkg.com/@ffmpeg/ffmpeg@0.10.1/dist/ffmpeg.min.js'
  
  // Load the FFmpeg script via script tag
  await new Promise<void>((resolve, reject) => {
    // Check if already loaded
    if ((window as any).FFmpeg) {
      resolve()
      return
    }
    
    const script = document.createElement('script')
    script.src = ffmpegUrl
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load FFmpeg'))
    document.head.appendChild(script)
  })

  onProgress?.({
    stage: 'loading',
    progress: 30,
    message: 'Initializing FFmpeg...',
  })

  // Access FFmpeg from the global scope
  const { createFFmpeg, fetchFile: ffmpegFetchFile } = (window as any).FFmpeg
  if (!createFFmpeg) {
    throw new Error('FFmpeg not found in global scope')
  }

  // Create FFmpeg instance
  ffmpeg = createFFmpeg({
    log: true,
    progress: ({ ratio }: { ratio: number }) => {
      onProgress?.({
        stage: 'encoding',
        progress: Math.round(ratio * 100),
        message: `Encoding: ${Math.round(ratio * 100)}%`,
      })
    },
  })

  // Store fetchFile for later use
  ffmpeg._fetchFile = ffmpegFetchFile

  onProgress?.({
    stage: 'loading',
    progress: 50,
    message: 'Loading FFmpeg core...',
  })

  // Load the FFmpeg core
  await ffmpeg.load()

  isLoaded = true
  
  onProgress?.({
    stage: 'loading',
    progress: 100,
    message: 'FFmpeg loaded',
  })

  return ffmpeg
}

/**
 * Fetch video files and write them to FFmpeg's virtual filesystem
 */
async function fetchAndWriteVideos(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ffmpegInstance: any,
  clips: VideoClip[],
  onProgress?: ProgressCallback
): Promise<string[]> {
  const fileNames: string[] = []
  const totalClips = clips.length
  const ffmpegFetchFile = ffmpegInstance._fetchFile || fetchFile

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i]
    const fileName = `input${i}.mp4`
    
    onProgress?.({
      stage: 'fetching',
      progress: Math.round(((i + 1) / totalClips) * 100),
      message: `Fetching video ${i + 1} of ${totalClips}...`,
    })

    try {
      const videoData = await ffmpegFetchFile(clip.url)
      ffmpegInstance.FS('writeFile', fileName, videoData)
      fileNames.push(fileName)
    } catch (error) {
      console.error(`Failed to fetch video ${i}:`, error)
      throw new Error(`Failed to fetch video clip ${i + 1}`)
    }
  }

  return fileNames
}

/**
 * Create a concat demuxer file list for FFmpeg
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createConcatFile(ffmpegInstance: any, fileNames: string[]): void {
  const fileList = fileNames.map(name => `file '${name}'`).join('\n')
  const encoder = new TextEncoder()
  ffmpegInstance.FS('writeFile', 'filelist.txt', encoder.encode(fileList))
}

/**
 * Concatenate multiple video clips into a single video
 */
export async function concatenateVideos(
  clips: VideoClip[],
  onProgress?: ProgressCallback
): Promise<Blob> {
  // Sort clips by order
  const sortedClips = [...clips].sort((a, b) => a.order - b.order)
  
  // Initialize FFmpeg
  const ff = await initFFmpeg(onProgress)

  // Fetch and write all videos to virtual filesystem
  const fileNames = await fetchAndWriteVideos(ff, sortedClips, onProgress)

  onProgress?.({
    stage: 'processing',
    progress: 0,
    message: 'Preparing to concatenate videos...',
  })

  // Create concat file list
  createConcatFile(ff, fileNames)

  onProgress?.({
    stage: 'encoding',
    progress: 0,
    message: 'Concatenating videos...',
  })

  // Run FFmpeg concat command
  // Using concat demuxer which is fast when videos have same codec
  await ff.run(
    '-f', 'concat',
    '-safe', '0',
    '-i', 'filelist.txt',
    '-c', 'copy',
    'output.mp4'
  )

  onProgress?.({
    stage: 'complete',
    progress: 100,
    message: 'Reading output file...',
  })

  // Read the output file
  const outputData = ff.FS('readFile', 'output.mp4')
  
  // Clean up files from virtual filesystem
  for (const fileName of fileNames) {
    ff.FS('unlink', fileName)
  }
  ff.FS('unlink', 'filelist.txt')
  ff.FS('unlink', 'output.mp4')

  // Create blob from output
  const blob = new Blob([outputData.buffer], { type: 'video/mp4' })
  
  onProgress?.({
    stage: 'complete',
    progress: 100,
    message: 'Video ready!',
  })

  return blob
}

/**
 * Concatenate videos and mix with background music
 */
export async function concatenateWithMusic(
  clips: VideoClip[],
  musicUrl: string | null,
  musicVolume: number = 0.3,
  onProgress?: ProgressCallback
): Promise<Blob> {
  // Sort clips by order
  const sortedClips = [...clips].sort((a, b) => a.order - b.order)
  
  // Initialize FFmpeg
  const ff = await initFFmpeg(onProgress)
  const ffmpegFetchFile = ff._fetchFile || fetchFile

  // Fetch and write all videos
  const fileNames = await fetchAndWriteVideos(ff, sortedClips, onProgress)

  // Create concat file list
  createConcatFile(ff, fileNames)

  onProgress?.({
    stage: 'processing',
    progress: 0,
    message: 'Concatenating videos...',
  })

  // First, concatenate all videos
  await ff.run(
    '-f', 'concat',
    '-safe', '0',
    '-i', 'filelist.txt',
    '-c', 'copy',
    'concatenated.mp4'
  )

  // If no music, just return the concatenated video
  if (!musicUrl) {
    const outputData = ff.FS('readFile', 'concatenated.mp4')
    
    // Cleanup
    for (const fileName of fileNames) {
      ff.FS('unlink', fileName)
    }
    ff.FS('unlink', 'filelist.txt')
    ff.FS('unlink', 'concatenated.mp4')
    
    return new Blob([outputData.buffer], { type: 'video/mp4' })
  }

  onProgress?.({
    stage: 'processing',
    progress: 50,
    message: 'Adding background music...',
  })

  // Fetch and write music file
  const musicData = await ffmpegFetchFile(musicUrl)
  ff.FS('writeFile', 'music.mp3', musicData)

  onProgress?.({
    stage: 'encoding',
    progress: 0,
    message: 'Mixing audio tracks...',
  })

  // Mix the original audio with background music
  await ff.run(
    '-i', 'concatenated.mp4',
    '-i', 'music.mp3',
    '-filter_complex', `[0:a]volume=1.0[a0];[1:a]volume=${musicVolume}[a1];[a0][a1]amix=inputs=2:duration=first[aout]`,
    '-map', '0:v',
    '-map', '[aout]',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-shortest',
    'output.mp4'
  )

  onProgress?.({
    stage: 'complete',
    progress: 100,
    message: 'Reading output file...',
  })

  // Read the final output
  const outputData = ff.FS('readFile', 'output.mp4')

  // Cleanup all files
  for (const fileName of fileNames) {
    ff.FS('unlink', fileName)
  }
  ff.FS('unlink', 'filelist.txt')
  ff.FS('unlink', 'concatenated.mp4')
  ff.FS('unlink', 'music.mp3')
  ff.FS('unlink', 'output.mp4')

  const blob = new Blob([outputData.buffer], { type: 'video/mp4' })

  onProgress?.({
    stage: 'complete',
    progress: 100,
    message: 'Video with music ready!',
  })

  return blob
}

/**
 * Trigger browser download of a video blob
 */
export function downloadVideo(blob: Blob, filename: string = 'documentary.mp4'): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Create an object URL for preview
 */
export function createPreviewUrl(blob: Blob): string {
  return URL.createObjectURL(blob)
}

/**
 * Clean up FFmpeg resources
 */
export function cleanupFFmpeg(): void {
  if (ffmpeg) {
    try {
      ffmpeg.exit()
    } catch {
      // Ignore exit errors
    }
    ffmpeg = null
    isLoaded = false
  }
}
