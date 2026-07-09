/**
 * Shared build context — native IdeaSpeak builder resolves the same project
 * snapshot from workspace state for preview, refine, and export.
 */

import type {
  BuildScaffoldPlan,
  ConversationMessage,
  CurrentProject,
  ProjectFile,
} from './projects'

export type NativeBuildTool =
  | 'plan'
  | 'grokBuild'
  | 'build'
  | 'preview'
  | 'refine'
  | 'asset'
  | 'zip'
  | 'github'
  | 'copySpec'

export interface WorkspaceBuildContext {
  conversation: ConversationMessage[]
  transcript: string
  buildPlan: BuildScaffoldPlan | null
  currentProject: CurrentProject | null
  selectedPersonality?: string
}

export function hasBuildContext(ctx: WorkspaceBuildContext): boolean {
  return (
    ctx.conversation.length > 0 ||
    !!ctx.buildPlan ||
    !!ctx.currentProject
  )
}

function conversationTranscript(ctx: WorkspaceBuildContext): string {
  if (ctx.transcript.trim()) return ctx.transcript.trim()
  return ctx.conversation
    .filter((m) => m.role === 'user' && !String(m.id).startsWith('voice-opener'))
    .map((m) => m.content)
    .join(' ')
}

export function simulateVoiceRefiner(transcript: string) {
  const cleaned = transcript.trim().replace(/\s+/g, ' ')
  const lower = cleaned.toLowerCase()

  let vision =
    'A delightful voice-first tool that turns spoken thoughts into beautiful, functional software.'
  let keyFeatures = [
    'Instant voice capture',
    'AI structuring',
    'Premium UI with motion',
    'Export & share',
  ]

  if (lower.includes('roadmap') || lower.includes('founder')) {
    vision =
      'Voice-powered roadmap and task generator that turns messy spoken strategy into clear, prioritized plans.'
    keyFeatures = [
      'Voice capture & transcription',
      'AI roadmap extraction',
      'Prioritized tasks',
      'Beautiful exports',
      'Team comments',
    ]
  } else if (lower.includes('client') || lower.includes('portal')) {
    vision = 'Voice-first client portal with spoken updates and stunning AI summaries.'
    keyFeatures = ['Speak updates', 'AI summaries', 'Visual timelines', 'Voice attachments']
  } else if (lower.includes('marketplace') || lower.includes('book') || lower.includes('consult')) {
    vision =
      'Premium marketplace for booking voice-based strategy sessions with top indie experts.'
    keyFeatures = [
      'Spoken expertise profiles',
      'Smart matching',
      'In-app booking + payments stub',
      'Post-session voice deliverables',
    ]
  }

  const optimizedPrompt = `Build a production-grade native web app: ${vision}\n\nMust ship: ${keyFeatures.join(', ')}\n\nDesign system sacred. Follow IdeaSpeak xAI agent prompt exactly.`

  return {
    brief: { vision, keyFeatures, original: cleaned, tech: 'React + Tailwind + Framer' },
    optimizedPrompt,
  }
}

