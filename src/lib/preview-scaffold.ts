/**
 * World-class Sandpack-safe previews.
 * React-only, inline styles + CSS keyframes — no Tailwind/lucide required.
 */

export type PreviewFiles = Record<string, string>

function esc(s: string): string {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$')
    .replace(/\r?\n/g, ' ')
}

function shortName(vision: string): string {
  return vision.split(/[.!?\n]/)[0].slice(0, 40).trim() || 'IdeaSpeak App'
}

function detectKind(text: string): 'habit' | 'client' | 'voice' | 'generic' {
  const t = text.toLowerCase()
  if (/habit|streak|daily|coach|ship.?today/.test(t)) return 'habit'
  if (/crm|client|consult|freelancer|lead|timeline|update/.test(t)) return 'client'
  if (/voice|speak|memo|transcript|rant/.test(t)) return 'voice'
  return 'generic'
}

const ENTRY_MAIN = `import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
`

const BASE_CSS = `* { box-sizing: border-box; margin: 0; padding: 0; }
html, body, #root { height: 100%; }
body {
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif;
  background: #0a0a0f;
  color: #e8e8f0;
  -webkit-font-smoothing: antialiased;
}
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes pulseGlow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(0,255,136,0.35); }
  50% { box-shadow: 0 0 0 12px rgba(0,255,136,0); }
}
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
button { font-family: inherit; cursor: pointer; }
input, textarea { font-family: inherit; }
`

function packageJson(name: string): string {
  return JSON.stringify(
    {
      name: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'ideaspeak-preview',
      private: true,
      main: '/index.js',
      dependencies: {
        react: '^18.2.0',
        'react-dom': '^18.2.0',
      },
    },
    null,
    2,
  )
}

