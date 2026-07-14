import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Mic,
  MicOff,
  Send,
  Settings,
  X,
  Copy,
  Download,
  MessageSquare,
  Sparkles,
  RefreshCw,
  Eye,
  Code2,
  ArrowRight,
  Wand2,
  Keyboard,
  Rocket,
  Crown,
  Maximize2,
  Minimize2,
  LayoutGrid,
  ScanEye,
  Users,
} from 'lucide-react'
import { toast, Toaster } from 'sonner'
import { runIdeaSpeakAgent, discussWithGrok, generateWithLLM } from './lib/xai'
import type { XaiMessage } from './lib/xai'
import { verifyXaiKey, loadLocalXaiKey as loadKey } from './lib/api-verify'
import { simulateVoiceRefiner } from './lib/build-tools'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { ModeBadge, type GrokMode } from './components/ModeBadge'
import { ApiSetupPanel } from './components/ApiSetupPanel'
import { AccountPanel } from './components/AccountPanel'
import { ShipPanel } from './components/ShipPanel'
import { PricingPanel } from './components/PricingPanel'
import { PolishPanel } from './components/PolishPanel'
import VoicePairPanel from './components/VoicePairPanel'
import { VisionRefinePanel, VISION_REFINE_CHIP } from './components/VisionRefinePanel'
import { GalleryPanel } from './components/GalleryPanel'
import { CouncilPanel } from './components/CouncilPanel'
import { LaunchAutopilotPanel } from './components/LaunchAutopilotPanel'
import { PlatformReadinessChip } from './components/PlatformReadinessChip'
import { IN_HOUSE_PLATFORM } from './lib/platform'

import {
  buildProductionScaffold,
  loadShipPrefs,
  supabaseSchemaSql,
  type ShipPreferences,
} from './lib/ship'
import {
  createVoicePairController,
  type VoicePairController,
  type VoicePairFilePatch,
  type VoicePairStatus,
} from './lib/voice-pair'
import {
  refineFromScreenshot,
  applySuggestedFileEdits,
} from './lib/vision-refine'
import { remixWorkspace, type GalleryEntry } from './lib/gallery'
import type { SavedWorkspace } from './lib/projects'
import {
  canUse,
  recordUsage,
  getPlanId,
  remainingQuota,
  type PlanId,
} from './lib/billing'
import {
  GrokVoiceAgent,
  type GrokVoiceState,
  type VoiceId,
} from './lib/grokVoice'
import {
  starterPreviewFiles,
  sanitizePreviewFiles,
  buildWorldClassPreview,
} from './lib/preview-scaffold'
import {
  checkSandboxAvailable,
  createSandbox,
  syncSandboxFiles,
  waitForSandboxReady,
} from './lib/sandbox'

// ── Types ──────────────────────────────────────────────────────────────────
type Mode = 'discuss' | 'build'
type Personality = 'grok' | 'witty' | 'mentor' | 'coach' | 'rebel'
type VoiceStatus =
  | 'idle'
  | 'prompting'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'error'
type WorkspaceTab = 'preview' | 'code'
type PreviewEngine = 'sandpack' | 'sandbox'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

interface GeneratedFiles {
  [path: string]: string
}

// ── Starter sandbox (world-class waiting room) ─────────────────────────────
const STARTER_FILES: GeneratedFiles = starterPreviewFiles()

const PERSONALITIES: { id: Personality; label: string; emoji: string }[] = [
  { id: 'grok', label: 'Grok', emoji: '🤖' },
  { id: 'witty', label: 'Witty', emoji: '😏' },
  { id: 'mentor', label: 'Mentor', emoji: '🧙' },
  { id: 'coach', label: 'Coach', emoji: '🏆' },
  { id: 'rebel', label: 'Rebel', emoji: '🔥' },
]

const DISCUSS_CHIPS = [
  'A habit tracker that feels like texting a coach',
  'CRM for freelancers who hate CRMs',
  'Voice notes that become a roadmap',
]

const BUILD_CHIPS = [
  'Build a habit tracker with streaks',
  'Make a freelancers CRM',
  'Voice notes → roadmap app',
]

/** Explicit green-light to leave planning and generate the live preview */
function wantsBuild(text: string): boolean {
  const t = text.toLowerCase().trim()
  return (
    /\b(build it|build this|let'?s build|start building|ready to build|go ahead and build|ship it|generate (the )?app|lock it in and build)\b/.test(
      t,
    ) ||
    t === 'build' ||
    t === 'build now'
  )
}

/** Agent thinks the plan is solid enough */
function replySignalsPlanReady(text: string): boolean {
  return /\b(ready to build|say build|plan (feels |is )?(solid|locked|good enough)|when you want the live preview|hit build)\b/i.test(
    text,
  )
}

/** Compile conversation into a build brief so generation uses the plan, not one utterance */
function compilePlanBrief(messages: ChatMessage[]): string {
  const users = messages.filter((m) => m.role === 'user').map((m) => m.content)
  const assistants = messages
    .filter((m) => m.role === 'assistant')
    .slice(1)
    .map((m) => m.content)
  return [
    'Build a live v1 from this collaborative plan:',
    '',
    '## User direction',
    ...users.map((u, i) => `${i + 1}. ${u}`),
    '',
    '## Co-founder notes (from planning)',
    ...assistants.slice(-4).map((a) => `- ${a}`),
    '',
    'Ship one tight vertical slice: primary user, core loop, wow moment, premium dark UI. Interactive and complete enough to click through.',
  ].join('\n')
}

/** Flatten { path: { code } } or { path: string } → Sandpack files */
function toSandpackFiles(
  files: Record<string, string | { code: string }>,
): GeneratedFiles {
  const out: GeneratedFiles = {}
  for (const [path, val] of Object.entries(files)) {
    if (typeof val === 'string') out[path] = val
    else if (val && typeof val === 'object' && 'code' in val) out[path] = val.code
  }
  return out
}

function workspaceFilesToGenerated(
  files: SavedWorkspace['currentProject'] extends infer P
    ? P extends { files: infer F }
      ? F
      : never
    : never,
): GeneratedFiles {
  const out: GeneratedFiles = {}
  if (!files) return out
  for (const [path, val] of Object.entries(files as Record<string, { code: string }>)) {
    out[path] = val.code
  }
  return out
}

function hydrateFromWorkspace(ws: SavedWorkspace) {
  return {
    messages: ws.conversation.map((m, i) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
      timestamp: Date.now() - (ws.conversation.length - i) * 1000,
    })),
    mode: ws.mode,
    planReady: !!ws.buildPlan || ws.status !== 'discussing',
    hasBuilt: ws.status === 'built',
    generatedFiles: workspaceFilesToGenerated(ws.currentProject?.files ?? {}),
    lastBuiltName: ws.currentProject?.name ?? ws.name,
    lastBuildPlan: ws.buildPlan?.oneLiner ?? ws.summary,
    personality: (ws.selectedPersonality as Personality) || 'grok',
  }
}

function mergeProjectFiles(generated: GeneratedFiles): GeneratedFiles {
  const safe = sanitizePreviewFiles(generated, {
    vision: generated['README.md']?.slice(0, 80),
  })
  return {
    ...STARTER_FILES,
    ...safe,
    'src/main.tsx': safe['src/main.tsx'] || STARTER_FILES['src/main.tsx'],
    'src/index.css': safe['src/index.css'] || STARTER_FILES['src/index.css'],
    'package.json': safe['package.json'] || STARTER_FILES['package.json'],
  }
}