export function generateNativeProject(
  brief: Record<string, unknown>,
  personality = 'grok'
): { files: ProjectFile; name: string } {
  const vision = String(brief.vision || 'Idea')
  const name = vision.split('.')[0].slice(0, 48).trim()
  const lower = (vision + ' ' + String(brief.original || '')).toLowerCase()

  const isRoadmap =
    lower.includes('roadmap') || lower.includes('task') || lower.includes('founder')
  const isPortal =
    lower.includes('portal') || lower.includes('client') || lower.includes('update')
  const isMarket =
    lower.includes('market') ||
    lower.includes('book') ||
    lower.includes('consult') ||
    lower.includes('session')

  let mainApp = ''

  if (isRoadmap) {
    mainApp = `import React, { useState } from 'react'
import { Mic, Plus, CheckCircle, ArrowRight } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface Item { id: number; title: string; status: string; priority: string }

export default function RoadmapApp() {
  const [items, setItems] = useState<Item[]>([
    { id: 1, title: "Define MVP scope from voice notes", status: "In Progress", priority: "High" },
    { id: 2, title: "Design system tokens & motion", status: "Todo", priority: "High" },
  ])
  const [input, setInput] = useState('')

  const addFromVoice = () => {
    if (!input.trim()) return
    setItems([{ id: Date.now(), title: input.trim(), status: "Todo", priority: "Medium" }, ...items])
    setInput('')
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e8e8f0] p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-5xl font-semibold tracking-tighter">{name}</h1>
        <p className="text-white/60 mt-1">Voice-powered roadmap · Built by IdeaSpeak</p>
        <div className="glass border border-[#1f1f27] rounded-3xl p-6 mt-8 flex gap-3">
          <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addFromVoice()}
            placeholder="Speak or type the next initiative..." className="flex-1 bg-[#111116] border border-[#1f1f27] rounded-2xl px-5 py-3" />
          <button onClick={addFromVoice} className="px-6 bg-[#00ff88] text-black rounded-2xl font-semibold flex items-center gap-2"><Plus size={18} /> Add</button>
          <button className="px-4 border border-[#1f1f27] rounded-2xl"><Mic size={18} /></button>
        </div>
        <div className="space-y-3 mt-6">
          <AnimatePresence>
            {items.map((item, idx) => (
              <motion.div key={item.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }}
                className="glass border border-[#1f1f27] rounded-3xl p-5 flex items-center justify-between">
                <div className="font-medium">{item.title}</div>
                <div className="text-xs px-3 py-1 rounded-xl bg-white/5">{item.status}</div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}`
  } else if (isPortal) {
    mainApp = `import React, { useState } from 'react'
import { Mic, Send, User } from 'lucide-react'

export default function ClientPortal() {
  const [updates, setUpdates] = useState([{ id: 1, from: "You", text: "Kicked off the redesign.", time: "2h ago" }])
  const [newUpdate, setNewUpdate] = useState('')
  const postUpdate = () => {
    if (!newUpdate.trim()) return
    setUpdates([{ id: Date.now(), from: "You", text: newUpdate.trim(), time: "just now" }, ...updates])
    setNewUpdate('')
  }
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e8e8f0] p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-5xl font-semibold tracking-tighter">{name}</h1>
        <p className="text-white/60 mb-8">Voice-first client updates</p>
        <div className="flex gap-3 mb-6">
          <input value={newUpdate} onChange={e=>setNewUpdate(e.target.value)} onKeyDown={e=>e.key==='Enter'&&postUpdate()}
            placeholder="Speak or type an update..." className="flex-1 bg-[#111116] border border-[#1f1f27] rounded-2xl px-5 py-3" />
          <button onClick={postUpdate} className="bg-[#00ff88] text-black px-6 rounded-2xl font-semibold flex items-center gap-2"><Send size={16}/> Post</button>
          <button className="border border-[#1f1f27] px-4 rounded-2xl"><Mic size={16}/></button>
        </div>
        {updates.map(u => (
          <div key={u.id} className="glass border border-[#1f1f27] rounded-3xl p-6 mb-4">
            <div className="text-sm text-white/60 mb-2"><User size={16} className="inline mr-2" />{u.from} · {u.time}</div>
            <div className="text-lg">{u.text}</div>
          </div>
        ))}
      </div>
    </div>
  )
}`
  } else if (isMarket) {
    mainApp = `import React, { useState } from 'react'
import { Mic, Calendar } from 'lucide-react'

export default function VoiceMarket() {
  const [sessions] = useState([
    { id: 1, expert: "Alex Rivera", topic: "Positioning for indie founders", time: "Today 4pm", price: "$180" },
  ])
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e8e8f0] p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-5xl font-semibold tracking-tighter mb-8">{name}</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sessions.map(s => (
            <div key={s.id} className="glass border border-[#1f1f27] rounded-3xl p-6">
              <div className="font-semibold text-xl">{s.expert}</div>
              <div className="text-white/70 mt-1">{s.topic}</div>
              <div className="flex items-center gap-2 text-white/60 mt-4 text-sm"><Calendar size={16}/> {s.time} · {s.price}</div>
              <button className="mt-4 w-full py-3 rounded-2xl border border-[#00ff88] text-[#00ff88]">Book session</button>
            </div>
          ))}
        </div>
        <button className="mt-6 px-6 bg-[#00ff88] text-black rounded-2xl font-semibold flex items-center gap-2"><Mic size={18} /> Speak goal</button>
      </div>
    </div>
  )
}`
  } else {
    mainApp = `import React, { useState } from 'react'
import { Mic, Sparkles } from 'lucide-react'
import { motion } from 'framer-motion'

export default function IdeaTool() {
  const [items, setItems] = useState([{id:1, text:"First captured idea from voice", done:false}])
  const [text, setText] = useState('')
  const capture = () => {
    if (!text.trim()) return
    setItems([{id:Date.now(), text: text.trim(), done:false}, ...items])
    setText('')
  }
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e8e8f0] p-12">
      <div className="max-w-xl mx-auto">
        <h1 className="text-6xl font-semibold tracking-tighter mb-3">{name}</h1>
        <p className="text-2xl text-white/70 mb-10">Speak it. Capture it. Make it real.</p>
        <div className="flex gap-3 mb-8">
          <input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>e.key==='Enter'&&capture()} placeholder="What are you thinking?" className="flex-1 bg-[#111116] border border-[#1f1f27] rounded-3xl px-6 py-4 text-lg" />
          <button onClick={capture} className="bg-[#00ff88] text-black px-8 rounded-3xl font-semibold flex items-center gap-3"><Sparkles size={20}/> Capture</button>
          <button className="border border-[#1f1f27] px-6 rounded-3xl"><Mic/></button>
        </div>
        <div className="space-y-3">
          {items.map((item, i) => (
            <motion.div key={item.id} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{delay:i*0.04}}
              className="glass border border-[#1f1f27] rounded-3xl p-6">{item.text}</motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}`
  }

  const files: ProjectFile = {
    'src/App.tsx': { code: mainApp },
    'src/index.css': {
      code: `@import "tailwindcss";\n:root { --accent: #00ff88; }\nbody { font-family: Inter, system-ui, sans-serif; background: #0a0a0f; color: #e8e8f0; }\n.glass { background: rgba(17,17,22,0.85); backdrop-filter: blur(20px); }`,
    },
    'src/main.tsx': {
      code: `import React from 'react'\nimport ReactDOM from 'react-dom/client'\nimport App from './App'\nimport './index.css'\n\nReactDOM.createRoot(document.getElementById('root')!).render(<App />)`,
    },
    'README.md': {
      code: `# ${name}\n\nGenerated by IdeaSpeak (${personality} personality).\n\nVision: ${vision}`,
    },
  }

  return { files, name }
}