function habitApp(title: string, subtitle: string, features: string[]): string {
  return `import { useState, useMemo } from 'react'

const FEATURES = ${JSON.stringify(features)}
const DAYS = ['M','T','W','T','F','S','S']

export default function App() {
  const [streak, setStreak] = useState(4)
  const [done, setDone] = useState([true, true, true, true, false, false, false])
  const [note, setNote] = useState('')
  const [ships, setShips] = useState([
    { id: 1, text: 'Shipped landing polish', day: 'Today' },
    { id: 2, text: 'Closed two client loops', day: 'Yesterday' },
  ])
  const progress = useMemo(() => Math.round((done.filter(Boolean).length / 7) * 100), [done])

  const toggle = (i) => {
    setDone(prev => {
      const next = [...prev]
      next[i] = !next[i]
      const count = next.filter(Boolean).length
      setStreak(Math.max(count, streak))
      return next
    })
  }
  const ship = () => {
    const t = note.trim()
    if (!t) return
    setShips([{ id: Date.now(), text: t, day: 'Just now' }, ...ships])
    setNote('')
    setStreak(s => s + 1)
  }

  return (
    <div style={S.shell}>
      <div style={S.wrap}>
        <header style={S.header}>
          <div>
            <div style={S.badge}>Live · did-you-ship-today</div>
            <h1 style={S.h1}>${esc(title)}</h1>
            <p style={S.sub}>${esc(subtitle)}</p>
          </div>
          <div style={S.streakCard}>
            <div style={S.streakNum}>{streak}</div>
            <div style={S.streakLabel}>day streak</div>
          </div>
        </header>

        <section style={S.panel}>
          <div style={S.rowBetween}>
            <span style={S.panelTitle}>This week</span>
            <span style={S.muted}>{progress}%</span>
          </div>
          <div style={S.week}>
            {DAYS.map((d, i) => (
              <button key={i} type="button" onClick={() => toggle(i)} style={{
                ...S.day,
                background: done[i] ? 'rgba(0,255,136,0.16)' : '#111116',
                borderColor: done[i] ? 'rgba(0,255,136,0.45)' : '#1f1f27',
                color: done[i] ? '#00ff88' : '#666',
              }}>
                <span style={{ fontSize: 11, opacity: 0.7 }}>{d}</span>
                <span style={{ fontSize: 16, fontWeight: 700 }}>{done[i] ? '✓' : '·'}</span>
              </button>
            ))}
          </div>
          <div style={S.barTrack}><div style={{ ...S.barFill, width: progress + '%' }} /></div>
        </section>

        <section style={{ ...S.panel, marginTop: 14 }}>
          <div style={S.panelTitle}>Ship something</div>
          <div style={S.compose}>
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && ship()}
              placeholder="What did you ship?"
              style={S.input}
            />
            <button type="button" onClick={ship} style={S.primary}>Ship</button>
          </div>
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ships.map((s, idx) => (
              <div key={s.id} style={{ ...S.card, animation: 'fadeUp .35s ease both', animationDelay: idx * 0.04 + 's' }}>
                <div style={{ fontWeight: 600 }}>{s.text}</div>
                <div style={S.chip}>{s.day}</div>
              </div>
            ))}
          </div>
        </section>

        <div style={S.tags}>
          {FEATURES.map(f => <span key={f} style={S.tag}>{f}</span>)}
        </div>
      </div>
    </div>
  )
}

const S = {
  shell: { minHeight: '100vh', background: 'radial-gradient(1200px 600px at 10% -10%, rgba(0,255,136,0.08), transparent), linear-gradient(165deg,#07070c,#0a0a0f 40%,#0c1410)', color: '#e8e8f0', padding: '28px 18px 48px' },
  wrap: { maxWidth: 440, margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 22 },
  badge: { display: 'inline-block', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#00ff88', background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.28)', borderRadius: 999, padding: '4px 10px', marginBottom: 10 },
  h1: { fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.15, marginBottom: 8 },
  sub: { color: '#888', fontSize: 14, lineHeight: 1.5, maxWidth: 260 },
  streakCard: { minWidth: 84, textAlign: 'center', background: 'rgba(17,17,22,0.9)', border: '1px solid #1f1f27', borderRadius: 16, padding: '12px 10px', animation: 'pulseGlow 2.4s ease infinite' },
  streakNum: { fontSize: 28, fontWeight: 800, color: '#00ff88', lineHeight: 1 },
  streakLabel: { fontSize: 10, color: '#666', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.06em' },
  panel: { background: 'rgba(17,17,22,0.85)', border: '1px solid #1f1f27', borderRadius: 20, padding: 16, backdropFilter: 'blur(12px)' },
  panelTitle: { fontSize: 12, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 },
  rowBetween: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  muted: { fontSize: 12, color: '#666' },
  week: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 },
  day: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, border: '1px solid', borderRadius: 12, padding: '8px 0', transition: 'all .15s' },
  barTrack: { marginTop: 12, height: 4, borderRadius: 4, background: '#1a1a22', overflow: 'hidden' },
  barFill: { height: '100%', background: 'linear-gradient(90deg,#00ff88,#5dffb0)', borderRadius: 4, transition: 'width .3s ease' },
  compose: { display: 'flex', gap: 8 },
  input: { flex: 1, background: '#0a0a0f', border: '1px solid #1f1f27', borderRadius: 12, padding: '12px 14px', color: '#e8e8f0', fontSize: 14, outline: 'none' },
  primary: { background: '#00ff88', color: '#0a0a0f', border: 'none', borderRadius: 12, padding: '0 18px', fontWeight: 700, fontSize: 14 },
  card: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, background: '#0c0c12', border: '1px solid #1a1a22', borderRadius: 14, padding: '12px 14px' },
  chip: { fontSize: 10, fontWeight: 600, color: '#00ff88', background: 'rgba(0,255,136,0.08)', borderRadius: 8, padding: '4px 8px', whiteSpace: 'nowrap' },
  tags: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 18 },
  tag: { fontSize: 11, color: '#777', border: '1px solid #1f1f27', borderRadius: 999, padding: '4px 10px' },
}
`
}

