/**
 * Single source of truth for IdeaSpeak xAI model defaults.
 * Env overrides always win.
 */

export const DEFAULT_CHAT_MODEL = 'grok-4.6'
export const DEFAULT_BUILD_MODEL = 'grok-4.6'
export const DEFAULT_BUILD_FALLBACK = 'grok-4.5'

export function chatModel() {
  return process.env.XAI_CHAT_MODEL?.trim() || DEFAULT_CHAT_MODEL
}

export function buildModel() {
  return process.env.XAI_BUILD_MODEL?.trim() || DEFAULT_BUILD_MODEL
}

export function buildFallbackModel() {
  return process.env.XAI_BUILD_FALLBACK?.trim() || DEFAULT_BUILD_FALLBACK
}
