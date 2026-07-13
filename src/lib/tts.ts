/** Unified text-to-speech: Grok TTS (preferred) with browser SpeechSynthesis fallback */

import { sanitizeForSpeech } from './speech'

export type TtsProvider = 'auto' | 'grok' | 'browser'
export type GrokVoiceId =
  | 'eve' | 'ara' | 'leo' | 'rex' | 'sal'
  | 'iris' | 'luna' | 'helix' | 'orion' | 'rigel'
  | 'celeste' | 'cosmo' | 'kepler' | 'lumen' | 'sirius'
  | 'carina' | 'zagan' | 'altair' | 'zenith' | 'atlas'
  | 'castor' | 'naksh'

export const GROK_VOICES: { id: GrokVoiceId; label: string; tone: string }[] = [
  { id: 'eve', label: 'Eve', tone: 'Default — clear and natural' },
  { id: 'ara', label: 'Ara', tone: 'Warm, friendly' },
  { id: 'leo', label: 'Leo', tone: 'Confident, direct' },
  { id: 'rex', label: 'Rex', tone: 'Strong, authoritative' },
  { id: 'sal', label: 'Sal', tone: 'Calm, professional' },
  { id: 'iris', label: 'Iris', tone: 'Upbeat, sales-friendly' },
  { id: 'luna', label: 'Luna', tone: 'Gentle, educational' },
  { id: 'helix', label: 'Helix', tone: 'Bold, dynamic' },
  { id: 'orion', label: 'Orion', tone: 'Cinematic narration' },
  { id: 'lumen', label: 'Lumen', tone: 'Bright, modern' },
  { id: 'carina', label: 'Carina', tone: 'Soft, empathetic' },
  { id: 'atlas', label: 'Atlas', tone: 'Steady, grounded' },
]

const STORAGE_KEYS = {
  provider: 'ideaspeak_tts_provider',
  voice: 'ideaspeak_tts_voice',
  enabled: 'ideaspeak_tts_enabled',
}

export function getTtsProvider(): TtsProvider {
  if (typeof window === 'undefined') return 'auto'
  return (localStorage.getItem(STORAGE_KEYS.provider) as TtsProvider) || 'auto'
}

export function setTtsProvider(p: TtsProvider) {
  localStorage.setItem(STORAGE_KEYS.provider, p)
}

export function getTtsVoice(): GrokVoiceId {
  if (typeof window === 'undefined') return 'eve'
  return (localStorage.getItem(STORAGE_KEYS.voice) as GrokVoiceId) || 'eve'
}

export function setTtsVoice(v: GrokVoiceId) {
  localStorage.setItem(STORAGE_KEYS.voice, v)
}

export function isTtsEnabled(): boolean {
  if (typeof window === 'undefined') return true
  const v = localStorage.getItem(STORAGE_KEYS.enabled)
  return v === null ? true : v === 'true'
}

export function setTtsEnabled(on: boolean) {
  localStorage.setItem(STORAGE_KEYS.enabled, String(on))
}

let currentAudio: HTMLAudioElement | null = null
let browserUtterance: SpeechSynthesisUtterance | null = null

export function stopSpeaking() {
  if (currentAudio) {
    currentAudio.pause()
    currentAudio.src = ''
    currentAudio = null
  }
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel()
  }
  browserUtterance = null
}

function speakBrowser(text: string, rate = 1): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!window.speechSynthesis) {
      reject(new Error('Browser speech not supported'))
      return
    }
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.rate = rate
    u.onend = () => resolve()
    u.onerror = (e) => reject(e.error || new Error('Browser TTS failed'))
    browserUtterance = u
    window.speechSynthesis.speak(u)
  })
}

async function speakGrok(
  text: string,
  voice: GrokVoiceId,
  speed = 1
): Promise<void> {
  stopSpeaking()

  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      voice_id: voice,
      language: 'en',
      speed,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Grok TTS failed (${res.status})`)
  }

  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)
  currentAudio = audio

  return new Promise((resolve, reject) => {
    audio.onended = () => {
      URL.revokeObjectURL(url)
      if (currentAudio === audio) currentAudio = null
      resolve()
    }
    audio.onerror = () => {
      URL.revokeObjectURL(url)
      if (currentAudio === audio) currentAudio = null
      reject(new Error('Audio playback failed'))
    }
    audio.play().catch(reject)
  })
}

export interface SpeakOptions {
  provider?: TtsProvider
  voice?: GrokVoiceId
  voiceMode?: boolean
  rate?: number
  /** Skip sanitize (already cleaned) */
  raw?: boolean
}

/**
 * Speak text aloud.
 * auto = try Grok TTS first, fall back to browser if key missing / error
 */
export async function speak(text: string, opts: SpeakOptions = {}): Promise<void> {
  if (!isTtsEnabled()) return
  if (!text?.trim()) return

  const cleaned = opts.raw ? text.trim() : sanitizeForSpeech(text, opts.voiceMode)
  if (!cleaned) return

  const provider = opts.provider || getTtsProvider()
  const voice = opts.voice || getTtsVoice()
  const rate = opts.rate ?? 1

  stopSpeaking()

  if (provider === 'browser') {
    await speakBrowser(cleaned, rate)
    return
  }

  if (provider === 'grok') {
    await speakGrok(cleaned, voice, rate)
    return
  }

  // auto
  try {
    await speakGrok(cleaned, voice, rate)
  } catch {
    await speakBrowser(cleaned, rate)
  }
}

/** Quick test clip for Settings */
export async function testVoice(voice?: GrokVoiceId): Promise<void> {
  await speak(
    'Hi, I am your IdeaSpeak voice. Ready to build something great.',
    { provider: 'auto', voice: voice || getTtsVoice(), raw: true }
  )
}
