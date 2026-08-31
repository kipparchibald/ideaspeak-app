/**
 * Extract living plan facets from collaborative conversation.
 * Heuristic — updates as voice/text turns land.
 */

export type PlanFacetKey = 'who' | 'loop' | 'wow' | 'cuts' | 'stack'

export type PlanFacets = Record<PlanFacetKey, string | null>

export const PLAN_FACET_LABELS: Record<PlanFacetKey, string> = {
  who: 'Who',
  loop: 'Core loop',
  wow: 'Wow moment',
  cuts: 'Not v1',
  stack: 'Stack',
}

const EMPTY: PlanFacets = {
  who: null,
  loop: null,
  wow: null,
  cuts: null,
  stack: null,
}

function joinUserText(messages: { role: string; content: string }[]): string {
  return messages
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .join('\n')
}

function joinAllText(messages: { role: string; content: string }[]): string {
  return messages.map((m) => m.content).join('\n')
}

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = text.match(re)
    if (m?.[1]?.trim()) return m[1].trim().slice(0, 120)
  }
  return null
}

/** @param messages chat history (user + assistant) */
export function extractPlanFacets(
  messages: { role: string; content: string }[],
): PlanFacets {
  if (!messages.length) return { ...EMPTY }

  const users = joinUserText(messages)
  const all = joinAllText(messages)
  const lower = all.toLowerCase()

  const who =
    firstMatch(users, [
      /\bfor\s+((?:solo\s+)?founders?|freelancers?|teams?|sales\s+pods?|creators?|agencies?|homeowners?|agents?)[^.!\n]*/i,
      /\b(target(?:ing)?|audience|users?)\s*(?:is|are|:)\s*([^.!\n]+)/i,
    ]) ||
    (/\bfreelancer/.test(lower) ? 'Freelancers' : null) ||
    (/\bfounder/.test(lower) ? 'Solo founders' : null) ||
    (/\bteam\b/.test(lower) ? 'Small teams' : null)

  const loop =
    firstMatch(all, [
      /\b(core loop|daily loop|main loop)\s*(?:is|:)?\s*([^.!\n]+)/i,
      /\b(every day|daily)\s+([^.!\n]{8,80})/i,
    ]) ||
    (/\bhabit|streak/.test(lower) ? 'Daily habit check-in' : null) ||
    (/\bcrm|client/.test(lower) ? 'Capture → status → next action' : null) ||
    (/\bvoice|speak/.test(lower) ? 'Speak → structure → act' : null)

  const wow =
    firstMatch(all, [
      /\b(wow moment|screenshot moment|hero moment)\s*(?:is|:)?\s*([^.!\n]+)/i,
      /\bfeels like\s+([^.!\n]{8,80})/i,
    ]) ||
    (/\bdark\s+ui|premium/.test(lower) ? 'Premium dark UI, one hero screen' : null)

  const cuts =
    firstMatch(all, [
      /\b(not v1|cut from v1|defer|later|skip for v1)\s*:?\s*([^.!\n]+)/i,
      /\b(no|skip)\s+(auth|payments?|admin|crm)\b[^.!\n]*/i,
    ]) ||
    (/\bauth later|no auth/.test(lower) ? 'Auth later' : null) ||
    (/\bone screen|single screen|hero screen/.test(lower) ? 'One screen only — rest later' : null)

  const stack =
    firstMatch(all, [
      /\b(react|next\.?js|vite|tailwind|supabase|vercel)\b[^.!\n]*/i,
    ]) ||
    (/\bnext\.?js/.test(lower) ? 'Next.js + Tailwind' : null) ||
    (/\breact/.test(lower) ? 'React + Tailwind' : null)

  return { who, loop, wow, cuts, stack }
}

export function planFacetCount(facets: PlanFacets): number {
  return Object.values(facets).filter(Boolean).length
}

export function planLooksComplete(facets: PlanFacets): boolean {
  return !!(facets.who && facets.loop && (facets.wow || facets.cuts))
}
