/** Remix Gallery — featured public builds users can preview and fork into their workspace */

import {
  upsertWorkspace,
  setActiveWorkspaceId,
  type SavedWorkspace,
  type ConversationMessage,
  type BuildScaffoldPlan,
  type CurrentProject,
  type ProjectFile,
} from './projects'
import { buildWorldClassPreview, type PreviewFiles } from './preview-scaffold'

export interface GalleryEntry {
  id: string
  name: string
  summary: string
  transcriptExcerpt: string
  isPublic: boolean
  previewThumb?: string
  createdAt: string
}

interface GalleryStoreEntry extends GalleryEntry {
  featured: boolean
  workspace: SavedWorkspace
}

const GALLERY_KEY = 'ideaspeak_gallery'

function previewFilesToProject(files: PreviewFiles): ProjectFile {
  const out: ProjectFile = {}
  for (const [path, code] of Object.entries(files)) {
    out[path] = { code }
  }
  return out
}

function toPublicEntry(row: GalleryStoreEntry): GalleryEntry {
  const { featured: _f, workspace: _w, ...entry } = row
  return entry
}

function readAll(): GalleryStoreEntry[] {
  try {
    const raw = localStorage.getItem(GALLERY_KEY)
    if (!raw) return seedGalleryIfEmpty()
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : seedGalleryIfEmpty()
  } catch {
    return seedGalleryIfEmpty()
  }
}

function writeAll(entries: GalleryStoreEntry[]) {
  localStorage.setItem(GALLERY_KEY, JSON.stringify(entries))
}

function makeConversation(lines: { role: 'user' | 'assistant'; content: string }[]): ConversationMessage[] {
  return lines.map((line, i) => ({
    id: `gal-msg-${i}`,
    role: line.role,
    content: line.content,
  }))
}

function makeBuildPlan(opts: {
  id: string
  name: string
  oneLiner: string
  vision: string
  targetUser: string
  coreLoop: string
  wowMoment: string
  v1Features: string[]
}): BuildScaffoldPlan {
  const now = new Date().toISOString()
  return {
    id: opts.id,
    status: 'built',
    name: opts.name,
    oneLiner: opts.oneLiner,
    vision: opts.vision,
    targetUser: opts.targetUser,
    coreLoop: opts.coreLoop,
    wowMoment: opts.wowMoment,
    v1Features: opts.v1Features,
    v2Deferred: ['Team accounts', 'Native mobile', 'Integrations marketplace'],
    techStack: ['React', 'Supabase', 'Vercel'],
    risks: ['Voice latency on slow networks', 'Habit fatigue after week two'],
    buildOrder: ['Core loop UI', 'Voice capture', 'Persistence', 'Polish pass'],
    agents: [
      { id: 'grok', name: 'Grok', emoji: '🤖', contribution: 'Product vision & ruthless v1 scope' },
      { id: 'coach', name: 'Coach', emoji: '🏆', contribution: 'Retention hooks & daily ritual' },
    ],
    fileScaffold: [
      { path: 'src/App.tsx', purpose: 'Primary interactive experience' },
      { path: 'src/index.css', purpose: 'Premium dark theme tokens' },
    ],
    brief: { vision: opts.vision, targetUser: opts.targetUser },
    optimizedPrompt: opts.oneLiner,
    createdAt: now,
  }
}

function makeDemoWorkspace(opts: {
  id: string
  name: string
  summary: string
  transcript: string
  transcriptExcerpt: string
  vision: string
  original: string
  keyFeatures: string[]
  conversation: { role: 'user' | 'assistant'; content: string }[]
  thumb: string
  createdAt: string
}): GalleryStoreEntry {
  const preview = buildWorldClassPreview({
    vision: opts.vision,
    original: opts.original,
    keyFeatures: opts.keyFeatures,
    personality: 'grok',
  })

  const buildPlan = makeBuildPlan({
    id: `plan-${opts.id}`,
    name: preview.name,
    oneLiner: opts.summary,
    vision: opts.vision,
    targetUser: opts.conversation[0]?.content.slice(0, 80) || 'Founders',
    coreLoop: opts.keyFeatures[0] || 'Daily ritual',
    wowMoment: opts.keyFeatures[1] || 'Instant feedback',
    v1Features: opts.keyFeatures,
  })

  const currentProject: CurrentProject = {
    id: `proj-${opts.id}`,
    name: preview.name,
    brief: { vision: opts.vision, keyFeatures: opts.keyFeatures },
    optimizedPrompt: opts.summary,
    files: previewFilesToProject(preview.files),
    transcript: opts.transcript,
  }

  const workspace: SavedWorkspace = {
    id: `gallery-src-${opts.id}`,
    name: preview.name,
    summary: opts.summary,
    status: 'built',
    mode: 'build',
    createdAt: opts.createdAt,
    updatedAt: opts.createdAt,
    conversation: makeConversation(opts.conversation),
    transcript: opts.transcript,
    buildPlan,
    currentProject,
    selectedPersonality: 'grok',
    proactiveSuggestions: [
      'Add streak recovery for missed days',
      'Ship a shareable progress card',
    ],
  }

  return {
    id: opts.id,
    name: preview.name,
    summary: opts.summary,
    transcriptExcerpt: opts.transcriptExcerpt,
    isPublic: true,
    previewThumb: opts.thumb,
    createdAt: opts.createdAt,
    featured: true,
    workspace,
  }
}