function clientApp(title: string, subtitle: string, features: string[]): string {
  return `import { useState } from 'react'

const FEATURES = ${JSON.stringify(features)}
const SEED = [
  { id: 1, client: 'Acme Co', text: 'Scope locked for phase 2 — waiting on brand kit.', time: '2h ago', tone: 'update' },
  { id: 2, client: 'Jordan Lee', text: 'Proposal sent. Follow-up Friday.', time: 'Yesterday', tone: 'action' },
  { id: 3, client: 'Northwind', text: 'Kickoff call — great energy on timeline.', time: 'Mon', tone: 'note' },
]

export default function App() {
  const [items, setItems] = useState(SEED)
  const [text, setText] = useState('')
  const [client, setClient] = useState('Acme Co')
  const [recording, setRecording] = useState(false)

  const post = () => {
    const t = text.trim()
    if (!t) return
    setItems([{ id: Date.now(), client, text: t, time: 'Just now', tone: 'update' }, ...items])
    setText('')
    setRecording(false)
  }
  const voiceCapture = () => {
    setRecording(true)
    setText(prev => prev || 'Spoke after call: client loves the new direction, wants weekly check-ins.')
    setTimeout(() => setRecording(false), 900)
  }

  return (
    <div style={S.shell}>
      <div style={S.wrap}>
        <div style={S.badge}>Live · client timeline</div>
        <h1 style={S.h1}>${esc(title)}</h1>
        <p style={S.sub}>${esc(subtitle)}</p>

        <div style={S.compose}>
          <div style={S.composeTop}>
            <select value={client} onChange={e => setClient(e.target.value)} style={S.select}>
              <option>Acme Co</option>
              <option>Jordan Lee</option>
              <option>Northwind</option>
              <option>New client</option>
            </select>
            <button type="button" onClick={voiceCapture} style={{
              ...S.mic,
              background: recording ? '#00ff88' : 'rgba(0,255,136,0.1)',
              color: recording ? '#0a0a0f' : '#00ff88',
              animation: recording ? 'pulseGlow 1s ease infinite' : 'none',
            }}>{recording ? 'Listening…' : '🎙 Speak'}</button>
          </div>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Update after the call…"
            rows={3}
            style={S.textarea}
          />
          <button type="button" onClick={post} style={S.primary}>Post to timeline</button>
        </div>

        <div style={S.timeline}>
          {items.map((item, i) => (
            <div key={item.id} style={{ ...S.card, animation: 'fadeUp .4s ease both', animationDelay: i * 0.05 + 's' }}>
              <div style={S.cardTop}>
                <span style={S.client}>{item.client}</span>
                <span style={S.time}>{item.time}</span>
              </div>
              <p style={S.body}>{item.text}</p>
              <span style={S.tone}>{item.tone}</span>
            </div>
          ))}
        </div>

        <div style={S.tags}>{FEATURES.map(f => <span key={f} style={S.tag}>{f}</span>)}</div>
      </div>
    </div>
  )
}

const S = {
  shell: { minHeight: '100vh', background: 'radial-gradient(900px 500px at 90% 0%, rgba(56,189,248,0.07), transparent), #0a0a0f', color: '#e8e8f0', padding: '28px 18px 48px' },
  wrap: { maxWidth: 440, margin: '0 auto' },
  badge: { display: 'inline-block', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#38bdf8', background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.28)', borderRadius: 999, padding: '4px 10px', marginBottom: 12 },
  h1: { fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 8 },
  sub: { color: '#888', fontSize: 14, lineHeight: 1.5, marginBottom: 20 },
  compose: { background: 'rgba(17,17,22,0.9)', border: '1px solid #1f1f27', borderRadius: 20, padding: 14, marginBottom: 18 },
  composeTop: { display: 'flex', gap: 8, marginBottom: 10 },
  select: { flex: 1, background: '#0a0a0f', border: '1px solid #1f1f27', borderRadius: 10, color: '#e8e8f0', padding: '10px 12px', fontSize: 13 },
  mic: { border: '1px solid rgba(0,255,136,0.3)', borderRadius: 10, padding: '0 14px', fontWeight: 700, fontSize: 13 },
  textarea: { width: '100%', background: '#0a0a0f', border: '1px solid #1f1f27', borderRadius: 12, padding: 12, color: '#e8e8f0', fontSize: 14, resize: 'none', outline: 'none', marginBottom: 10, lineHeight: 1.45 },
  primary: { width: '100%', background: '#00ff88', color: '#0a0a0f', border: 'none', borderRadius: 12, padding: '12px', fontWeight: 700, fontSize: 14 },
  timeline: { display: 'flex', flexDirection: 'column', gap: 10 },
  card: { background: 'rgba(17,17,22,0.85)', border: '1px solid #1f1f27', borderRadius: 18, padding: 14 },
  cardTop: { display: 'flex', justifyContent: 'space-between', marginBottom: 8 },
  client: { fontWeight: 700, fontSize: 13, color: '#e8e8f0' },
  time: { fontSize: 11, color: '#555' },
  body: { fontSize: 14, lineHeight: 1.5, color: '#c8c8d4', marginBottom: 10 },
  tone: { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#00ff88', background: 'rgba(0,255,136,0.08)', borderRadius: 6, padding: '3px 8px' },
  tags: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 18 },
  tag: { fontSize: 11, color: '#777', border: '1px solid #1f1f27', borderRadius: 999, padding: '4px 10px' },
}
`
}

