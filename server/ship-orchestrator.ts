/**
 * Ship orchestrator — server-side GitHub → Vercel → env → domain → live URL.
 * In-memory job store (skeleton); replace with Supabase when persistence ships.
 *
 * Types mirror src/lib/ship-job-types.ts / autopilot LaunchTimelineEvent when merged.
 */

// ── Types (compatible with ship-job-types.ts + autopilot) ───────────────────

export const ShipStep = {
  github: 'github',
  vercel: 'vercel',
  env: 'env',
  domain: 'domain',
  done: 'done',
} as const

export type ShipStep = (typeof ShipStep)[keyof typeof ShipStep]

export type ShipEventStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'error'
  | 'skipped'
  | 'manual'
  | 'waiting'

export interface ShipJobEvent {
  id: string
  step: ShipStep
  status: ShipEventStatus
  title: string
  message: string
  timestamp: number
  url?: string
  error?: string
  meta?: Record<string, string>
}

export type ShipJobStatus = 'pending' | 'running' | 'success' | 'error'

export interface ShipJobRecord {
  id: string
  status: ShipJobStatus
  appName: string
  appSlug: string
  idea?: string
  userId?: string
  createdAt: number
  updatedAt: number
  events: ShipJobEvent[]
  repoUrl?: string
  vercelDeployUrl?: string
  vercelProjectId?: string
  liveUrl?: string
  error?: string
}

export interface RunShipJobOpts {
  appName: string
  appSlug: string
  idea?: string
  scaffoldFiles: Record<string, string>
  userId?: string
  onProgress?: (event: ShipJobEvent) => void
}

// ── In-memory store ─────────────────────────────────────────────────────────

const jobs = new Map<string, ShipJobRecord>()
let eventCounter = 0
let jobCounter = 0

export function getShipJob(id: string): ShipJobRecord | undefined {
  return jobs.get(id)
}

export function listShipJobs(): ShipJobRecord[] {
  return [...jobs.values()].sort((a, b) => b.createdAt - a.createdAt)
}

/** Public snapshot for API — omits heavy fields */
export function serializeShipJob(job: ShipJobRecord) {
  return {
    id: job.id,
    status: job.status,
    appName: job.appName,
    appSlug: job.appSlug,
    idea: job.idea,
    userId: job.userId,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    events: job.events,
    repoUrl: job.repoUrl,
    vercelDeployUrl: job.vercelDeployUrl,
    vercelProjectId: job.vercelProjectId,
    liveUrl: job.liveUrl,
    error: job.error,
  }
}

export function createShipJob(opts: Omit<RunShipJobOpts, 'scaffoldFiles' | 'onProgress'>): string {
  jobCounter += 1
  const id = `ship-${Date.now()}-${jobCounter}`
  const now = Date.now()
  const record: ShipJobRecord = {
    id,
    status: 'pending',
    appName: opts.appName,
    appSlug: opts.appSlug,
    idea: opts.idea,
    userId: opts.userId,
    createdAt: now,
    updatedAt: now,
    events: [],
  }
  jobs.set(id, record)
  return id
}

// ── Links & helpers (server-safe; no localStorage) ──────────────────────────

const SHIP_LINKS = {
  githubNew: 'https://github.com/new',
  githubTokens:
    'https://github.com/settings/tokens/new?scopes=repo&description=IdeaSpeak%20Ship%20Orchestrator',
  vercelNew: 'https://vercel.com/new',
  vercelDashboard: 'https://vercel.com/dashboard',
  vercelDeployButton: (repoUrl: string) => {
    if (!repoUrl) return 'https://vercel.com/new'
    return `https://vercel.com/new/clone?repository-url=${encodeURIComponent(repoUrl)}`
  },
  vercelEnv: (projectHint?: string) =>
    projectHint
      ? `https://vercel.com/${projectHint}/settings/environment-variables`
      : 'https://vercel.com/dashboard',
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'ideaspeak-app'
  )
}

function guessVercelUrl(slug: string): string {
  const safe = slugify(slug).replace(/-/g, '') || 'ideaspeakapp'
  return `https://${safe}.vercel.app`
}

function ideaspeakLiveUrl(slug: string): string {
  return `https://${slugify(slug)}.ideaspeak.app`
}

function getGithubToken(): string {
  return (
    process.env.GITHUB_TOKEN?.trim() ||
    process.env.GITHUB_APP_TOKEN?.trim() ||
    ''
  )
}

