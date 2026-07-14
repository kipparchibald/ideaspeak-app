// Grok Voice Agent — real-time speech-to-speech via xAI Realtime WebSocket
// Docs: https://docs.x.ai/developers/model-capabilities/audio/voice-agent

export type VoiceId =
  | 'eve'
  | 'ara'
  | 'leo'
  | 'rex'
  | 'sal'
  | 'iris'
  | 'luna'
  | 'helix'
  | 'orion'
  | 'rigel'
  | 'celeste'
  | 'cosmo'
  | 'kepler'
  | 'lumen'
  | 'sirius'

export type GrokVoiceState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'error'

export interface GrokVoiceConversationTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface GrokVoiceOptions {
  voice?: VoiceId
  instructions?: string
  /** Prior turns — lightly seeded after session.updated (instructions carry most context) */
  conversationSeed?: GrokVoiceConversationTurn[]
  greetingInstructions?: string
  onUserTranscript?: (text: string, isFinal: boolean) => void
  onAssistantTranscript?: (text: string, isFinal: boolean) => void
  onStateChange?: (state: GrokVoiceState) => void
  /** Fatal — all retries exhausted */
  onError?: (err: string) => void
  /** Transient issue; agent is retrying */
  onReconnecting?: () => void
  /** @deprecated use onUserTranscript */
  onTranscript?: (text: string, isFinal: boolean) => void
}

export const IDEASPEAK_VOICE_INSTRUCTIONS = `You are Grok from xAI — sharp, truth-seeking, a little irreverent — co-building products inside IdeaSpeak.

You are on a LIVE VOICE CALL with the founder. Not a chatbot. Not customer support.

Personality:
- Sound like Grok: direct, witty, zero corporate fluff
- Short spoken answers: 1–3 sentences unless they ask for more
- Contractions speech. Natural pauses. Dry humor OK
- Never say "I'd be happy to", "Great question", "Absolutely", "How can I help"

Job this call:
- Collaborate on a ruthless v1 product plan
- Never parrot their idea back at them
- Lead with an opinion, then one sharp question
- Lock: who it's for, daily core loop, wow moment, what to cut
- When the plan is solid, tell them you're handing off to the builder and they should watch the live preview on screen — the app builds automatically when you say that
- Do not claim you already pushed code or deployed unless the preview is visibly building

If they say "build it" / "let's build" / "go ahead and build", confirm you're handing off to the builder and they should watch the preview.

When YOU decide the plan is ready (without them saying build), say clearly: "Handing off to the builder — watch the preview." That triggers the build.

Stay on this voice call through the build — you will announce when the preview is live. Never hand off to browser text-to-speech.`

const CONNECT_RETRIES = 3
const AUTO_RECONNECT_MAX = 5
const TOKEN_TIMEOUT_MS = 12_000
const SOCKET_TIMEOUT_MS = 22_000
const SESSION_BOOT_FALLBACK_MS = 9_000
const INSTRUCTIONS_MAX_CHARS = 6_800
const VOICE_MODEL = 'grok-voice-latest'

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function isRecoverableVoiceError(msg: string): boolean {
  return /conversation|item\.create|seed|transcription|whisper|tool|modalit|invalid.*session|too large|length/i.test(
    msg,
  )
}

export class GrokVoiceAgent {
  private ws: WebSocket | null = null
  private audioContext: AudioContext | null = null
  private playbackContext: AudioContext | null = null
  private mediaStream: MediaStream | null = null
  private scriptProcessor: ScriptProcessorNode | null = null
  private audioQueue: ArrayBuffer[] = []
  private isPlayingAudio = false
  private state: GrokVoiceState = 'idle'
  private opts: GrokVoiceOptions
  private assistantBuf = ''
  private userBuf = ''
  private nextPlayTime = 0