function voiceApp(title: string, subtitle: string, features: string[]): string {
  return `import { useState } from 'react'

const FEATURES = ${JSON.stringify(features)}

export default function App() {
  const [live, setLive] = useState(false)
  const [draft, setDraft] = useState('')
  const [items, setItems] = useState([
    { id: 1, raw: 'Need to follow up on pricing with Sam', structured: 'Task · Follow up Sam · Pricing', status: 'Ready' },
    { id: 2, raw: 'Idea for onboarding email sequence', structured: 'Note · Onboarding sequence', status: 'Inbox' },
  ])

  const capture = () => {
    setLive(true)
    setDraft('Spoke: client wants weekly async updates and a shared timeline view')
    setTimeout(() => setLive(false), 1200)
  }
  const commit = () => {
    const t = draft.trim()
    if (!t) return
    setItems([{
      id: Date.now(),
      raw: t.replace(/^Spoke:\\s*/i, ''),
      structured: 'Card · ' + t.replace(/^Spoke:\\s*/i, '').slice(0, 42),
      status: 'New',
    }, ...items])
    setDraft('')
  }

  return (
    <div style={S.shell}>
      <div style={S.wrap}>
        <div style={S.badge}>Live · voice → structure</div>
        <h1 style={S.h1}>${esc(title)}</h1>
        <p style={S.sub}>${esc(subtitle)}</p>

        <div style={S.stage}>
          <button type="button" onClick={capture} style={{
            ...S.orb,
            boxShadow: live ? '0 0 0 16px rgba(0,255,136,0.12)' : '0 0 40px rgba(0,255,136,0.15)',
            transform: live ? 'scale(1.04)' : 'scale(1)',
          }}>
            <span style={{ fontSize: 28 }}>{live ? '◉' : '🎙'}</span>
          </button>
          <div style={S.orbLabel}>{live ? 'Listening…' : 'Tap to capture'}</div>
          <textarea value={draft} onChange={e => setDraft(e.target.value)} placeholder="Transcript lands here…" rows={3} style={S.textarea} />
          <button type="button" onClick={commit} style={S.primary}>Structure it</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
          {items.map((item, i) => (
            <div key={item.id} style={{ ...S.card, animation: 'fadeUp .35s ease both', animationDelay: i * 0.04 + 's' }}>
              <div style={S.raw}>{item.raw}</div>
              <div style={S.structured}>{item.structured}</div>
              <span style={S.chip}>{item.status}</span>
            </div>
          ))}
        </div>
        <div style={S.tags}>{FEATURES.map(f => <span key={f} style={S.tag}>{f}</span>)}</div>
      </div>
    </div>
  )
}

const S = {
  shell: { minHeight: '100vh', background: 'radial-gradient(700px 400px at 50% 0%, rgba(0,255,136,0.1), transparent), #0a0a0f', color: '#e8e8f0', padding: '28px 18px 48px' },
  wrap: { maxWidth: 440, margin: '0 auto' },
  badge: { display: 'inline-block', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#00ff88', background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.28)', borderRadius: 999, padding: '4px 10px', marginBottom: 12 },
  h1: { fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 8, textAlign: 'center' },
  sub: { color: '#888', fontSize: 14, lineHeight: 1.5, marginBottom: 22, textAlign: 'center' },
  stage: { background: 'rgba(17,17,22,0.9)', border: '1px solid #1f1f27', borderRadius: 24, padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center' },
  orb: { width: 88, height: 88, borderRadius: '50%', border: 'none', background: '#00ff88', color: '#0a0a0f', display: 'grid', placeItems: 'center', transition: 'all .2s' },
  orbLabel: { marginTop: 10, marginBottom: 14, fontSize: 12, color: '#888', fontWeight: 600 },
  textarea: { width: '100%', background: '#0a0a0f', border: '1px solid #1f1f27', borderRadius: 12, padding: 12, color: '#e8e8f0', fontSize: 13, resize: 'none', outline: 'none', marginBottom: 10 },
  primary: { width: '100%', background: '#00ff88', color: '#0a0a0f', border: 'none', borderRadius: 12, padding: '12px', fontWeight: 700 },
  card: { background: 'rgba(17,17,22,0.85)', border: '1px solid #1f1f27', borderRadius: 16, padding: 14 },
  raw: { fontSize: 13, color: '#888', marginBottom: 6, fontStyle: 'italic' },
  structured: { fontSize: 15, fontWeight: 600, marginBottom: 10 },
  chip: { fontSize: 10, fontWeight: 700, color: '#00ff88', background: 'rgba(0,255,136,0.08)', borderRadius: 6, padding: '3px 8px' },
  tags: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 18, justifyContent: 'center' },
  tag: { fontSize: 11, color: '#777', border: '1px solid #1f1f27', borderRadius: 999, padding: '4px 10px' },
}
`
}

