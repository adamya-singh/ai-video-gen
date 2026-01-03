import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export type LLMModel = 'gpt-4-turbo' | 'claude-3.5-sonnet'

interface LLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export async function generateWithLLM(
  messages: LLMMessage[],
  model: LLMModel = 'gpt-4-turbo'
): Promise<string> {
  if (model === 'gpt-4-turbo' || model.startsWith('gpt')) {
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      temperature: 0.7,
      max_tokens: 4096,
    })

    return response.choices[0]?.message?.content || ''
  } else {
    // Claude
    const systemMessage = messages.find(m => m.role === 'system')
    const otherMessages = messages.filter(m => m.role !== 'system')

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4096,
      system: systemMessage?.content || '',
      messages: otherMessages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    })

    const content = response.content[0]
    if (content.type === 'text') {
      return content.text
    }
    return ''
  }
}

export async function streamWithLLM(
  messages: LLMMessage[],
  model: LLMModel = 'gpt-4-turbo'
): Promise<ReadableStream> {
  if (model === 'gpt-4-turbo' || model.startsWith('gpt')) {
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      temperature: 0.7,
      max_tokens: 4096,
      stream: true,
    })

    return new ReadableStream({
      async start(controller) {
        for await (const chunk of response) {
          const text = chunk.choices[0]?.delta?.content || ''
          if (text) {
            controller.enqueue(new TextEncoder().encode(text))
          }
        }
        controller.close()
      },
    })
  } else {
    // Claude streaming
    const systemMessage = messages.find(m => m.role === 'system')
    const otherMessages = messages.filter(m => m.role !== 'system')

    const response = await anthropic.messages.stream({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4096,
      system: systemMessage?.content || '',
      messages: otherMessages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    })

    return new ReadableStream({
      async start(controller) {
        for await (const event of response) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            controller.enqueue(new TextEncoder().encode(event.delta.text))
          }
        }
        controller.close()
      },
    })
  }
}

