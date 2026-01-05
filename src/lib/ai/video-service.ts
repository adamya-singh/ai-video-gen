import { getVertexAIClient, MODELS } from './vertex-client'

export interface GenerateVideoResult {
  success: boolean
  videoUri?: string
  error?: string
}

// Polling configuration
const POLL_INTERVAL_MS = 5000 // 5 seconds between polls
const MAX_POLL_ATTEMPTS = 120 // 10 minutes max wait time (120 * 5s)

/**
 * Generate a video using Veo 3.1 Fast
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
    // Veo 3.1 can generate from text prompt or image + prompt
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
        durationSeconds: Math.min(durationSeconds, 8), // Veo 3.1 max is 8 seconds
        aspectRatio: '16:9',
        generateAudio: true, // Veo 3.1 supports audio generation
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
        error: `Video generation timed out after ${MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS / 1000} seconds`,
      }
    }

    // Check for errors
    if (currentOperation.error) {
      return {
        success: false,
        error: `Video generation failed: ${JSON.stringify(currentOperation.error)}`,
      }
    }

    // Extract the video URI from the response
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

    const videoUri = generatedVideos[0].video?.uri
    if (!videoUri) {
      return {
        success: false,
        error: 'No video URI in response',
      }
    }

    return {
      success: true,
      videoUri: videoUri,
    }
  } catch (error) {
    console.error('Video generation error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during video generation',
    }
  }
}

/**
 * Download video from GCS URI and return as buffer
 * The video URI from Veo is typically a GCS URI that needs to be downloaded
 */
export async function downloadVideoFromUri(videoUri: string): Promise<{
  success: boolean
  videoBuffer?: Buffer
  error?: string
}> {
  try {
    // If it's a GCS URI (gs://...), we need to construct a download URL
    // For Vertex AI, the returned URI should be directly accessible with auth
    const response = await fetch(videoUri)

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to download video: ${response.status} ${response.statusText}`,
      }
    }

    const arrayBuffer = await response.arrayBuffer()
    const videoBuffer = Buffer.from(arrayBuffer)

    return {
      success: true,
      videoBuffer,
    }
  } catch (error) {
    console.error('Video download error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during video download',
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

