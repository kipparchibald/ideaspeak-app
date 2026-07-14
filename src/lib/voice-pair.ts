/**
 * Voice Pair Build — co-build state machine over GrokVoiceAgent.
 * States: idle | listening | agent-working | user-barge-in
 */

import {
  GrokVoiceAgent,
  IDEASPEAK_VOICE_INSTRUCTIONS,
  type GrokVoiceState,
  type VoiceId,
} from './grokVoice'

export type VoicePairStatus = 'idle' | 'listening' | 'agent-working' | 'user-barge-in'

export interface VoicePairFilePatch {
  path: string
  summary: string
}

export interface VoicePairCallbacks {
  /** User speech from Grok realtime mic */
  onTranscript?: (text: string, isFinal: boolean) => void
  /** Agent build narration (Grok voice or build progress headline) */
  onAgentNarration?: (text: string, isFinal?: boolean) => void
  /** File touched during live build */
  onFilePatch?: (patch: VoicePairFilePatch) => void
  onStatusChange?: (status: VoicePairStatus) => void
  onError?: (err: string) => void
}

export interface VoicePairOptions extends VoicePairCallbacks {
  voice?: VoiceId
  instructions?: string
  /** Retained patch chips (newest first) */
  maxPatches?: number
}

export const VOICE_PAIR_INSTRUCTIONS = `${IDEASPEAK_VOICE_INSTRUCTIONS}

Voice Pair Build mode:
- The founder may keep talking while a coding agent edits files live on screen.
- When the agent is building, narrate briefly what changed (1 sentence) — paths and intent, not full code.
- If they interrupt or ask a question mid-build, stop narrating and answer directly.
- Never claim a file was written unless you see a patch event; say "handing that to the builder" instead.
- Prefer "Your turn" energy when waiting for them; stay concise when the agent is working.`

const BARGE_IN_RESET_MS = 1200

export function mapGrokStateToVoicePair(
  grok: GrokVoiceState,
  agentWorking: boolean,
  bargeIn: boolean,
): VoicePairStatus {
  if (grok === 'idle' || grok === 'error') return 'idle'
  if (bargeIn) return 'user-barge-in'
  if (agentWorking && (grok === 'speaking' || grok === 'thinking')) return 'agent-working'
  if (agentWorking) return 'agent-working'
  if (grok === 'listening' || grok === 'connecting') return 'listening'
  if (grok === 'thinking' || grok === 'speaking') return agentWorking ? 'agent-working' : 'listening'
  return 'listening'
}

export class VoicePairController {
  private agent: GrokVoiceAgent | null = null
  private status: VoicePairStatus = 'idle'
  private grokState: GrokVoiceState = 'idle'
  private agentWorking = false
  private agentPaused = false
  private bargeInActive = false
  private bargeInTimer: ReturnType<typeof setTimeout> | null = null
  private narration = ''
  private patches: VoicePairFilePatch[] = []
  private readonly opts: Required<Pick<VoicePairOptions, 'maxPatches'>> & VoicePairOptions

  constructor(opts: VoicePairOptions = {}) {
    this.opts = {
      voice: 'eve',
      instructions: VOICE_PAIR_INSTRUCTIONS,
      maxPatches: 24,
      ...opts,
    }
  }

  getStatus(): VoicePairStatus {
    return this.status
  }

  getNarration(): string {
    return this.narration
  }

  getFilePatches(): VoicePairFilePatch[] {
    return [...this.patches]
  }

  isAgentPaused(): boolean {
    return this.agentPaused
  }

  isAgentWorking(): boolean {
    return this.agentWorking
  }

  isConnected(): boolean {
    return this.agent !== null && this.grokState !== 'idle' && this.grokState !== 'error'
  }

  private setStatus(next: VoicePairStatus) {
    if (this.status === next) return
    this.status = next
    this.opts.onStatusChange?.(next)
  }

  private syncStatus() {
    const next = mapGrokStateToVoicePair(this.grokState, this.agentWorking, this.bargeInActive)
    this.setStatus(next)
  }

  private clearBargeInTimer() {
    if (this.bargeInTimer) {
      clearTimeout(this.bargeInTimer)
      this.bargeInTimer = null
    }
  }

  private armBargeInReset() {
    this.clearBargeInTimer()
    this.bargeInTimer = setTimeout(() => {
      this.bargeInActive = false
      this.syncStatus()
    }, BARGE_IN_RESET_MS)
  }

  private pushPatch(patch: VoicePairFilePatch) {
    const normalized = {
      path: patch.path.replace(/^\/+/, ''),
      summary: patch.summary.trim() || 'Updated',
    }
    this.patches = [
      normalized,
      ...this.patches.filter((p) => p.path !== normalized.path),
    ].slice(0, this.opts.maxPatches ?? 24)
    this.opts.onFilePatch?.(normalized)
  }