  private wantsConnection = false
  private intentionalDisconnect = false
  private conversationSeeded = false
  private greetingSent = false
  private uplinkEnabled = false
  private micBootstrapped = false
  private pendingBoot: ((sendGreeting: boolean) => Promise<void>) | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private sessionBootTimer: ReturnType<typeof setTimeout> | null = null
  private autoReconnectCount = 0
  private onVisibilityBound: (() => void) | null = null
  private pendingConnectResolve: (() => void) | null = null
  private pendingConnectReject: ((e: Error) => void) | null = null
  private pendingConnectFinish: ((fn: () => void) => void) | null = null

  constructor(opts: GrokVoiceOptions = {}) {
    this.opts = {
      voice: 'eve',
      instructions: IDEASPEAK_VOICE_INSTRUCTIONS,
      ...opts,
    }
  }

  private setState(s: GrokVoiceState) {
    this.state = s
    this.opts.onStateChange?.(s)
  }

  getState() {
    return this.state
  }

  private trimInstructions(text: string): string {
    if (text.length <= INSTRUCTIONS_MAX_CHARS) return text
    return (
      text.slice(0, INSTRUCTIONS_MAX_CHARS) +
      '\n\n[Earlier context truncated for voice stability — continue from recent thread.]'
    )
  }

  private buildSessionConfig() {
    return {
      voice: this.opts.voice || 'eve',
      instructions: this.trimInstructions(
        this.opts.instructions || IDEASPEAK_VOICE_INSTRUCTIONS,
      ),
      reasoning: { effort: 'none' as const },
      turn_detection: {
        type: 'server_vad' as const,
        threshold: 0.5,
        prefix_padding_ms: 333,
        silence_duration_ms: 700,
      },
      audio: {
        input: { format: { type: 'audio/pcm' as const, rate: 24000 } },
        output: { format: { type: 'audio/pcm' as const, rate: 24000 } },
      },
    }
  }

