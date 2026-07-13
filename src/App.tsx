import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, MicOff, Send, Settings, X, Copy, Download, Zap, MessageSquare, Code2, Sparkles, RefreshCw, Eye } from 'lucide-react'
import { SandpackProvider, SandpackLayout, SandpackCodeEditor, SandpackPreview, SandpackFileExplorer } from '@codesandbox/sandpack-react'
import { sandpackDark } from '@codesandbox/sandpack-themes'
import { toast, Toaster } from 'sonner'
import { runIdeaSpeakAgent, discussWithGrok, generateWithLLM } from './lib/xai'
import type { XaiMessage } from './lib/xai'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { ModeBadge } from './components/ModeBadge'
import { ApiSetupPanel } from './components/ApiSetupPanel'
import { loadLocalXaiKey } from './lib/api-verify'

// ── Types ──────────────────────────────────────────────────────────────────
 type Mode = 'discuss' | 'build'
type Personality = 'grok' | 'witty' | 'mentor' | 'coach' | 'rebel'
type VoiceStatus = 'idle' | 'listening' | 'error'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

interface GeneratedFiles {
  [path: string]: string
}

// ── Default starter files ──────────────────────────────────────────────────────
const STARTER_FILES: GeneratedFiles = {
  'src/App.tsx': `import { useState } from 'react'

export default function App() {
  const [ready, setReady] = useState(false)
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a0a0f 0%, #111116 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Inter, system-ui, sans-serif',
      color: '#e8e8f0',
    }}>
      <div style={{ textAlign: 'center', maxWidth: 480, padding: '0 24px' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🎙</div>
        <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 12, letterSpacing: '-0.02em' }}>
          IdeaSpeak
        </h1>
        <p style={{ color: '#888', fontSize: 16, lineHeight: 1.6, marginBottom: 32 }}>
          Speak your idea in the left panel and watch your app appear here in real time.
        </p>
        <button
          onClick={() => setReady(true)}
          style={{
            background: '#00ff88',
            color: '#0a0a0f',
            border: 'none',
            borderRadius: 12,
            padding: '12px 28px',
            fontSize: 15,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {ready ? '✓ Ready to build!' : 'Get started →'}
        </button>
      </div>
    </div>
  )
}`,
  'src/main.tsx': `import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)`,
  'src/index.css': `* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Inter, system-ui, sans-serif; }`,
  'package.json': JSON.stringify({ name: 'ideaspeak-app', dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0' } }, null, 2),
}

// ── Personality labels ─────────────────────────────────────────────────────
const PERSONALITIES: { id: Personality; label: string; emoji: string }[] = [
  { id: 'grok',   label: 'Grok',    emoji: '🤖' },
  { id: 'witty',  label: 'Witty',   emoji: '😏' },
  { id: 'mentor', label: 'Mentor',  emoji: '🧙' },
  { id: 'coach',  label: 'Coach',   emoji: '🏆' },
  { id: 'rebel',  label: 'Rebel',   emoji: '🔥' },
]

// ── Voice wave bars ──────────────────────────────────────────────────────
const WAVE_DELAYS = ['0s','0.08s','0.16s','0.24s','0.32s','0.4s','0.32s','0.24s','0.16s','0.08s']

function WaveBars({ active }: { active: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 24 }}>
      {WAVE_DELAYS.map((d, i) => (
        <div
          key={i}
          style={{
            width: 3,
            borderRadius: 2,
            background: active ? '#00ff88' : '#333',
            height: active ? undefined : 6,
            animation: active ? `wave-bar 1s ease-in-out ${d} infinite` : 'none',
          }}
        />
      ))}
      <style>{`
        @keyframes wave-bar {
          0%,100% { height: 4px; opacity: .4; }
          50%      { height: 20px; opacity: 1; }
        }
      `}</style>
    </div>
  )
}

