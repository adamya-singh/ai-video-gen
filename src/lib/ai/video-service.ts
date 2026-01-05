import { getVertexAIClient, MODELS } from './vertex-client'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

export interface GenerateVideoResult {
  success: boolean
  videoBuffer?: Buffer
  videoUri?: string
  error?: string
}

// Polling configuration
const POLL_INTERVAL_MS = 5000 // 5 seconds between polls
const MAX_POLL_ATTEMPTS = 120 // 10 minutes max wait time (120 * 5s)

/**
 * Generate a video using Veo 3 and return the video buffer directly
 * This is an async operation that requires polling for completion
 */
export async function generateVideo(
  prompt: string,
  imageBase64?: string,
  durationSeconds: number = 5
): Promise<GenerateVideoResult> {
  try {
    const client = getVertexAIClient()

    // Build the generation parameters
    const params: {
      model: string
      prompt?: string
      image?: { imageBytes: string; mimeType: string }
      config?: {
        numberOfVideos?: number
        durationSeconds?: number
        aspectRatio?: string
        personGeneration?: string
        generateAudio?: boolean
      }
    } = {
      model: MODELS.VIDEO,
      prompt: prompt,
      config: {
        numberOfVideos: 1,
        durationSeconds: Math.min(durationSeconds, 8), // Veo max is 8 seconds
        aspectRatio: '16:9',
        generateAudio: true, // Veo supports audio generation
      },
    }

    // If we have an input image, use it as the starting frame
    if (imageBase64) {
      params.image = {
        imageBytes: imageBase64,
        mimeType: 'image/png',
      }
    }

    // Start the video generation operation
    const operation = await client.models.generateVideos(params)

    if (!operation.name) {
      return {
        success: false,
        error: 'No operation name returned',
      }
    }

    // Poll for completion
    let currentOperation = operation
    let attempts = 0

    while (!currentOperation.done && attempts < MAX_POLL_ATTEMPTS) {
      await sleep(POLL_INTERVAL_MS)
      attempts++

      currentOperation = await client.operations.getVideosOperation({
        operation: currentOperation,
      })

      // Log progress for debugging
      if (attempts % 6 === 0) {
        // Log every 30 seconds
        console.log(
          `Video generation in progress... (${attempts * 5}s elapsed, operation: ${operation.name})`
        )
      }
    }

    if (!currentOperation.done) {
      return {
        success: false,
        error: `Video generation timed out after ${(MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1000} seconds`,
      }
    }

    // Check for errors
    if (currentOperation.error) {
      return {
        success: false,
        error: `Video generation failed: ${JSON.stringify(currentOperation.error)}`,
      }
    }

    // Extract the video from the response
    const generatedVideos = currentOperation.response?.generatedVideos
    if (!generatedVideos || generatedVideos.length === 0) {
      // Check if filtered by RAI
      if (currentOperation.response?.raiMediaFilteredCount) {
        return {
          success: false,
          error: `Video filtered by content policy: ${currentOperation.response.raiMediaFilteredReasons?.join(', ') || 'unknown reason'}`,
        }
      }
      return {
        success: false,
        error: 'No videos generated',
      }
    }

    const generatedVideo = generatedVideos[0]
    const video = generatedVideo.video

    if (!video) {
      return {
        success: false,
        error: 'No video object in response',
      }
    }

    // Check if we got video bytes directly (preferred)
    if (video.videoBytes) {
      console.log('Video returned with direct bytes')
      const videoBuffer = Buffer.from(video.videoBytes, 'base64')
      return {
        success: true,
        videoBuffer,
        videoUri: video.uri,
      }
    }

    // If no direct bytes, download from URI using SDK
    if (video.uri) {
      console.log(`Downloading video from URI: ${video.uri}`)
      
      // Use SDK's download method - it handles GCS authentication
      const tempDir = os.tmpdir()
      const tempFilePath = path.join(tempDir, `veo-video-${Date.now()}.mp4`)

      try {
        await client.files.download({
          file: generatedVideo,
          downloadPath: tempFilePath,
        })

        // Read the downloaded file
        const videoBuffer = fs.readFileSync(tempFilePath)
        
        // Clean up temp file
        fs.unlinkSync(tempFilePath)

        return {
          success: true,
          videoBuffer,
          videoUri: video.uri,
        }
      } catch (downloadError) {
        console.error('SDK download failed, trying direct fetch:', downloadError)
        
        // Fallback: try direct fetch (might work for signed URLs)
        try {
          const response = await fetch(video.uri)
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer()
            return {
              success: true,
              videoBuffer: Buffer.from(arrayBuffer),
              videoUri: video.uri,
            }
          }
        } catch {
          // Ignore fallback error
        }
        
        return {
          success: false,
          error: `Failed to download video: ${downloadError instanceof Error ? downloadError.message : 'Unknown error'}`,
          videoUri: video.uri,
        }
      }
    }

    return {
      success: false,
      error: 'No video bytes or URI in response',
    }
  } catch (error) {
    console.error('Video generation error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during video generation',
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
