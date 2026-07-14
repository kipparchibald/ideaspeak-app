/** Live build narration — agent headlines + scrolling minutiae log */

export type BuildJobKind = 'quick' | 'plan' | 'refine'

export type BuildPhase = 'intro' | 'working' | 'done' | 'error'

export interface BuildLogEntry {
  id: string
  ts: number
  text: string
  agent?: string
}

export interface BuildProgressSnapshot {
  headline: string
  phase: BuildPhase
  log: BuildLogEntry[]
  kind: BuildJobKind | null
}

export interface BuildProgressContext {
  grokLive?: boolean
  projectName?: string
  vision?: string
  refinement?: string
  fileScaffold?: { path: string; purpose: string }[]
  buildOrder?: string[]
  v1Features?: string[]
}

type ProgressCallbacks = {
  onUpdate: (snap: BuildProgressSnapshot) => void
}

function entry(text: string, agent?: string): BuildLogEntry {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ts: Date.now(), text, agent }
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function formatLogTimestamp(ts: number): string {
  return formatTime(ts)
}

type TickerStep = { text?: string; agent?: string; headline?: string }

export class BuildProgressSession {
  private snap: BuildProgressSnapshot
  private timers: ReturnType<typeof setTimeout>[] = []
  private intervals: ReturnType<typeof setInterval>[] = []
  private disposed = false
  private stepIndex = 0
  private ctx: BuildProgressContext
  private cb: ProgressCallbacks

  constructor(kind: BuildJobKind, ctx: BuildProgressContext, cb: ProgressCallbacks) {
    this.ctx = ctx
    this.cb = cb
    this.snap = { headline: '', phase: 'intro', log: [], kind }
  }

  private emit() {
    if (!this.disposed) this.cb.onUpdate({ ...this.snap, log: [...this.snap.log] })
  }

  private push(text: string, agent?: string) {
    this.snap.log.push(entry(text, agent))
    if (this.snap.log.length > 120) this.snap.log = this.snap.log.slice(-120)
    this.emit()
  }

  private headline(text: string) {
    this.snap.headline = text
    this.emit()
  }

  private phase(p: BuildPhase) {
    this.snap.phase = p
    this.emit()
  }

  intro() {
    const name = this.ctx.projectName || 'your app'
    if (this.snap.kind === 'quick') {
      this.headline(
        this.ctx.grokLive
          ? `I'll turn your idea into "${name}" — a polished vertical slice with live preview.`
          : `I'll scaffold "${name}" locally — design tokens, core loop, Sandpack-ready files.`
      )
      this.push('Grok Build session started', 'Grok Build')
      this.push('Ingesting voice + conversation context…', 'Voice Refiner')
    } else if (this.snap.kind === 'plan') {
      this.headline(
        this.ctx.grokLive
          ? `Executing the approved multi-agent plan for "${name}".`
          : `Materializing the scaffold plan for "${name}" from your agents.`
      )
      this.push('Plan execution authorized', 'Scope Advisor')
      this.push(`Target: ${this.ctx.vision?.slice(0, 72) || 'vertical slice v1'}…`, 'Architect')
    } else {
      this.headline(`I'll apply your refinement and refresh the live preview.`)
      this.push('Refinement received', 'IdeaSpeak')
      if (this.ctx.refinement) {
        this.push(`Change: ${this.ctx.refinement.slice(0, 96)}${this.ctx.refinement.length > 96 ? '…' : ''}`, 'Voice Refiner')
      }
    }
    this.phase('working')
  }

  /** Emit staged log lines on an interval while async work runs */
  startTicker() {
    const steps = this.buildTickerSteps()
    if (!steps.length) return

    const interval = setInterval(() => {
      if (this.disposed || this.stepIndex >= steps.length) return
      const step = steps[this.stepIndex++]
      if (step.headline) this.headline(step.headline)
      if (step.text) this.push(step.text, step.agent)
    }, this.ctx.grokLive ? 2200 : 650)

    this.intervals.push(interval)
  }