// ── Settings Modal (now with full API Setup Panel) ───────────────────
function SettingsModal({
  open, onClose, apiKey, setApiKey, personality, setPersonality, ttsEnabled, setTtsEnabled
}: {
  open: boolean; onClose: () => void
  apiKey: string; setApiKey: (k: string) => void
  personality: Personality; setPersonality: (p: Personality) => void
  ttsEnabled: boolean; setTtsEnabled: (v: boolean) => void
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(8px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={e => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            initial={{ scale: .95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: .95, opacity: 0 }}
            style={{ background: '#111116', border: '1px solid #1f1f27', borderRadius: 20, padding: 28, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#e8e8f0' }}>Settings</h2>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}><X size={18} /></button>
            </div>

            {/* Seamless secure API setup */}
            <ApiSetupPanel
              onKeySaved={(hasKey) => {
                const key = loadLocalXaiKey()
                setApiKey(key)
                if (hasKey) toast.success('Grok connected')
              }}
            />

            <div style={{ height: 1, background: '#1f1f27', margin: '24px 0' }} />

            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 12 }}>
              AI Personality
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
              {PERSONALITIES.map(p => (
                <button
                  key={p.id}
                  onClick={() => setPersonality(p.id)}
                  style={{
                    padding: '7px 14px', borderRadius: 8, border: '1px solid',
                    borderColor: personality === p.id ? '#00ff88' : '#1f1f27',
                    background: personality === p.id ? 'rgba(0,255,136,.1)' : 'transparent',
                    color: personality === p.id ? '#00ff88' : '#888',
                    fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  {p.emoji} {p.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#e8e8f0' }}>Text-to-speech</div>
                <div style={{ fontSize: 12, color: '#555' }}>AI reads responses aloud</div>
              </div>
              <button
                onClick={() => setTtsEnabled(!ttsEnabled)}
                style={{
                  width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                  background: ttsEnabled ? '#00ff88' : '#1f1f27',
                  position: 'relative', transition: 'background .2s',
                }}
              >
                <div style={{
                  position: 'absolute', top: 2, left: ttsEnabled ? 22 : 2,
                  width: 20, height: 20, borderRadius: 10, background: '#fff', transition: 'left .2s',
                }} />
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ── Main App ───────────────────────────────────────────────────────────────
export default function App() {
  // Core state
  const [mode, setMode] = useState<Mode>('discuss')
  const [messages, setMessages] = useState<ChatMessage[]>([{
    role: 'assistant',
    content: "Hey! I'm IdeaSpeak — speak or type your app idea and I'll help you plan, refine, and build it. What are you working on?",
    timestamp: Date.now(),
  }])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [generatedFiles, setGeneratedFiles] = useState<GeneratedFiles>(STARTER_FILES)
  const [activeFile] = useState('src/App.tsx')
  const [showSettings, setShowSettings] = useState(false)
  const [showPreview, setShowPreview] = useState(true)

  // Settings
  const [apiKey, setApiKey] = useState(() => loadLocalXaiKey())
  const [personality, setPersonality] = useState<Personality>('grok')
  const [ttsEnabled, setTtsEnabled] = useState(false)

  // Voice
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('idle')
  const [voiceInterim, setVoiceInterim] = useState('')
  const recognitionRef = useRef<any>(null)
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const isSupported = typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // TTS
  const speak = useCallback((text: string) => {
    if (!ttsEnabled || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(text.slice(0, 300))
    utt.rate = 1.05
    window.speechSynthesis.speak(utt)
  }, [ttsEnabled])

  // ── Send message ─────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text?: string) => {
    const content = (text || input).trim()
    if (!content || isLoading) return
    setInput('')
    setVoiceInterim('')
    if (voiceStatus === 'listening') stopVoice()

    const userMsg: ChatMessage = { role: 'user', content, timestamp: Date.now() }
    setMessages(prev => [...prev, userMsg])
    setIsLoading(true)

    try {
      if (mode === 'discuss') {
        const history: XaiMessage[] = messages
          .filter(m => m.role !== 'assistant' || messages.indexOf(m) > 0)
          .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
        history.push({ role: 'user', content })

        const reply = await discussWithGrok(history, apiKey || undefined, null, personality, true)
        const assistantMsg: ChatMessage = { role: 'assistant', content: reply, timestamp: Date.now() }
        setMessages(prev => [...prev, assistantMsg])
        speak(reply)

      } else {
        const result = await runIdeaSpeakAgent(content, messages, apiKey || undefined)
        const assistantMsg: ChatMessage = {
          role: 'assistant',
          content: result.plan || `Built! Here's what I generated based on your idea. You can see it live in the preview panel.`,
          timestamp: Date.now(),
        }
        setMessages(prev => [...prev, assistantMsg])
        speak(assistantMsg.content)

        if (apiKey) {
          try {
            const llmResult = await generateWithLLM(content, result.brief, apiKey, personality)
            if (llmResult.files) {
              setGeneratedFiles({ ...STARTER_FILES, ...llmResult.files })
              toast.success('App generated! Check the preview →')
            }
          } catch {
            // fall through
          }
        }
      }
    } catch (err) {
      const errMsg: ChatMessage = {
        role: 'assistant',
        content: 'Something went wrong. Check your xAI key in Settings or try again.',
        timestamp: Date.now(),
      }
      setMessages(prev => [...prev, errMsg])
    }

    setIsLoading(false)
  }, [input, isLoading, messages, mode, apiKey, personality, speak, voiceStatus])

  // ── Voice ───────────────────────────────────────────────────────────────
  const stopVoice = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    recognitionRef.current?.abort()
    recognitionRef.current = null
    setVoiceStatus('idle')
    setVoiceInterim('')
  }, [])

  const startVoice = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { toast.error('Voice not supported in this browser. Try Chrome.'); return }

    const recognition = new SR()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognition.maxAlternatives = 3
    recognitionRef.current = recognition

    recognition.onstart = () => setVoiceStatus('listening')

    recognition.onresult = (e: any) => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      let final = '', interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        let best = e.results[i][0]
        for (let j = 1; j < e.results[i].length; j++) {
          if (e.results[i][j].confidence > best.confidence) best = e.results[i][j]
        }
        if (e.results[i].isFinal) final += best.transcript
        else interim += best.transcript
      }
      if (final) {
        setInput(prev => (prev + ' ' + final).trim())
      }
      setVoiceInterim(interim)
      silenceTimerRef.current = setTimeout(() => {
        stopVoice()
        setInput(prev => {
          if (prev.trim()) sendMessage(prev.trim())
          return ''
        })
      }, 2200)
    }

    recognition.onerror = (e: any) => {
      if (e.error !== 'aborted') {
        toast.error(`Mic error: ${e.error}`)
        setVoiceStatus('error')
      }
    }

    recognition.onend = () => {
      if (voiceStatus === 'listening' && recognitionRef.current) {
        try { recognition.start() } catch {}
      }
    }

    try { recognition.start() } catch (e) { toast.error('Could not start mic') }
  }, [stopVoice, sendMessage, voiceStatus])

  const toggleVoice = () => voiceStatus === 'listening' ? stopVoice() : startVoice()

  // ── Export ZIP ────────────────────────────────────────────────────────
  const exportZip = async () => {
    const zip = new JSZip()
    Object.entries(generatedFiles).forEach(([path, content]) => {
      zip.file(path, content)
    })
    zip.file('README.md', `# IdeaSpeak Generated App\n\nBuilt with IdeaSpeak — voice-first AI app builder.\n\n## Run\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n`)
    const blob = await zip.generateAsync({ type: 'blob' })
    saveAs(blob, 'ideaspeak-app.zip')
    toast.success('Downloaded!')
  }

  const selectedPersonality = PERSONALITIES.find(p => p.id === personality)

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#0a0a0f', color: '#e8e8f0', fontFamily: 'Inter, system-ui, sans-serif', overflow: 'hidden' }}>
      <Toaster theme="dark" position="top-right" />

      {/* ── Header ── */}
      <div style={{ height: 52, borderBottom: '1px solid #1f1f27', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, background: '#00ff88', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Mic size={14} color="#0a0a0f" strokeWidth={2.5} />
          </div>
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-.3px' }}>
            IdeaSpeak<span style={{ color: '#00ff88' }}>.dev</span>
          </span>
          <ModeBadge hasApiKey={!!apiKey} />
        </div>

        {/* Mode toggle */}
        <div style={{ display: 'flex', background: '#111116', border: '1px solid #1f1f27', borderRadius: 10, padding: 3, gap: 2 }}>
          {(['discuss', 'build'] as Mode[]).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                padding: '5px 14px', borderRadius: 7, border: 'none', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 13, fontWeight: 500,
                background: mode === m ? '#1f1f27' : 'transparent',
                color: mode === m ? '#e8e8f0' : '#555',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {m === 'discuss' ? <MessageSquare size={13} /> : <Code2 size={13} />}
              {m === 'discuss' ? 'Discuss' : 'Build'}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setShowPreview(v => !v)} style={{ background: 'none', border: '1px solid #1f1f27', borderRadius: 8, padding: '6px 10px', color: '#888', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <Eye size={14} /> {showPreview ? 'Hide' : 'Preview'}
          </button>
          <button onClick={() => setShowSettings(true)} style={{ background: 'none', border: '1px solid #1f1f27', borderRadius: 8, padding: '6px 10px', color: '#888', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <Settings size={14} /> {selectedPersonality?.emoji}
          </button>
        </div>
      </div>

      {/* ── Main layout ── */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: showPreview ? '380px 1fr' : '1fr', overflow: 'hidden' }}>

        {/* ── LEFT: Chat panel ── */}
        <div style={{ display: 'flex', flexDirection: 'column', borderRight: showPreview ? '1px solid #1f1f27' : 'none', overflow: 'hidden' }}>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {messages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: msg.role === 'user' ? '#1f1f27' : 'rgba(0,255,136,.12)',
                  border: `1px solid ${msg.role === 'user' ? '#333' : 'rgba(0,255,136,.2)'}`,
                  fontSize: 11, fontWeight: 700,
                  color: msg.role === 'user' ? '#888' : '#00ff88',
                }}>
                  {msg.role === 'user' ? 'K' : <Sparkles size={12} />}
                </div>
                <div style={{
                  maxWidth: '82%', padding: '10px 13px', borderRadius: 14,
                  fontSize: 13.5, lineHeight: 1.6,
                  background: msg.role === 'user' ? '#1a1a22' : '#13131a',
                  border: `1px solid ${msg.role === 'user' ? '#1f1f27' : '#252530'}`,
                  borderTopLeftRadius: msg.role === 'assistant' ? 4 : 14,
                  borderTopRightRadius: msg.role === 'user' ? 4 : 14,
                  color: msg.role === 'user' ? '#e8e8f0' : '#c8c8d8',
                  whiteSpace: 'pre-wrap',
                }}>
                  {msg.content}
                </div>
              </motion.div>
            ))}

            {isLoading && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(0,255,136,.12)', border: '1px solid rgba(0,255,136,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Sparkles size={12} color="#00ff88" />
                </div>
                <div style={{ background: '#13131a', border: '1px solid #252530', borderRadius: 14, borderTopLeftRadius: 4, padding: '12px 16px', display: 'flex', gap: 5, alignItems: 'center' }}>
                  {[0,1,2].map(i => (
                    <div key={i} style={{ width: 6, height: 6, borderRadius: 3, background: '#444', animation: `typing-dot 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                  ))}
                </div>
              </motion.div>
            )}
            <div ref={messagesEndRef} />
            <style>{`@keyframes typing-dot { 0%,60%,100% { transform:translateY(0);opacity:.4 } 30% { transform:translateY(-6px);opacity:1 } }`}</style>
          </div>

          {/* Input area */}
          <div style={{ padding: '12px 14px', borderTop: '1px solid #1f1f27', flexShrink: 0 }}>
            {voiceInterim && (
              <div style={{ fontSize: 12, color: '#00ff88', fontStyle: 'italic', marginBottom: 8, padding: '6px 10px', background: 'rgba(0,255,136,.06)', borderRadius: 8, border: '1px solid rgba(0,255,136,.15)' }}>
                🎙 {voiceInterim}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <button
                onClick={toggleVoice}
                disabled={!isSupported}
                style={{
                  width: 40, height: 40, borderRadius: '50%', border: 'none', cursor: isSupported ? 'pointer' : 'not-allowed',
                  background: voiceStatus === 'listening' ? '#00ff88' : '#1a1a22',
                  color: voiceStatus === 'listening' ? '#0a0a0f' : '#888',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  animation: voiceStatus === 'listening' ? 'pulse-glow 2s infinite' : 'none',
                  transition: 'all .2s',
                }}
              >
                {voiceStatus === 'listening' ? <MicOff size={16} /> : <Mic size={16} />}
              </button>

              {voiceStatus === 'listening' ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 40 }}>
                  <WaveBars active />
                </div>
              ) : (
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                  placeholder={mode === 'discuss' ? 'Describe your idea…' : 'What should I build?'}
                  rows={1}
                  style={{
                    flex: 1, resize: 'none', background: '#111116', border: '1px solid #1f1f27',
                    borderRadius: 10, padding: '10px 12px', color: '#e8e8f0', fontSize: 13.5,
                    fontFamily: 'inherit', outline: 'none', lineHeight: 1.5, minHeight: 40, maxHeight: 120,
                  }}
                />
              )}

              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || isLoading}
                style={{
                  width: 40, height: 40, borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: input.trim() && !isLoading ? '#00ff88' : '#1a1a22',
                  color: input.trim() && !isLoading ? '#0a0a0f' : '#444',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  transition: 'all .2s',
                }}
              >
                {isLoading ? <RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={15} />}
              </button>
            </div>

            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {(mode === 'discuss'
                ? ['What are the risks?', 'Who is the user?', 'What should the MVP be?']
                : ['Add dark mode', 'Add auth', 'Make it mobile-first']
              ).map(q => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #1f1f27', background: 'transparent', color: '#555', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s' }}
                  onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = '#00ff88'; (e.target as HTMLElement).style.color = '#00ff88' }}
                  onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = '#1f1f27'; (e.target as HTMLElement).style.color = '#555' }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── RIGHT: Code + Preview ── */}
        {showPreview && (
          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ height: 44, borderBottom: '1px solid #1f1f27', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Zap size={14} color="#00ff88" />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#e8e8f0' }}>Live Preview</span>
                <span style={{ fontSize: 11, color: '#444' }}>· {Object.keys(generatedFiles).length} files</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => { navigator.clipboard.writeText(generatedFiles[activeFile] || ''); toast.success('Copied!') }}
                  style={{ background: 'none', border: '1px solid #1f1f27', borderRadius: 7, padding: '5px 10px', color: '#888', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}
                >
                  <Copy size={12} /> Copy
                </button>
                <button
                  onClick={exportZip}
                  style={{ background: 'rgba(0,255,136,.1)', border: '1px solid rgba(0,255,136,.25)', borderRadius: 7, padding: '5px 10px', color: '#00ff88', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600 }}
                >
                  <Download size={12} /> Export ZIP
                </button>
              </div>
            </div>

            <div style={{ flex: 1, overflow: 'hidden' }}>
              <SandpackProvider
                key={JSON.stringify(Object.keys(generatedFiles))}
                template="react-ts"
                theme={sandpackDark}
                files={generatedFiles}
                options={{ activeFile, visibleFiles: Object.keys(generatedFiles).filter(f => f.endsWith('.tsx') || f.endsWith('.css') || f.endsWith('.ts')) }}
                customSetup={{ dependencies: { 'framer-motion': '^11.0.0', 'lucide-react': '^0.383.0' } }}
              >
                <SandpackLayout style={{ height: '100%', border: 'none', borderRadius: 0 }}>
                  <SandpackFileExplorer style={{ minWidth: 160 }} />
                  <SandpackCodeEditor showTabs showLineNumbers closableTabs style={{ flex: 1 }} />
                  <SandpackPreview style={{ flex: 1 }} showOpenInCodeSandbox={false} showRefreshButton />
                </SandpackLayout>
              </SandpackProvider>
            </div>
          </div>
        )}
      </div>

      <SettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        apiKey={apiKey}
        setApiKey={setApiKey}
        personality={personality}
        setPersonality={setPersonality}
        ttsEnabled={ttsEnabled}
        setTtsEnabled={setTtsEnabled}
      />

      <style>{`
        @keyframes pulse-glow { 0%,100% { box-shadow: 0 0 0 0 rgba(0,255,136,.4); } 50% { box-shadow: 0 0 0 16px rgba(0,255,136,.08); } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: #1f1f27; border-radius: 2px; }
        textarea { scrollbar-width: thin; }
      `}</style>
    </div>
  )
}
