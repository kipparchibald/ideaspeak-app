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
  /** Prior turns from History — seeded into realtime session on connect */
  conversationSeed?: GrokVoiceConversationTurn[]
  /** Overrides default first greeting */
  greetingInstructions?: string
  /** User speech transcript */
  onUserTranscript?: (text: string, isFinal: boolean) => void
  /** Grok spoken reply as text (when available) */
  onAssistantTranscript?: (text: string, isFinal: boolean) => void
  onStateChange?: (state: GrokVoiceState) => void
  onError?: (err: string) => void
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
  private conversationSeeded = false
  private pendingBoot: (() => Promise<void>) | null = null

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

  private buildSessionConfig() {
    return {
      voice: this.opts.voice || 'eve',
      instructions: this.opts.instructions || IDEASPEAK_VOICE_INSTRUCTIONS,
      reasoning: { effort: 'none' as const },
      turn_detection: {
        type: 'server_vad' as const,
        threshold: 0.5,
        prefix_padding_ms: 333,
        silence_duration_ms: 600,
      },
      audio: {
        input: { format: { type: 'audio/pcm' as const, rate: 24000 } },
        output: { format: { type: 'audio/pcm' as const, rate: 24000 } },
      },
    }
  }

  private async getEphemeralToken(): Promise<string> {
    const res = await fetch('/api/voice/token', { method: 'POST' })
    const data = await res.json().catch(() => ({} as Record<string, unknown>))
    if (!res.ok) {
      const err =
        (typeof data.error === 'string' && data.error) ||
        (typeof data.message === 'string' && data.message) ||
        `Voice token failed (${res.status}). Is XAI_API_KEY set on the server?`
      throw new Error(err)
    }
    const raw =
      (data.client_secret as { value?: string } | undefined)?.value ||
      (typeof data.value === 'string' ? data.value : '') ||
      (typeof data.token === 'string' ? data.token : '') ||
      (typeof data.client_secret === 'string' ? data.client_secret : '')
    if (!raw) {
      throw new Error('Voice token response missing client_secret')
    }
    return raw.startsWith('xai-client-secret.') ? raw.slice('xai-client-secret.'.length) : raw
  }

  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return
    this.setState('connecting')
    this.conversationSeeded = false
    this.pendingBoot = null

    try {
      const token = await this.getEphemeralToken()

      await new Promise<void>((resolve, reject) => {
        let settled = false
        const finish = (fn: () => void) => {
          if (settled) return
          settled = true
          window.clearTimeout(timeout)
          fn()
        }

        const ws = new WebSocket(
          'wss://api.x.ai/v1/realtime?model=grok-voice-latest',
          [`xai-client-secret.${token}`],
        )
        this.ws = ws
        ws.binaryType = 'arraybuffer'

        const timeout = window.setTimeout(() => {
          finish(() => reject(new Error('Grok Voice connection timed out')))
        }, 20_000)

        this.pendingBoot = async () => {
          await this.startMicrophone(this.opts.greetingInstructions)
          finish(resolve)
        }

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
            if (typeof e.data === 'string') this.handleEvent(JSON.parse(e.data))
          } catch {
            /* ignore */
          }
        }

        ws.onerror = () => {
          finish(() => {
            this.opts.onError?.('WebSocket error talking to Grok Voice')
            this.setState('error')
            reject(new Error('WebSocket error'))
          })
        }

        ws.onclose = (ev) => {
          this.cleanupMedia()
          this.pendingBoot = null
          if (!settled) {
            finish(() =>
              reject(
                new Error(
                  ev.reason?.trim() || `Grok Voice disconnected (code ${ev.code})`,
                ),
              ),
            )
            return
          }
          if (this.state !== 'idle' && this.state !== 'error') this.setState('idle')
        }
      })
    } catch (err: unknown) {
      this.pendingBoot = null
      this.setState('error')
      const msg = err instanceof Error ? err.message : 'Failed to connect to Grok Voice'
      this.opts.onError?.(msg)
      throw err
    }
  }

  private handleEvent(event: any) {
    switch (event.type) {
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
          void boot().catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : 'Microphone setup failed'
            this.opts.onError?.(msg)
            this.setState('error')
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

      // User transcripts (several event name variants across protocol versions)
      case 'conversation.item.input_audio_transcription.delta':
      case 'conversation.item.input_audio_transcription.updated': {
        const t = event.delta || event.transcript || ''
        if (t) {
          this.userBuf += t
          this.emitUser(this.userBuf, false)
        }
        break
      }
      case 'conversation.item.input_audio_transcription.completed': {
        const t = event.transcript || this.userBuf
        this.userBuf = ''
        if (t) this.emitUser(t, true)
        break
      }

      case 'response.created':
        this.assistantBuf = ''
        this.setState('thinking')
        break

      // Assistant text (when provided alongside audio)
      case 'response.audio_transcript.delta':
      case 'response.output_audio_transcript.delta': {
        const d = event.delta || ''
        this.assistantBuf += d
        this.opts.onAssistantTranscript?.(this.assistantBuf, false)
        break
      }
      case 'response.audio_transcript.done':
      case 'response.output_audio_transcript.done': {
        const t = event.transcript || this.assistantBuf
        this.assistantBuf = ''
        if (t) this.opts.onAssistantTranscript?.(t, true)
        break
      }

      // Audio from Grok
      case 'response.output_audio.delta':
      case 'response.audio.delta':
        this.setState('speaking')
        if (event.delta) {
          try {
            const bytes = this.b64ToArrayBuffer(event.delta)
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
        // Return to listening after audio drains
        void this.whenPlaybackIdle().then(() => {
          if (this.state === 'speaking' || this.state === 'thinking') {
            this.setState('listening')
          }
        })
        break

      case 'error': {
        const msg =
          event.error?.message ||
          event.message ||
          (typeof event.error === 'string' ? event.error : '') ||
          'Grok Voice error'
        this.pendingBoot = null
        this.opts.onError?.(msg)
        this.setState('error')
        break
      }
    }
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
    for (const turn of turns) {
      const role = turn.role === 'assistant' ? 'assistant' : 'user'
      this.ws?.send(
        JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'message',
            role,
            content: [
              { type: role === 'user' ? 'input_text' : 'output_text', text: turn.content },
            ],
          },
        }),
      )
    }
  }

  private async startMicrophone(greetingInstructions?: string) {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      this.audioContext = new AudioContext({ sampleRate: 24000 })
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume()
      }

      const source = this.audioContext.createMediaStreamSource(this.mediaStream)
      this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1)

      this.scriptProcessor.onaudioprocess = (e) => {
        if (this.ws?.readyState !== WebSocket.OPEN) return
        // Mute uplink while Grok is talking to reduce echo
        if (this.state === 'speaking') return

        const float32 = e.inputBuffer.getChannelData(0)
        const pcm16 = this.float32ToPcm16(float32)
        const b64 = this.arrayBufferToB64(pcm16.buffer as ArrayBuffer)

        this.ws.send(
          JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: b64,
          }),
        )
      }

      source.connect(this.scriptProcessor)
      // Keep processor alive without feedback squeal
      const mute = this.audioContext.createGain()
      mute.gain.value = 0
      this.scriptProcessor.connect(mute)
      mute.connect(this.audioContext.destination)

      this.setState('listening')

      this.ws?.send(
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
    } catch (err: any) {
      this.opts.onError?.('Microphone access denied: ' + (err.message || err))
      this.setState('error')
    }
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
    if (!this.playbackContext) {
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

  /** Speak as Grok without adding a user turn (build updates, preview ready, etc.) */
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
    return this.ws?.readyState === WebSocket.OPEN
  }

  private cleanupMedia() {
    try {
      this.scriptProcessor?.disconnect()
    } catch {
      /* ignore */
    }
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
    try {
      void this.playbackContext?.close()
    } catch {
      /* ignore */
    }
    this.scriptProcessor = null
    this.mediaStream = null
    this.audioContext = null
    this.playbackContext = null
    this.audioQueue = []
    this.isPlayingAudio = false
    this.nextPlayTime = 0
  }

  disconnect() {
    this.pendingBoot = null
    this.conversationSeeded = false
    this.cleanupMedia()
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
