import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  Loader2,
  Lock,
  Mic,
  MicOff,
  Send,
  Shield,
  Volume2,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  GrokVoiceAgent,
  type GrokVoiceState,
} from '../lib/grokVoice'
import {
  buildChiefGreeting,
  buildChiefVoiceInstructions,
  chiefConversationSeed,
} from '../lib/chief-voice'
import {
  chiefDiscuss,
  chiefVoiceTokenHeaders,
  chiefVoiceTokenPaths,
  clearChiefSession,
  fetchChiefStatus,
  getChiefSessionToken,
  isChiefUnlocked,
  unlockChiefDesk,
  type ChiefIntegrationStatus,
} from '../lib/chief-gate'
import { getSupabaseSession } from '../lib/supabase'
import { speak } from '../lib/tts'

type ChiefMsg = { role: 'user' | 'assistant'; content: string; ts: number }

const VOICE_CFG: Record<GrokVoiceState, { label: string; color: string }> = {
  idle: { label: 'Tap mic to talk', color: '#c4b5fd' },
  connecting: { label: 'Connecting…', color: '#facc15' },
  listening: { label: 'Listening', color: '#00ff88' },
  thinking: { label: 'Thinking…', color: '#818cf8' },
  speaking: { label: 'Speaking', color: '#38bdf8' },
  error: { label: 'Voice error', color: '#f87171' },
}

const DEFAULT_INTEGRATION: ChiefIntegrationStatus = {
  timezone: 'America/Boise',
  calendarConnected: false,
  gmailConnected: false,
  mailSendEnabled: false,
}

function VoiceOrb({ state }: { state: GrokVoiceState }) {
  const cfg = VOICE_CFG[state]
  const live = state === 'listening' || state === 'thinking' || state === 'speaking'
  return (
    <div className="relative flex h-14 w-14 items-center justify-center">
      {live && (
        <motion.span
          className="absolute inset-0 rounded-full"
          style={{ background: cfg.color, opacity: 0.2 }}
          animate={{ scale: [1, 1.35, 1], opacity: [0.25, 0.08, 0.25] }}
          transition={{ duration: 1.6, repeat: Infinity }}
        />
      )}
      <span
        className="relative z-10 h-10 w-10 rounded-full border-2"
        style={{ borderColor: cfg.color, boxShadow: live ? `0 0 24px ${cfg.color}55` : undefined }}
      />
    </div>
  )
}