function genericApp(title: string, subtitle: string, features: string[]): string {
  return `import { useState } from 'react'

const FEATURES = ${JSON.stringify(features)}

export default function App() {
  const [items, setItems] = useState([
    { id: 1, title: 'Core loop ready', meta: 'Live' },
    { id: 2, title: 'Refine by voice next', meta: 'Next' },
  ])
  const [text, setText] = useState('')
  const [tab, setTab] = useState('home')

  const add = () => {
    const t = text.trim()
    if (!t) return
    setItems([{ id: Date.now(), title: t, meta: 'New' }, ...items])
    setText('')
  }

  return (
    <div style={S.shell}>
      <div style={S.wrap}>
        <div style={S.badge}>Live preview · IdeaSpeak</div>
        <h1 style={S.h1}>${esc(title)}</h1>
        <p style={S.sub}>${esc(subtitle)}</p>

        <div style={S.tabs}>
          {['home', 'capture', 'insights'].map(t => (
            <button key={t} type="button" onClick={() => setTab(t)} style={{
              ...S.tab,
              background: tab === t ? 'rgba(0,255,136,0.12)' : 'transparent',
              color: tab === t ? '#00ff88' : '#666',
              borderColor: tab === t ? 'rgba(0,255,136,0.35)' : '#1f1f27',
            }}>{t}</button>
          ))}
        </div>

        {tab === 'capture' ? (
          <div style={S.panel}>
            <div style={S.compose}>
              <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="Capture something…" style={S.input} />
              <button type="button" onClick={add} style={S.primary}>Add</button>
            </div>
          </div>
        ) : tab === 'insights' ? (
          <div style={S.panel}>
            <div style={S.statRow}>
              <div style={S.stat}><div style={S.statN}>{items.length}</div><div style={S.statL}>items</div></div>
              <div style={S.stat}><div style={S.statN}>{FEATURES.length}</div><div style={S.statL}>features</div></div>
              <div style={S.stat}><div style={S.statN}>v1</div><div style={S.statL}>shipped</div></div>
            </div>
            <p style={{ color: '#666', fontSize: 13, marginTop: 12, lineHeight: 1.5 }}>
              Insights stay light in v1 — enough to feel alive, not a dashboard graveyard.
            </p>
          </div>
        ) : (
          <div style={S.panel}>
            <div style={S.compose}>
              <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="Quick add…" style={S.input} />
              <button type="button" onClick={add} style={S.primary}>Add</button>
            </div>
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.map((item, i) => (
                <div key={item.id} style={{ ...S.card, animation: 'fadeUp .35s ease both', animationDelay: i * 0.04 + 's' }}>
                  <span style={{ fontWeight: 600 }}>{item.title}</span>
                  <span style={S.chip}>{item.meta}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={S.tags}>{FEATURES.map(f => <span key={f} style={S.tag}>{f}</span>)}</div>
        <p style={S.foot}>Built with IdeaSpeak · refine by voice · Ship when ready</p>
      </div>
    </div>
  )
}

const S = {
  shell: { minHeight: '100vh', background: 'linear-gradient(165deg,#07070c,#0a0a0f 45%,#0d1512)', color: '#e8e8f0', padding: '28px 18px 48px' },
  wrap: { maxWidth: 440, margin: '0 auto' },
  badge: { display: 'inline-block', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#00ff88', background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.28)', borderRadius: 999, padding: '4px 10px', marginBottom: 12 },
  h1: { fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 8 },
  sub: { color: '#888', fontSize: 14, lineHeight: 1.5, marginBottom: 16 },
  tabs: { display: 'flex', gap: 6, marginBottom: 14 },
  tab: { flex: 1, border: '1px solid', borderRadius: 10, padding: '8px 0', fontSize: 12, fontWeight: 700, textTransform: 'capitalize' },
  panel: { background: 'rgba(17,17,22,0.9)', border: '1px solid #1f1f27', borderRadius: 20, padding: 14 },
  compose: { display: 'flex', gap: 8 },
  input: { flex: 1, background: '#0a0a0f', border: '1px solid #1f1f27', borderRadius: 12, padding: '12px 14px', color: '#e8e8f0', fontSize: 14, outline: 'none' },
  primary: { background: '#00ff88', color: '#0a0a0f', border: 'none', borderRadius: 12, padding: '0 16px', fontWeight: 700 },
  card: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, background: '#0c0c12', border: '1px solid #1a1a22', borderRadius: 14, padding: '12px 14px' },
  chip: { fontSize: 10, fontWeight: 700, color: '#00ff88', background: 'rgba(0,255,136,0.08)', borderRadius: 8, padding: '4px 8px' },
  statRow: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 },
  stat: { background: '#0c0c12', border: '1px solid #1a1a22', borderRadius: 14, padding: 12, textAlign: 'center' },
  statN: { fontSize: 20, fontWeight: 800, color: '#00ff88' },
  statL: { fontSize: 10, color: '#666', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.06em' },
  tags: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 16 },
  tag: { fontSize: 11, color: '#777', border: '1px solid #1f1f27', borderRadius: 999, padding: '4px 10px' },
  foot: { marginTop: 22, textAlign: 'center', fontSize: 11, color: '#3a3a45' },
}
`
}

