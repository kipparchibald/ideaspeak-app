/**
 * Shared build context — native IdeaSpeak builder resolves the same project
 * snapshot from workspace state for preview, refine, and export.
 *
 * Preview scaffolds use ONLY React + inline styles so Sandpack never blanks
 * on missing Tailwind/lucide/framer loads.
 */

import type {
  BuildScaffoldPlan,
  ConversationMessage,
  CurrentProject,
  ProjectFile,
} from './projects'
import { buildWorldClassPreview, sanitizePreviewFiles } from './preview-scaffold'
import { buildProductionScaffold, EXPORT_SCAFFOLD_CHECKLIST } from './ship'

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

  if (lower.includes('habit') || lower.includes('streak')) {
    vision = 'Habit tracker with streaks that feels like texting a coach.'
    keyFeatures = ['Daily check-in', 'Streaks', 'Dark premium UI', 'Simple list']
  } else if (lower.includes('roadmap') || lower.includes('founder') || lower.includes('task')) {
    vision =
      'Voice-powered roadmap and task generator that turns messy spoken strategy into clear, prioritized plans.'
    keyFeatures = [
      'Voice capture',
      'AI roadmap extraction',
      'Prioritized tasks',
      'Beautiful list UI',
    ]
  } else if (lower.includes('client') || lower.includes('portal') || lower.includes('crm')) {
    vision = 'Lightweight CRM / client portal with clean cards and quick capture.'
    keyFeatures = ['Add clients', 'Notes', 'Status chips', 'Search']
  } else if (lower.includes('marketplace') || lower.includes('book') || lower.includes('consult')) {
    vision = 'Premium booking marketplace for sessions with experts.'
    keyFeatures = ['Expert cards', 'Book CTA', 'Prices', 'Voice goal']
  } else if (cleaned.length > 8) {
    vision = cleaned.slice(0, 120)
    keyFeatures = ['Core loop', 'Clean UI', 'Fast capture', 'Ship-ready layout']
  }

  const optimizedPrompt = `Build a production-grade native web app: ${vision}\n\nMust ship: ${keyFeatures.join(', ')}\n\nDesign system sacred. Follow IdeaSpeak xAI agent prompt exactly.`

  return {
    brief: { vision, keyFeatures, original: cleaned, tech: 'React + inline styles' },
    optimizedPrompt,
  }
}

/**
 * Sandpack-safe scaffold — world-class themed previews (habit / client / voice / generic).
 */
export function generateNativeProject(
  brief: Record<string, unknown>,
  personality = 'grok',
): { files: ProjectFile; name: string } {
  const features = Array.isArray(brief.keyFeatures)
    ? (brief.keyFeatures as string[]).map(String)
    : undefined
  const { files: flat, name } = buildWorldClassPreview({
    vision: String(brief.vision || brief.original || 'Your app'),
    original: String(brief.original || brief.vision || ''),
    keyFeatures: features,
    personality,
  })
  const files: ProjectFile = {}
  for (const [path, code] of Object.entries(flat)) {
    files[path] = { code }
  }
  return { files, name }
}

/** Flatten Sandpack / ProjectFile maps to plain strings for ZIP export */
export function projectFilesToFlat(
  files: ProjectFile | Record<string, string>,
): Record<string, string> {
  const flat: Record<string, string> = {}
  for (const [path, value] of Object.entries(files)) {
    flat[path] =
      typeof value === 'string' ? value : String((value as { code?: string })?.code ?? '')
  }
  return flat
}

/**
 * Normalize preview sources before production export — fills missing entry files
 * and strips Next-only imports that break Sandpack.
 */
export function prepareExportPreviewFiles(
  files: ProjectFile | Record<string, string>,
  fallback?: { vision?: string; original?: string; keyFeatures?: string[] },
): Record<string, string> {
  const flat = projectFilesToFlat(files)
  return sanitizePreviewFiles(flat, fallback ?? {})
}

/** Build the full production ZIP file map from workspace context */
export function buildExportScaffoldFromContext(
  ctx: WorkspaceBuildContext,
  prefs: {
    appName: string
    appSlug: string
    supabase?: { url: string; anonKey: string; projectRef: string }
    customDomain?: string
    githubRepoUrl?: string
    vercelProjectUrl?: string
    checklist?: Record<string, boolean>
  },
): Record<string, string> | null {
  const project = resolveExportProject(ctx)
  if (!project) return null

  const previewFiles = prepareExportPreviewFiles(project.files, {
    vision: String(project.brief?.vision || project.transcript || ''),
    original: String(project.brief?.original || project.transcript || ''),
    keyFeatures: Array.isArray(project.brief?.keyFeatures)
      ? (project.brief.keyFeatures as string[])
      : undefined,
  })

  return buildProductionScaffold({
    appName: prefs.appName || project.name,
    appSlug: prefs.appSlug,
    idea: project.transcript || String(project.brief?.vision || ''),
    previewFiles,
    prefs: {
      appName: prefs.appName || project.name,
      appSlug: prefs.appSlug,
      supabase: prefs.supabase ?? { url: '', anonKey: '', projectRef: '' },
      customDomain: prefs.customDomain ?? '',
      githubRepoUrl: prefs.githubRepoUrl ?? '',
      vercelProjectUrl: prefs.vercelProjectUrl ?? '',
      checklist: prefs.checklist ?? {},
    },
  })
}

/** Quick validation — returns missing required scaffold paths */
export function validateExportScaffold(files: Record<string, string>): string[] {
  return EXPORT_SCAFFOLD_CHECKLIST.filter((path) => !files[path]?.trim())
}

export function resolveExportProject(ctx: WorkspaceBuildContext): CurrentProject | null {
  if (ctx.currentProject) return ctx.currentProject

  const transcript = conversationTranscript(ctx)
  if (!ctx.buildPlan && !transcript) return null

  if (ctx.buildPlan) {
    const { files, name } = generateNativeProject(
      ctx.buildPlan.brief,
      ctx.selectedPersonality,
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
