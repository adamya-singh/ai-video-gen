'use client'

// Dynamic imports are used to avoid Next.js bundler errors with @ffmpeg/ffmpeg
// The library uses internal dynamic imports that can't be statically analyzed

// Type for FFmpeg instance (imported dynamically at runtime)
type FFmpegInstance = InstanceType<Awaited<typeof import('@ffmpeg/ffmpeg')>['FFmpeg']>

// Singleton FFmpeg instance
let ffmpeg: FFmpegInstance | null = null
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
 * Initialize and load FFmpeg WASM
 */
export async function initFFmpeg(onProgress?: ProgressCallback): Promise<FFmpegInstance> {
  if (ffmpeg && isLoaded) {
    return ffmpeg
  }

  onProgress?.({
    stage: 'loading',
    progress: 0,
    message: 'Loading FFmpeg...',
  })

  // Dynamic import FFmpeg at runtime to avoid bundler issues
  const { FFmpeg } = await import('@ffmpeg/ffmpeg')
  const { toBlobURL } = await import('@ffmpeg/util')

  ffmpeg = new FFmpeg()

  // Set up logging for debugging
  ffmpeg.on('log', ({ message }) => {
    console.log('[FFmpeg]', message)
  })

  // Track encoding progress
  ffmpeg.on('progress', ({ progress }) => {
    onProgress?.({
      stage: 'encoding',
      progress: Math.round(progress * 100),
      message: `Encoding: ${Math.round(progress * 100)}%`,
    })
  })

  // Load FFmpeg core from CDN
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm'
  
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  })

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
  ffmpegInstance: FFmpegInstance,
  clips: VideoClip[],
  onProgress?: ProgressCallback
): Promise<string[]> {
  // Dynamic import fetchFile at runtime
  const { fetchFile } = await import('@ffmpeg/util')
  
  const fileNames: string[] = []
  const totalClips = clips.length

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i]
    const fileName = `input${i}.mp4`
    
    onProgress?.({
      stage: 'fetching',
      progress: Math.round(((i + 1) / totalClips) * 100),
      message: `Fetching video ${i + 1} of ${totalClips}...`,
    })

    try {
      const videoData = await fetchFile(clip.url)
      await ffmpegInstance.writeFile(fileName, videoData)
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
async function createConcatFile(ffmpegInstance: FFmpegInstance, fileNames: string[]): Promise<void> {
  const fileList = fileNames.map(name => `file '${name}'`).join('\n')
  const encoder = new TextEncoder()
  await ffmpegInstance.writeFile('filelist.txt', encoder.encode(fileList))
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
  await createConcatFile(ff, fileNames)

  onProgress?.({
    stage: 'encoding',
    progress: 0,
    message: 'Concatenating videos...',
  })

  // Run FFmpeg concat command
  // Using concat demuxer which is fast when videos have same codec
  await ff.exec([
    '-f', 'concat',
    '-safe', '0',
    '-i', 'filelist.txt',
    '-c', 'copy',
    'output.mp4'
  ])

  onProgress?.({
    stage: 'complete',
    progress: 100,
    message: 'Reading output file...',
  })

  // Read the output file
  const outputData = await ff.readFile('output.mp4')
  
  // Clean up files from virtual filesystem
  for (const fileName of fileNames) {
    await ff.deleteFile(fileName)
  }
  await ff.deleteFile('filelist.txt')
  await ff.deleteFile('output.mp4')

  // Create blob from output - convert to Uint8Array to ensure compatibility
  const blob = new Blob([new Uint8Array(outputData as Uint8Array)], { type: 'video/mp4' })
  
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

  // Fetch and write all videos
  const fileNames = await fetchAndWriteVideos(ff, sortedClips, onProgress)

  // Create concat file list
  await createConcatFile(ff, fileNames)

  onProgress?.({
    stage: 'processing',
    progress: 0,
    message: 'Concatenating videos...',
  })

  // First, concatenate all videos
  await ff.exec([
    '-f', 'concat',
    '-safe', '0',
    '-i', 'filelist.txt',
    '-c', 'copy',
    'concatenated.mp4'
  ])

  // If no music, just return the concatenated video
  if (!musicUrl) {
    const outputData = await ff.readFile('concatenated.mp4')
    
    // Cleanup
    for (const fileName of fileNames) {
      await ff.deleteFile(fileName)
    }
    await ff.deleteFile('filelist.txt')
    await ff.deleteFile('concatenated.mp4')
    
    return new Blob([new Uint8Array(outputData as Uint8Array)], { type: 'video/mp4' })
  }

  onProgress?.({
    stage: 'processing',
    progress: 50,
    message: 'Adding background music...',
  })

  // Dynamic import fetchFile for music
  const { fetchFile } = await import('@ffmpeg/util')
  
  // Fetch and write music file
  const musicData = await fetchFile(musicUrl)
  await ff.writeFile('music.mp3', musicData)

  onProgress?.({
    stage: 'encoding',
    progress: 0,
    message: 'Mixing audio tracks...',
  })

  // Mix the original audio with background music
  // The filter: mix original audio (volume 1.0) with music (volume specified)
  await ff.exec([
    '-i', 'concatenated.mp4',
    '-i', 'music.mp3',
    '-filter_complex', `[0:a]volume=1.0[a0];[1:a]volume=${musicVolume}[a1];[a0][a1]amix=inputs=2:duration=first[aout]`,
    '-map', '0:v',
    '-map', '[aout]',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-shortest',
    'output.mp4'
  ])

  onProgress?.({
    stage: 'complete',
    progress: 100,
    message: 'Reading output file...',
  })

  // Read the final output
  const outputData = await ff.readFile('output.mp4')

  // Cleanup all files
  for (const fileName of fileNames) {
    await ff.deleteFile(fileName)
  }
  await ff.deleteFile('filelist.txt')
  await ff.deleteFile('concatenated.mp4')
  await ff.deleteFile('music.mp3')
  await ff.deleteFile('output.mp4')

  const blob = new Blob([new Uint8Array(outputData as Uint8Array)], { type: 'video/mp4' })

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
    ffmpeg.terminate()
    ffmpeg = null
    isLoaded = false
  }
}
