import { getVertexAIClient, MODELS } from './vertex-client'
import { Modality } from '@google/genai'

export interface GenerateImageResult {
  success: boolean
  imageData?: {
    base64: string
    mimeType: string
  }
  error?: string
}

/**
 * Generate an image using Gemini 2.5 Flash Image (Nano Banana)
 * Uses the generateContent API with IMAGE modality
 */
export async function generateImage(
  prompt: string,
  referenceImageBase64?: string
): Promise<GenerateImageResult> {
  try {
    const client = getVertexAIClient()

    // Build contents array with optional reference image
    const contents: Array<{
      role: string
      parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>
    }> = []

    // If we have a reference image, include it for style consistency
    if (referenceImageBase64) {
      contents.push({
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: referenceImageBase64,
            },
          },
          {
            text: `Use this image as a style reference. Generate a new image in the same visual style with this description: ${prompt}`,
          },
        ],
      })
    } else {
      contents.push({
        role: 'user',
        parts: [
          {
            text: `Generate a high-quality, cinematic image for a documentary video: ${prompt}`,
          },
        ],
      })
    }

    const response = await client.models.generateContent({
      model: MODELS.IMAGE,
      contents: contents,
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE],
      },
    })

    // Extract image from response
    const candidates = response.candidates
    if (!candidates || candidates.length === 0) {
      return {
        success: false,
        error: 'No candidates returned from model',
      }
    }

    const parts = candidates[0].content?.parts
    if (!parts) {
      return {
        success: false,
        error: 'No parts in response',
      }
    }

    // Find the image part
    for (const part of parts) {
      if (part.inlineData?.data) {
        return {
          success: true,
          imageData: {
            base64: part.inlineData.data,
            mimeType: part.inlineData.mimeType || 'image/png',
          },
        }
      }
    }

    return {
      success: false,
      error: 'No image found in response',
    }
  } catch (error) {
    console.error('Image generation error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during image generation',
    }
  }
}

/**
 * Convert base64 image data to a data URL for display
 */
export function base64ToDataUrl(base64: string, mimeType: string): string {
  return `data:${mimeType};base64,${base64}`
}

/**
 * Convert base64 to Blob for uploading to storage
 */
export function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64)
  const byteNumbers = new Array(byteCharacters.length)
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i)
  }
  const byteArray = new Uint8Array(byteNumbers)
  return new Blob([byteArray], { type: mimeType })
}