  private buildTickerSteps(): TickerStep[] {
    const scaffold =
      this.ctx.fileScaffold?.map((f) => ({
        text: `Scaffolding ${f.path} — ${f.purpose}`,
        agent: 'Engineer',
      })) ?? []

    const order =
      this.ctx.buildOrder?.map((step) => ({
        text: step,
        agent: 'Architect',
      })) ?? []

    const features =
      this.ctx.v1Features?.slice(0, 4).map((f) => ({
        text: `Shipping v1: ${f}`,
        agent: 'Scope Advisor',
      })) ?? []

    const common = [
      { text: 'Locking design tokens (dark premium, #00ff88 accent)…', agent: 'UX Lead' },
      { text: 'Composing React 19 + TypeScript module graph…', agent: 'Engineer' },
      { text: 'Wiring Tailwind v4 + glass surfaces…', agent: 'UX Lead' },
      { text: 'Adding empty, loading, and error states…', agent: 'UX Lead' },
      { text: 'Embedding Framer Motion micro-interactions…', agent: 'UX Lead' },
      { text: 'Validating Sandpack preview compatibility…', agent: 'Engineer' },
    ]

    if (this.snap.kind === 'refine') {
      return [
        { text: 'Diffing current files against your request…', agent: 'Engineer' },
        { text: 'Preserving design system tokens…', agent: 'UX Lead' },
        { text: 'Patching component tree…', agent: 'Engineer' },
        { text: 'Re-running preview compile…', agent: 'Engineer' },
        ...(this.ctx.grokLive
          ? [{ text: 'Grok build model applying structured edits…', agent: 'Builder' }]
          : [{ text: 'Simulator applying local transformation…', agent: 'Builder' }]),
      ]
    }

    if (this.snap.kind === 'quick') {
      return [
        { text: 'Extracting job-to-be-done from transcript…', agent: 'Voice Refiner' },
        { text: 'Inferring target user + wow moment…', agent: 'Architect' },
        ...features,
        ...order.slice(0, 3),
        ...common,
        ...(this.ctx.grokLive
          ? [
              { text: 'Calling grok-build-0.1 with production agent prompt…', agent: 'Builder' },
              { text: 'Model reasoning over vertical slice scope…', agent: 'Builder', headline: 'Grok is writing your app — this usually takes 30–60 seconds.' },
              { text: 'Awaiting structured JSON (files + metadata)…', agent: 'Builder' },
            ]
          : [
              { text: 'Generating simulator scaffold from brief…', agent: 'Builder' },
              { headline: 'Assembling simulator preview…' },
            ]),
        ...scaffold,
      ]
    }

    // plan
    return [
      ...order,
      ...features,
      ...scaffold,
      ...common,
      ...(this.ctx.grokLive
        ? [
            { text: 'Executing optimizedPrompt via grok-build-0.1…', agent: 'Builder' },
            { text: 'Agents synchronized — Architect, UX, Engineer, Scope…', agent: 'Builder', headline: 'Grok is executing your scaffold plan.' },
            { text: 'Parsing agent JSON output…', agent: 'Engineer' },
          ]
        : [{ text: 'Simulator generating plan-aligned files…', agent: 'Builder' }]),
    ]
  }

  /** Public hook for callers to add a log line during async work */
  note(text: string, agent?: string) {
    this.push(text, agent)
  }

  logRefineComplete() {
    this.push('Voice Refiner structured the brief', 'Voice Refiner')
  }

  logBuildRequest() {
    this.push(
      this.ctx.grokLive ? 'Handoff → Grok build agent (grok-build-0.1)' : 'Handoff → local simulator',
      'Builder'
    )
  }

  logFiles(files: Record<string, { code: string } | string>) {
    this.push('Received file bundle — writing to project…', 'Engineer')
    const paths = Object.keys(files).sort()
    for (const path of paths) {
      const size =
        typeof files[path] === 'string'
          ? (files[path] as string).length
          : ((files[path] as { code: string })?.code || '').length
      this.push(`  ✓ ${path} (${size.toLocaleString()} chars)`, 'Engineer')
    }
    this.push(`${paths.length} files ready for Sandpack preview`, 'Engineer')
  }

  async complete(projectName: string, usedReal: boolean): Promise<void> {
    this.stopTicker()
    this.phase('done')
    this.headline(
      usedReal
        ? `Done — "${projectName}" is built. Open the live preview and refine by voice.`
        : `Done — "${projectName}" preview is ready (simulator). Add Grok for full agent builds.`
    )
    this.push('Grok Build complete ✓', 'Grok Build')
    this.push(`Project: ${projectName}`, 'Grok Build')
    this.push(usedReal ? 'Powered by grok-build-0.1 + IdeaSpeak agents' : 'Offline scaffold — add API key for live Grok Build', 'Grok Build')
    await new Promise((r) => setTimeout(r, 2200))
  }

  async fail(message: string): Promise<void> {
    this.stopTicker()
    this.phase('error')
    this.headline(`Build hit a snag — ${message}`)
    this.push(`Error: ${message}`, 'IdeaSpeak')
    await new Promise((r) => setTimeout(r, 2800))
  }

  stopTicker() {
    for (const id of this.intervals) clearInterval(id)
    this.intervals = []
    for (const id of this.timers) clearTimeout(id)
    this.timers = []
  }

  dispose() {
    this.disposed = true
    this.stopTicker()
  }
}

let activeSession: BuildProgressSession | null = null

export function beginBuildProgress(
  kind: BuildJobKind,
  ctx: BuildProgressContext,
  onUpdate: (snap: BuildProgressSnapshot) => void
): BuildProgressSession {
  activeSession?.dispose()
  activeSession = new BuildProgressSession(kind, ctx, { onUpdate })
  return activeSession
}

export function endBuildProgress() {
  activeSession?.dispose()
  activeSession = null
}

export const EMPTY_BUILD_PROGRESS: BuildProgressSnapshot = {
  headline: '',
  phase: 'intro',
  log: [],
  kind: null,
}