function getSupabaseEnv(): { url: string; anonKey: string } {
  return {
    url:
      process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
      process.env.SUPABASE_URL?.trim() ||
      process.env.VITE_SUPABASE_URL?.trim() ||
      '',
    anonKey:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
      process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
      '',
  }
}

function nextEventId(): string {
  eventCounter += 1
  return `ship-event-${Date.now()}-${eventCounter}`
}

function parseGithubRepo(repoUrl: string): { owner: string; repo: string } | null {
  try {
    const m = repoUrl.match(/github\.com\/([^/]+)\/([^/#?]+)/i)
    if (!m) return null
    return { owner: m[1], repo: m[2].replace(/\.git$/, '') }
  } catch {
    return null
  }
}

// ── GitHub API (from autopilot.ts) ──────────────────────────────────────────

async function githubFetch<T>(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
  })

  if (!res.ok) {
    let detail = res.statusText
    try {
      const err = (await res.json()) as { message?: string }
      detail = err.message || detail
    } catch {
      /* ignore */
    }
    throw new Error(detail || `GitHub API ${res.status}`)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

async function getGithubUser(token: string): Promise<{ login: string }> {
  return githubFetch(token, '/user')
}

async function createGithubRepo(
  token: string,
  slug: string,
  description: string,
): Promise<{ full_name: string; html_url: string }> {
  return githubFetch(token, '/user/repos', {
    method: 'POST',
    body: JSON.stringify({
      name: slug,
      description,
      private: true,
      auto_init: false,
    }),
  })
}

async function pushScaffoldToGithub(
  token: string,
  owner: string,
  repo: string,
  files: Record<string, string>,
  onFile?: (path: string, index: number, total: number) => void,
): Promise<void> {
  const paths = Object.keys(files).filter((p) => files[p] != null)
  const treeItems: { path: string; mode: string; type: string; sha: string }[] = []

  for (let i = 0; i < paths.length; i++) {
    const path = paths[i]
    onFile?.(path, i + 1, paths.length)
    const blob = await githubFetch<{ sha: string }>(token, `/repos/${owner}/${repo}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({ content: files[path], encoding: 'utf-8' }),
    })
    treeItems.push({ path, mode: '100644', type: 'blob', sha: blob.sha })
  }

  const tree = await githubFetch<{ sha: string }>(token, `/repos/${owner}/${repo}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ tree: treeItems }),
  })

  const commit = await githubFetch<{ sha: string }>(token, `/repos/${owner}/${repo}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({
      message: 'Initial commit — IdeaSpeak Ship Orchestrator',
      tree: tree.sha,
    }),
  })

  try {
    await githubFetch(token, `/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      body: JSON.stringify({ ref: 'refs/heads/main', sha: commit.sha }),
    })
  } catch {
    await githubFetch(token, `/repos/${owner}/${repo}/git/refs/heads/main`, {
      method: 'PATCH',
      body: JSON.stringify({ sha: commit.sha, force: true }),
    })
  }
}

function filterScaffoldForGithub(files: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [path, content] of Object.entries(files)) {
    if (!content?.trim()) continue
    if (path.startsWith('preview-source/')) continue
    if (path === '.env.local') continue
    out[path] = content
  }
  return out
}

// ── Vercel API ────────────────────────────────────────────────────────────────