/** Strip fake git/deploy claims from model copy */
function sanitizeBuildTalk(text: string): string {
  if (!text) return text
  return text
    .replace(/\b(I(?:'m| am)?\s+)?(push(?:ing|ed)?|committ(?:ing|ed)|deploy(?:ing|ed)?)\b[^.!?\n]*/gi, '')
    .replace(/\b(GitHub|git push|opened a PR|pull request|Vercel deploy)\b[^.!?\n]*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const WAVE_DELAYS = ['0s', '0.08s', '0.16s', '0.24s', '0.32s', '0.4s', '0.32s', '0.24s', '0.16s', '0.08s']

interface SandpackWorkspaceProps {
  previewRevision: number
  workspaceTab: WorkspaceTab
  hasBuilt: boolean
  generatedFiles: GeneratedFiles
  visibleSandpackFiles: string[]
  appTsxLength: number
}

const SandpackWorkspace = lazy(async () => {
  const [
    { SandpackProvider, SandpackLayout, SandpackCodeEditor, SandpackPreview, SandpackFileExplorer },
    { sandpackDark },
  ] = await Promise.all([
    import('@codesandbox/sandpack-react'),
    import('@codesandbox/sandpack-themes'),
  ])

  function SandpackWorkspaceInner({
    previewRevision,
    workspaceTab,
    hasBuilt,
    generatedFiles,
    visibleSandpackFiles,
    appTsxLength,
  }: SandpackWorkspaceProps) {
    return (
      <SandpackProvider
        key={`sp-${previewRevision}-${workspaceTab}-${hasBuilt}-${appTsxLength}`}
        template="react-ts"
        theme={sandpackDark}
        files={generatedFiles}
        options={{
          activeFile: 'src/App.tsx',
          visibleFiles: visibleSandpackFiles,
          recompileMode: 'immediate',
          recompileDelay: 80,
          autorun: true,
          autoReload: true,
          initMode: 'immediate',
        }}
        customSetup={{
          dependencies: {
            react: '^18.2.0',
            'react-dom': '^18.2.0',
          },
          entry: '/src/main.tsx',
        }}
      >
        {workspaceTab === 'preview' ? (
          <div className="h-full flex flex-col">
            <div className="shrink-0 flex items-center justify-center gap-1.5 py-2 border-b border-[#14141c]">
              <span className="w-2 h-2 rounded-full bg-[#ff5f57]" />
              <span className="w-2 h-2 rounded-full bg-[#febc2e]" />
              <span className="w-2 h-2 rounded-full bg-[#28c840]" />
              <span className="ml-2 text-[10px] text-[#3a3a45] font-medium tracking-wide">
                LIVE PREVIEW
              </span>
            </div>
            <SandpackLayout style={{ height: '100%', flex: 1, border: 'none', borderRadius: 0 }}>
              <SandpackPreview
                style={{ height: '100%', flex: 1, minHeight: 0 }}
                showOpenInCodeSandbox={false}
                showRefreshButton
                showNavigator={false}
                showOpenNewtab={false}
              />
            </SandpackLayout>
          </div>
        ) : (
          <SandpackLayout style={{ height: '100%', border: 'none', borderRadius: 0 }}>
            <SandpackFileExplorer style={{ minWidth: 140, maxWidth: 180 }} />
            <SandpackCodeEditor
              showTabs
              showLineNumbers
              closableTabs
              style={{ flex: 1, height: '100%' }}
            />
          </SandpackLayout>
        )}
      </SandpackProvider>
    )
  }

  return { default: SandpackWorkspaceInner }
})

function SandpackLoadingFallback() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#08080c]">
      <div className="w-9 h-9 rounded-full border-2 border-[#00ff88] border-t-transparent animate-spin" />
      <p className="text-[13px] font-medium text-[#888]">Loading preview runtime…</p>
    </div>
  )
}

function WaveBars({ active, size = 'md' }: { active: boolean; size?: 'md' | 'lg' }) {
  const barW = size === 'lg' ? 4 : 3
  const gap = size === 'lg' ? 4 : 3
  const idleH = size === 'lg' ? 8 : 6
  return (
    <div className="flex items-center" style={{ gap, height: size === 'lg' ? 32 : 24 }} aria-hidden>
      {WAVE_DELAYS.map((d, i) => (
        <div
          key={i}
          className="rounded-full"
          style={{
            width: barW,
            background: active ? '#00ff88' : '#333',
            height: active ? undefined : idleH,
            animation: active
              ? `wave-bar-${size} 1s ease-in-out ${d} infinite`
              : 'none',
          }}
        />
      ))}
    </div>
  )
}

// ── Settings ───────────────────────────────────────────────────────────────
function SettingsModal({
  open,
  onClose,
  personality,
  setPersonality,
  ttsEnabled,
  setTtsEnabled,
  onKeySaved,
}: {
  open: boolean
  onClose: () => void
  personality: Personality
  setPersonality: (p: Personality) => void
  ttsEnabled: boolean
  setTtsEnabled: (v: boolean) => void
  onKeySaved: (hasKey: boolean) => void
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/70 backdrop-blur-md"
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.98, opacity: 0 }}
            className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-[#1f1f27] bg-[#111116] p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-[17px] font-semibold tracking-tight text-[#e8e8f0]">Settings</h2>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-[#666] hover:text-[#ccc] hover:bg-white/5 transition-colors"
                aria-label="Close settings"
              >
                <X size={18} />
              </button>
            </div>

            <ApiSetupPanel onKeySaved={onKeySaved} />

            <div className="h-px bg-[#1f1f27] my-6" />

            <AccountPanel />

            <div className="h-px bg-[#1f1f27] my-6" />

            <label className="block text-[11px] font-semibold text-[#666] uppercase tracking-wider mb-3">
              Personality
            </label>
            <div className="flex gap-2 flex-wrap mb-6">
              {PERSONALITIES.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPersonality(p.id)}
                  className={`px-3 py-1.5 rounded-lg text-[13px] border transition-colors ${
                    personality === p.id
                      ? 'border-[#00ff88]/50 bg-[#00ff88]/10 text-[#00ff88]'
                      : 'border-[#1f1f27] text-[#777] hover:border-[#333] hover:text-[#aaa]'
                  }`}
                >
                  {p.emoji} {p.label}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="text-[14px] font-medium text-[#e8e8f0]">Read replies aloud</div>
                <div className="text-[12px] text-[#555] mt-0.5">Browser speech synthesis</div>
              </div>
              <button
                role="switch"
                aria-checked={ttsEnabled}
                onClick={() => setTtsEnabled(!ttsEnabled)}
                className={`relative w-11 h-6 rounded-full border-0 cursor-pointer transition-colors ${
                  ttsEnabled ? 'bg-[#00ff88]' : 'bg-[#1f1f27]'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                    ttsEnabled ? 'translate-x-5' : ''
                  }`}
                />
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function App() {
  // Plan first (discuss), then build when ready — voice is collaborative, not parrot+generate
  const [mode, setMode] = useState<Mode>('discuss')
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        "Hey — I'm Grok. Tap the mic for a real voice call with me (not browser text-to-speech). We'll plan a ruthless v1, then you say build it for a live preview.",
      timestamp: Date.now(),
    },
  ])
  const [planReady, setPlanReady] = useState(false)
  const voiceTurnRef = useRef(false)
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [generatedFiles, setGeneratedFiles] = useState<GeneratedFiles>(STARTER_FILES)
  const [hasBuilt, setHasBuilt] = useState(false)
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('preview')
  const [previewFullscreen, setPreviewFullscreen] = useState(false)
  const [showWorkspace, setShowWorkspace] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [mobilePanel, setMobilePanel] = useState<'chat' | 'app'>('chat')
  const [previewFlash, setPreviewFlash] = useState(false)
  const [previewRevision, setPreviewRevision] = useState(0)
  const [isBuilding, setIsBuilding] = useState(false)
  const [previewEngine, setPreviewEngine] = useState<PreviewEngine>('sandpack')
  const [e2bAvailable, setE2bAvailable] = useState(false)
  const [sandboxId, setSandboxId] = useState<string | null>(null)
  const [sandboxPreviewUrl, setSandboxPreviewUrl] = useState<string | null>(null)
  const [sandboxLoading, setSandboxLoading] = useState(false)
  const [sandboxStatus, setSandboxStatus] = useState('')
  const projectIdRef = useRef(`ideaspeak-${Date.now()}`)
  const [showShip, setShowShip] = useState(false)
  const [showPricing, setShowPricing] = useState(false)
  const [showPolish, setShowPolish] = useState(false)
  const [showGallery, setShowGallery] = useState(false)
  const [showVision, setShowVision] = useState(false)
  const [showCouncil, setShowCouncil] = useState(false)
  const [showAutopilot, setShowAutopilot] = useState(false)
  const [planId, setPlanIdState] = useState<PlanId>(() => getPlanId())
  const [lastBuiltName, setLastBuiltName] = useState('My IdeaSpeak App')
  const [lastBuildPlan, setLastBuildPlan] = useState('')
  const [usageTick, setUsageTick] = useState(0)
  const [hideSimBanner, setHideSimBanner] = useState(() => {
    try {
      return sessionStorage.getItem('ideaspeak_hide_sim_banner') === '1'
    } catch {
      return false
    }
  })
  const buildsLeft = remainingQuota('build')
  void usageTick // re-render after recordUsage bumps tick

  const [apiKey, setApiKey] = useState(() => loadKey())
  /** Verified live Grok (not just "key string present") */
  const [grokLive, setGrokLive] = useState(false)
  const [grokStatusMsg, setGrokStatusMsg] = useState('')
  const [personality, setPersonality] = useState<Personality>('grok')
  // On by default so mic open + replies give spoken feedback
  const [ttsEnabled, setTtsEnabled] = useState(true)

  // Verify Grok on load (and whenever key changes)
  useEffect(() => {
    let cancelled = false
    const key = loadKey()
    setApiKey(key)
    verifyXaiKey(key || undefined).then((r) => {
      if (cancelled) return
      setGrokLive(r.status === 'live')
      setGrokStatusMsg(r.message || '')
      if (key && r.status === 'invalid') {
        toast.error('Grok key not working', {
          description: r.message || 'Update key in Settings (console.x.ai)',
          duration: 6000,
        })
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    checkSandboxAvailable().then((ok) => {
      if (!cancelled) setE2bAvailable(ok)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const sandboxIdRef = useRef<string | null>(null)
  useEffect(() => {
    sandboxIdRef.current = sandboxId
  }, [sandboxId])

  useEffect(() => {
    if (previewEngine !== 'sandbox' || !hasBuilt || !e2bAvailable) return

    let cancelled = false
    const projectId = projectIdRef.current

    const bootSandbox = async () => {
      setSandboxLoading(true)
      setSandboxStatus('Creating cloud sandbox…')
      try {
        const existingId = sandboxIdRef.current
        if (existingId) {
          setSandboxStatus('Syncing files to sandbox…')
          await syncSandboxFiles(existingId, generatedFiles)
          const url = await waitForSandboxReady(existingId, { timeoutMs: 45_000 })
          if (!cancelled) {
            setSandboxPreviewUrl(url)
            setSandboxStatus(url ? '' : 'Waiting for Vite dev server…')
          }
          return
        }

        const session = await createSandbox(projectId, generatedFiles)
        if (cancelled) return

        setSandboxId(session.sandboxId)
        sandboxIdRef.current = session.sandboxId

        if (session.isStub) {
          setSandboxStatus(session.error || 'E2B not configured on server')
          return
        }

        setSandboxStatus(
          session.status === 'ready'
            ? ''
            : 'Installing dependencies (npm install)…',
        )

        const url =
          session.previewUrl || (await waitForSandboxReady(session.sandboxId))
        if (!cancelled) {
          setSandboxPreviewUrl(url)
          if (!url) setSandboxStatus('Sandbox timed out — check server logs')
          else setSandboxStatus('')
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Sandbox failed'
        if (!cancelled) {
          setSandboxStatus(msg)
          toast.error('E2B sandbox failed', { description: msg })
        }
      } finally {
        if (!cancelled) setSandboxLoading(false)
      }
    }

    void bootSandbox()
    return () => {
      cancelled = true
    }
  }, [previewEngine, hasBuilt, e2bAvailable, previewRevision, generatedFiles])

  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('idle')
  const [voiceInterim, setVoiceInterim] = useState('')
  const [assistantLiveLine, setAssistantLiveLine] = useState('')
  const [grokVoiceId] = useState<VoiceId>('eve')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const grokAgentRef = useRef<GrokVoiceAgent | null>(null)
  const voicePairRef = useRef<VoicePairController | null>(null)
  const [voicePairOpen, setVoicePairOpen] = useState(false)
  const [voicePairStatus, setVoicePairStatus] = useState<VoicePairStatus>('idle')
  const [voicePairNarration, setVoicePairNarration] = useState('')
  const [voicePairPatches, setVoicePairPatches] = useState<VoicePairFilePatch[]>([])
  const [voicePairAgentPaused, setVoicePairAgentPaused] = useState(false)
  const prevGeneratedKeysRef = useRef<string[]>([])
  /** True while user wants the mic on — survives stale event closures */
  const voiceActiveRef = useRef(false)
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const sendMessageRef = useRef<(text?: string, modeOverride?: Mode) => Promise<void>>(async () => {})
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  // Mic always available — Grok Voice uses getUserMedia; browser STT is fallback only
  const isSupported =
    typeof window !== 'undefined' &&
    !!(
      navigator.mediaDevices?.getUserMedia ||
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition
    )

  const userTurns = messages.filter((m) => m.role === 'user').length
  const showEmptyHints = userTurns === 0 && !isLoading
  const grokMode: GrokMode = grokLive ? 'live' : apiKey ? 'key-missing' : 'simulator'

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }, [input])

  // Tear down mic if the component unmounts while listening
  useEffect(() => {
    return () => {
      voiceActiveRef.current = false
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      try {
        recognitionRef.current?.abort?.()
      } catch {
        /* ignore */
      }
      recognitionRef.current = null
      try {
        window.speechSynthesis?.cancel()
      } catch {
        /* ignore */
      }
    }
  }, [])

  /** Prefer a natural English voice — browser default often sounds like a robot */
  const pickVoice = useCallback(() => {
    if (!window.speechSynthesis) return null
    const voices = window.speechSynthesis.getVoices()
    if (!voices.length) return null
    const prefer = [
      /samantha/i,
      /karen/i,
      /moira/i,
      /google us english/i,
      /microsoft (aria|jenny|guy)/i,
      /natural/i,
      /enhanced/i,
    ]
    for (const re of prefer) {
      const v = voices.find((x) => re.test(x.name) && /en/i.test(x.lang))
      if (v) return v
    }
    return (
      voices.find((v) => v.lang === 'en-US') ||
      voices.find((v) => /^en/i.test(v.lang)) ||
      null
    )
  }, [])

  const speak = useCallback(
    (text: string, opts?: { force?: boolean }) => {
      if (!opts?.force && !ttsEnabled) return
      if (!window.speechSynthesis) return
      // Strip leftover bot cadence before speaking
      const clean = text
        .replace(/^(Perfect|Awesome|Great|Absolutely)[!.,]?\s*/i, '')
        .slice(0, 280)
      window.speechSynthesis.cancel()
      const utt = new SpeechSynthesisUtterance(clean)
      utt.rate = 1.08
      utt.pitch = 0.95
      const voice = pickVoice()
      if (voice) utt.voice = voice
      window.speechSynthesis.speak(utt)
    },
    [ttsEnabled, pickVoice],
  )

  /** Await spoken line (used before mic listens so TTS isn't transcribed) */
  const speakAndWait = useCallback(
    (text: string): Promise<void> => {
      return new Promise((resolve) => {
        if (!window.speechSynthesis) {
          resolve()
          return
        }
        window.speechSynthesis.cancel()
        // Chrome: voices often empty until this fires
        const run = () => {
          const utt = new SpeechSynthesisUtterance(text)
          utt.rate = 1.08
          utt.pitch = 0.95
          const voice = pickVoice()
          if (voice) utt.voice = voice
          let done = false
          const finish = () => {
            if (done) return
            done = true
            resolve()
          }
          utt.onend = finish
          utt.onerror = finish
          window.speechSynthesis.speak(utt)
          window.setTimeout(finish, 5000)
        }
        if (window.speechSynthesis.getVoices().length) run()
        else {
          window.speechSynthesis.onvoiceschanged = () => {
            window.speechSynthesis.onvoiceschanged = null
            run()
          }
          // fallback if event never fires
          window.setTimeout(run, 200)
        }
      })
    },
    [pickVoice],
  )

  const stopVoice = useCallback(() => {
    voiceActiveRef.current = false
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    // Real Grok Voice session
    if (grokAgentRef.current) {
      try {
        grokAgentRef.current.disconnect()
      } catch {
        /* ignore */
      }
      grokAgentRef.current = null
    }
    // Browser STT fallback
    const rec = recognitionRef.current
    recognitionRef.current = null
    if (rec) {
      try {
        rec.onresult = null
        rec.onerror = null
        rec.onend = null
        rec.onstart = null
      } catch {
        /* ignore */
      }
      try {
        rec.stop()
      } catch {
        try {
          rec.abort()
        } catch {
          /* ignore */
        }
      }
    }
    setVoiceStatus('idle')
    setVoiceInterim('')
    setAssistantLiveLine('')
    try {
      window.speechSynthesis?.cancel()
    } catch {
      /* ignore */
    }
  }, [])

  const stopVoicePair = useCallback(() => {
    voicePairRef.current?.dispose()
    voicePairRef.current = null
    setVoicePairOpen(false)
    setVoicePairStatus('idle')
    setVoicePairNarration('')
    setVoicePairAgentPaused(false)
  }, [])

  const startVoicePair = useCallback(async () => {
    stopVoice()
    voicePairRef.current?.dispose()
    const ctrl = createVoicePairController({
      onStatusChange: setVoicePairStatus,
      onAgentNarration: (text, isFinal) =>
        setVoicePairNarration(isFinal === false ? text : ''),
      onFilePatch: (patch) =>
        setVoicePairPatches((p) =>
          [patch, ...p.filter((x) => x.path !== patch.path)].slice(0, 24),
        ),
      onTranscript: (text, isFinal) => {
        if (isFinal) {
          setMessages((prev) => [
            ...prev,
            { role: 'user', content: text.trim(), timestamp: Date.now() },
          ])
        }
      },
      onError: (err) => toast.error('Voice pair', { description: err }),
    })
    voicePairRef.current = ctrl
    setVoicePairOpen(true)
    setVoicePairPatches([])
    setVoicePairNarration('')
    try {
      await ctrl.start()
      setGrokLive(true)
    } catch (e: unknown) {
      stopVoicePair()
      toast.error('Voice pair failed', {
        description: e instanceof Error ? e.message : 'Could not connect',
      })
    }
  }, [stopVoice, stopVoicePair])

  useEffect(() => {
    voicePairRef.current?.setAgentWorking(isBuilding)
    if (!isBuilding) setVoicePairAgentPaused(false)
  }, [isBuilding])

  useEffect(() => {
    const paths = Object.keys(generatedFiles)
    const prev = new Set(prevGeneratedKeysRef.current)
    for (const path of paths) {
      if (!prev.has(path)) {
        voicePairRef.current?.recordFilePatch({ path, summary: 'Added' })
      }
    }
    prevGeneratedKeysRef.current = paths
  }, [generatedFiles])

  useEffect(() => () => voicePairRef.current?.dispose(), [])

  // Esc closes topmost modal / stops mic
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (showPricing) setShowPricing(false)
      else if (showAutopilot) setShowAutopilot(false)
      else if (showCouncil) setShowCouncil(false)
      else if (showVision) setShowVision(false)
      else if (showGallery) setShowGallery(false)
      else if (showPolish) setShowPolish(false)
      else if (showShip) setShowShip(false)
      else if (showSettings) setShowSettings(false)
      else if (voicePairOpen) stopVoicePair()
      else if (voiceActiveRef.current || voiceStatus === 'prompting') stopVoice()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    showPricing,
    showAutopilot,
    showCouncil,
    showVision,
    showGallery,
    showPolish,
    showShip,
    showSettings,
    voicePairOpen,
    stopVoice,
    stopVoicePair,
    voiceStatus,
  ])

  const revealLivePreview = useCallback(() => {
    setHasBuilt(true)
    setWorkspaceTab('preview')
    setShowWorkspace(true)
    setMobilePanel('app')
    setPreviewRevision((n) => n + 1)
    setPreviewFlash(true)
    window.setTimeout(() => setPreviewFlash(false), 2800)
  }, [])

  /** Always produce a runnable preview — local scaffold first (instant), Grok optional upgrade */
  const materializeApp = useCallback(
    async (idea: string, history: ChatMessage[]) => {
      const gate = canUse('build')
      if (!gate.ok) {
        toast.error(gate.reason || 'Build limit reached', {
          action: { label: 'Upgrade', onClick: () => setShowPricing(true) },
        })
        setShowPricing(true)
        throw new Error('PLAN_LIMIT')
      }

      setIsBuilding(true)
      voicePairRef.current?.setNarration('Scaffolding your app…', { speak: true })
      const key = apiKey || loadKey() || undefined

      // Instant local scaffold so preview is never empty while APIs run
      const sim = simulateVoiceRefiner(idea)
      let brief: Record<string, unknown> = {
        ...(sim.brief as Record<string, unknown>),
        original: idea,
      }
      let plan =
        'Your app is live in the Preview panel. Click around, then Ship or refine by voice.'
      let source: 'grok' | 'local' = 'local'
      let name = 'Your app'

      try {
        // Instant world-class themed scaffold (habit / client / voice / generic)
        const themed = buildWorldClassPreview({
          vision: String(brief.vision || idea),
          original: idea,
          keyFeatures: Array.isArray(brief.keyFeatures)
            ? (brief.keyFeatures as string[])
            : undefined,
          personality,
        })
        name = themed.name || name
        setGeneratedFiles(mergeProjectFiles(themed.files))
        voicePairRef.current?.setNarration(
          `Wrote ${Object.keys(themed.files).length} preview files`,
          { speak: true },
        )
        setLastBuiltName(name)
        setLastBuildPlan(plan)
        revealLivePreview()
        recordUsage('build')
        setUsageTick((n) => n + 1)

        // Optional Grok code upgrade (capped) — sanitized for Sandpack
        if (key) {
          try {
            const refined = await Promise.race([
              runIdeaSpeakAgent(idea, history, key),
              new Promise<null>((r) => setTimeout(() => r(null), 12000)),
            ])
            if (refined?.brief) {
              brief = { ...(refined.brief as Record<string, unknown>), original: idea }
              if (refined.plan) plan = sanitizeBuildTalk(refined.plan)
            }
            const llmResult = await Promise.race([
              generateWithLLM(idea, brief, key, personality),
              new Promise<null>((r) => setTimeout(() => r(null), 45000)),
            ])
            if (llmResult?.files && Object.keys(llmResult.files).length > 0) {
              const files = mergeProjectFiles(
                toSandpackFiles(llmResult.files as GeneratedFiles),
              )
              setGeneratedFiles(files)
              name = llmResult.name || name
              if (llmResult.plan) plan = sanitizeBuildTalk(llmResult.plan)
              setLastBuiltName(name)
              setLastBuildPlan(plan)
              source = 'grok'
              setPreviewRevision((n) => n + 1)
              toast.success('Live preview upgraded', {
                description: 'Grok files · fully interactive',
              })
              return { plan, name, source }
            }
          } catch (e) {
            console.warn('Grok upgrade skipped', e)
          }
        }

        toast.success('Live preview ready', {
          description: `${themed.kind} experience · click around on the right`,
        })
        return { plan, name, source }
      } catch (e) {
        console.error(e)
        const fallback = buildWorldClassPreview({
          vision: idea,
          original: idea,
          keyFeatures: ['Core loop'],
          personality,
        })
        setGeneratedFiles(mergeProjectFiles(fallback.files))
        revealLivePreview()
        toast.success('Live preview ready')
        return { plan, name: fallback.name, source: 'local' as const }
      } finally {
        setIsBuilding(false)
      }
    },
    [apiKey, personality, revealLivePreview],
  )

  const sendMessage = useCallback(
    async (text?: string, modeOverride?: Mode) => {
      const content = (text || input).trim()
      if (!content) return
      if (isLoading) {
        toast.message('Still working on the last turn…')
        return
      }

      const fromVoice = voiceTurnRef.current
      voiceTurnRef.current = false

      // Default: stay in plan/discuss. Only build on explicit green-light or Build mode send.
      let activeMode: Mode = modeOverride ?? mode
      if (modeOverride) {
        setMode(modeOverride)
        activeMode = modeOverride
      } else if (wantsBuild(content)) {
        activeMode = 'build'
        setMode('build')
        setPlanReady(true)
      } else if (activeMode === 'build' && !planReady && !wantsBuild(content)) {
        // User is in Build tab but still ideating — keep collaborating
        activeMode = 'discuss'
      }

      setInput('')
      setVoiceInterim('')
      if (voiceActiveRef.current || voiceStatus === 'listening' || voiceStatus === 'prompting') {
        stopVoice()
      }

      const userMsg: ChatMessage = { role: 'user', content, timestamp: Date.now() }
      const nextHistory = [...messages, userMsg]
      setMessages(nextHistory)
      setIsLoading(true)

      try {
        if (activeMode === 'discuss') {
          const history: XaiMessage[] = nextHistory
            .filter((m) => !(m.role === 'assistant' && nextHistory.indexOf(m) === 0))
            .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

          // Voice turns always use voiceMode so replies stay short + speakable
          const result = await discussWithGrok(
            history,
            apiKey || loadKey() || undefined,
            null,
            personality,
            true, // short, spoken, collaborative replies
          )
          const reply = result.content

          if (result.live) {
            setGrokLive(true)
          } else {
            setGrokLive(false)
            if (result.error && (apiKey || loadKey())) {
              toast.message('Not connected to Grok', {
                description:
                  result.error.includes('Incorrect') || result.error.includes('invalid')
                    ? 'Your API key was rejected. Open Settings → paste a fresh key from console.x.ai'
                    : result.error,
                duration: 7000,
                action: {
                  label: 'Settings',
                  onClick: () => setShowSettings(true),
                },
              })
            }
          }

          const assistantMsg: ChatMessage = {
            role: 'assistant',
            content: reply,
            timestamp: Date.now(),
          }
          setMessages((prev) => [...prev, assistantMsg])

          const userCount = nextHistory.filter((m) => m.role === 'user').length
          if (replySignalsPlanReady(reply) || userCount >= 3) {
            setPlanReady(true)
          }

          // Always speak plan replies (especially after mic) — this is the collaboration
          speak(reply, { force: fromVoice || ttsEnabled })
        } else {
          // Build from the full plan, not a single half-sentence
          const buildBrief = compilePlanBrief(nextHistory)
          const built = await materializeApp(buildBrief, nextHistory)
          const planText = sanitizeBuildTalk(built.plan || '')
          const assistantMsg: ChatMessage = {
            role: 'assistant',
            content:
              `Live preview is up for “${built.name || 'your app'}” on the right.\n\n` +
              (planText || 'Click through it, then refine by voice or open Ship when you’re ready.'),
            timestamp: Date.now(),
          }
          setMessages((prev) => [...prev, assistantMsg])
          speak(
            `${built.name || 'Your app'} is live in the preview. Tell me what to change, or open Ship when you're ready.`,
            { force: fromVoice || ttsEnabled },
          )
        }
      } catch (err) {
        if (err instanceof Error && err.message === 'PLAN_LIMIT') {
          // already toasted + pricing opened
        } else {
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content:
                activeMode === 'build'
                  ? 'Something went wrong while building. Try again, or check your xAI key in Settings.'
                  : 'I lost that thread for a second — say that again?',
              timestamp: Date.now(),
            },
          ])
          toast.error(activeMode === 'build' ? 'Build failed' : 'Could not reach the agent')
        }
      }

      setIsLoading(false)
    },
    [
      input,
      isLoading,
      messages,
      mode,
      planReady,
      apiKey,
      personality,
      speak,
      ttsEnabled,
      voiceStatus,
      stopVoice,
      materializeApp,
    ],
  )

  sendMessageRef.current = sendMessage

  const mapGrokState = (s: GrokVoiceState): VoiceStatus => {
    if (s === 'idle') return 'idle'
    if (s === 'connecting') return 'connecting'
    if (s === 'listening') return 'listening'
    if (s === 'thinking') return 'thinking'
    if (s === 'speaking') return 'speaking'
    return 'error'
  }

  /** Real Grok Voice (speech↔speech). Falls back to browser STT only if token fails. */
  const startGrokVoice = useCallback(async () => {
    stopVoice()
    voiceActiveRef.current = true
    setVoiceStatus('connecting')
    setVoiceInterim('')
    setAssistantLiveLine('')
    toast.message('Connecting to Grok Voice…')

    const agent = new GrokVoiceAgent({
      voice: grokVoiceId,
      onStateChange: (s) => {
        if (!voiceActiveRef.current && s !== 'idle') return
        setVoiceStatus(mapGrokState(s))
      },
      onUserTranscript: (text, isFinal) => {
        if (!text.trim()) return
        setVoiceInterim(isFinal ? '' : text)
        if (isFinal) {
          const content = text.trim()
          setMessages((prev) => {
            // Avoid duplicate finals
            const last = prev[prev.length - 1]
            if (last?.role === 'user' && last.content === content) return prev
            return [...prev, { role: 'user', content, timestamp: Date.now() }]
          })
          if (wantsBuild(content)) {
            setPlanReady(true)
            // End voice call then build from full plan
            window.setTimeout(() => {
              stopVoice()
              void sendMessageRef.current('build it', 'build')
            }, 400)
          } else {
            const n =
              messagesRef.current.filter((m) => m.role === 'user').length + 1
            if (n >= 3) setPlanReady(true)
          }
        }
      },
      onAssistantTranscript: (text, isFinal) => {
        if (!text.trim()) return
        setAssistantLiveLine(isFinal ? '' : text)
        if (isFinal) {
          const content = text.trim()
          setMessages((prev) => {
            const last = prev[prev.length - 1]
            if (last?.role === 'assistant' && last.content === content) return prev
            return [...prev, { role: 'assistant', content, timestamp: Date.now() }]
          })
          if (replySignalsPlanReady(content)) setPlanReady(true)
        }
      },
      onError: (err) => {
        console.warn('Grok Voice error:', err)
        toast.error('Grok Voice', { description: err })
        setVoiceStatus('error')
        voiceActiveRef.current = false
        grokAgentRef.current = null
      },
    })

    grokAgentRef.current = agent
    try {
      await agent.connect()
    } catch (e) {
      grokAgentRef.current = null
      voiceActiveRef.current = false
      throw e
    }
    if (agent.getState() === 'error') {
      grokAgentRef.current = null
      voiceActiveRef.current = false
      throw new Error('Grok Voice failed to connect')
    }
    setGrokLive(true)
    setHideSimBanner(true)
    toast.success('Grok Voice live — talk to Grok')
  }, [stopVoice, grokVoiceId])

  /** Browser STT + TTS fallback when realtime voice token unavailable */
  const startBrowserVoice = useCallback(async () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      toast.error('Voice needs Chrome/Edge, or a working Grok Voice server key')
      return
    }

    voiceActiveRef.current = true
    setVoiceStatus('prompting')
    setVoiceInterim('')
    await speakAndWait(
      planReady
        ? "Alright — refine more, or say build it."
        : "Hey. Who's it for, and what do they do every day?",
    )
    if (!voiceActiveRef.current) {
      setVoiceStatus('idle')
      return
    }

    const recognition = new SR()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognitionRef.current = recognition
    setVoiceStatus('listening')

    recognition.onresult = (e: any) => {
      if (!voiceActiveRef.current) return
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      let final = ''
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const piece = e.results[i][0]?.transcript || ''
        if (e.results[i].isFinal) final += piece
        else interim += piece
      }
      if (final) {
        setInput((prev) => (prev + ' ' + final).trim())
        setVoiceInterim('')
      } else setVoiceInterim(interim)
      silenceTimerRef.current = setTimeout(() => {
        if (!voiceActiveRef.current) return
        stopVoice()
        setInput((prev) => {
          const text = prev.trim()
          if (text) {
            voiceTurnRef.current = true
            void sendMessageRef.current(text)
          }
          return ''
        })
      }, 2000)
    }

    recognition.onerror = (e: any) => {
      if (e?.error === 'aborted' || e?.error === 'no-speech') return
      if (e?.error === 'not-allowed') {
        toast.error('Microphone blocked')
        stopVoice()
        setVoiceStatus('error')
      }
    }

    recognition.onend = () => {
      if (!voiceActiveRef.current) {
        setVoiceStatus('idle')
        return
      }
      try {
        recognition.start()
      } catch {
        stopVoice()
      }
    }

    try {
      recognition.start()
    } catch {
      stopVoice()
      toast.error('Could not start microphone')
    }
  }, [speakAndWait, planReady, stopVoice])

  const startVoice = useCallback(async () => {
    // Prefer real Grok Voice whenever server/key can issue a token
    try {
      await startGrokVoice()
      return
    } catch (e: any) {
      console.warn('Grok Voice unavailable, browser fallback:', e)
      toast.message('Grok Voice unavailable', {
        description: 'Falling back to browser mic + speech. Fix server XAI_API_KEY for real Grok Voice.',
      })
      await startBrowserVoice()
    }
  }, [startGrokVoice, startBrowserVoice])

  /** Tap once to start Grok Voice, tap again to hang up */
  const toggleVoice = useCallback(() => {
    const active =
      voiceActiveRef.current ||
      !!grokAgentRef.current ||
      voiceStatus === 'listening' ||
      voiceStatus === 'connecting' ||
      voiceStatus === 'thinking' ||
      voiceStatus === 'speaking' ||
      voiceStatus === 'prompting'
    if (active) stopVoice()
    else void startVoice()
  }, [voiceStatus, stopVoice, startVoice])

  const switchMode = (next: Mode) => {
    if (next === mode) return
    setMode(next)
  }

  const startBuildFromPlan = () => {
    const users = messages.filter((m) => m.role === 'user')
    if (users.length === 0) {
      setMode('discuss')
      toast.message('Plan first', {
        description: 'Tap the mic and shape the idea — then build.',
      })
      return
    }
    setPlanReady(true)
    setMode('build')
    // Explicit green light uses full conversation as brief
    void sendMessage('build it', 'build')
  }

  const lastUserIdea = [...messages].reverse().find((m) => m.role === 'user')?.content || ''

  const sessionTranscript = messages
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n')
    .slice(0, 4000)

  const handleGalleryRemix = useCallback((entry: GalleryEntry) => {
    const ws = remixWorkspace(entry)
    if (!ws) {
      toast.error('Could not remix', { description: 'Gallery entry not found' })
      return
    }
    const h = hydrateFromWorkspace(ws)
    setMessages(h.messages)
    setMode(h.mode)
    setPlanReady(h.planReady)
    setHasBuilt(h.hasBuilt)
    if (Object.keys(h.generatedFiles).length > 0) {
      setGeneratedFiles(mergeProjectFiles(h.generatedFiles))
      setPreviewRevision((n) => n + 1)
    }
    setLastBuiltName(h.lastBuiltName)
    setLastBuildPlan(h.lastBuildPlan)
    setPersonality(h.personality)
    setShowWorkspace(true)
    setWorkspaceTab('preview')
    setMobilePanel('app')
    toast.success(`Remixed “${entry.name}”`, {
      description: 'Loaded into your workspace — refine by voice or ship',
    })
  }, [])

  const handleVisionApply = useCallback(
    async (refinementText: string, imageBase64: string | null) => {
      setIsBuilding(true)
      try {
        const key = apiKey || loadKey() || undefined
        const flat = { ...generatedFiles }

        const vision = imageBase64
          ? await refineFromScreenshot(
              imageBase64,
              {
                appName: lastBuiltName,
                idea: lastUserIdea,
                fileList: Object.keys(generatedFiles),
                appSourcePreview: flat['src/App.tsx'],
                userNote: refinementText,
              },
              key,
            )
          : null

        if (vision?.suggestedFileEdits?.length) {
          const patched = applySuggestedFileEdits(flat, vision.suggestedFileEdits)
          setGeneratedFiles(mergeProjectFiles(patched))
          setPreviewRevision((n) => n + 1)
          toast.success('Preview updated from screenshot')
          return
        }

        const brief = {
          vision: refinementText,
          original: refinementText,
          keyFeatures: ['Match screenshot'],
        }
        const llm = key ? await generateWithLLM(refinementText, brief, key, personality) : null
        if (llm?.files) {
          setGeneratedFiles(mergeProjectFiles(toSandpackFiles(llm.files as GeneratedFiles)))
          setPreviewRevision((n) => n + 1)
          toast.success('Live preview reskinned from screenshot')
        } else {
          toast.message('Refinement noted', { description: refinementText.slice(0, 120) })
        }
      } finally {
        setIsBuilding(false)
      }
    },
    [apiKey, generatedFiles, lastBuiltName, lastUserIdea, personality],
  )

  const getScaffoldFiles = async (prefs: ShipPreferences) => {
    const appName = prefs.appName || lastBuiltName || 'IdeaSpeak App'
    const appSlug = prefs.appSlug || 'ideaspeak-app'
    const idea =
      lastUserIdea ||
      messages
        .filter((m) => m.role === 'user')
        .map((m) => m.content)
        .join(' · ')

    return buildProductionScaffold({
      appName,
      appSlug,
      idea,
      previewFiles: generatedFiles,
      prefs,
    })
  }

  const exportProductionZip = async (prefs?: ShipPreferences) => {
    const gate = canUse('ship')
    if (!gate.ok) {
      toast.error(gate.reason || 'Ship limit reached')
      setShowPricing(true)
      throw new Error('PLAN_LIMIT')
    }

    const appName = prefs?.appName || lastBuiltName || 'IdeaSpeak App'
    const appSlug = prefs?.appSlug || 'ideaspeak-app'
    const idea =
      lastUserIdea ||
      messages
        .filter((m) => m.role === 'user')
        .map((m) => m.content)
        .join(' · ')

    const scaffold = buildProductionScaffold({
      appName,
      appSlug,
      idea,
      previewFiles: generatedFiles,
      prefs: prefs || {
        appName,
        appSlug,
        supabase: { url: '', anonKey: '', projectRef: '' },
        customDomain: '',
        githubRepoUrl: '',
        vercelProjectUrl: '',
        checklist: {},
      },
    })

    const zip = new JSZip()
    Object.entries(scaffold).forEach(([path, content]) => {
      zip.file(path, content)
    })
    const blob = await zip.generateAsync({ type: 'blob' })
    saveAs(blob, `${appSlug}.zip`)
    recordUsage('ship')
    setUsageTick((n) => n + 1)
    toast.success('Production ZIP ready', {
      description: 'Next.js + Supabase + Vercel + multi-model polish packs',
    })
  }

  /** Lightweight preview-only zip (dev sources) */
  const exportPreviewZip = async () => {
    const zip = new JSZip()
    Object.entries(generatedFiles).forEach(([path, content]) => {
      zip.file(path, content)
    })
    zip.file(
      'README.md',
      `# Preview export\n\nUse **Ship** in IdeaSpeak for the full production Next.js package (Supabase, Vercel, domains).\n`,
    )
    const blob = await zip.generateAsync({ type: 'blob' })
    saveAs(blob, 'ideaspeak-preview.zip')
    toast.success('Preview sources downloaded')
  }

  const copyShipSchema = async () => {
    try {
      await navigator.clipboard.writeText(supabaseSchemaSql(lastBuiltName))
      toast.success('Schema SQL copied — paste in Supabase SQL Editor')
    } catch {
      toast.error('Could not copy schema')
    }
  }

  const visibleSandpackFiles = Object.keys(generatedFiles).filter(
    (f) => f.endsWith('.tsx') || f.endsWith('.css') || f.endsWith('.ts') || f === 'package.json',
  )

  return (
    <div className="h-dvh flex flex-col bg-[#0a0a0f] text-[#e8e8f0] overflow-hidden font-sans antialiased">
      <Toaster theme="dark" position="top-center" richColors closeButton />

      {/* ── Header ── */}
      <header className="h-14 shrink-0 border-b border-[#1f1f27] flex items-center justify-between gap-3 px-3 sm:px-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-[#00ff88] flex items-center justify-center shrink-0 shadow-[0_0_20px_rgba(0,255,136,0.25)]">
            <Mic size={15} color="#0a0a0f" strokeWidth={2.5} />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-[15px] tracking-tight leading-none">
              IdeaSpeak<span className="text-[#00ff88]">.dev</span>
            </div>
            <div className="text-[11px] text-[#555] mt-0.5 hidden sm:block truncate">
              {grokLive ? 'Live Grok · plan → build → ship' : 'Plan → build → ship'}
            </div>
          </div>
          <div className="ml-0.5 sm:ml-1 shrink-0">
            <ModeBadge mode={grokMode} compact />
          </div>
          {/* Compact mic status */}
          <div
            className={`hidden lg:inline-flex items-center gap-1.5 ml-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide border ${
              voiceStatus !== 'idle' && voiceStatus !== 'error'
                ? 'bg-[#00ff88]/12 border-[#00ff88]/35 text-[#00ff88]'
                : 'bg-[#14141c] border-[#2a2a35] text-[#555]'
            }`}
            title="Grok Voice call status"
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                voiceStatus !== 'idle' && voiceStatus !== 'error'
                  ? 'bg-[#00ff88] shadow-[0_0_6px_#00ff88] animate-pulse'
                  : 'bg-[#3a3a48]'
              }`}
            />
            {voiceStatus === 'idle' || voiceStatus === 'error'
              ? 'Call off'
              : voiceStatus === 'speaking'
                ? 'Grok'
                : voiceStatus === 'connecting'
                  ? '…'
                  : 'Live'}
          </div>
        </div>

        {/* Desktop mode switch — secondary, not competing with brand */}
        <div className="hidden md:flex items-center bg-[#111116] border border-[#1f1f27] rounded-xl p-1 gap-0.5">
          {(
            [
              { id: 'discuss' as Mode, label: 'Plan', icon: MessageSquare },
              { id: 'build' as Mode, label: 'Build', icon: Wand2 },
            ] as const
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => switchMode(id)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-all ${
                mode === id
                  ? 'bg-[#1a1a22] text-[#e8e8f0] shadow-sm'
                  : 'text-[#555] hover:text-[#999]'
              }`}
            >
              <Icon size={14} className={mode === id ? (id === 'build' ? 'text-[#00ff88]' : '') : ''} />
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Mobile panel switch */}
          <div className="flex md:hidden bg-[#111116] border border-[#1f1f27] rounded-lg p-0.5">
            <button
              onClick={() => setMobilePanel('chat')}
              className={`px-2.5 py-1.5 rounded-md text-[12px] font-medium ${
                mobilePanel === 'chat' ? 'bg-[#1a1a22] text-[#e8e8f0]' : 'text-[#555]'
              }`}
            >
              Chat
            </button>
            <button
              onClick={() => {
                setMobilePanel('app')
                setShowWorkspace(true)
              }}
              className={`px-2.5 py-1.5 rounded-md text-[12px] font-medium ${
                mobilePanel === 'app' ? 'bg-[#1a1a22] text-[#e8e8f0]' : 'text-[#555]'
              }`}
            >
              App
            </button>
          </div>

          <button
            onClick={() => setShowWorkspace((v) => !v)}
            className="hidden md:inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[#1f1f27] text-[13px] text-[#777] hover:text-[#ccc] hover:border-[#333] transition-colors"
          >
            <Eye size={14} />
            {showWorkspace ? 'Focus chat' : 'Show app'}
          </button>

          <button
            onClick={() => setShowGallery(true)}
            className="hidden sm:inline-flex items-center gap-1.5 h-9 px-2.5 rounded-lg border border-[#1f1f27] text-[12px] text-[#888] hover:text-[#00ff88] hover:border-[#00ff88]/35 transition-colors"
            title="Remix gallery"
          >
            <LayoutGrid size={14} />
            Gallery
          </button>

          <button
            onClick={() => setShowPricing(true)}
            className={`hidden sm:inline-flex items-center gap-1.5 h-9 px-2.5 rounded-lg border text-[12px] transition-colors ${
              planId === 'free'
                ? 'border-[#1f1f27] text-[#888] hover:text-[#00ff88] hover:border-[#00ff88]/35'
                : 'border-[#00ff88]/35 bg-[#00ff88]/08 text-[#00ff88]'
            }`}
            title="Plans & usage"
          >
            <Crown size={14} />
            <span className="capitalize">{planId}</span>
            {buildsLeft !== null && (
              <span className="text-[10px] opacity-70 tabular-nums">{buildsLeft} left</span>
            )}
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-[#1f1f27] text-[#777] hover:text-[#ccc] hover:border-[#333] transition-colors"
            aria-label="Settings"
          >
            <Settings size={16} />
          </button>
        </div>
      </header>

      {/* Grok connection banner */}
      {!grokLive && !hideSimBanner && (
        <div className="shrink-0 flex items-center gap-2 px-3 sm:px-4 py-2 bg-[#fa0]/08 border-b border-[#fa0]/15">
          <button
            onClick={() => setShowSettings(true)}
            className="flex-1 text-left text-[12px] text-[#fa0] hover:underline"
          >
            <span className="font-medium">
              {apiKey ? 'Grok key not working' : 'Simulator mode'}
            </span>
            <span className="text-[#fa0]/70">
              {apiKey
                ? ` — ${grokStatusMsg || 'rejected by xAI'}. Paste a new key from console.x.ai →`
                : ' — add a free Grok key in Settings for real co-founder voice →'}
            </span>
          </button>
          <button
            onClick={() => {
              setHideSimBanner(true)
              try {
                sessionStorage.setItem('ideaspeak_hide_sim_banner', '1')
              } catch {
                /* ignore */
              }
            }}
            className="p-1 rounded text-[#fa0]/60 hover:text-[#fa0] hover:bg-[#fa0]/10"
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Body ── */}
      <div
        className={`flex-1 min-h-0 grid overflow-hidden ${
          showWorkspace && !previewFullscreen
            ? 'md:grid-cols-[minmax(320px,400px)_1fr]'
            : 'grid-cols-1'
        }`}
      >
        {/* Chat column */}
        <section
          className={`flex flex-col min-h-0 border-r border-[#1f1f27] ${
            previewFullscreen
              ? 'hidden'
              : mobilePanel === 'app'
                ? 'hidden md:flex'
                : 'flex'
          }`}
        >
          {/* Step cue */}
          <div className="shrink-0 px-4 pt-3 pb-1">
            <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-[#555] flex-wrap">
              {(
                [
                  { n: '1', label: 'Plan', on: mode === 'discuss' && !hasBuilt },
                  { n: '2', label: 'Ready', on: planReady && !hasBuilt },
                  { n: '3', label: 'Preview', on: hasBuilt && !isBuilding },
                  { n: '4', label: 'Ship', on: hasBuilt },
                ] as const
              ).map((s, i, arr) => (
                <span key={s.label} className="inline-flex items-center gap-1.5">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md ${
                      s.on ? 'bg-[#00ff88]/10 text-[#00ff88]' : 'bg-white/5 text-[#666]'
                    }`}
                  >
                    {s.n} · {s.label}
                  </span>
                  {i < arr.length - 1 && <ArrowRight size={10} className="text-[#333]" />}
                </span>
              ))}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-3 space-y-3.5 scroll-smooth">
            {showEmptyHints && (
              <div className="text-center px-2 pt-2 pb-4 space-y-2">
                <h1 className="text-[22px] sm:text-[26px] font-bold tracking-tight text-[#e8e8f0] leading-tight">
                  Speak your app into existence.
                </h1>
                <p className="text-[13px] sm:text-[14px] text-[#666] leading-relaxed max-w-sm mx-auto">
                  Grok plans it with you. You see it live. Ship to Vercel when it&apos;s real.
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <motion.div
                key={`${msg.timestamp}-${i}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
              >
                <div
                  className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[11px] font-semibold ${
                    msg.role === 'user'
                      ? 'bg-[#1a1a22] border border-[#2a2a35] text-[#888]'
                      : 'bg-[#00ff88]/10 border border-[#00ff88]/20 text-[#00ff88]'
                  }`}
                >
                  {msg.role === 'user' ? 'You' : <Sparkles size={12} />}
                </div>
                <div
                  className={`max-w-[85%] px-3.5 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-[#16161e] border border-[#22222c] text-[#e8e8f0] rounded-2xl rounded-tr-md'
                      : 'bg-[#111116] border border-[#1f1f27] text-[#c4c4d4] rounded-2xl rounded-tl-md'
                  }`}
                >
                  {msg.content}
                </div>
              </motion.div>
            ))}

            {isLoading && (
              <div className="flex gap-2.5">
                <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center bg-[#00ff88]/10 border border-[#00ff88]/20">
                  <Sparkles size={12} className="text-[#00ff88]" />
                </div>
                <div className="bg-[#111116] border border-[#1f1f27] rounded-2xl rounded-tl-md px-4 py-3 flex flex-col gap-1.5 min-w-[160px]">
                  <div className="flex gap-1.5 items-center">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-[#555]"
                        style={{ animation: `typing-dot 1.2s ease-in-out ${i * 0.2}s infinite` }}
                      />
                    ))}
                  </div>
                  <span className="text-[11px] text-[#00ff88]/70 font-medium">
                    {mode === 'build' ? 'Building your app…' : 'Thinking…'}
                  </span>
                </div>
              </div>
            )}

            {/* Plan → build gate (only after collaboration) */}
            {!hasBuilt && !isLoading && userTurns >= 1 && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="pt-1 space-y-2"
              >
                {planReady || userTurns >= 2 ? (
                  <button
                    onClick={startBuildFromPlan}
                    className="w-full flex items-center justify-between gap-3 rounded-xl border border-[#00ff88]/35 bg-[#00ff88]/10 hover:bg-[#00ff88]/15 px-4 py-3 transition-colors text-left"
                  >
                    <div>
                      <div className="text-[13px] font-semibold text-[#00ff88]">
                        Build live preview from this plan
                      </div>
                      <div className="text-[11px] text-[#00ff88]/65 mt-0.5">
                        Uses everything you planned together — not a restated one-liner
                      </div>
                    </div>
                    <Wand2 size={18} className="text-[#00ff88] shrink-0" />
                  </button>
                ) : (
                  <div className="rounded-xl border border-[#1f1f27] bg-[#111116] px-3 py-2.5 text-[11px] text-[#666]">
                    Keep planning by voice — when the v1 feels sharp, this becomes a Build button.
                  </div>
                )}
              </motion.div>
            )}

            {/* Post-build next steps — monetization path */}
            {hasBuilt && !isLoading && !isBuilding && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-[#1f1f27] bg-[#111116] p-3 space-y-2"
              >
                <div className="text-[11px] font-semibold text-[#888] uppercase tracking-wider">
                  Next · make it real
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      setShowWorkspace(true)
                      setWorkspaceTab('preview')
                      setMobilePanel('app')
                    }}
                    className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-[#1f1f27] text-[12px] font-semibold text-[#ccc] hover:border-[#00ff88]/35 hover:text-[#00ff88]"
                  >
                    <Eye size={13} /> Preview
                  </button>
                  <button
                    onClick={() => setShowPolish(true)}
                    className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-[#1f1f27] text-[12px] font-semibold text-[#ccc] hover:border-[#00ff88]/35 hover:text-[#00ff88]"
                  >
                    <Wand2 size={13} /> Polish
                  </button>
                  <button
                    onClick={() => setShowShip(true)}
                    className="col-span-2 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-[#00ff88] text-[12px] font-bold text-[#0a0a0f] hover:opacity-90"
                  >
                    <Rocket size={13} /> Ship · Supabase · host · domain
                  </button>
                </div>
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Composer — voice-first */}
          <div className="shrink-0 border-t border-[#1f1f27] bg-[#0c0c12]/95 backdrop-blur-sm p-3 sm:p-4 space-y-3">
            {/* Mobile mode */}
            <div className="flex md:hidden gap-1.5">
              {(
                [
                  { id: 'discuss' as Mode, label: 'Plan', icon: MessageSquare },
                  { id: 'build' as Mode, label: 'Build', icon: Wand2 },
                ] as const
              ).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => switchMode(id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-medium border transition-colors ${
                    mode === id
                      ? 'border-[#00ff88]/35 bg-[#00ff88]/10 text-[#00ff88]'
                      : 'border-[#1f1f27] text-[#666]'
                  }`}
                >
                  <Icon size={13} />
                  {label}
                </button>
              ))}
            </div>

            {showEmptyHints && voiceStatus === 'idle' && (
              <div className="flex flex-wrap gap-1.5 justify-center">
                {DISCUSS_CHIPS.map((q) => (
                  <button
                    key={q}
                    onClick={() => {
                      setMode('discuss')
                      void sendMessage(q)
                    }}
                    className="px-2.5 py-1.5 rounded-lg border border-[#1f1f27] text-[11.5px] text-[#666] hover:border-[#00ff88]/35 hover:text-[#00ff88] transition-colors text-left"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {planReady && !hasBuilt && userTurns > 0 && voiceStatus === 'idle' && (
              <div className="flex flex-wrap gap-1.5 justify-center">
                {BUILD_CHIPS.map((q) => (
                  <button
                    key={q}
                    onClick={() => void sendMessage(q, 'build')}
                    className="px-2.5 py-1.5 rounded-lg border border-[#00ff88]/25 text-[11.5px] text-[#00ff88]/80 hover:border-[#00ff88]/45 hover:text-[#00ff88] transition-colors text-left"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {/* Primary: giant mic — clear ON / OFF visual states */}
            {(() => {
              const isOn =
                voiceStatus === 'listening' ||
                voiceStatus === 'connecting' ||
                voiceStatus === 'thinking' ||
                voiceStatus === 'speaking' ||
                voiceStatus === 'prompting'
              const isErr = voiceStatus === 'error'
              const statusLabel =
                voiceStatus === 'connecting'
                  ? 'Connecting to Grok…'
                  : voiceStatus === 'thinking'
                    ? 'Grok thinking…'
                    : voiceStatus === 'speaking'
                      ? 'Grok speaking'
                      : voiceStatus === 'listening'
                        ? 'Grok Voice · live'
                        : voiceStatus === 'prompting'
                          ? 'Getting ready…'
                          : isErr
                            ? 'Voice error'
                            : 'Grok Voice off'
              const accent =
                voiceStatus === 'speaking' || voiceStatus === 'thinking'
                  ? 'text-[#38bdf8]'
                  : isOn
                    ? 'text-[#00ff88]'
                    : isErr
                      ? 'text-red-400'
                      : 'text-[#c8c8d4]'
              return (
                <div
                  className={`rounded-2xl px-4 py-4 flex flex-col items-center gap-3.5 transition-colors duration-300 border ${
                    isOn
                      ? 'border-[#00ff88]/40 bg-gradient-to-b from-[#00ff88]/14 via-[#00ff88]/05 to-transparent'
                      : isErr
                        ? 'border-red-500/35 bg-red-500/8'
                        : 'border-[#1f1f27] bg-[#0e0e14]'
                  }`}
                >
                  <div
                    className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase border ${
                      isOn
                        ? 'bg-[#00ff88]/15 border-[#00ff88]/40 text-[#00ff88]'
                        : isErr
                          ? 'bg-red-500/15 border-red-500/40 text-red-400'
                          : 'bg-[#14141c] border-[#2a2a35] text-[#666]'
                    }`}
                    role="status"
                    aria-live="polite"
                  >
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        isOn
                          ? 'bg-[#00ff88] shadow-[0_0_8px_#00ff88] animate-pulse'
                          : isErr
                            ? 'bg-red-400'
                            : 'bg-[#3a3a48]'
                      }`}
                    />
                    {statusLabel}
                  </div>

                  {voiceStatus === 'speaking' && assistantLiveLine && (
                    <p className="text-[14px] text-[#38bdf8] text-center leading-relaxed max-w-sm px-2 italic">
                      {assistantLiveLine}
                    </p>
                  )}

                  {voiceStatus === 'listening' && voiceInterim && (
                    <p className="text-[14px] text-[#00ff88] text-center leading-relaxed max-w-sm px-2">
                      {voiceInterim}
                    </p>
                  )}

                  {(voiceStatus === 'listening' || voiceStatus === 'speaking') && (
                    <WaveBars active size="lg" />
                  )}

                  <button
                    type="button"
                    onClick={toggleVoice}
                    disabled={!isSupported || isLoading}
                    aria-pressed={isOn}
                    aria-label={isOn ? 'End Grok Voice call' : 'Start Grok Voice call'}
                    title={isOn ? 'Hang up' : 'Talk to Grok'}
                    className={`relative w-[72px] h-[72px] sm:w-[80px] sm:h-[80px] rounded-full flex items-center justify-center transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 ${
                      isOn
                        ? 'bg-[#00ff88] text-[#0a0a0f] mic-button recording shadow-[0_0_0_10px_rgba(0,255,136,0.18),0_0_48px_rgba(0,255,136,0.4)]'
                        : isSupported
                          ? 'bg-[#16161e] text-[#888] border-2 border-[#2a2a35] hover:border-[#00ff88]/45 hover:text-[#00ff88] hover:bg-[#1a1a24]'
                          : 'bg-[#121218] text-[#444] border-2 border-[#222]'
                    }`}
                  >
                    {isOn && (
                      <span
                        className="absolute inset-[-10px] rounded-full border-2 border-[#00ff88]/35 animate-ping pointer-events-none"
                        style={{ animationDuration: '1.6s' }}
                      />
                    )}
                    {voiceStatus === 'connecting' || voiceStatus === 'thinking' ? (
                      <RefreshCw size={28} className="relative z-10 animate-spin" />
                    ) : isOn ? (
                      <MicOff size={32} strokeWidth={2.25} className="relative z-10" />
                    ) : (
                      <Mic size={32} strokeWidth={2.25} className="relative z-10" />
                    )}
                  </button>

                  <div className="text-center min-h-[40px]">
                    <p className={`text-[15px] font-semibold tracking-tight ${accent}`}>
                      {isOn
                        ? voiceStatus === 'speaking'
                          ? 'Grok is talking — listen'
                          : voiceStatus === 'thinking'
                            ? 'Grok is thinking…'
                            : voiceStatus === 'connecting'
                              ? 'Connecting to Grok Voice…'
                              : 'Your turn — talk naturally'
                        : isErr
                          ? 'Tap to try again'
                          : 'Tap to speak'}
                    </p>
                    <p className={`text-[11px] mt-1 ${isOn ? 'text-[#00ff88]/55' : 'text-[#4a4a58]'}`}>
                      {isOn
                        ? 'Real Grok Voice · speech-to-speech · tap mic to hang up'
                        : grokLive
                          ? 'Realtime Grok Voice (not browser TTS) · say build it when ready'
                          : 'Needs live server key for Grok Voice · Settings / setup:grok'}
                    </p>
                  </div>
                </div>
              )
            })()}

            {/* Secondary: type + send — hide while on a Grok call */}
            {voiceStatus === 'idle' || voiceStatus === 'error' ? (
              <div className="flex items-end gap-2">
                <div className="flex-1 relative">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        void sendMessage()
                      }
                    }}
                    placeholder="Or type here…"
                    rows={1}
                    className="w-full resize-none bg-[#111116] border border-[#1f1f27] focus:border-[#00ff88]/30 rounded-xl px-3.5 py-2.5 pr-9 text-[13px] text-[#e8e8f0] placeholder:text-[#3d3d48] outline-none leading-relaxed min-h-[42px] max-h-[120px] transition-colors"
                  />
                  <span className="absolute right-3 bottom-3 text-[#2e2e38] pointer-events-none">
                    <Keyboard size={13} />
                  </span>
                </div>
                <button
                  onClick={() => void sendMessage()}
                  disabled={!input.trim() || isLoading}
                  className={`w-10 h-10 rounded-xl shrink-0 flex items-center justify-center transition-all ${
                    input.trim() && !isLoading
                      ? 'bg-[#00ff88] text-[#0a0a0f] hover:opacity-90'
                      : 'bg-[#15151c] border border-[#1f1f27] text-[#333]'
                  }`}
                  aria-label="Send"
                >
                  {isLoading ? (
                    <RefreshCw size={15} className="animate-spin" />
                  ) : (
                    <Send size={15} />
                  )}
                </button>
              </div>
            ) : null}

            <p className="text-[10.5px] text-[#3a3a45] text-center px-2">
              {hasBuilt
                ? 'Preview is live · refine by voice or open Ship'
                : planReady
                  ? 'Plan ready · say “build it” or tap the green Build button'
                  : 'Plan mode · voice co-founder · build only when you green-light'}
            </p>
          </div>
        </section>

        {/* Workspace */}
        {(showWorkspace || previewFullscreen) && (
          <section
            className={`flex flex-col min-h-0 min-w-0 bg-[#08080c] ${
              previewFullscreen
                ? 'flex'
                : mobilePanel === 'chat'
                  ? 'hidden md:flex'
                  : 'flex'
            }`}
          >
            <div className="h-12 shrink-0 border-b border-[#1f1f27] flex items-center justify-between px-3 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#111116] border border-[#1f1f27]">
                  {(
                    [
                      { id: 'preview' as WorkspaceTab, label: 'Preview', icon: Eye },
                      { id: 'code' as WorkspaceTab, label: 'Code', icon: Code2 },
                    ] as const
                  ).map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      onClick={() => setWorkspaceTab(id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
                        workspaceTab === id
                          ? 'bg-[#1a1a22] text-[#e8e8f0]'
                          : 'text-[#555] hover:text-[#999]'
                      }`}
                    >
                      <Icon size={13} className={workspaceTab === id ? 'text-[#00ff88]' : ''} />
                      {label}
                    </button>
                  ))}
                </div>
                {hasBuilt && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-[#00ff88]/12 border border-[#00ff88]/35 text-[#00ff88]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] animate-pulse" />
                    Live
                  </span>
                )}
                {hasBuilt && (
                  <button
                    type="button"
                    onClick={() => setShowVision(true)}
                    className="hidden md:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold border border-[#00ff88]/30 bg-[#00ff88]/08 text-[#00ff88] hover:bg-[#00ff88]/12 transition-colors"
                  >
                    {VISION_REFINE_CHIP}
                  </button>
                )}
                {e2bAvailable && hasBuilt && (
                  <div className="hidden lg:flex items-center gap-1 p-0.5 rounded-lg bg-[#111116] border border-[#1f1f27]">
                    {(
                      [
                        { id: 'sandpack' as PreviewEngine, label: 'Instant (Sandpack)' },
                        { id: 'sandbox' as PreviewEngine, label: 'Real (Sandbox)' },
                      ] as const
                    ).map(({ id, label }) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setPreviewEngine(id)}
                        className={`px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
                          previewEngine === id
                            ? 'bg-[#1a1a22] text-[#00ff88]'
                            : 'text-[#555] hover:text-[#999]'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 min-w-0">
                <span className="hidden sm:inline text-[11px] text-[#444] truncate">
                  {isBuilding
                    ? 'Compiling preview…'
                    : sandboxLoading
                      ? sandboxStatus || 'Booting E2B sandbox…'
                      : hasBuilt
                        ? previewEngine === 'sandbox'
                          ? `${Object.keys(generatedFiles).length} files · E2B VM`
                          : `${Object.keys(generatedFiles).length} files · in-browser`
                        : 'Waiting for first build'}
                </span>
                <button
                  type="button"
                  onClick={() => (voicePairOpen ? stopVoicePair() : void startVoicePair())}
                  className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border text-[12px] transition-colors ${
                    voicePairOpen
                      ? 'border-[#00ff88]/40 bg-[#00ff88]/10 text-[#00ff88]'
                      : 'border-[#1f1f27] text-[#777] hover:text-[#ccc] hover:border-[#333]'
                  }`}
                  title="Voice pair build — talk while agent codes"
                >
                  <Mic size={12} />
                  <span className="hidden sm:inline">Pair</span>
                </button>
                <button
                  onClick={() => {
                    const main = generatedFiles['src/App.tsx'] || Object.values(generatedFiles)[0] || ''
                    void navigator.clipboard.writeText(main)
                    toast.success('Copied App.tsx')
                  }}
                  className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border border-[#1f1f27] text-[12px] text-[#777] hover:text-[#ccc] hover:border-[#333] transition-colors"
                >
                  <Copy size={12} />
                  <span className="hidden sm:inline">Copy</span>
                </button>
                <button
                  onClick={() => void exportPreviewZip()}
                  className="hidden sm:inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border border-[#1f1f27] text-[12px] text-[#777] hover:text-[#ccc] hover:border-[#333] transition-colors"
                  title="Preview sources only"
                >
                  <Download size={12} />
                </button>
                <button
                  onClick={() => {
                    setPreviewFullscreen((v) => {
                      const next = !v
                      if (next) {
                        setWorkspaceTab('preview')
                        setShowWorkspace(true)
                        setMobilePanel('app')
                      }
                      return next
                    })
                  }}
                  className={`inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border text-[12px] transition-colors ${
                    previewFullscreen
                      ? 'border-[#00ff88]/40 bg-[#00ff88]/10 text-[#00ff88]'
                      : 'border-[#1f1f27] text-[#777] hover:text-[#ccc] hover:border-[#333]'
                  }`}
                  title={previewFullscreen ? 'Exit full-screen test mode' : 'Full-screen preview test mode'}
                  aria-pressed={previewFullscreen}
                >
                  {previewFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                  <span className="hidden sm:inline">{previewFullscreen ? 'Exit' : 'Test'}</span>
                </button>
                <button
                  onClick={() => setShowVision(true)}
                  disabled={!hasBuilt}
                  className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border border-[#1f1f27] text-[12px] text-[#888] hover:text-[#00ff88] hover:border-[#00ff88]/35 disabled:opacity-40 transition-colors"
                  title="Upload a screenshot — Grok vision matches your live preview"
                >
                  <ScanEye size={13} />
                  <span className="hidden sm:inline">Vision</span>
                </button>
                <button
                  onClick={() => setShowPolish(true)}
                  disabled={!hasBuilt}
                  className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border border-[#1f1f27] text-[12px] text-[#888] hover:text-[#00ff88] hover:border-[#00ff88]/35 disabled:opacity-40 transition-colors"
                  title="Polish with Cursor / Grok / Claude / GPT"
                >
                  <Wand2 size={13} />
                  <span className="hidden sm:inline">Polish</span>
                </button>
                <button
                  onClick={() => setShowCouncil(true)}
                  disabled={!hasBuilt}
                  className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border border-[#1f1f27] text-[12px] text-[#888] hover:text-[#38bdf8] hover:border-[#38bdf8]/35 disabled:opacity-40 transition-colors"
                  title="Council launch review — Grok, Claude, Cursor, GPT"
                >
                  <Users size={13} />
                  <span className="hidden sm:inline">Council</span>
                </button>
                {IN_HOUSE_PLATFORM && (
                  <PlatformReadinessChip
                    appSlug={loadShipPrefs().appSlug}
                    hasBuilt={hasBuilt}
                    onOpenLaunch={() => setShowAutopilot(true)}
                  />
                )}
                <button
                  onClick={() => setShowAutopilot(true)}
                  disabled={!hasBuilt}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-[#7dd3fc]/40 bg-[#7dd3fc]/15 text-[12px] font-bold text-[#7dd3fc] hover:opacity-90 disabled:opacity-40"
                  title="Launch Autopilot — GitHub → Vercel → live URL"
                >
                  <Sparkles size={13} />
                  Launch
                </button>
                <button
                  onClick={() => setShowShip(true)}
                  disabled={!hasBuilt}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-[#00ff88]/40 bg-[#00ff88] text-[12px] font-bold text-[#0a0a0f] hover:opacity-90 disabled:opacity-40 transition-opacity"
                >
                  <Rocket size={13} />
                  Ship
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 relative bg-[#06060a]">
              {voicePairOpen && (
                <div className="absolute bottom-3 left-3 right-3 z-30 sm:left-auto sm:right-3 sm:max-w-[340px] pointer-events-auto">
                  <VoicePairPanel
                    active={voicePairOpen}
                    voiceStatus={voicePairStatus}
                    narration={voicePairNarration}
                    filePatches={voicePairPatches}
                    agentPaused={voicePairAgentPaused}
                    onBargeIn={() => {
                      voicePairRef.current?.bargeIn()
                      setVoicePairAgentPaused(true)
                    }}
                    onPauseAgent={() => {
                      voicePairRef.current?.pauseAgent()
                      setVoicePairAgentPaused(true)
                    }}
                    onResumeAgent={() => {
                      voicePairRef.current?.resumeAgent()
                      setVoicePairAgentPaused(false)
                    }}
                    onClose={stopVoicePair}
                  />
                </div>
              )}
              {isBuilding && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#08080c]/90 backdrop-blur-md">
                  <div className="w-10 h-10 rounded-full border-2 border-[#00ff88] border-t-transparent animate-spin" />
                  <p className="text-[14px] font-semibold text-[#00ff88]">Compiling live preview…</p>
                  <p className="text-[11px] text-[#555]">Interactive app · runs in-browser</p>
                </div>
              )}
              {sandboxLoading && previewEngine === 'sandbox' && !isBuilding && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#08080c]/90 backdrop-blur-md">
                  <div className="w-10 h-10 rounded-full border-2 border-[#00ff88] border-t-transparent animate-spin" />
                  <p className="text-[14px] font-semibold text-[#00ff88]">Booting real sandbox…</p>
                  <p className="text-[11px] text-[#555] max-w-xs text-center">
                    {sandboxStatus || 'npm install · Vite dev server on E2B'}
                  </p>
                </div>
              )}
              {previewFlash && !isBuilding && !sandboxLoading && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-full bg-[#00ff88] text-[#0a0a0f] text-[12px] font-bold shadow-lg shadow-[#00ff88]/30 pointer-events-none">
                  Live · interactive
                </div>
              )}

              {previewEngine === 'sandbox' && hasBuilt ? (
                sandboxPreviewUrl ? (
                  <iframe
                    key={sandboxPreviewUrl}
                    src={sandboxPreviewUrl}
                    title="E2B sandbox preview"
                    className="w-full h-full border-0 bg-[#0a0a0f]"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                  />
                ) : (
                  !sandboxLoading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
                      <p className="text-[14px] font-semibold text-[#e8e8f0]">Sandbox preview unavailable</p>
                      <p className="text-[12px] text-[#666] max-w-sm">
                        {sandboxStatus || 'Set E2B_API_KEY on the server and try again.'}
                      </p>
                    </div>
                  )
                )
              ) : (
                <Suspense fallback={<SandpackLoadingFallback />}>
                  <SandpackWorkspace
                    previewRevision={previewRevision}
                    workspaceTab={workspaceTab}
                    hasBuilt={hasBuilt}
                    generatedFiles={generatedFiles}
                    visibleSandpackFiles={visibleSandpackFiles}
                    appTsxLength={(generatedFiles['src/App.tsx'] || '').length}
                  />
                </Suspense>
              )}
            </div>
          </section>
        )}
      </div>

      <SettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        personality={personality}
        setPersonality={setPersonality}
        ttsEnabled={ttsEnabled}
        setTtsEnabled={setTtsEnabled}
        onKeySaved={(hasKey) => {
          const k = loadKey()
          setApiKey(k)
          void verifyXaiKey(k || undefined).then((r) => {
            setGrokLive(r.status === 'live')
            setGrokStatusMsg(r.message || '')
            if (r.status === 'live') {
              toast.success('Grok connected — real co-founder voice')
              setHideSimBanner(true)
            } else if (hasKey) {
              toast.error('Key saved but Grok still not live', {
                description: r.message || 'Check the key at console.x.ai',
              })
            }
          })
        }}
      />

      <ShipPanel
        open={showShip}
        onClose={() => setShowShip(false)}
        hasBuilt={hasBuilt}
        defaultAppName={lastBuiltName}
        onDownloadZip={exportProductionZip}
        onCopySchema={() => void copyShipSchema()}
      />

      <PolishPanel
        open={showPolish}
        onClose={() => setShowPolish(false)}
        ctx={{
          appName: lastBuiltName,
          idea: lastUserIdea,
          plan: lastBuildPlan,
          fileList: Object.keys(generatedFiles),
        }}
        onUpgrade={() => {
          setShowPolish(false)
          setShowPricing(true)
        }}
      />

      <GalleryPanel
        open={showGallery}
        onClose={() => setShowGallery(false)}
        onRemix={handleGalleryRemix}
      />

      <VisionRefinePanel
        open={showVision}
        onClose={() => setShowVision(false)}
        hasBuilt={hasBuilt}
        appName={lastBuiltName}
        idea={lastUserIdea}
        fileList={Object.keys(generatedFiles)}
        appSourcePreview={generatedFiles['src/App.tsx']}
        apiKey={apiKey || loadKey() || undefined}
        onApply={handleVisionApply}
      />

      <CouncilPanel
        open={showCouncil}
        onClose={() => setShowCouncil(false)}
        context={{
          appName: lastBuiltName,
          files: generatedFiles,
          transcript: sessionTranscript || lastUserIdea,
          shipPrefs: loadShipPrefs(),
        }}
        onUpgrade={() => {
          setShowCouncil(false)
          setShowPricing(true)
        }}
        onApplyFix={(action) => {
          void sendMessage(`Council fix: ${action}`, 'discuss')
        }}
      />

      <LaunchAutopilotPanel
        open={showAutopilot}
        onClose={() => setShowAutopilot(false)}
        hasBuilt={hasBuilt}
        defaultAppName={lastBuiltName}
        getScaffoldFiles={getScaffoldFiles}
      />

      <PricingPanel
        open={showPricing}
        onClose={() => setShowPricing(false)}
        onPlanChange={(id) => setPlanIdState(id)}
      />

      <style>{`
        @keyframes wave-bar-md {
          0%, 100% { height: 4px; opacity: .4; }
          50% { height: 18px; opacity: 1; }
        }
        @keyframes wave-bar-lg {
          0%, 100% { height: 8px; opacity: .4; }
          50% { height: 28px; opacity: 1; }
        }
        @keyframes typing-dot {
          0%, 60%, 100% { transform: translateY(0); opacity: .35; }
          30% { transform: translateY(-5px); opacity: 1; }
        }
        .sp-wrapper, .sp-layout { height: 100% !important; }
        .sp-preview-container, .sp-preview-iframe { height: 100% !important; }
      `}</style>
    </div>
  )
}