  /** Start realtime Grok voice session for pair-build */
  async start(): Promise<void> {
    if (this.agent?.getState() === 'connecting') return
    this.stop()
    this.agentPaused = false
    this.agentWorking = false
    this.bargeInActive = false
    this.narration = ''

    const agent = new GrokVoiceAgent({
      voice: this.opts.voice,
      instructions: this.opts.instructions,
      onStateChange: (s) => {
        this.grokState = s
        this.syncStatus()
      },
      onUserTranscript: (text, isFinal) => {
        if (!text.trim()) return
        this.opts.onTranscript?.(text, isFinal)
        if (isFinal && this.agentWorking && !this.agentPaused) {
          this.bargeIn()
        }
      },
      onAssistantTranscript: (text, isFinal) => {
        if (!text.trim() || this.agentPaused) return
        this.narration = isFinal ? '' : text
        this.opts.onAgentNarration?.(text, isFinal)
        if (isFinal) this.narration = ''
      },
      onError: (err) => {
        this.opts.onError?.(err)
        this.grokState = 'error'
        this.setStatus('idle')
      },
    })

    this.agent = agent
    this.grokState = 'connecting'
    this.syncStatus()

    try {
      await agent.connect()
      this.grokState = agent.getState()
      this.syncStatus()
    } catch (err: unknown) {
      this.agent = null
      this.grokState = 'idle'
      this.setStatus('idle')
      throw err
    }
  }

  /** End voice pair session */
  stop() {
    this.clearBargeInTimer()
    this.agent?.disconnect()
    this.agent = null
    this.grokState = 'idle'
    this.agentWorking = false
    this.agentPaused = false
    this.bargeInActive = false
    this.narration = ''
    this.setStatus('idle')
  }

  /** Tell the machine the coding agent started / finished */
  setAgentWorking(working: boolean) {
    this.agentWorking = working
    if (!working) this.agentPaused = false
    this.syncStatus()
  }

  /** External build headline — spoken when not paused */
  setNarration(text: string, opts?: { speak?: boolean; isFinal?: boolean }) {
    const trimmed = text.trim()
    if (!trimmed) return
    if (this.agentPaused) return

    this.narration = opts?.isFinal === false ? trimmed : ''
    this.opts.onAgentNarration?.(trimmed, opts?.isFinal ?? true)

    if (opts?.speak !== false && this.agent && this.agentWorking) {
      this.agent.sendText(
        `Narrate this build update in one short spoken sentence (no code): ${trimmed}`,
      )
    }
  }

  /** Record a live file edit for UI chips */
  recordFilePatch(patch: VoicePairFilePatch) {
    this.pushPatch(patch)
    if (!this.agentPaused && this.agentWorking) {
      const line = `Updated ${patch.path}: ${patch.summary}`
      this.setNarration(line, { speak: true, isFinal: true })
    }
  }

  /** User explicitly interrupts agent build narration */
  bargeIn() {
    if (!this.agentWorking && this.status !== 'agent-working') return
    this.bargeInActive = true
    this.agentPaused = true
    this.narration = ''
    this.setStatus('user-barge-in')
    this.armBargeInReset()
    this.agent?.sendText(
      'The founder is interrupting mid-build. Pause build narration and listen — acknowledge in one short sentence.',
    )
  }

  /** Pause coding agent narration (mic stays hot) */
  pauseAgent() {
    this.agentPaused = true
    this.narration = ''
    if (this.agentWorking) this.syncStatus()
  }

  /** Resume agent narration after pause or barge-in */
  resumeAgent() {
    this.agentPaused = false
    this.bargeInActive = false
    this.clearBargeInTimer()
    if (this.agentWorking) {
      this.syncStatus()
      this.agent?.sendText(
        'Resume brief build narration — one sentence on what you are doing next.',
      )
    }
  }

  /** Push a user text line into the live Grok session */
  sendUserText(text: string) {
    if (!text.trim()) return
    this.agent?.sendText(text.trim())
  }

  dispose() {
    this.stop()
    this.patches = []
  }
}

/** Factory for App.tsx / workspace integration */
export function createVoicePairController(opts?: VoicePairOptions): VoicePairController {
  return new VoicePairController(opts)
}

export const VOICE_PAIR_STATUS_LABELS: Record<
  VoicePairStatus,
  { headline: string; sub: string; accent: string }
> = {
  idle: {
    headline: 'Voice pair off',
    sub: 'Start a call to co-build with live narration',
    accent: '#555',
  },
  listening: {
    headline: 'Your turn',
    sub: 'Speak — Grok is listening',
    accent: '#00ff88',
  },
  'agent-working': {
    headline: 'Agent building',
    sub: 'Grok narrates file changes · tap barge-in anytime',
    accent: '#38bdf8',
  },
  'user-barge-in': {
    headline: 'Barge-in',
    sub: 'You interrupted — agent paused',
    accent: '#facc15',
  },
}