import { GoogleGenAI } from '@google/genai'

// Parse service account credentials from environment variable
function getServiceAccountCredentials() {
  const keyJson = process.env.GCP_SERVICE_ACCOUNT_KEY
  if (!keyJson) {
    throw new Error('GCP_SERVICE_ACCOUNT_KEY environment variable is not set')
  }

  try {
    return JSON.parse(keyJson)
  } catch {
    throw new Error('Failed to parse GCP_SERVICE_ACCOUNT_KEY as JSON')
  }
}

// Singleton client instance
let clientInstance: GoogleGenAI | null = null

export function getVertexAIClient(): GoogleGenAI {
  if (clientInstance) {
    return clientInstance
  }

  const projectId = process.env.GCP_PROJECT_ID
  const location = process.env.GCP_LOCATION || 'us-central1'

  if (!projectId) {
    throw new Error('GCP_PROJECT_ID environment variable is not set')
  }

  const credentials = getServiceAccountCredentials()

  clientInstance = new GoogleGenAI({
    vertexai: true,
    project: projectId,
    location: location,
    googleAuthOptions: {
      credentials: {
        client_email: credentials.client_email,
        private_key: credentials.private_key,
      },
    },
  })

  return clientInstance
}

// Model identifiers for Vertex AI
export const MODELS = {
  // Gemini 2.5 Flash Image (Nano Banana) - for image generation via generateContent
  IMAGE: 'gemini-2.5-flash-image',
  // Veo 3.1 Fast (video + audio) - for video generation
  VIDEO: 'veo-3.0-generate-preview',
} as const

// Configuration
export const CONFIG = {
  projectId: process.env.GCP_PROJECT_ID || '',
  location: process.env.GCP_LOCATION || 'us-central1',
}