const DEMO_ENTRIES: GalleryStoreEntry[] = [
  makeDemoWorkspace({
    id: 'gal-habit-coach',
    name: 'ShipToday',
    summary: 'A habit tracker that texts like a coach — streaks, daily ship log, zero guilt.',
    transcriptExcerpt:
      'I want something that feels like texting a coach, not another checkbox app. When I miss a day it should nudge me, not shame me.',
    vision: 'Habit tracker that feels like texting a coach',
    original: 'A habit tracker that feels like texting a coach',
    keyFeatures: ['Daily streak ritual', 'Coach-style nudges', 'Ship log', 'Recovery mode'],
    thumb: 'linear-gradient(135deg, #00ff88 0%, #0a3d2e 100%)',
    createdAt: '2026-06-12T14:30:00.000Z',
    transcript: [
      'User: I want a habit tracker that feels like texting a coach, not another checkbox app.',
      'Grok: Who is it for — solo founders, creatives, or anyone building in public?',
      'User: Solo founders shipping side projects. I miss days and guilt-spiral.',
      'Grok: Core loop: one daily ship + streak. Miss a day → recovery nudge, not shame. Say build when locked.',
      'User: build it',
    ].join('\n'),
    conversation: [
      {
        role: 'user',
        content: 'I want a habit tracker that feels like texting a coach, not another checkbox app.',
      },
      {
        role: 'assistant',
        content:
          "Love it — who's the daily user? Solo founders shipping in public, or anyone with a streak addiction?",
      },
      {
        role: 'user',
        content: 'Solo founders. When I miss a day I guilt-spiral and quit the whole app.',
      },
      {
        role: 'assistant',
        content:
          'Core loop: one daily ship + streak bar. Miss a day → recovery nudge, not shame. v1 is streak, ship log, coach tone. Say build when it feels sharp.',
      },
      { role: 'user', content: 'build it' },
      {
        role: 'assistant',
        content: 'Live preview is up — tap through the streak ritual and ship log on the right.',
      },
    ],
  }),
  makeDemoWorkspace({
    id: 'gal-freelancer-crm',
    name: 'Loopline',
    summary: 'CRM for freelancers who hate CRMs — clients, timelines, and voice updates in one lane.',
    transcriptExcerpt:
      'Every CRM feels like enterprise software. I just need clients, open loops, and a timeline I can update by voice between calls.',
    vision: 'CRM for freelancers who hate CRMs',
    original: 'CRM for freelancers who hate CRMs',
    keyFeatures: ['Client lanes', 'Open loops', 'Voice status updates', 'Timeline view'],
    thumb: 'linear-gradient(135deg, #38bdf8 0%, #1e3a5f 100%)',
    createdAt: '2026-06-18T09:15:00.000Z',
    transcript: [
      'User: CRM for freelancers who hate CRMs — lightweight, not Salesforce cosplay.',
      'Grok: What do they do every day — chase invoices, status updates, or scope creep?',
      'User: Status updates between calls. I forget what I promised each client.',
      'Grok: v1: client cards, open loops, timeline, voice note → structured update. Build when ready.',
      'User: build it',
    ].join('\n'),
    conversation: [
      {
        role: 'user',
        content: 'CRM for freelancers who hate CRMs — I refuse another enterprise monster.',
      },
      {
        role: 'assistant',
        content: 'What hurts most — forgetting promises, chasing invoices, or scope creep on threads?',
      },
      {
        role: 'user',
        content: 'Status updates between calls. I lose track of what I told each client.',
      },
      {
        role: 'assistant',
        content:
          'v1: client lanes, open loops, timeline, voice note → structured update. No pipeline stages theater. Say build when locked.',
      },
      { role: 'user', content: 'build it' },
      {
        role: 'assistant',
        content: 'Loopline preview is live — click client cards and try a voice status update.',
      },
    ],
  }),
  makeDemoWorkspace({
    id: 'gal-voice-roadmap',
    name: 'RantMap',
    summary: 'Voice notes that become a roadmap — rant, Grok structures epics and next actions.',
    transcriptExcerpt:
      'I brain-dump on walks. I need voice memos that turn into a roadmap with epics and what to build this week.',
    vision: 'Voice notes that become a roadmap',
    original: 'Voice notes that become a roadmap',
    keyFeatures: ['Voice rant capture', 'Epic extraction', 'This-week slice', 'Shareable roadmap'],
    thumb: 'linear-gradient(135deg, #a78bfa 0%, #3b2d5c 100%)',
    createdAt: '2026-07-02T16:45:00.000Z',
    transcript: [
      'User: Voice notes that become a roadmap — I rant on walks and lose the structure.',
      'Grok: Output format — kanban, timeline, or founder one-pager?',
      'User: Epics plus a ruthless this-week slice. I need to ship, not document.',
      'Grok: v1: record rant → epics → weekly build list. Share link read-only. Build?',
      'User: build it',
    ].join('\n'),
    conversation: [
      {
        role: 'user',
        content: 'Voice notes that become a roadmap. I rant on walks and lose all structure.',
      },
      {
        role: 'assistant',
        content: 'When the rant ends — kanban board, timeline, or a single founder one-pager?',
      },
      {
        role: 'user',
        content: 'Epics plus a ruthless this-week slice. I need to ship, not document forever.',
      },
      {
        role: 'assistant',
        content:
          'v1: voice rant → extracted epics → weekly build list. Shareable read-only link later. Say build when ready.',
      },
      { role: 'user', content: 'build it' },
      {
        role: 'assistant',
        content: 'RantMap is live — record a rant and watch epics populate on the right.',
      },
    ],
  }),
]

