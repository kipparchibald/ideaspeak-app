/**
 * Screenshot → Living UI
 * Upload a reference image, analyze via Grok vision (/api/discuss),
 * optionally elevate with /api/refine, return brief + suggested file edits.
 */

import { discussWithGrok, type XaiMessage } from './xai'

/** Proactive chip copy — surface after first build */
export const VISION_REFINE_CHIP = 'Match this screenshot'

export const VISION_IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif'
export const VISION_IMAGE_MAX_BYTES = 4 * 1024 * 1024 // 4 MB

export interface SuggestedFileEdit {
  path: string
  summary: string
  /** Full file replacement when the model returns complete content */
  content?: string
  /** Partial search/replace hunks */
  patches?: { find: string; replace: string }[]
}

export interface RefinementBrief {
  vision?: string
  designNotes?: string
  layout?: string
  colors?: string
  typography?: string
  spacing?: string
  interactions?: string
  keyChanges?: string[]
  users?: string
  keyFeatures?: string[]
}

export interface VisionRefineContext {
  appName?: string
  idea?: string
  userNote?: string
  fileList?: string[]
  /** Snippet of current App.tsx for targeted edits */
  appSourcePreview?: string
}

export interface VisionRefineResult {
  refinementText: string
  refinementBrief: RefinementBrief
  suggestedFileEdits: SuggestedFileEdit[]
  /** Raw model output (debug / copy) */
  rawContent?: string
  live: boolean
  error?: string
}

export interface ReadImageResult {
  dataUrl: string
  mime: string
  width?: number
  height?: number
}

function apiBase(path: string): string {
  if (typeof window !== 'undefined') return path
  const base = process.env.IDEASPEAK_API || 'http://localhost:3001'
  return `${base.replace(/\/$/, '')}${path}`
}

/** Parse JSON object from LLM output (handles markdown fences) */
export function parseVisionJson(content: string): Record<string, unknown> | null {
  if (!content) return null
  let text = content.trim()
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) text = fence[1].trim()
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    return JSON.parse(m[0]) as Record<string, unknown>
  } catch {
    return null
  }
}

export function validateVisionImage(file: File): string | null {
  if (!file.type.startsWith('image/')) return 'Upload a PNG, JPEG, WebP, or GIF screenshot.'
  if (file.size > VISION_IMAGE_MAX_BYTES) {
    return `Image must be under ${Math.round(VISION_IMAGE_MAX_BYTES / (1024 * 1024))} MB.`
  }
  return null
}

/** Read a File as a base64 data URL suitable for xAI vision */
export function readImageAsDataUrl(file: File): Promise<ReadImageResult> {
  return new Promise((resolve, reject) => {
    const err = validateVisionImage(file)
    if (err) {
      reject(new Error(err))
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result || '')
      if (!dataUrl.startsWith('data:image/')) {
        reject(new Error('Could not read image.'))
        return
      }

      const img = new Image()
      img.onload = () => {
        resolve({
          dataUrl,
          mime: file.type,
          width: img.naturalWidth,
          height: img.naturalHeight,
        })
      }
      img.onerror = () => resolve({ dataUrl, mime: file.type })
      img.src = dataUrl
    }
    reader.onerror = () => reject(new Error('Failed to read file.'))
    reader.readAsDataURL(file)
  })
}

function buildVisionUserPrompt(ctx: VisionRefineContext): string {
  const files =
    ctx.fileList?.slice(0, 20).join(', ') || 'src/App.tsx, src/index.tsx, package.json'
  const preview = ctx.appSourcePreview
    ? `\nCurrent App.tsx excerpt:\n\`\`\`tsx\n${ctx.appSourcePreview.slice(0, 2400)}\n\`\`\``
    : ''

  return `You are the IdeaSpeak Vision Refiner. The user uploaded a UI screenshot they want the live preview to match.

App: ${ctx.appName || 'IdeaSpeak preview'}
Original idea: ${ctx.idea || '(from session)'}
Known files: ${files}
${ctx.userNote ? `User note: ${ctx.userNote}` : ''}
${preview}

Study the screenshot. Output ONLY valid JSON (no markdown outside the object):
{
  "refinementBrief": {
    "vision": "one-line product vision aligned to screenshot",
    "designNotes": "what you see — layout, hierarchy, mood",
    "layout": "grid/flex structure, nav placement, hero",
    "colors": "background, surface, accent, text",
    "typography": "scale, weights, font feel",
    "spacing": "padding rhythm, density",
    "interactions": "buttons, hover, motion hints",
    "keyChanges": ["concrete UI changes to match screenshot"]
  },
  "suggestedFileEdits": [
    {
      "path": "src/App.tsx",
      "summary": "what to change",
      "patches": [{ "find": "old snippet", "replace": "new snippet" }]
    }
  ],
  "refinementText": "2-4 sentences the builder will apply — specific, actionable, no fluff"
}

Rules:
- Match the screenshot's layout, colors, typography, and component shapes as closely as practical.
- Prefer editing src/App.tsx and inline styles (Sandpack-safe).
- suggestedFileEdits must reference real paths from the file list.
- refinementText is what we pass to the build/refine pipeline.`
}

