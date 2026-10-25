import OpenAI from 'openai'
import { agentConfig, type ModelRole } from '../../agent.config'

let client: OpenAI | null = null

/** The only LLM client in the agent path: Nebius Token Factory. */
export function nebius(): OpenAI {
  if (client) return client
  const baseURL = process.env.NEBIUS_BASE_URL
  const apiKey = process.env.NEBIUS_API_KEY
  if (!baseURL || !apiKey) throw new Error('NEBIUS_BASE_URL and NEBIUS_API_KEY must be set')
  client = new OpenAI({ baseURL, apiKey })
  return client
}

export function modelFor(role: ModelRole): string {
  return agentConfig.models[role]
}

export function costUsd(role: ModelRole, promptTokens: number, completionTokens: number): number {
  const p = agentConfig.pricing[role]
  return (promptTokens * p.input + completionTokens * p.output) / 1_000_000
}