function UnlockGate({ onUnlocked }: { onUnlocked: () => void }) {
  const [secret, setSecret] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const tryUnlock = async (opts: { secret?: string; supabaseAccessToken?: string }) => {
    setLoading(true)
    setError('')
    const res = await unlockChiefDesk(opts)
    setLoading(false)
    if (res.ok) {
      toast.success('Chief desk unlocked')
      onUnlocked()
    } else {
      setError(res.error || 'Access denied')
    }
  }

  useEffect(() => {
    void (async () => {
      const session = await getSupabaseSession()
      if (session?.access_token) {
        await tryUnlock({ supabaseAccessToken: session.access_token })
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="rounded-2xl border border-[#2a2a35] bg-[#111116] p-8 shadow-xl">
        <div className="mb-6 flex items-center gap-3">
          <Shield className="text-[#c4b5fd]" size={28} />
          <div>
            <h1 className="text-xl font-semibold text-[#e8e8f0]">Chief of Staff</h1>
            <p className="text-sm text-[#888]">Private desk — Kipp only</p>
          </div>
        </div>
        <p className="mb-6 text-sm leading-relaxed text-[#aaa]">
          Enter your owner gate secret, or sign in with your owner email in IdeaSpeak Account
          settings first.
        </p>
        <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-[#888]">
          Gate secret
        </label>
        <input
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void tryUnlock({ secret: secret.trim() })}
          placeholder="CHIEF_GATE_SECRET"
          className="mb-4 w-full rounded-xl border border-[#2a2a35] bg-[#0a0a0f] px-4 py-3 text-[#e8e8f0] outline-none focus:border-[#c4b5fd]"
          autoComplete="off"
        />
        {error && <p className="mb-4 text-sm text-[#f87171]">{error}</p>}
        <button
          type="button"
          disabled={loading || !secret.trim()}
          onClick={() => void tryUnlock({ secret: secret.trim() })}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#c4b5fd] py-3 font-semibold text-[#0a0a0f] disabled:opacity-40"
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : <Lock size={18} />}
          Unlock desk
        </button>
        <a
          href="/"
          className="mt-6 flex items-center justify-center gap-2 text-sm text-[#888] hover:text-[#c4b5fd]"
        >
          <ArrowLeft size={14} /> Back to IdeaSpeak builder
        </a>
      </div>
    </div>
  )
}

export default function ChiefDesk() {
  const [unlocked, setUnlocked] = useState(isChiefUnlocked())
  const [integration, setIntegration] = useState<ChiefIntegrationStatus>(DEFAULT_INTEGRATION)
  const [messages, setMessages] = useState<ChiefMsg[]>([])
  const [draft, setDraft] = useState('')
  const [voiceState, setVoiceState] = useState<GrokVoiceState>('idle')
  const [liveLine, setLiveLine] = useState('')
  const [sending, setSending] = useState(false)

  const agentRef = useRef<GrokVoiceAgent | null>(null)
  const messagesRef = useRef<ChiefMsg[]>([])
  const integrationRef = useRef(integration)

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    integrationRef.current = integration
  }, [integration])

  const refreshStatus = useCallback(async () => {
    const status = await fetchChiefStatus()
    if (status) setIntegration(status)
  }, [])

  useEffect(() => {
    if (!unlocked) return
    void refreshStatus()
  }, [unlocked, refreshStatus])

  const appendMessage = useCallback((msg: Omit<ChiefMsg, 'ts'> & { ts?: number }) => {
    setMessages((prev) => [...prev, { ...msg, ts: msg.ts ?? Date.now() }])
  }, [])

  const stopVoice = useCallback(() => {
    agentRef.current?.disconnect()
    agentRef.current = null
    setVoiceState('idle')
    setLiveLine('')
  }, [])

  const startVoice = useCallback(async () => {
    if (!getChiefSessionToken()) {
      setUnlocked(false)
      return
    }

    stopVoice()
    setVoiceState('connecting')
    toast.message('Connecting Chief of Staff voice…')

    const history = messagesRef.current.map((m) => ({ role: m.role, content: m.content }))
    const integ = integrationRef.current

    const agent = new GrokVoiceAgent({
      voice: 'rigel',
      instructions: buildChiefVoiceInstructions(integ),
      conversationSeed: chiefConversationSeed(history),
      greetingInstructions: buildChiefGreeting(integ),
      tokenPaths: chiefVoiceTokenPaths(),
      tokenHeaders: chiefVoiceTokenHeaders(),
      onStateChange: setVoiceState,
      onUserTranscript: (text, isFinal) => {
        if (!text.trim()) return
        if (isFinal) appendMessage({ role: 'user', content: text.trim() })
      },
      onAssistantTranscript: (text, isFinal) => {
        if (!text.trim()) return
        setLiveLine(isFinal ? '' : text)
        if (isFinal) appendMessage({ role: 'assistant', content: text.trim() })
      },
      onReconnecting: () => {
        setVoiceState('connecting')
        toast.message('Reconnecting…', { duration: 2000 })
      },
      onError: (err) => {
        toast.error('Voice error', { description: err })
        setVoiceState('error')
        agentRef.current = null
      },
    })

    agentRef.current = agent
    try {
      await agent.connect()
      toast.success('Chief of Staff — voice live')
    } catch (e) {
      agentRef.current = null
      const msg = e instanceof Error ? e.message : 'Could not connect'
      setVoiceState('error')
      toast.error('Voice unavailable', { description: msg })
    }
  }, [appendMessage, stopVoice])

  const toggleVoice = useCallback(() => {
    const active =
      agentRef.current?.isConnected() ||
      voiceState === 'connecting' ||
      voiceState === 'listening' ||
      voiceState === 'thinking' ||
      voiceState === 'speaking'
    if (active) stopVoice()
    else void startVoice()
  }, [voiceState, startVoice, stopVoice])

  useEffect(() => () => stopVoice(), [stopVoice])

  const sendText = async () => {
    const text = draft.trim()
    if (!text || sending) return
    setDraft('')
    appendMessage({ role: 'user', content: text })
    setSending(true)
    try {
      const history = [...messagesRef.current, { role: 'user' as const, content: text }].map(
        (m) => ({ role: m.role, content: m.content }),
      )
      const reply = await chiefDiscuss(history, true)
      appendMessage({ role: 'assistant', content: reply })
      void speak(reply, { voiceMode: true })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Request failed'
      toast.error(msg)
      if (msg.includes('session')) setUnlocked(false)
    } finally {
      setSending(false)
    }
  }

  const voiceLive =
    voiceState === 'listening' || voiceState === 'thinking' || voiceState === 'speaking'

  if (!unlocked) {
    return <UnlockGate onUnlocked={() => setUnlocked(true)} />
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#0a0a0f] text-[#e8e8f0]">
      <header className="flex items-center justify-between border-b border-[#1f1f27] px-4 py-3 md:px-8">
        <div className="flex items-center gap-3">
          <Shield className="text-[#c4b5fd]" size={22} />
          <div>
            <h1 className="text-lg font-semibold">Chief of Staff</h1>
            <p className="text-xs text-[#888]">America/Boise · drafts only until you say send</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              clearChiefSession()
              stopVoice()
              setUnlocked(false)
            }}
            className="hidden text-xs text-[#888] hover:text-[#f87171] sm:block"
          >
            Lock desk
          </button>
          <a
            href="/"
            className="flex items-center gap-2 rounded-xl border border-[#2a2a35] px-3 py-2 text-sm text-[#aaa] hover:border-[#c4b5fd] hover:text-[#c4b5fd]"
          >
            <ArrowLeft size={14} /> Builder
          </a>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-6 md:px-6">
        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          <span
            className={`rounded-full px-3 py-1 ${integration.calendarConnected ? 'bg-[#00ff8822] text-[#00ff88]' : 'bg-[#2a2a35] text-[#888]'}`}
          >
            Calendar {integration.calendarConnected ? 'linked' : 'not wired'}
          </span>
          <span
            className={`rounded-full px-3 py-1 ${integration.gmailConnected ? 'bg-[#00ff8822] text-[#00ff88]' : 'bg-[#2a2a35] text-[#888]'}`}
          >
            Gmail {integration.gmailConnected ? 'linked' : 'not wired'}
          </span>
        </div>

        <div className="mb-6 flex flex-col items-center gap-3 rounded-2xl border border-[#1f1f27] bg-[#111116] p-6">
          <VoiceOrb state={voiceState} />
          <p className="text-sm font-medium" style={{ color: VOICE_CFG[voiceState].color }}>
            {VOICE_CFG[voiceState].label}
            {voiceLive && (
              <span className="ml-2 inline-flex items-center gap-1 text-[#00ff88]">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#00ff88]" />
                LIVE
              </span>
            )}
          </p>
          <button
            type="button"
            onClick={toggleVoice}
            className="flex items-center gap-2 rounded-full px-6 py-3 font-semibold transition"
            style={{
              background: voiceLive ? '#2a2a35' : '#c4b5fd',
              color: voiceLive ? '#e8e8f0' : '#0a0a0f',
            }}
          >
            {voiceLive ? <MicOff size={20} /> : <Mic size={20} />}
            {voiceLive ? 'End voice' : 'Start voice'}
          </button>
          {liveLine && (
            <p className="max-w-md text-center text-sm text-[#aaa]">
              <Volume2 size={14} className="mr-1 inline text-[#38bdf8]" />
              {liveLine}
            </p>
          )}
        </div>

        <div className="min-h-[200px] flex-1 space-y-3 overflow-y-auto rounded-2xl border border-[#1f1f27] bg-[#0d0d12] p-4">
          {messages.length === 0 && (
            <p className="text-center text-sm text-[#666]">
              Tap the mic for a spoken briefing, or type below.
            </p>
          )}
          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <motion.div
                key={m.ts}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-[#c4b5fd22] text-[#e8e8f0]'
                      : 'bg-[#1a1a22] text-[#ccc]'
                  }`}
                >
                  {m.content}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <div className="mt-4 flex gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void sendText()
              }
            }}
            rows={2}
            placeholder="Type if mic is unavailable…"
            className="flex-1 resize-none rounded-xl border border-[#2a2a35] bg-[#111116] px-4 py-3 text-sm outline-none focus:border-[#c4b5fd]"
          />
          <button
            type="button"
            disabled={sending || !draft.trim()}
            onClick={() => void sendText()}
            className="flex h-auto items-center justify-center rounded-xl bg-[#c4b5fd] px-4 text-[#0a0a0f] disabled:opacity-40"
            aria-label="Send message"
          >
            {sending ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
          </button>
        </div>
      </div>
    </div>
  )
}
