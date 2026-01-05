// Mock services for image, video, and voice generation
// These return placeholder content with realistic delays

const PLACEHOLDER_IMAGES = [
  'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1280&h=720&fit=crop',
  'https://images.unsplash.com/photo-1534996858221-380b92700493?w=1280&h=720&fit=crop',
  'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=1280&h=720&fit=crop',
  'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=1280&h=720&fit=crop',
  'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=1280&h=720&fit=crop',
  'https://images.unsplash.com/photo-1507400492013-162706c8c05e?w=1280&h=720&fit=crop',
  'https://images.unsplash.com/photo-1516339901601-2e1b62dc0c45?w=1280&h=720&fit=crop',
  'https://images.unsplash.com/photo-1484589065579-248aad0d628b?w=1280&h=720&fit=crop',
]

const SAMPLE_VIDEO_URL = 'https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4'

export async function mockGenerateImage(prompt: string, index: number): Promise<{
  success: boolean
  url?: string
  error?: string
}> {
  // Simulate API delay (2-4 seconds)
  await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 2000))
  
  // 5% chance of failure for realism
  if (Math.random() < 0.05) {
    return { success: false, error: 'Image generation failed (mock error)' }
  }
  
  const imageUrl = PLACEHOLDER_IMAGES[index % PLACEHOLDER_IMAGES.length]
  return { success: true, url: imageUrl }
}

export async function mockGenerateVideo(imageUrl: string, motionType: string): Promise<{
  success: boolean
  url?: string
  error?: string
}> {
  // Simulate longer API delay for video (5-10 seconds)
  await new Promise(resolve => setTimeout(resolve, 5000 + Math.random() * 5000))
  
  // 10% chance of failure for realism
  if (Math.random() < 0.1) {
    return { success: false, error: 'Video generation failed (mock error)' }
  }
  
  return { success: true, url: SAMPLE_VIDEO_URL }
}

export async function mockGenerateVoice(text: string): Promise<{
  success: boolean
  url?: string
  durationSeconds?: number
  error?: string
}> {
  // Simulate API delay (1-3 seconds)
  await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000))
  
  // 5% chance of failure
  if (Math.random() < 0.05) {
    return { success: false, error: 'Voice generation failed (mock error)' }
  }
  
  // Estimate duration based on word count (150 words per minute)
  const wordCount = text.split(/\s+/).length
  const durationSeconds = Math.round((wordCount / 150) * 60)
  
  // Return a sample audio file
  return { 
    success: true, 
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    durationSeconds 
  }
}

/**
 * Cost estimation for visual generation using Vertex AI
 * 
 * Pricing (as of 2024):
 * - Gemini 2.5 Flash Image: ~$0.02-0.04 per image
 * - Veo 3.1 Fast (video + audio): ~$0.05/second of video
 * - ElevenLabs voice: ~$0.30 per minute
 */
export function getCostEstimate(scenes: number, avgVideoDurationSeconds: number = 5): {
  images: { count: number; unitCost: number; total: number; model: string }
  videos: { count: number; secondsPerVideo: number; costPerSecond: number; total: number; model: string }
  voice: { minutes: number; unitCost: number; total: number }
  subtotal: number
  platformFee: number
  total: number
} {
  // Gemini 2.5 Flash Image pricing
  const imageUnitCost = 0.03 // ~$0.03 per image (average)
  const imageCost = scenes * imageUnitCost

  // Veo 3.1 Fast pricing: $0.05/second for video+audio
  const videoCostPerSecond = 0.05
  const videoCost = scenes * avgVideoDurationSeconds * videoCostPerSecond

  // ElevenLabs voice pricing (unchanged)
  const voiceCost = Math.ceil(scenes * 0.25) * 0.30 // ~15 seconds per scene

  const subtotal = imageCost + videoCost + voiceCost
  const platformFee = subtotal * 0.15

  return {
    images: { 
      count: scenes, 
      unitCost: imageUnitCost, 
      total: imageCost,
      model: 'gemini-2.5-flash-image'
    },
    videos: { 
      count: scenes, 
      secondsPerVideo: avgVideoDurationSeconds,
      costPerSecond: videoCostPerSecond, 
      total: videoCost,
      model: 'veo-3.1-fast'
    },
    voice: { 
      minutes: Math.ceil(scenes * 0.25), 
      unitCost: 0.30, 
      total: voiceCost 
    },
    subtotal,
    platformFee,
    total: subtotal + platformFee,
  }
}

// Backwards compatibility alias
export const getMockCostEstimate = getCostEstimate