/** Resolve a CurrentProject for any platform — uses built files, plan, or conversation. */
export function resolveExportProject(ctx: WorkspaceBuildContext): CurrentProject | null {
  if (ctx.currentProject) return ctx.currentProject

  const transcript = conversationTranscript(ctx)
  if (!ctx.buildPlan && !transcript) return null

  if (ctx.buildPlan) {
    const { files, name } = generateNativeProject(
      ctx.buildPlan.brief,
      ctx.selectedPersonality
    )
    return {
      id: ctx.buildPlan.id,
      name: ctx.buildPlan.name || name,
      brief: ctx.buildPlan.brief,
      optimizedPrompt: ctx.buildPlan.optimizedPrompt,
      files,
      transcript: transcript || ctx.buildPlan.vision,
    }
  }

  const { brief, optimizedPrompt } = simulateVoiceRefiner(transcript)
  const { files, name } = generateNativeProject(brief, ctx.selectedPersonality)
  return {
    id: `export-${Date.now().toString(36)}`,
    name,
    brief,
    optimizedPrompt,
    files,
    transcript,
  }
}

export function getOptimizedPrompt(ctx: WorkspaceBuildContext): string {
  if (ctx.currentProject?.optimizedPrompt) return ctx.currentProject.optimizedPrompt
  if (ctx.buildPlan?.optimizedPrompt) return ctx.buildPlan.optimizedPrompt
  const transcript = conversationTranscript(ctx)
  if (transcript) return simulateVoiceRefiner(transcript).optimizedPrompt
  return ''
}

export const NATIVE_TOOL_LABELS: Record<NativeBuildTool, { label: string; description: string }> = {
  plan: { label: 'Multi-Agent Plan', description: 'Architect, UX, Engineer, and Scope agents draft v1' },
  grokBuild: { label: 'Grok Build', description: 'Build a live preview from your conversation with Grok' },
  build: { label: 'Grok Build from Plan', description: 'Execute the approved multi-agent scaffold with Grok' },
  preview: { label: 'Live Preview', description: 'Sandpack preview with file explorer and code editor' },
  refine: { label: 'Refine', description: 'Voice or text refinements with vision upload' },
  asset: { label: 'Assets', description: 'Generate images with xAI for your app' },
  zip: { label: 'Export ZIP', description: 'Next.js 15 project with AGENTS.md, Supabase stubs, and context' },
  github: { label: 'GitHub', description: 'Push production scaffold to a new repository' },
  copySpec: { label: 'Copy Spec', description: 'Copy the full build specification' },
}