/** Waiting room before first build — still interactive & premium */
export function starterPreviewFiles(): PreviewFiles {
  const app = `import { useState } from 'react'

export default function App() {
  const [pulse, setPulse] = useState(0)
  return (
    <div style={{
      minHeight: '100vh',
      display: 'grid',
      placeItems: 'center',
      background: 'radial-gradient(800px 400px at 50% 0%, rgba(0,255,136,0.1), transparent), #0a0a0f',
      color: '#e8e8f0',
      fontFamily: 'Inter, system-ui, sans-serif',
      padding: 24,
    }}>
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <div style={{
          width: 72, height: 72, margin: '0 auto 18px', borderRadius: 22,
          background: 'rgba(0,255,136,0.12)', border: '1px solid rgba(0,255,136,0.3)',
          display: 'grid', placeItems: 'center', fontSize: 30,
          animation: 'pulseGlow 2.2s ease infinite',
        }}>🎙</div>
        <div style={{
          display: 'inline-block', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: '#00ff88', marginBottom: 12,
          background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.25)',
          borderRadius: 999, padding: '4px 10px',
        }}>Live canvas</div>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 10 }}>
          Your product appears here
        </h1>
        <p style={{ color: '#888', fontSize: 14, lineHeight: 1.55, marginBottom: 22 }}>
          Plan with Grok by voice, then build. This panel becomes a real interactive app — not a mock.
        </p>
        <button
          type="button"
          onClick={() => setPulse(p => p + 1)}
          style={{
            background: '#00ff88', color: '#0a0a0f', border: 'none', borderRadius: 12,
            padding: '12px 22px', fontWeight: 700, fontSize: 14,
          }}
        >
          {pulse ? \`Ready · \${pulse}\` : 'Preview is live'}
        </button>
      </div>
    </div>
  )
}
`
  return {
    'src/App.tsx': app,
    'src/main.tsx': ENTRY_MAIN,
    'src/index.css': BASE_CSS,
    'package.json': packageJson('ideaspeak-waiting'),
  }
}