function seedGalleryIfEmpty(): GalleryStoreEntry[] {
  writeAll(DEMO_ENTRIES)
  return DEMO_ENTRIES
}

/** Featured public gallery entries (demo-seeded on first visit). */
export function listFeaturedGallery(): GalleryEntry[] {
  return readAll()
    .filter((e) => e.featured && e.isPublic)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map(toPublicEntry)
}

/** All public entries (featured + community when added). */
export function listPublicGallery(): GalleryEntry[] {
  return readAll()
    .filter((e) => e.isPublic)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map(toPublicEntry)
}

export function getGalleryEntry(id: string): GalleryEntry | null {
  const row = readAll().find((e) => e.id === id)
  return row ? toPublicEntry(row) : null
}

/** Copy a gallery workspace into the user's project suite as a new SavedWorkspace. */
export function remixWorkspace(entry: GalleryEntry | string): SavedWorkspace | null {
  const id = typeof entry === 'string' ? entry : entry.id
  const row = readAll().find((e) => e.id === id)
  if (!row) return null

  const now = new Date().toISOString()
  const src = row.workspace
  const copy: SavedWorkspace = {
    ...JSON.parse(JSON.stringify(src)),
    id: `ws-${Date.now().toString(36)}`,
    name: `${src.name} (remix)`,
    createdAt: now,
    updatedAt: now,
    conversation: src.conversation.map((m, i) => ({
      ...m,
      id: `remix-${Date.now().toString(36)}-${i}`,
    })),
    currentProject: src.currentProject
      ? {
          ...src.currentProject,
          id: `proj-remix-${Date.now().toString(36)}`,
        }
      : null,
    buildPlan: src.buildPlan
      ? {
          ...src.buildPlan,
          id: `plan-remix-${Date.now().toString(36)}`,
          status: 'built',
        }
      : null,
  }

  const saved = upsertWorkspace(copy)
  setActiveWorkspaceId(saved.id)
  return saved
}

/** Publish a workspace snapshot to the gallery (local stub for future cloud sync). */
export function publishToGallery(
  workspace: SavedWorkspace,
  opts?: { featured?: boolean; previewThumb?: string },
): GalleryEntry {
  const excerpt =
    workspace.transcript?.slice(0, 160) ||
    workspace.conversation.find((m) => m.role === 'user')?.content.slice(0, 160) ||
    workspace.summary

  const entry: GalleryStoreEntry = {
    id: `gal-${workspace.id}`,
    name: workspace.name,
    summary: workspace.summary,
    transcriptExcerpt: excerpt + (excerpt.length >= 160 ? '…' : ''),
    isPublic: true,
    previewThumb: opts?.previewThumb,
    createdAt: workspace.createdAt,
    featured: opts?.featured ?? false,
    workspace: JSON.parse(JSON.stringify(workspace)),
  }

  const all = readAll().filter((e) => e.id !== entry.id)
  all.unshift(entry)
  writeAll(all)
  return toPublicEntry(entry)
}