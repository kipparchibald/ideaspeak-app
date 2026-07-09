// Grok Voice Agent — WebSocket client for real-time speech-to-speech
// Uses ephemeral tokens so XAI_API_KEY never touches the browser
// Docs: https://docs.x.ai/developers/model-capabilities/audio/voice-agent

export type VoiceId =
  | 'eve' | 'ara' | 'leo' | 'rex' | 'sal'
  | 'iris' | 'luna' | 'helix' | 'orion' | 'rigel'
  | 'celeste' | 'cosmo' | 'kepler' | 'lumen' | 'sirius'

export interface GrokVoiceOptions {
  voice?: VoiceId
  instructions?: string
  onTranscript?: (text: string, isFinal: boolean) => void
  onAudio?: (chunk: ArrayBuffer) => void
  onStateChange?: (state: GrokVoiceState) => void
  onError?: (err: string) => void
}

export type GrokVoiceState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'error'

const IDEASPEAK_INSTRUCTIONS = `You are IdeaSpeak, a voice-first AI product strategist and app builder powered by Grok.

Your job: Help users turn spoken ideas into real web apps through natural conversation.

Personality:
- Direct, smart, enthusiastic — like a brilliant technical co-founder
- Ask ONE sharp clarifying question at a time
- Celebrate good ideas, challenge weak ones honestly
- Keep responses SHORT and conversational for voice — 2-4 sentences max
- End most turns with a question to keep the dialogue flowing

When a user describes an app idea:
1. Confirm you understood it in one sentence
2. Ask the single most important clarifying question
3. After 3-4 exchanges, summarize the plan and say "Ready to build — want me to generate it?"

You have access to web search. Use it when the user asks about competitors, tech options, or current tools.

Voice style: Speak naturally, use contractions, vary rhythm. No bullet points or lists — this is a spoken conversation.`

export class GrokVoiceAgent {
  private ws: WebSocket | null = null
  private audioContext: AudioContext | null = null
  private mediaStream: MediaStream | null = null
  private scriptProcessor: ScriptProcessorNode | null = null
  private audioQueue: ArrayBuffer[] = []
  private isPlayingAudio = false
  private state: GrokVoiceState = 'idle'
  private opts: GrokVoiceOptions

  constructor(opts: GrokVoiceOptions = {}) {
    this.opts = {
      voice: 'eve',
      instructions: IDEASPEAK_INSTRUCTIONS,
      ...opts,
    }
  }

  private setState(s: GrokVoiceState) {
    this.state = s
    this.opts.onStateChange?.(s)
  }

  getState() { return this.state }

  // ── Get ephemeral token from our Bun backend ───────────────────────────────
  private async getEphemeralToken(): Promise<string> {
    const res = await fetch('/api/voice/token', { method: 'POST' })
    if (!res.ok) throw new Error(`Token fetch failed: ${res.status}`)
    const data = await res.json()
    // xAI returns { client_secret: { value: "..." } }
    return data.client_secret?.value || data.token
  }

  // ── Connect to Grok Voice Agent ────────────────────────────────────────────
  async connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return
    this.setState('connecting')