async function vercelFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = process.env.VERCEL_TOKEN?.trim()
  if (!token) throw new Error('VERCEL_TOKEN not set')

  const teamId = process.env.VERCEL_TEAM_ID?.trim()
  const separator = path.includes('?') ? '&' : '?'
  const url = teamId
    ? `https://api.vercel.com${path}${separator}teamId=${encodeURIComponent(teamId)}`
    : `https://api.vercel.com${path}`

  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    },
  })

  if (!res.ok) {
    let detail = res.statusText
    try {
      const err = (await res.json()) as { error?: { message?: string }; message?: string }
      detail = err.error?.message || err.message || detail
    } catch {
      /* ignore */
    }
    throw new Error(detail || `Vercel API ${res.status}`)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

async function createVercelProject(
  name: string,
  repoFullName: string,
): Promise<{ id: string; name: string }> {
  return vercelFetch('/v10/projects', {
    method: 'POST',
    body: JSON.stringify({
      name,
      framework: 'nextjs',
      gitRepository: { type: 'github', repo: repoFullName },
    }),
  })
}

async function setVercelEnvVar(
  projectId: string,
  key: string,
  value: string,
): Promise<void> {
  await vercelFetch(`/v10/projects/${projectId}/env`, {
    method: 'POST',
    body: JSON.stringify({
      key,
      value,
      type: 'encrypted',
      target: ['production', 'preview', 'development'],
    }),
  })
}

// ── Job runner ────────────────────────────────────────────────────────────────

export async function runShipJob(jobId: string, opts: RunShipJobOpts): Promise<ShipJobRecord> {
  const job = jobs.get(jobId)
  if (!job) throw new Error(`Ship job not found: ${jobId}`)

  job.status = 'running'
  job.updatedAt = Date.now()

  const safeSlug = slugify(opts.appSlug || opts.appName)
  const githubToken = getGithubToken()
  const vercelToken = process.env.VERCEL_TOKEN?.trim()
  const supabase = getSupabaseEnv()

  let repoUrl = ''
  let vercelDeployUrl = SHIP_LINKS.vercelNew
  let vercelProjectId: string | undefined
  let fatalError: string | undefined

  const progress = (
    partial: Omit<ShipJobEvent, 'id' | 'timestamp'> & { id?: string; timestamp?: number },
  ) => {
    const event: ShipJobEvent = {
      id: partial.id || nextEventId(),
      timestamp: partial.timestamp ?? Date.now(),
      step: partial.step,
      status: partial.status,
      title: partial.title,
      message: partial.message,
      url: partial.url,
      error: partial.error,
      meta: partial.meta,
    }
    job.events.push(event)
    job.updatedAt = Date.now()
    opts.onProgress?.(event)
    return event
  }

  // ── GitHub ────────────────────────────────────────────────────────────────
  progress({
    step: ShipStep.github,
    status: 'running',
    title: 'GitHub',
    message: githubToken
      ? `Creating repo ${safeSlug} and pushing scaffold…`
      : 'No server GitHub token — manual repo creation required',
  })

  if (githubToken) {
    try {
      const user = await getGithubUser(githubToken)

      try {
        const created = await createGithubRepo(
          githubToken,
          safeSlug,
          `${opts.appName} — built with IdeaSpeak`,
        )
        repoUrl = created.html_url
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (!/already exists/i.test(msg)) throw err
        repoUrl = `https://github.com/${user.login}/${safeSlug}`
        progress({
          step: ShipStep.github,
          status: 'running',
          title: 'GitHub',
          message: `Repo exists — updating files on ${user.login}/${safeSlug}…`,
          url: repoUrl,
        })
      }

      const uploadable = filterScaffoldForGithub(opts.scaffoldFiles)
      const total = Object.keys(uploadable).length

      await pushScaffoldToGithub(githubToken, user.login, safeSlug, uploadable, (path, index, t) => {
        progress({
          step: ShipStep.github,
          status: 'running',
          title: 'GitHub',
          message: `Uploading ${path} (${index}/${t})…`,
          url: repoUrl,
        })
      })

      vercelDeployUrl = SHIP_LINKS.vercelDeployButton(repoUrl)
      job.repoUrl = repoUrl
      progress({
        step: ShipStep.github,
        status: 'success',
        title: 'GitHub',
        message: `Pushed ${total} files to ${user.login}/${safeSlug}`,
        url: repoUrl,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'GitHub step failed'
      fatalError = message
      progress({
        step: ShipStep.github,
        status: 'error',
        title: 'GitHub',
        message: 'Could not create repo or push files',
        error: message,
      })
    }
  } else {
    progress({
      step: ShipStep.github,
      status: 'manual',
      title: 'GitHub',
      message: 'Set GITHUB_TOKEN on the server or create a repo manually',
      url: SHIP_LINKS.githubNew,
      meta: { tokenHelp: SHIP_LINKS.githubTokens },
    })
  }

  // ── Vercel ────────────────────────────────────────────────────────────────
  progress({
    step: ShipStep.vercel,
    status: repoUrl && vercelToken ? 'running' : 'manual',
    title: 'Vercel',
    message: repoUrl
      ? vercelToken
        ? 'Creating Vercel project and linking GitHub repo…'
        : 'Import repo on Vercel — guided URL below'
      : 'Connect GitHub on Vercel after your repo exists',
    url: repoUrl ? vercelDeployUrl : SHIP_LINKS.vercelNew,
  })

  if (repoUrl && vercelToken) {
    const parsed = parseGithubRepo(repoUrl)
    if (parsed) {
      try {
        const project = await createVercelProject(safeSlug, `${parsed.owner}/${parsed.repo}`)
        vercelProjectId = project.id
        job.vercelProjectId = project.id
        vercelDeployUrl = `https://vercel.com/${parsed.owner}/${project.name}`
        job.vercelDeployUrl = vercelDeployUrl
        progress({
          step: ShipStep.vercel,
          status: 'success',
          title: 'Vercel',
          message: `Project ${project.name} created — trigger deploy in Vercel dashboard`,
          url: vercelDeployUrl,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Vercel project creation failed'
        vercelDeployUrl = SHIP_LINKS.vercelDeployButton(repoUrl)
        job.vercelDeployUrl = vercelDeployUrl
        progress({
          step: ShipStep.vercel,
          status: 'manual',
          title: 'Vercel',
          message: `API create failed (${message}) — use guided import instead`,
          url: vercelDeployUrl,
        })
      }
    } else {
      job.vercelDeployUrl = vercelDeployUrl
      progress({
        step: ShipStep.vercel,
        status: 'manual',
        title: 'Vercel',
        message: 'Complete import in Vercel — click Deploy, then return here',
        url: vercelDeployUrl,
      })
    }
  } else if (repoUrl) {
    job.vercelDeployUrl = vercelDeployUrl
    progress({
      step: ShipStep.vercel,
      status: 'manual',
      title: 'Vercel',
      message: 'Set VERCEL_TOKEN on the server or complete import manually',
      url: vercelDeployUrl,
    })
  }

  // ── Env ───────────────────────────────────────────────────────────────────
  const hasEnv = Boolean(supabase.url && supabase.anonKey)
  const envMeta: Record<string, string> = {
    NEXT_PUBLIC_SUPABASE_URL: supabase.url || 'https://YOUR_PROJECT.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: supabase.anonKey || 'your-anon-key',
  }

  progress({
    step: ShipStep.env,
    status: hasEnv ? 'running' : 'waiting',
    title: 'Environment',
    message: hasEnv
      ? 'Injecting Supabase env vars from server configuration…'
      : 'Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to server env',
    meta: envMeta,
  })

  if (hasEnv && vercelProjectId && vercelToken) {
    try {
      await setVercelEnvVar(vercelProjectId, 'NEXT_PUBLIC_SUPABASE_URL', supabase.url)
      await setVercelEnvVar(vercelProjectId, 'NEXT_PUBLIC_SUPABASE_ANON_KEY', supabase.anonKey)
      progress({
        step: ShipStep.env,
        status: 'success',
        title: 'Environment',
        message: 'Supabase keys set on Vercel project — redeploy to apply',
        url: SHIP_LINKS.vercelEnv(vercelProjectId),
        meta: envMeta,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Env injection failed'
      progress({
        step: ShipStep.env,
        status: 'manual',
        title: 'Environment',
        message: `Could not set env via API (${message}) — paste keys in Vercel settings`,
        url: SHIP_LINKS.vercelEnv(vercelProjectId),
        meta: envMeta,
      })
    }
  } else if (hasEnv) {
    progress({
      step: ShipStep.env,
      status: 'manual',
      title: 'Environment',
      message: 'Copy Supabase keys into Vercel → Settings → Environment Variables',
      url: SHIP_LINKS.vercelEnv(),
      meta: envMeta,
    })
  }

  // ── Domain ────────────────────────────────────────────────────────────────
  progress({
    step: ShipStep.domain,
    status: 'skipped',
    title: 'Domain',
    message: 'Optional — attach a custom domain anytime in Vercel',
    url: SHIP_LINKS.vercelDashboard,
  })

  // ── Done ──────────────────────────────────────────────────────────────────
  const liveUrl = ideaspeakLiveUrl(safeSlug)
  const fallbackUrl = guessVercelUrl(safeSlug)
  job.liveUrl = liveUrl

  progress({
    step: ShipStep.done,
    status: fatalError ? 'error' : 'success',
    title: 'Live',
    message: fatalError
      ? 'Ship job finished with errors — fix GitHub step and retry'
      : `Target live URL: ${liveUrl} (Vercel default: ${fallbackUrl})`,
    url: liveUrl,
    meta: { vercelGuess: fallbackUrl },
  })

  job.status = fatalError ? 'error' : 'success'
  job.error = fatalError
  job.updatedAt = Date.now()

  return job
}