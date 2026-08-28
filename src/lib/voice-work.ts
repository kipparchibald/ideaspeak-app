/** Client-side Voice Work v2 types and helpers */

export type VoiceWorkKind = 'BUILD' | 'DESK' | 'RESEARCH' | 'DRAFT' | 'ROUTE'

export interface VoiceWorkBrief {
  who: string
  job: string
  surfaces: string[]
  data: {
    real: string[]
    neverInvent: string[]
  }
  v1: string[]
  notV1: string[]
  tools: {
    stackOrConnectors: string[]
    wired: string[]
    notWired: string[]
  }
  done: string
  hardThing: string
  consequence: string
}

export interface VoiceWorkHandoff {
  target: string
  reason?: string
  briefSummary?: string
}

export interface VoiceWorkRefine {
  kind: VoiceWorkKind
  secondaryKind: VoiceWorkKind | null
  ready: boolean
  missing: string[]
  spoken: string
  suggestion: string | null
  brief: VoiceWorkBrief
  handoff: VoiceWorkHandoff | null
  optimizedPrompt: string
}

export interface WorkProduct {
  type: 'draft' | 'checklist' | 'brief' | 'handoff' | 'research' | 'desk'
  title: string
  content: string
  draft?: { title: string; body: string; unsent: boolean }
  claims?: { text: string; source: string | null }[]
  need?: 'paste' | 'route'
  drafts?: { subject: string; body: string; unsent: boolean }[]
  handoff?: { desk: string; why: string; decided: string[]; missing: string[] }
}

export interface ActReceipt {
  kind: VoiceWorkKind | string
  spoken: string
  will: string
  willNot: string[]
  seconds: number
  sendBlocked: boolean
}

export interface ActResult {
  ok?: boolean
  receipt: ActReceipt
  action: 'BUILD' | 'WORK'
  effectiveKind: VoiceWorkKind | string
  buildPrompt?: string
  workProduct?: WorkProduct
  spokenFinish?: string
  error?: string
  missing?: string[]
}

export const EMPTY_BRIEF: VoiceWorkBrief = {
  who: '',
  job: '',
  surfaces: [],
  data: { real: [], neverInvent: ['listings', 'lots', 'solds', 'emails', 'events'] },
  v1: [],
  notV1: [],
  tools: { stackOrConnectors: [], wired: [], notWired: [] },
  done: '',
  hardThing: '',
  consequence: 'preview only',
}

export const EMPTY_REFINE: VoiceWorkRefine = {
  kind: 'BUILD',
  secondaryKind: null,
  ready: false,
  missing: ['Who', 'Job', 'Surfaces', 'Data', 'v1', 'Not v1', 'Tools', 'Done', 'Hard thing', 'Consequence'],
  spoken: '',
  suggestion: null,
  brief: EMPTY_BRIEF,
  handoff: null,
  optimizedPrompt: '',
}

export function isBuildKind(kind: VoiceWorkKind): boolean {
  return kind === 'BUILD'
}

/** Local work-product synthesis when /api/plan is unavailable */
export function synthesizeWorkProducts(refine: VoiceWorkRefine): WorkProduct[] {
  const { brief, kind, handoff, optimizedPrompt } = refine

  if (kind === 'ROUTE' && handoff) {
    return [
      {
        type: 'handoff',
        title: `Handoff → ${handoff.target}`,
        content: [
          `Target desk: ${handoff.target}`,
          handoff.reason ? `Reason: ${handoff.reason}` : '',
          handoff.briefSummary ? `\nBrief summary:\n${handoff.briefSummary}` : '',
          `\nWho: ${brief.who}`,
          `Job: ${brief.job}`,
          `v1: ${brief.v1.join(', ')}`,
          `Done: ${brief.done}`,
          '\n— Open the target desk to continue. IdeaSpeak does not impersonate this desk.',
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ]
  }

  if (kind === 'DRAFT') {
    const body = optimizedPrompt || [
      `To: [recipient]`,
      `Subject: ${brief.job}`,
      '',
      `[Draft body — edit before sending]`,
      '',
      `Context: ${brief.who}`,
      `Goal: ${brief.done}`,
      '',
      `— Draft only. Say "ship" to send (not wired in preview).`,
    ].join('\n')
    return [{ type: 'draft', title: 'Draft copy', content: body }]
  }

  if (kind === 'DESK') {
    return [
      {
        type: 'checklist',
        title: 'Desk checklist',
        content: [
          `Who: ${brief.who}`,
          `Job: ${brief.job}`,
          '',
          '## v1 steps',
          ...brief.v1.map((v, i) => `${i + 1}. ${v}`),
          '',
          '## Wired',
          ...(brief.tools.wired.length ? brief.tools.wired.map((w) => `- ${w}`) : ['- (none yet)']),
          '',
          '## Not wired (honest)',
          ...(brief.tools.notWired.length
            ? brief.tools.notWired.map((w) => `- ${w}`)
            : ['- (none listed)']),
          '',
          `Done when: ${brief.done}`,
          `Hard thing: ${brief.hardThing}`,
          '',
          '— Receipts only. No send without explicit ship.',
        ].join('\n'),
      },
    ]
  }

  if (kind === 'RESEARCH') {
    return [
      {
        type: 'research',
        title: 'Research brief',
        content:
          optimizedPrompt ||
          [
            `Who: ${brief.who}`,
            `Question: ${brief.job}`,
            '',
            '## Findings',
            '[Sourced findings go here — never invent without a source]',
            '',
            '## Gaps to verify',
            `- ${brief.hardThing}`,
            '',
            `Done: ${brief.done}`,
          ].join('\n'),
      },
    ]
  }

  return []
}

export function statusLabelForKind(kind: VoiceWorkKind, ready: boolean, isBuilding: boolean): string {
  if (isBuilding) {
    return isBuildKind(kind) ? 'Building preview…' : 'Drafting work product…'
  }
  if (!ready) {
    return kind === 'BUILD' ? 'Planning app…' : `Planning ${kind.toLowerCase()} work…`
  }
  return isBuildKind(kind) ? 'Ready to build' : 'Ready to do'
}

export async function refineTranscript(
  transcript: string,
  history: { role: string; content: string }[] = [],
): Promise<{ parsed: VoiceWorkRefine; requestId?: string } | null> {
  try {
    const res = await fetch('/api/refine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript, history }),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (data?.parsed) {
      return { parsed: data.parsed as VoiceWorkRefine, requestId: data.requestId }
    }
    return null
  } catch {
    return null
  }
}

export async function callAct(params: {
  refine: VoiceWorkRefine
  userIntent?: string
  history?: { role: string; content: string }[]
}): Promise<ActResult | null> {
  try {
    const res = await fetch('/api/act', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refine: params.refine,
        userIntent: params.userIntent || '',
        history: params.history || [],
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      return {
        ok: false,
        receipt: {
          kind: params.refine.kind,
          spoken: '',
          will: '',
          willNot: ['send'],
          seconds: 0,
          sendBlocked: false,
        },
        action: 'WORK',
        effectiveKind: params.refine.kind,
        error: data.error,
        missing: data.missing,
      }
    }
    return data as ActResult
  } catch {
    return null
  }
}

/** Map act work product → pane list */
export function actWorkProductToPane(wp: WorkProduct): WorkProduct[] {
  return [wp]
}

/** True when preview should use Sandpack (BUILD toy only, after act) */
export function shouldShowSandpackAfterAct(
  effectiveKind: string,
  hasBuilt: boolean,
): boolean {
  return effectiveKind === 'BUILD' || hasBuilt
}