  private clearTimers() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.sessionBootTimer) clearTimeout(this.sessionBootTimer)
    this.reconnectTimer = null
    this.sessionBootTimer = null
  }

  private bindVisibilityResume() {
    if (this.onVisibilityBound || typeof document === 'undefined') return
    this.onVisibilityBound = () => {
      if (document.visibilityState !== 'visible') return
      void this.audioContext?.resume()
      void this.playbackContext?.resume()
    }
    document.addEventListener('visibilitychange', this.onVisibilityBound)
  }

  private unbindVisibilityResume() {
    if (this.onVisibilityBound && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityBound)
    }
    this.onVisibilityBound = null
  }

  private async getEphemeralToken(): Promise<string> {
    let lastErr = 'Voice token failed'
    for (let attempt = 0; attempt < CONNECT_RETRIES; attempt++) {
      try {
        const res = await fetch('/api/voice/token', {
          method: 'POST',
          signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
        })
        const data = await res.json().catch(() => ({} as Record<string, unknown>))
        if (!res.ok) {
          throw new Error(
            (typeof data.error === 'string' && data.error) ||
              (typeof data.message === 'string' && data.message) ||
              `Voice token failed (${res.status})`,
          )
        }
        const raw =
          (data.client_secret as { value?: string } | undefined)?.value ||
          (typeof data.value === 'string' ? data.value : '') ||
          (typeof data.token === 'string' ? data.token : '') ||
          (typeof data.client_secret === 'string' ? data.client_secret : '')
        if (!raw) throw new Error('Voice token response missing client_secret')
        return raw.startsWith('xai-client-secret.')
          ? raw.slice('xai-client-secret.'.length)
          : raw
      } catch (e: unknown) {
        lastErr = e instanceof Error ? e.message : String(e)
        if (attempt < CONNECT_RETRIES - 1) await sleep(500 * (attempt + 1))
      }
    }
    throw new Error(lastErr)
  }

  private scheduleSessionBootFallback(sendGreeting: boolean) {
    if (this.sessionBootTimer) clearTimeout(this.sessionBootTimer)
    this.sessionBootTimer = setTimeout(() => {
      if (!this.pendingBoot) return
      const boot = this.pendingBoot
      this.pendingBoot = null
      void boot(sendGreeting)
        .then(() => this.pendingConnectFinish?.(() => this.pendingConnectResolve?.()))
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : 'Microphone setup failed'
          this.pendingConnectFinish?.(() =>
            this.pendingConnectReject?.(new Error(msg)),
          )
        })
    }, SESSION_BOOT_FALLBACK_MS)
  }

  private async runBoot(sendGreeting: boolean) {
    if (this.sessionBootTimer) {
      clearTimeout(this.sessionBootTimer)
      this.sessionBootTimer = null
    }
    await this.ensureMicrophone()
    this.uplinkEnabled = true
    this.setState('listening')
    if (sendGreeting && !this.greetingSent) {
      this.sendGreeting(this.opts.greetingInstructions)
      this.greetingSent = true
    }
  }

  private async openSocket(token: string, sendGreeting: boolean): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      let settled = false
      const finish = (fn: () => void) => {
        if (settled) return
        settled = true
        window.clearTimeout(socketTimeout)
        fn()
      }

      try {
        this.ws?.close()
      } catch {
        /* ignore */
      }

      const ws = new WebSocket(`wss://api.x.ai/v1/realtime?model=${VOICE_MODEL}`, [
        `xai-client-secret.${token}`,
      ])
      this.ws = ws
      ws.binaryType = 'arraybuffer'

      const socketTimeout = window.setTimeout(() => {
        finish(() => reject(new Error('Grok Voice connection timed out')))
      }, SOCKET_TIMEOUT_MS)

      this.pendingConnectResolve = resolve
      this.pendingConnectReject = reject
      this.pendingConnectFinish = finish
      this.pendingBoot = async (greet) => this.runBoot(greet)
      this.scheduleSessionBootFallback(sendGreeting)

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'session.update',
            session: this.buildSessionConfig(),
          }),
        )
      }

      ws.onmessage = (e) => {
        try {
          if (typeof e.data === 'string') this.handleEvent(JSON.parse(e.data), sendGreeting)
        } catch {
          /* ignore */
        }
      }

      ws.onerror = () => {
        finish(() => reject(new Error('WebSocket error talking to Grok Voice')))
      }

      ws.onclose = (ev) => {
        this.uplinkEnabled = false
        if (this.sessionBootTimer) {
          clearTimeout(this.sessionBootTimer)
          this.sessionBootTimer = null
        }
        this.pendingBoot = null

        this.pendingConnectResolve = null
        this.pendingConnectReject = null
        this.pendingConnectFinish = null

        if (!settled) {
          finish(() =>
            reject(new Error(ev.reason?.trim() || `Grok Voice disconnected (code ${ev.code})`)),
          )
          return
        }

        if (this.intentionalDisconnect || !this.wantsConnection) {
          if (this.state !== 'idle' && this.state !== 'error') this.setState('idle')
          return
        }

        if (this.autoReconnectCount < AUTO_RECONNECT_MAX) {
          this.autoReconnectCount++
          this.opts.onReconnecting?.()
          this.setState('connecting')
          if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
          this.reconnectTimer = setTimeout(() => {
            void this.reconnect(false).catch(() => {
              /* reconnect handles fatal */
            })
          }, Math.min(1200 * this.autoReconnectCount, 6000))
          return
        }

        this.failFatally('Voice call dropped — tap mic to reconnect')
      }
    })
  }

  private handleEvent(event: Record<string, unknown>, sendGreeting: boolean) {
    const connectResolve = this.pendingConnectResolve
    const connectReject = this.pendingConnectReject
    const connectFinish = this.pendingConnectFinish
    const type = String(event.type || '')

    switch (type) {
      case 'session.created':
        break

      case 'session.updated':
        if (!this.conversationSeeded) {
          this.seedConversation(this.opts.conversationSeed)
          this.conversationSeeded = true
        }
        if (this.pendingBoot) {
          const boot = this.pendingBoot
          this.pendingBoot = null
          void boot(sendGreeting)
            .then(() => {
              connectFinish?.(() => connectResolve?.())
              this.pendingConnectResolve = null
              this.pendingConnectReject = null
              this.pendingConnectFinish = null
            })
            .catch((err: unknown) => {
              const msg = err instanceof Error ? err.message : 'Microphone setup failed'
              connectFinish?.(() => connectReject?.(new Error(msg)))
            })
        } else if (this.state === 'connecting') {
          this.setState('listening')
        }
        break

      case 'input_audio_buffer.speech_started':
        this.setState('listening')
        break

      case 'input_audio_buffer.speech_stopped':
        this.setState('thinking')
        break

      case 'conversation.item.input_audio_transcription.delta':
      case 'conversation.item.input_audio_transcription.updated': {
        const t = String(event.delta || event.transcript || '')
        if (t) {
          this.userBuf += t
          this.emitUser(this.userBuf, false)
        }
        break
      }
      case 'conversation.item.input_audio_transcription.completed': {
        const t = String(event.transcript || this.userBuf)
        this.userBuf = ''
        if (t) this.emitUser(t, true)
        break
      }

      case 'response.created':
        this.assistantBuf = ''
        this.setState('thinking')
        break

      case 'response.audio_transcript.delta':
      case 'response.output_audio_transcript.delta': {
        const d = String(event.delta || '')
        this.assistantBuf += d
        this.opts.onAssistantTranscript?.(this.assistantBuf, false)
        break
      }
      case 'response.audio_transcript.done':
      case 'response.output_audio_transcript.done': {
        const t = String(event.transcript || this.assistantBuf)
        this.assistantBuf = ''
        if (t) this.opts.onAssistantTranscript?.(t, true)
        break
      }

      case 'response.output_audio.delta':
      case 'response.audio.delta':
        this.setState('speaking')
        if (event.delta) {
          try {
            const bytes = this.b64ToArrayBuffer(String(event.delta))
            this.enqueueAudio(bytes)
          } catch {
            /* ignore bad chunk */
          }
        }
        break

      case 'response.output_audio.done':
      case 'response.audio.done':
        break

      case 'response.done':
        if (this.assistantBuf) {
          this.opts.onAssistantTranscript?.(this.assistantBuf, true)
          this.assistantBuf = ''
        }
        void this.whenPlaybackIdle().then(() => {
          if (this.state === 'speaking' || this.state === 'thinking') {
            this.setState('listening')
          }
        })
        break

      case 'error': {
        const errObj = event.error as { message?: string } | string | undefined
        const msg =
          (typeof errObj === 'object' && errObj?.message) ||
          (typeof event.message === 'string' ? event.message : '') ||
          (typeof errObj === 'string' ? errObj : '') ||
          'Grok Voice error'

        if (isRecoverableVoiceError(msg)) {
          this.conversationSeeded = true
          if (this.pendingBoot) {
            const boot = this.pendingBoot
            this.pendingBoot = null
            void boot(sendGreeting)
              .then(() => connectFinish?.(() => connectResolve?.()))
              .catch((err: unknown) => {
                connectFinish?.(() =>
                  connectReject?.(
                    new Error(err instanceof Error ? err.message : 'Microphone setup failed'),
                  ),
                )
              })
          }
          return
        }

        if (this.state === 'connecting' && connectReject && connectFinish) {
          connectFinish(() => connectReject(new Error(msg)))
          return
        }

        this.failFatally(msg)
        break
      }
    }
  }

  private failFatally(msg: string) {
    this.pendingBoot = null
    this.wantsConnection = false
    this.clearTimers()
    this.setState('error')
    this.opts.onError?.(msg)
  }

  private async reconnect(sendGreeting: boolean) {
    if (!this.wantsConnection || this.intentionalDisconnect) return
    this.setState('connecting')
    this.conversationSeeded = false
    try {
      const token = await this.getEphemeralToken()
      await this.openSocket(token, sendGreeting)
      this.autoReconnectCount = 0
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Reconnect failed'
      if (this.autoReconnectCount < AUTO_RECONNECT_MAX) {
        this.autoReconnectCount++
        this.opts.onReconnecting?.()
        this.reconnectTimer = setTimeout(() => {
          void this.reconnect(false)
        }, Math.min(1500 * this.autoReconnectCount, 8000))
        return
      }
      this.failFatally(msg)
    }
  }

  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN && this.uplinkEnabled) return

    this.wantsConnection = true
    this.intentionalDisconnect = false
    this.autoReconnectCount = 0
    this.greetingSent = false
    this.conversationSeeded = false
    this.setState('connecting')
    this.bindVisibilityResume()

    let lastErr: Error | null = null
    for (let attempt = 0; attempt < CONNECT_RETRIES; attempt++) {
      try {
        if (attempt > 0) this.opts.onReconnecting?.()
        const token = await this.getEphemeralToken()
        await this.openSocket(token, true)
        return
      } catch (e: unknown) {
        lastErr = e instanceof Error ? e : new Error(String(e))
        if (attempt < CONNECT_RETRIES - 1) await sleep(700 * (attempt + 1))
      }
    }

    this.failFatally(lastErr?.message || 'Failed to connect to Grok Voice')
    throw lastErr
  }

  private emitUser(text: string, isFinal: boolean) {
    this.opts.onUserTranscript?.(text, isFinal)
    this.opts.onTranscript?.(text, isFinal)
  }

  private b64ToArrayBuffer(b64: string): ArrayBuffer {
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes.buffer
  }

  private arrayBufferToB64(buf: ArrayBuffer): string {
    const bytes = new Uint8Array(buf)
    let binary = ''
    const chunk = 0x8000
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
    }
    return btoa(binary)
  }

  private seedConversation(turns?: GrokVoiceConversationTurn[]) {
    if (!turns?.length || this.ws?.readyState !== WebSocket.OPEN) return
    for (const turn of turns.slice(-4)) {
      const role = turn.role === 'assistant' ? 'assistant' : 'user'
      const text = turn.content.trim().slice(0, 320)
      if (!text) continue
      try {
        this.ws?.send(
          JSON.stringify({
            type: 'conversation.item.create',
            item: {
              type: 'message',
              role,
              content: [
                { type: role === 'user' ? 'input_text' : 'output_text', text },
              ],
            },
          }),
        )
      } catch {
        /* skip bad seed turn */
      }
    }
  }

  private async ensureMicrophone() {
    const streamActive = this.mediaStream?.getTracks().some((t) => t.readyState === 'live')
    if (this.micBootstrapped && streamActive && this.scriptProcessor) return

    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })

    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new AudioContext({ sampleRate: 24000 })
    }
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume()
    }

    if (this.scriptProcessor) {
      try {
        this.scriptProcessor.disconnect()
      } catch {
        /* ignore */
      }
    }

    const source = this.audioContext.createMediaStreamSource(this.mediaStream)
    this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1)

    this.scriptProcessor.onaudioprocess = (e) => {
      if (!this.uplinkEnabled || this.ws?.readyState !== WebSocket.OPEN) return
      if (this.state === 'speaking') return

      const float32 = e.inputBuffer.getChannelData(0)
      const pcm16 = this.float32ToPcm16(float32)
      const b64 = this.arrayBufferToB64(pcm16.buffer as ArrayBuffer)

      try {
        this.ws?.send(
          JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: b64,
          }),
        )
      } catch {
        /* ws may be closing */
      }
    }

    source.connect(this.scriptProcessor)
    const mute = this.audioContext.createGain()
    mute.gain.value = 0
    this.scriptProcessor.connect(mute)
    mute.connect(this.audioContext.destination)

    this.micBootstrapped = true
  }

  private sendGreeting(greetingInstructions?: string) {
    if (this.ws?.readyState !== WebSocket.OPEN) return
    this.ws.send(
      JSON.stringify({
        type: 'response.create',
        response: {
          instructions:
            greetingInstructions ||
            this.opts.greetingInstructions ||
            'Greet briefly as Grok (one short sentence). Ask who the product is for and what they do every day. No corporate fluff.',
        },
      }),
    )
  }

  private float32ToPcm16(float32: Float32Array): Int16Array {
    const pcm = new Int16Array(float32.length)
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]))
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff
    }
    return pcm
  }

  private enqueueAudio(buffer: ArrayBuffer) {
    this.audioQueue.push(buffer)
    if (!this.isPlayingAudio) void this.playNextChunk()
  }

  private async ensurePlaybackContext() {
    if (!this.playbackContext || this.playbackContext.state === 'closed') {
      this.playbackContext = new AudioContext({ sampleRate: 24000 })
    }
    if (this.playbackContext.state === 'suspended') {
      await this.playbackContext.resume()
    }
    return this.playbackContext
  }

  private async playNextChunk() {
    if (this.audioQueue.length === 0) {
      this.isPlayingAudio = false
      return
    }
    this.isPlayingAudio = true
    const chunk = this.audioQueue.shift()!

    try {
      const ctx = await this.ensurePlaybackContext()
      const pcm16 = new Int16Array(chunk)
      const audioBuffer = ctx.createBuffer(1, pcm16.length, 24000)
      const channel = audioBuffer.getChannelData(0)
      for (let i = 0; i < pcm16.length; i++) {
        channel[i] = pcm16[i] / 0x8000
      }
      const source = ctx.createBufferSource()
      source.buffer = audioBuffer
      source.connect(ctx.destination)
      const startAt = Math.max(ctx.currentTime, this.nextPlayTime)
      source.start(startAt)
      this.nextPlayTime = startAt + audioBuffer.duration
      source.onended = () => {
        void this.playNextChunk()
      }
    } catch {
      void this.playNextChunk()
    }
  }

  private whenPlaybackIdle(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (!this.isPlayingAudio && this.audioQueue.length === 0) resolve()
        else setTimeout(check, 80)
      }
      check()
    })
  }

  sendText(text: string) {
    if (this.ws?.readyState !== WebSocket.OPEN) return
    this.ws.send(
      JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text }],
        },
      }),
    )
    this.ws.send(JSON.stringify({ type: 'response.create' }))
  }

  speakLine(instructions: string) {
    if (this.ws?.readyState !== WebSocket.OPEN) return
    this.ws.send(
      JSON.stringify({
        type: 'response.create',
        response: { instructions },
      }),
    )
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN && this.uplinkEnabled
  }

  private cleanupMedia(full = true) {
    this.uplinkEnabled = false
    try {
      this.scriptProcessor?.disconnect()
    } catch {
      /* ignore */
    }
    if (full) {
      try {
        this.mediaStream?.getTracks().forEach((t) => t.stop())
      } catch {
        /* ignore */
      }
      try {
        void this.audioContext?.close()
      } catch {
        /* ignore */
      }
      this.scriptProcessor = null
      this.mediaStream = null
      this.audioContext = null
      this.micBootstrapped = false
    }
    try {
      void this.playbackContext?.close()
    } catch {
      /* ignore */
    }
    this.playbackContext = null
    this.audioQueue = []
    this.isPlayingAudio = false
    this.nextPlayTime = 0
  }

  disconnect() {
    this.wantsConnection = false
    this.intentionalDisconnect = true
    this.pendingBoot = null
    this.conversationSeeded = false
    this.greetingSent = false
    this.clearTimers()
    this.unbindVisibilityResume()
    this.cleanupMedia(true)
    try {
      this.ws?.close()
    } catch {
      /* ignore */
    }
    this.ws = null
    this.setState('idle')
  }

  setVoice(voice: VoiceId) {
    this.opts.voice = voice
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'session.update',
          session: { voice },
        }),
      )
    }
  }
}