/**
 * Inject saved session / History into Grok Voice instructions + conversation seed.
 */

import { IDEASPEAK_VOICE_INSTRUCTIONS } from './grokVoice'

export interface VoiceSessionContext {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  planReady?: boolean
  hasBuilt?: boolean
  appName?: string
  planSummary?: string
  mode?: 'discuss' | 'build'
}

export interface VoiceConversationTurn {
  role: 'user' | 'assistant'
  content: string
}

const DEFAULT_OPENER_SNIPPET = 'Tap the mic for a real voice call'

function isDefaultOpener(content: string): boolean {
  return content.includes(DEFAULT_OPENER_SNIPPET)
}

/** Light seed only — full history lives in instructions to avoid duplicate WS payloads. */
export function voiceConversationSeed(
  messages: VoiceSessionContext['messages'],
  maxTurns = 4,
): VoiceConversationTurn[] {
  const filtered = messages.filter(
    (m) => m.content.trim() && !(m.role === 'assistant' && isDefaultOpener(m.content)),
  )
  if (filtered.length > 6) return []
  return filtered.slice(-maxTurns).map((m) => ({
    role: m.role,
    content: m.content.trim().slice(0, 280),
  }))
}

function formatTranscript(messages: VoiceSessionContext['messages'], maxChars = 2400): string {
  const lines = messages
    .filter((m) => m.content.trim() && !(m.role === 'assistant' && isDefaultOpener(m.content)))
    .map((m) => `${m.role === 'user' ? 'Founder' : 'Grok'}: ${m.content.trim()}`)
  let out = ''
  for (const line of lines) {
    if (out.length + line.length + 1 > maxChars) break
    out += (out ? '\n' : '') + line
  }
  return out
}

export function buildVoiceSessionInstructions(ctx: VoiceSessionContext): string {
  const transcript = formatTranscript(ctx.messages)
  const userTurns = ctx.messages.filter((m) => m.role === 'user').length
  const hasHistory = userTurns > 0 && transcript.length > 40

  if (!hasHistory) {
    return IDEASPEAK_VOICE_INSTRUCTIONS
  }

  const statusLines: string[] = [
    '',
    '--- RESTORED SESSION (History tab — continue, do NOT restart from zero) ---',
    `Prior turns in this session: ${userTurns}`,
  ]

  if (ctx.appName) statusLines.push(`Working title: ${ctx.appName}`)
  if (ctx.planSummary?.trim()) {
    statusLines.push(`Plan summary: ${ctx.planSummary.trim().slice(0, 400)}`)
  }
  if (ctx.hasBuilt) {
    statusLines.push(
      'Status: LIVE PREVIEW already built. Help refine by voice or say what to change — do not re-plan from scratch unless they ask.',
    )
  } else if (ctx.planReady) {
    statusLines.push(
      'Status: PLAN LOCKED from prior session. Continue refining OR hand off to builder when they are ready. If they say build it, hand off immediately.',
    )
  } else {
    statusLines.push('Status: Mid-plan — pick up the thread below and keep sharpening the v1.')
  }

  statusLines.push('', 'Conversation so far:', transcript)
  statusLines.push(
    '',
    'Rules for this resumed call:',
    '- You HAVE the history above — never ask "what app?" or "who is it for?" as if starting fresh',
    '- Reference specifics from prior turns naturally',
    '- If plan is locked and they want to ship, say handing off to the builder and watch the preview',
    '- If preview is already live, focus on refinements',
  )

  return IDEASPEAK_VOICE_INSTRUCTIONS + statusLines.join('\n')
}

export function buildVoiceGreetingInstructions(ctx: VoiceSessionContext): string {
  const name = ctx.appName?.trim() || 'your app'
  if (ctx.hasBuilt) {
    return `Brief Grok greeting — one short sentence. Welcome them back to "${name}" which is already live in preview. Ask what they want to change or refine. Do not re-plan from scratch.`
  }
  if (ctx.planReady) {
    return `Brief Grok greeting — one or two sentences. Welcome back: you already planned "${name}" together from History. Offer to refine one thing OR hand off to the builder if they say build it. Reference something specific from the plan.`
  }
  const userTurns = ctx.messages.filter((m) => m.role === 'user').length
  if (userTurns >= 2) {
    return `Brief Grok greeting — welcome back to the saved session. Pick up the product plan where you left off (you have the transcript in instructions). One sharp follow-up question only — do not restart discovery.`
  }
  return 'Greet briefly as Grok (one short sentence). Ask who the product is for and what they do every day. No corporate fluff.'
}