    try {
      const token = await this.getEphemeralToken()

      // Browser WebSocket auth: pass token as subprotocol with prefix
      this.ws = new WebSocket(
        'wss://api.x.ai/v1/realtime?model=grok-voice-latest',
        [`xai-client-secret.${token}`]
      )

      this.ws.onopen = () => {
        // Configure the session
        this.ws!.send(JSON.stringify({
          type: 'session.update',
          session: {
            voice: this.opts.voice || 'eve',
            instructions: this.opts.instructions,
            turn_detection: { type: 'server_vad' },
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            tools: [
              { type: 'web_search' },
            ],
          },
        }))
        this.setState('listening')
        this.startMicrophone()
      }

      this.ws.onmessage = (e) => this.handleEvent(JSON.parse(e.data))

      this.ws.onerror = () => {
        this.setState('error')
        this.opts.onError?.('WebSocket connection failed. Check your xAI key.')
      }

      this.ws.onclose = () => {
        if (this.state !== 'idle') this.setState('idle')
      }

    } catch (err: any) {
      this.setState('error')
      this.opts.onError?.(err.message || 'Failed to connect to Grok Voice')
    }
  }

  // ── Handle incoming WebSocket events ──────────────────────────────────────
  private handleEvent(event: any) {
    switch (event.type) {
      case 'session.created':
      case 'session.updated':
        break

      // Transcript updates (what the user said)
      case 'conversation.item.input_audio_transcription.updated':
        this.opts.onTranscript?.(event.transcript || '', false)
        break
      case 'conversation.item.input_audio_transcription.completed':
        this.opts.onTranscript?.(event.transcript || '', true)
        break

      // Grok is thinking
      case 'response.created':
        this.setState('thinking')
        break

      // Audio coming back from Grok
      case 'response.output_audio.delta':
        this.setState('speaking')
        if (event.delta) {
          const bytes = Uint8Array.from(atob(event.delta), c => c.charCodeAt(0))
          this.enqueueAudio(bytes.buffer)
        }
        break

      case 'response.output_audio.done':
        // Audio finished — go back to listening
        this.flushAudioQueue().then(() => {
          if (this.state === 'speaking') this.setState('listening')
        })
        break

      case 'response.done':
        break

      case 'error':
        this.opts.onError?.(event.error?.message || 'Grok Voice error')
        this.setState('error')
        break
    }
  }

  // ── Microphone capture → PCM16 → WebSocket ─────────────────────────────────
  private async startMicrophone() {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      this.audioContext = new AudioContext({ sampleRate: 24000 })

      const source = this.audioContext.createMediaStreamSource(this.mediaStream)
      // ScriptProcessor is deprecated but still widest-supported for raw PCM
      this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1)

      this.scriptProcessor.onaudioprocess = (e) => {
        if (this.ws?.readyState !== WebSocket.OPEN) return
        if (this.state === 'speaking') return // don't send mic during playback

        const float32 = e.inputBuffer.getChannelData(0)
        const pcm16 = this.float32ToPcm16(float32)
        const b64 = btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)))

        this.ws.send(JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: b64,
        }))
      }

      source.connect(this.scriptProcessor)
      this.scriptProcessor.connect(this.audioContext.destination)
    } catch (err: any) {
      this.opts.onError?.('Microphone access denied: ' + err.message)
      this.setState('error')
    }
  }

  private float32ToPcm16(float32: Float32Array): Int16Array {
    const pcm = new Int16Array(float32.length)
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]))
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
    }
    return pcm
  }

  // ── Audio playback queue ───────────────────────────────────────────────────
  private enqueueAudio(buffer: ArrayBuffer) {
    this.audioQueue.push(buffer)
    if (!this.isPlayingAudio) this.playNextChunk()
  }

  private async playNextChunk() {
    if (this.audioQueue.length === 0) {
      this.isPlayingAudio = false
      return
    }
    this.isPlayingAudio = true
    const chunk = this.audioQueue.shift()!

    try {
      if (!this.audioContext) return
      // PCM16 at 24kHz → AudioBuffer
      const pcm16 = new Int16Array(chunk)
      const audioBuffer = this.audioContext.createBuffer(1, pcm16.length, 24000)
      const channel = audioBuffer.getChannelData(0)
      for (let i = 0; i < pcm16.length; i++) {
        channel[i] = pcm16[i] / 0x8000
      }
      const source = this.audioContext.createBufferSource()
      source.buffer = audioBuffer
      source.connect(this.audioContext.destination)
      source.onended = () => this.playNextChunk()
      source.start()
    } catch {
      this.playNextChunk()
    }
  }

  private async flushAudioQueue() {
    // Wait until queue drains
    return new Promise<void>(resolve => {
      const check = () => {
        if (!this.isPlayingAudio && this.audioQueue.length === 0) resolve()
        else setTimeout(check, 100)
      }
      check()
    })
  }

  // ── Send text message (for hybrid text+voice mode) ─────────────────────────
  sendText(text: string) {
    if (this.ws?.readyState !== WebSocket.OPEN) return
    this.ws.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text }],
      },
    }))
    this.ws.send(JSON.stringify({ type: 'response.create' }))
  }

  // ── Disconnect ─────────────────────────────────────────────────────────────
  disconnect() {
    this.scriptProcessor?.disconnect()
    this.audioContext?.close()
    this.mediaStream?.getTracks().forEach(t => t.stop())
    this.ws?.close()
    this.ws = null
    this.audioContext = null
    this.mediaStream = null
    this.scriptProcessor = null
    this.audioQueue = []
    this.isPlayingAudio = false
    this.setState('idle')
  }

  // ── Change voice mid-session ───────────────────────────────────────────────
  setVoice(voice: VoiceId) {
    this.opts.voice = voice
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'session.update',
        session: { voice },
      }))
    }
  }
}