export function buildWorldClassPreview(opts: {
  vision?: string
  original?: string
  keyFeatures?: string[]
  personality?: string
}): { files: PreviewFiles; name: string; kind: string } {
  const vision = String(opts.vision || opts.original || 'Your app')
  const original = String(opts.original || vision)
  const name = shortName(vision)
  const features =
    Array.isArray(opts.keyFeatures) && opts.keyFeatures.length
      ? opts.keyFeatures.slice(0, 5).map(String)
      : ['Voice capture', 'Core loop', 'Premium UI', 'Ship-ready']
  const kind = detectKind(vision + ' ' + original)
  const subtitle = vision.slice(0, 110)

  let appCode = genericApp(name, subtitle, features)
  if (kind === 'habit') appCode = habitApp(name, subtitle, features)
  else if (kind === 'client') appCode = clientApp(name, subtitle, features)
  else if (kind === 'voice') appCode = voiceApp(name, subtitle, features)

  const files: PreviewFiles = {
    'src/App.tsx': appCode,
    'src/main.tsx': ENTRY_MAIN,
    'src/index.css': BASE_CSS,
    'package.json': packageJson(name),
    'README.md': `# ${name}\\n\\nLive preview from IdeaSpeak (${opts.personality || 'grok'}).\\n\\n${vision}\\n`,
  }

  return { files, name, kind }
}

/** Ensure LLM-generated files are Sandpack-safe enough to show something */
/** True when App.tsx is runnable inside Sandpack (export default + minimum size). */
export function isRunnableSandpackApp(files: PreviewFiles): boolean {
  const app = String(files['src/App.tsx'] || files['App.tsx'] || '')
  if (app.length < 80) return false
  if (!/export\s+default/.test(app)) return false
  if (/from\s+['"]next\//.test(app)) return false
  return true
}

export function sanitizePreviewFiles(
  incoming: PreviewFiles,
  fallbackBrief: { vision?: string; original?: string; keyFeatures?: string[] },
): PreviewFiles {
  const hasApp =
    incoming['src/App.tsx'] ||
    incoming['App.tsx'] ||
    incoming['/src/App.tsx']
  if (!hasApp || String(hasApp).length < 40) {
    return buildWorldClassPreview(fallbackBrief).files
  }

  const files: PreviewFiles = { ...incoming }
  // Normalize paths
  if (files['App.tsx'] && !files['src/App.tsx']) {
    files['src/App.tsx'] = files['App.tsx']
  }
  if (!files['src/main.tsx']) files['src/main.tsx'] = ENTRY_MAIN
  if (!files['src/index.css']) files['src/index.css'] = BASE_CSS
  if (!files['package.json']) files['package.json'] = packageJson('ideaspeak-preview')

  // Strip Next-only imports that break Sandpack
  if (files['src/App.tsx']) {
    files['src/App.tsx'] = files['src/App.tsx']
      .replace(/from ['"]next\/[^'"]+['"]/g, "from 'react'")
      .replace(/import\s+[^;]+from\s+['"]next\/[^'"]+['"];?\n?/g, '')
  }

  return files
}
