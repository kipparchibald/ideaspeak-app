import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, MicOff, Volume2, Loader2, AlertCircle } from 'lucide-react'
import { GrokVoiceAgent, type GrokVoiceState, type VoiceId } from '../lib/grokVoice'

const VOICES: { id: VoiceId; label: string; desc: string }[] = [
  { id: 'eve',    label: 'Eve',    desc: 'Energetic · Upbeat'      },
  { id: 'iris',   label: 'Iris',   desc: 'Friendly · Charming'     },
  { id: 'luna',   label: 'Luna',   desc: 'Gentle · Patient'        },
  { id: 'rigel',  label: 'Rigel',  desc: 'Professional · Calm'     },
  { id: 'helix',  label: 'Helix',  desc: 'Bold · Dynamic'          },
  { id: 'sirius', label: 'Sirius', desc: 'Witty · Playful'         },
  { id: 'leo',    label: 'Leo',    desc: 'Authoritative · Strong'  },
  { id: 'ara',    label: 'Ara',    desc: 'Warm · Friendly'         },
]

interface Props {
  onTranscript?: (text: string, isFinal: boolean) => void
  hasApiKey: boolean
}

const STATE_CFG: Record<GrokVoiceState, { label: string; color: string; pulse: boolean }> = {
  idle:       { label: 'Tap to speak', color: '#00ff88', pulse: false },
  connecting: { label: 'Connecting…',  color: '#facc15', pulse: true  },
  listening:  { label: 'Listening…',   color: '#00ff88', pulse: true  },
  thinking:   { label: 'Thinking…',    color: '#818cf8', pulse: true  },
  speaking:   { label: 'Speaking…',    color: '#38bdf8', pulse: true  },
  error:      { label: 'Error',        color: '#f87171', pulse: false },
}

export default function GrokVoiceButton({ onTranscript, hasApiKey }: Props) {
  const [voiceState, setVoiceState] = useState<GrokVoiceState>('idle')
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState('')
  const [selectedVoice, setSelectedVoice] = useState<VoiceId>('eve')
  const [showPicker, setShowPicker] = useState(false)
  const agentRef = useRef<GrokVoiceAgent | null>(null)
  const isActive = voiceState !== 'idle' && voiceState !== 'error'
  const cfg = STATE_CFG[voiceState]

  const toggle = async () => {
    if (isActive) {
      agentRef.current?.disconnect()
      agentRef.current = null
      setTranscript('')
      setError('')
      return
    }
    setError('')
    agentRef.current = new GrokVoiceAgent({
      voice: selectedVoice,
      onTranscript: (text, isFinal) => { setTranscript(text); onTranscript?.(text, isFinal) },
      onStateChange: setVoiceState,
      onError: (err) => { setError(err); setVoiceState('error') },
    })
    await agentRef.current.connect()
  }

  const changeVoice = (v: VoiceId) => {
    setSelectedVoice(v)
    agentRef.current?.setVoice(v)
    setShowPicker(false)
  }

  useEffect(() => () => { agentRef.current?.disconnect() }, [])

  const currentVoice = VOICES.find(v => v.id === selectedVoice)!

  if (!hasApiKey) {
    return (
      <div style={{ padding:'12px 14px', background:'rgba(251,191,36,.08)', border:'1px solid rgba(251,191,36,.2)', borderRadius:12, fontSize:13, color:'#fbbf24', display:'flex', alignItems:'center', gap:8 }}>
        <AlertCircle size={14} /> Add your xAI key in Settings to enable Grok Voice
      </div>
    )
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <motion.button onClick={toggle} whileTap={{ scale:.94 }} style={{
          width:52, height:52, borderRadius:'50%', border:'none', cursor:'pointer',
          background: isActive ? cfg.color : '#1a1a22',
          color: isActive ? '#0a0a0f' : '#888',
          display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
          animation: cfg.pulse ? `grok-pulse 2s ease-in-out infinite` : 'none',
          transition:'background .25s, color .25s',
        }}>
          {voiceState==='connecting' ? <Loader2 size={20} style={{animation:'spin 1s linear infinite'}} />
           : voiceState==='speaking'  ? <Volume2 size={20} />
           : isActive                  ? <MicOff size={20} />
                                       : <Mic size={20} />}
        </motion.button>

        <div style={{ flex:1 }}>
          <div style={{ fontSize:12, fontWeight:600, color:cfg.color, marginBottom:4 }}>{cfg.label}</div>
          {isActive
            ? <div style={{ display:'flex', gap:2.5, alignItems:'center', height:20 }}>
                {Array.from({length:14},(_,i) => (
                  <div key={i} style={{ width:3, borderRadius:2, background:cfg.color, animation:`wave-grok 1s ease-in-out ${(i%7)*0.08}s infinite` }} />
                ))}
              </div>
            : <div style={{ fontSize:11.5, color:'#444' }}>Grok Voice · {currentVoice.label} · $0.05/min</div>
          }
        </div>

        <button onClick={() => setShowPicker(v=>!v)} style={{
          background:'none', border:'1px solid #1f1f27', borderRadius:8,
          padding:'5px 10px', color:'#555', cursor:'pointer', fontSize:12, fontFamily:'inherit',
        }}>
          {currentVoice.label} ▾
        </button>
      </div>

      <AnimatePresence>
        {transcript && (
          <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}}
            style={{ fontSize:13, color:'#888', fontStyle:'italic', padding:'6px 10px', background:'rgba(0,255,136,.04)', borderRadius:8, border:'1px solid rgba(0,255,136,.1)' }}>
            🎙 {transcript}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {error && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            style={{ fontSize:12, color:'#f87171', padding:'6px 10px', background:'rgba(248,113,113,.08)', borderRadius:8, border:'1px solid rgba(248,113,113,.2)', display:'flex', alignItems:'center', gap:6 }}>
            <AlertCircle size={12} /> {error}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPicker && (
          <motion.div initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}}
            style={{ background:'#111116', border:'1px solid #1f1f27', borderRadius:12, overflow:'hidden' }}>
            {VOICES.map(v => (
              <button key={v.id} onClick={() => changeVoice(v.id)} style={{
                width:'100%', padding:'10px 14px',
                background: selectedVoice===v.id ? 'rgba(0,255,136,.08)' : 'transparent',
                border:'none', borderBottom:'1px solid #1a1a22', cursor:'pointer',
                display:'flex', alignItems:'center', justifyContent:'space-between', fontFamily:'inherit',
              }}>
                <span style={{ fontSize:13, fontWeight:600, color: selectedVoice===v.id ? '#00ff88' : '#e8e8f0' }}>{v.label}</span>
                <span style={{ fontSize:11, color:'#555' }}>{v.desc}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes grok-pulse { 0%,100%{box-shadow:0 0 0 0 ${cfg.color}50} 50%{box-shadow:0 0 0 14px ${cfg.color}00} }
        @keyframes wave-grok  { 0%,100%{height:4px;opacity:.4} 50%{height:18px;opacity:1} }
        @keyframes spin        { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>
    </div>
  )
}
