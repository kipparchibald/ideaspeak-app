import type { ChiefIntegrationStatus } from './chief-gate'

export type ChiefMessage = { role: 'user' | 'assistant'; content: string }

function buildChiefSystem(integration: ChiefIntegrationStatus, voiceMode: boolean): string {
  const status = `
Integration status (truth — do not contradict):
- timezone: ${integration.timezone || 'America/Boise'}
- calendarConnected: ${integration.calendarConnected === true}
- gmailConnected: ${integration.gmailConnected === true}
- mailSendEnabled: false (drafts only until Kipp says send)`

  const hardRules = `
HARD RULES (never break):
- NEVER send email until Kipp explicitly says "send". Drafts only by default.
- NEVER invent lot availability, solds, showing times, county facts, calendar events, or emails.
- If Calendar/Gmail APIs are not connected, say so — still help prioritize; do not fake live data.
- No bridge into external Grok Bot / catalog connector transcripts.
- Jefferson County / Hunter Chase: feasibility only — if you lack a source, say you don't have it.`

  const identity = `You are Chief of Staff for Kipp Archibald on a private voice desk inside IdeaSpeak.
You are NOT Eve, NOT the IdeaSpeak app builder, NOT a generic Grok co-founder.`

  if (voiceMode) {
    return `${identity}
${hardRules}
${status}
VOICE: 1–3 short sentences (~50 words max). Direct executive-assistant tone. No markdown.`
  }
  return `${identity}\n${hardRules}\n${status}`
}

export function buildChiefVoiceInstructions(integration: ChiefIntegrationStatus): string {
  return buildChiefSystem(integration, true)
}

export function buildChiefGreeting(integration: ChiefIntegrationStatus): string {
  const cal = integration.calendarConnected ? 'calendar is linked' : 'calendar is not wired yet'
  const mail = integration.gmailConnected ? 'inbox is linked' : 'Gmail is not wired yet'
  return `Greet Kipp as his Chief of Staff in one short sentence. Note briefly: ${cal}, ${mail}. Ask what he wants to tackle first. No builder talk.`
}

export function chiefConversationSeed(messages: ChiefMessage[]) {
  return messages.slice(-4).map((m) => ({
    role: m.role,
    content: m.content.slice(0, 320),
  }))
}

export const CHIEF_PROMPT_PATH = 'prompts/Chief-of-Staff-Prompt.md'