function normalizeBrief(raw: unknown): RefinementBrief {
  if (!raw || typeof raw !== 'object') return {}
  const b = raw as Record<string, unknown>
  const keyChanges = Array.isArray(b.keyChanges)
    ? b.keyChanges.map(String).filter(Boolean)
    : undefined
  const keyFeatures = Array.isArray(b.keyFeatures)
    ? b.keyFeatures.map(String).filter(Boolean)
    : undefined
  return {
    vision: b.vision != null ? String(b.vision) : undefined,
    designNotes: b.designNotes != null ? String(b.designNotes) : undefined,
    layout: b.layout != null ? String(b.layout) : undefined,
    colors: b.colors != null ? String(b.colors) : undefined,
    typography: b.typography != null ? String(b.typography) : undefined,
    spacing: b.spacing != null ? String(b.spacing) : undefined,
    interactions: b.interactions != null ? String(b.interactions) : undefined,
    keyChanges,
    users: b.users != null ? String(b.users) : undefined,
    keyFeatures,
  }
}

function normalizeFileEdits(raw: unknown): SuggestedFileEdit[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const e = item as Record<string, unknown>
      const path = String(e.path || '').trim()
      if (!path) return null
      const patches = Array.isArray(e.patches)
        ? e.patches
            .map((p) => {
              if (!p || typeof p !== 'object') return null
              const h = p as Record<string, unknown>
              const find = String(h.find ?? '')
              const replace = String(h.replace ?? '')
              if (!find) return null
              return { find, replace }
            })
            .filter(Boolean) as { find: string; replace: string }[]
        : undefined
      return {
        path,
        summary: String(e.summary || 'Update to match screenshot'),
        content: e.content != null ? String(e.content) : undefined,
        patches: patches?.length ? patches : undefined,
      }
    })
    .filter(Boolean) as SuggestedFileEdit[]
}

function simulateVisionRefine(ctx: VisionRefineContext): VisionRefineResult {
  const name = ctx.appName || 'your app'
  const refinementText = `Match the uploaded screenshot for ${name}: mirror the layout hierarchy, surface colors, typography scale, and CTA placement. Tighten spacing to feel premium and dark-native. Refresh hero + card components in src/App.tsx.`
  const refinementBrief: RefinementBrief = {
    vision: `Live preview styled to match the reference screenshot for ${name}.`,
    designNotes:
      'Dark premium shell, high-contrast type, accent highlights on primary actions, generous card radius.',
    layout: 'Top nav or compact header, hero block, primary CTA, supporting cards or list below.',
    colors: 'Background #0a0a0f–#111116, surfaces #1a1a22, accent #00ff88, muted text #888.',
    typography: 'Semibold headings 17–24px, body 12–14px, tight tracking on titles.',
    spacing: '16–24px section gaps, 12px internal card padding.',
    interactions: 'Subtle hover on buttons, focus rings on inputs, no gratuitous motion.',
    keyChanges: [
      'Reskin App.tsx to match screenshot palette and layout',
      'Align button styles and border radii to reference',
      'Update hero copy hierarchy to match visual weight in screenshot',
    ],
  }
  const suggestedFileEdits: SuggestedFileEdit[] = [
    {
      path: 'src/App.tsx',
      summary: 'Reskin layout, colors, and component hierarchy to match screenshot',
      patches: [
        {
          find: "background: '#0a0a0f'",
          replace: "background: '#0e0e14'",
        },
      ],
    },
  ]
  return {
    refinementText,
    refinementBrief,
    suggestedFileEdits,
    live: false,
    error: 'Simulator — add Grok key for vision analysis',
  }
}

/** Optional second pass: elevate transcript via /api/refine */
async function refineBriefFromTranscript(
  transcript: string,
  apiKey?: string,
): Promise<{ brief?: RefinementBrief; optimizedPrompt?: string } | null> {
  const key = (
    apiKey ||
    (typeof localStorage !== 'undefined' ? localStorage.getItem('ideaspeak_xai_key') : '') ||
    ''
  ).trim()

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (key) headers['X-AI-Key'] = key

    const res = await fetch(apiBase('/api/refine'), {
      method: 'POST',
      headers,
      body: JSON.stringify({ transcript, history: [] }),
    })
    const data = await res.json().catch(() => ({} as { parsed?: { brief?: unknown } }))
    if (!res.ok || !data?.parsed?.brief) return null
    return {
      brief: normalizeBrief(data.parsed.brief),
      optimizedPrompt:
        typeof data.parsed.optimizedPrompt === 'string'
          ? data.parsed.optimizedPrompt
          : undefined,
    }
  } catch {
    return null
  }
}

/**
 * Analyze a screenshot with Grok vision and return refinement brief + file edits.
 */
export async function refineFromScreenshot(
  imageDataUrl: string,
  ctx: VisionRefineContext = {},
  apiKey?: string,
): Promise<VisionRefineResult> {
  if (!imageDataUrl?.startsWith('data:image/')) {
    return {
      ...simulateVisionRefine(ctx),
      error: 'Invalid image data URL',
    }
  }

  const messages: XaiMessage[] = [
    { role: 'user', content: buildVisionUserPrompt(ctx) },
  ]

  const discuss = await discussWithGrok(
    messages,
    apiKey,
    imageDataUrl,
    'grok',
    false,
  )

  if (!discuss.live) {
    const sim = simulateVisionRefine(ctx)
    return {
      ...sim,
      error: discuss.error || sim.error,
      rawContent: discuss.content,
    }
  }

  const parsed = parseVisionJson(discuss.content)
  if (!parsed) {
    const refinementText =
      discuss.content.trim() ||
      `Apply UI changes to match the uploaded screenshot for ${ctx.appName || 'the app'}.`
    const elevated = await refineBriefFromTranscript(refinementText, apiKey)
    return {
      refinementText,
      refinementBrief: elevated?.brief || {
        vision: refinementText.slice(0, 200),
        keyChanges: ['Match screenshot layout and visual style in src/App.tsx'],
      },
      suggestedFileEdits: [
        {
          path: 'src/App.tsx',
          summary: 'Restyle preview to match uploaded screenshot',
        },
      ],
      rawContent: discuss.content,
      live: true,
      error: 'Model returned prose — using as refinement text',
    }
  }

  const refinementBrief = normalizeBrief(parsed.refinementBrief)
  const suggestedFileEdits = normalizeFileEdits(parsed.suggestedFileEdits)
  const refinementText = String(
    parsed.refinementText ||
      refinementBrief.designNotes ||
      `Match the uploaded screenshot for ${ctx.appName || 'the live preview'}.`,
  )

  const elevated = await refineBriefFromTranscript(refinementText, apiKey)
  const mergedBrief: RefinementBrief = {
    ...refinementBrief,
    ...(elevated?.brief || {}),
    keyChanges: [
      ...(refinementBrief.keyChanges || []),
      ...(elevated?.brief?.keyChanges || []),
    ].filter((v, i, a) => a.indexOf(v) === i),
  }

  return {
    refinementText,
    refinementBrief: mergedBrief,
    suggestedFileEdits,
    rawContent: discuss.content,
    live: true,
  }
}

/** Apply suggested edits to a flat file map (immutable) */
export function applySuggestedFileEdits(
  files: Record<string, string>,
  edits: SuggestedFileEdit[],
): Record<string, string> {
  const next = { ...files }
  for (const edit of edits) {
    if (edit.content) {
      next[edit.path] = edit.content
      continue
    }
    const current = next[edit.path]
    if (!current || !edit.patches?.length) continue
    let updated = current
    for (const { find, replace } of edit.patches) {
      if (updated.includes(find)) updated = updated.replace(find, replace)
    }
    next[edit.path] = updated
  }
  return next
}