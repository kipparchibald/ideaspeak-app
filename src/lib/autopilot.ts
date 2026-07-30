/**
 * Launch Autopilot — guided GitHub → Vercel → env → domain → live URL.
 * Client-side orchestration with progress timeline events.
 */

import { SHIP_LINKS, slugify, type ShipPreferences } from './ship'

/** Launch pipeline steps (const enum-style; TS erasableSyntaxOnly-safe) */
export const LaunchStep = {
  github: 'github',
  vercel: 'vercel',
  env: 'env',
  domain: 'domain',
  done: 'done',
} as const

export type LaunchStep = (typeof LaunchStep)[keyof typeof LaunchStep]

export type LaunchEventStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'error'
  | 'skipped'
  | 'manual'
  | 'waiting'

export interface LaunchTimelineEvent {
  id: string
  step: LaunchStep
  status: LaunchEventStatus
  title: string
  message: string
  timestamp: number
  url?: string
  error?: string
  meta?: Record<string, string>
}

export interface LaunchStepMeta {
  id: LaunchStep
  title: string
  subtitle: string
  instructions: string[]
}

export interface RunLaunchAutopilotOpts {
  /** Production scaffold file map (same as ZIP export) */
  scaffoldFiles: Record<string, string>
  appName: string
  slug: string
  githubToken?: string
  /** When set, Autopilot creates the Vercel project + env + deploy via API (no dashboard) */
  vercelToken?: string
  vercelTeamId?: string
  supabaseUrl?: string
  supabaseAnonKey?: string
  customDomain?: string
  /** Skip GitHub push when user already has a repo URL */
  existingRepoUrl?: string
  /** Prefer zero-click when tokens present */
  autonomous?: boolean
  onProgress?: (event: LaunchTimelineEvent) => void
  /** Open external URLs (Vercel deploy, GitHub repo, etc.) */
  onOpenUrl?: (url: string) => void
  signal?: AbortSignal
}

export interface LaunchAutopilotResult {
  events: LaunchTimelineEvent[]
  repoUrl?: string
  vercelDeployUrl?: string
  suggestedLiveUrl?: string
}

export const GITHUB_TOKEN_KEY = 'ideaspeak_github_token'
const AUTOPILOT_STATE_KEY = 'ideaspeak_autopilot_state'

export interface AutopilotPersistedState {
  repoUrl: string
  vercelDeployUrl: string
  liveUrl: string
  lastSlug: string
  lastLaunchedAt: number
}

export const LAUNCH_STEPS: LaunchStepMeta[] = [
  {
    id: LaunchStep.github,
    title: 'GitHub',
    subtitle: 'Create repo & push scaffold',
    instructions: [
      'Paste a GitHub personal access token (repo scope) — stored only in this browser.',
      'Autopilot creates a private repo and pushes your production scaffold in one commit.',
      'No token? Open github.com/new and push the ZIP manually, then paste the repo URL.',
    ],
  },
  {
    id: LaunchStep.vercel,
    title: 'Vercel',
    subtitle: 'Import & deploy',
    instructions: [
      'Opens Vercel “Import Git Repository” with your repo pre-filled.',
      'Keep framework preset: Next.js. Root directory: ./',
      'First deploy may take 2–4 minutes — leave the tab open.',
    ],
  },
  {
    id: LaunchStep.env,
    title: 'Env vars',
    subtitle: 'Supabase keys on Vercel',
    instructions: [
      'Vercel → Project → Settings → Environment Variables.',
      'Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY for Production.',
      'Redeploy after saving env vars so the build picks them up.',
    ],
  },
  {
    id: LaunchStep.domain,
    title: 'Domain',
    subtitle: 'Optional custom domain',
    instructions: [
      'Buy a domain anywhere (Porkbun, Namecheap, etc.).',
      'Vercel → Project → Settings → Domains → Add.',
      'Apex: A → 76.76.21.21 · Subdomain: CNAME → cname.vercel-dns.com',
    ],
  },
  {
    id: LaunchStep.done,
    title: 'Live',
    subtitle: 'Your production URL',
    instructions: [
      'Paste your Vercel production URL (or custom domain) when deploy finishes.',
      'Open the link and click through your core loop once.',
      'Share — you shipped with voice.',
    ],
  },
]

export const AUTOPILOT_LINKS = {
  githubNew: SHIP_LINKS.githubNew,
  githubTokens: 'https://github.com/settings/tokens/new?scopes=repo&description=IdeaSpeak%20Launch%20Autopilot',
  vercelNew: SHIP_LINKS.vercelNew,
  vercelEnv: (projectHint?: string) =>
    projectHint
      ? `https://vercel.com/${projectHint}/settings/environment-variables`
      : 'https://vercel.com/dashboard',
  vercelDomains: SHIP_LINKS.vercelDashboard,
  supabaseApi: SHIP_LINKS.supabaseProjects,
  porkbun: SHIP_LINKS.porkbun,
  namecheap: SHIP_LINKS.namecheap,
  vercelDeploy: (repoUrl: string) => SHIP_LINKS.vercelDeployButton(repoUrl),
}

let eventCounter = 0

function nextEventId(): string {
  eventCounter += 1
  return `launch-${Date.now()}-${eventCounter}`
}

function emit(
  events: LaunchTimelineEvent[],
  onProgress: RunLaunchAutopilotOpts['onProgress'],
  partial: Omit<LaunchTimelineEvent, 'id' | 'timestamp'> & { id?: string; timestamp?: number },
): LaunchTimelineEvent {
  const event: LaunchTimelineEvent = {
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
  events.push(event)
  onProgress?.(event)
  return event
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Launch cancelled', 'AbortError')
}

export function loadGithubToken(): string {
  try {
    return localStorage.getItem(GITHUB_TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

export function saveGithubToken(token: string) {
  const trimmed = token.trim()
  if (trimmed) localStorage.setItem(GITHUB_TOKEN_KEY, trimmed)
  else localStorage.removeItem(GITHUB_TOKEN_KEY)
}

export function loadAutopilotState(): AutopilotPersistedState | null {
  try {
    const raw = localStorage.getItem(AUTOPILOT_STATE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as AutopilotPersistedState
  } catch {
    return null
  }
}

export function saveAutopilotState(patch: Partial<AutopilotPersistedState>) {
  const prev = loadAutopilotState()
  const next: AutopilotPersistedState = {
    repoUrl: patch.repoUrl ?? prev?.repoUrl ?? '',
    vercelDeployUrl: patch.vercelDeployUrl ?? prev?.vercelDeployUrl ?? '',
    liveUrl: patch.liveUrl ?? prev?.liveUrl ?? '',
    lastSlug: patch.lastSlug ?? prev?.lastSlug ?? '',
    lastLaunchedAt: patch.lastLaunchedAt ?? Date.now(),
  }
  localStorage.setItem(AUTOPILOT_STATE_KEY, JSON.stringify(next))
}

export function vercelEnvVars(supabaseUrl?: string, supabaseAnonKey?: string) {
  return [
    {
      key: 'NEXT_PUBLIC_SUPABASE_URL',
      value: supabaseUrl || 'https://YOUR_PROJECT.supabase.co',
    },
    {
      key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      value: supabaseAnonKey || 'your-anon-key',
    },
  ]
}

export function guessVercelUrl(slug: string): string {
  const safe = slugify(slug).replace(/-/g, '') || 'ideaspeakapp'
  return `https://${safe}.vercel.app`
}

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

/** Bulk initial commit via Git Data API */
async function pushScaffoldToGithub(
  token: string,
  owner: string,
  repo: string,
  files: Record<string, string>,
  onFile?: (path: string, index: number, total: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const paths = Object.keys(files).filter((p) => files[p] != null)
  const treeItems: { path: string; mode: string; type: string; sha: string }[] = []

  for (let i = 0; i < paths.length; i++) {
    throwIfAborted(signal)
    const path = paths[i]
    onFile?.(path, i + 1, paths.length)
    const blob = await githubFetch<{ sha: string }>(token, `/repos/${owner}/${repo}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({ content: files[path], encoding: 'utf-8' }),
    })
    treeItems.push({ path, mode: '100644', type: 'blob', sha: blob.sha })
  }

  throwIfAborted(signal)
  const tree = await githubFetch<{ sha: string }>(token, `/repos/${owner}/${repo}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ tree: treeItems }),
  })

  throwIfAborted(signal)
  const commit = await githubFetch<{ sha: string }>(token, `/repos/${owner}/${repo}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({
      message: 'Initial commit — IdeaSpeak Launch Autopilot',
      tree: tree.sha,
    }),
  })

  throwIfAborted(signal)
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


// ── Vercel REST (browser-side with user token from Confidential Box) ─────────

async function vercelApiFetch<T>(
  token: string,
  path: string,
  init: RequestInit = {},
  teamId?: string,
): Promise<T> {
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

function parseGithubFullName(repoUrl: string): string | null {
  try {
    const u = new URL(repoUrl)
    if (!u.hostname.includes('github.com')) return null
    const parts = u.pathname.replace(/^\//, '').replace(/\.git$/, '').split('/')
    if (parts.length < 2) return null
    return `${parts[0]}/${parts[1]}`
  } catch {
    return null
  }
}

async function createOrGetVercelProject(
  token: string,
  name: string,
  repoFullName: string,
  teamId?: string,
): Promise<{ id: string; name: string; link?: string }> {
  try {
    const created = await vercelApiFetch<{ id: string; name: string }>(
      token,
      '/v10/projects',
      {
        method: 'POST',
        body: JSON.stringify({
          name,
          framework: 'nextjs',
          gitRepository: { type: 'github', repo: repoFullName },
        }),
      },
      teamId,
    )
    return created
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!/already|exist|conflict|409/i.test(msg)) throw err
    const list = await vercelApiFetch<{ projects?: { id: string; name: string }[] }>(
      token,
      `/v9/projects?search=${encodeURIComponent(name)}&limit=20`,
      {},
      teamId,
    )
    const found = (list.projects || []).find((p) => p.name === name)
    if (!found) throw err
    return found
  }
}

async function setVercelEnvFromVault(
  token: string,
  projectId: string,
  vars: { key: string; value: string }[],
  teamId?: string,
): Promise<number> {
  let set = 0
  for (const v of vars) {
    if (!v.value?.trim()) continue
    try {
      await vercelApiFetch(
        token,
        `/v10/projects/${projectId}/env`,
        {
          method: 'POST',
          body: JSON.stringify({
            key: v.key,
            value: v.value,
            type: 'encrypted',
            target: ['production', 'preview', 'development'],
          }),
        },
        teamId,
      )
      set++
    } catch (err) {
      // Env may already exist — try upsert via filter+edit is complex; skip duplicates
      const msg = err instanceof Error ? err.message : ''
      if (!/already|exist|conflict|409/i.test(msg)) {
        console.warn('[autopilot] env set failed', v.key, msg)
      }
    }
  }
  return set
}

async function triggerVercelDeploy(
  token: string,
  projectId: string,
  repoFullName: string,
  teamId?: string,
): Promise<{ url?: string; id?: string }> {
  const [org, repo] = repoFullName.split('/')
  const deployment = await vercelApiFetch<{
    id?: string
    url?: string
    inspectorUrl?: string
  }>(
    token,
    '/v13/deployments',
    {
      method: 'POST',
      body: JSON.stringify({
        name: repo,
        project: projectId,
        gitSource: {
          type: 'github',
          org,
          repo,
          ref: 'main',
        },
        target: 'production',
      }),
    },
    teamId,
  )
  const host = deployment.url ? `https://${deployment.url.replace(/^https?:\/\//, '')}` : undefined
  return { url: host || deployment.inspectorUrl, id: deployment.id }
}

/**
 * Orchestrate launch steps. GitHub push is automatic when token is present;
 * Vercel opens a guided import URL; env/domain are guided manual steps.
 */
export async function runLaunchAutopilot(
  opts: RunLaunchAutopilotOpts,
): Promise<LaunchAutopilotResult> {
  const {
    scaffoldFiles,
    appName,
    slug,
    githubToken,
    vercelToken,
    vercelTeamId,
    supabaseUrl,
    supabaseAnonKey,
    customDomain,
    existingRepoUrl,
    autonomous,
    onProgress,
    onOpenUrl,
    signal,
  } = opts
  const handsOff = Boolean(autonomous || vercelToken?.trim())

  const events: LaunchTimelineEvent[] = []
  const safeSlug = slugify(slug)
  let repoUrl = existingRepoUrl?.trim() || ''
  let vercelDeployUrl = repoUrl ? AUTOPILOT_LINKS.vercelDeploy(repoUrl) : AUTOPILOT_LINKS.vercelNew

  const progress = (
    partial: Omit<LaunchTimelineEvent, 'id' | 'timestamp'> & { id?: string; timestamp?: number },
  ) => emit(events, onProgress, partial)

  // ── GitHub ──────────────────────────────────────────────────────────────
  progress({
    step: LaunchStep.github,
    status: 'running',
    title: 'GitHub',
    message: githubToken
      ? `Creating repo ${safeSlug} and pushing scaffold…`
      : 'Waiting — add a GitHub token or paste an existing repo URL',
  })

  if (githubToken && !existingRepoUrl) {
    try {
      throwIfAborted(signal)
      const user = await getGithubUser(githubToken)
      throwIfAborted(signal)

      try {
        const created = await createGithubRepo(
          githubToken,
          safeSlug,
          `${appName} — built with IdeaSpeak`,
        )
        repoUrl = created.html_url
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (!/already exists/i.test(msg)) throw err
        repoUrl = `https://github.com/${user.login}/${safeSlug}`
        progress({
          step: LaunchStep.github,
          status: 'running',
          title: 'GitHub',
          message: `Repo exists — updating files on ${user.login}/${safeSlug}…`,
        })
      }

      const uploadable = filterScaffoldForGithub(scaffoldFiles)
      const total = Object.keys(uploadable).length

      await pushScaffoldToGithub(
        githubToken,
        user.login,
        safeSlug,
        uploadable,
        (path, index, t) => {
          progress({
            step: LaunchStep.github,
            status: 'running',
            title: 'GitHub',
            message: `Uploading ${path} (${index}/${t})…`,
            url: repoUrl,
          })
        },
        signal,
      )

      vercelDeployUrl = AUTOPILOT_LINKS.vercelDeploy(repoUrl)
      progress({
        step: LaunchStep.github,
        status: 'success',
        title: 'GitHub',
        message: `Pushed ${total} files to ${user.login}/${safeSlug}`,
        url: repoUrl,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'GitHub step failed'
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      progress({
        step: LaunchStep.github,
        status: 'error',
        title: 'GitHub',
        message: 'Could not create repo or push files',
        error: message,
      })
    }
  } else if (existingRepoUrl) {
    repoUrl = existingRepoUrl
    vercelDeployUrl = AUTOPILOT_LINKS.vercelDeploy(repoUrl)
    progress({
      step: LaunchStep.github,
      status: 'success',
      title: 'GitHub',
      message: 'Using your existing repository',
      url: repoUrl,
    })
  } else {
    progress({
      step: LaunchStep.github,
      status: 'manual',
      title: 'GitHub',
      message: 'Create a repo manually or add a token, then continue',
      url: AUTOPILOT_LINKS.githubNew,
    })
  }

  throwIfAborted(signal)

  // ── Vercel (+ env) ──────────────────────────────────────────────────────
  const envVars = vercelEnvVars(supabaseUrl, supabaseAnonKey)
  const hasEnv = Boolean(supabaseUrl?.trim() && supabaseAnonKey?.trim())
  let suggestedLiveUrl = customDomain
    ? customDomain.startsWith('http')
      ? customDomain
      : `https://${customDomain}`
    : guessVercelUrl(safeSlug)
  let vercelProjectId: string | undefined

  if (repoUrl && vercelToken?.trim()) {
    progress({
      step: LaunchStep.vercel,
      status: 'running',
      title: 'Vercel',
      message: 'Creating project from GitHub via Confidential Box token…',
    })
    try {
      throwIfAborted(signal)
      const fullName = parseGithubFullName(repoUrl)
      if (!fullName) throw new Error('Could not parse GitHub repo from URL')
      const project = await createOrGetVercelProject(
        vercelToken.trim(),
        safeSlug,
        fullName,
        vercelTeamId?.trim() || undefined,
      )
      vercelProjectId = project.id
      vercelDeployUrl = `https://vercel.com/${fullName.split('/')[0]}/${project.name}`

      progress({
        step: LaunchStep.vercel,
        status: 'running',
        title: 'Vercel',
        message: `Project ready (${project.name}) — setting environment variables…`,
        url: vercelDeployUrl,
      })

      const setCount = await setVercelEnvFromVault(
        vercelToken.trim(),
        project.id,
        envVars,
        vercelTeamId?.trim() || undefined,
      )
      progress({
        step: LaunchStep.env,
        status: setCount > 0 || !hasEnv ? 'success' : 'success',
        title: 'Environment',
        message:
          setCount > 0
            ? `Set ${setCount} env var(s) on Vercel automatically`
            : hasEnv
              ? 'Env vars already present or empty — continuing'
              : 'No Supabase keys in box — deploy will still run; add later if needed',
        meta: Object.fromEntries(envVars.map((v) => [v.key, v.value ? '••••' : ''])),
      })

      progress({
        step: LaunchStep.vercel,
        status: 'running',
        title: 'Vercel',
        message: 'Triggering production deployment…',
      })
      const deploy = await triggerVercelDeploy(
        vercelToken.trim(),
        project.id,
        fullName,
        vercelTeamId?.trim() || undefined,
      )
      if (deploy.url) suggestedLiveUrl = deploy.url
      vercelDeployUrl = deploy.url || vercelDeployUrl

      progress({
        step: LaunchStep.vercel,
        status: 'success',
        title: 'Vercel',
        message: 'Deploy started — no dashboard clicks required',
        url: vercelDeployUrl,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Vercel API failed'
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      progress({
        step: LaunchStep.vercel,
        status: 'error',
        title: 'Vercel',
        message: 'API deploy failed — falling back to import URL',
        error: message,
      })
      onOpenUrl?.(vercelDeployUrl)
      progress({
        step: LaunchStep.vercel,
        status: 'manual',
        title: 'Vercel',
        message: 'Open Vercel import and click Deploy, then return here',
        url: vercelDeployUrl,
      })
      progress({
        step: LaunchStep.env,
        status: hasEnv ? 'manual' : 'waiting',
        title: 'Environment',
        message: hasEnv
          ? 'Paste Supabase keys in Vercel env if API path failed'
          : 'Add Supabase in Confidential Box for next run',
        meta: Object.fromEntries(envVars.map((v) => [v.key, v.value])),
      })
    }
  } else {
    progress({
      step: LaunchStep.vercel,
      status: repoUrl ? 'running' : 'manual',
      title: 'Vercel',
      message: repoUrl
        ? handsOff
          ? 'Add Vercel token in Confidential Box for zero-click deploy'
          : 'Opening Vercel import with your repo…'
        : 'Connect GitHub on Vercel after your repo exists',
      url: vercelDeployUrl,
    })

    if (repoUrl) {
      onOpenUrl?.(vercelDeployUrl)
      progress({
        step: LaunchStep.vercel,
        status: 'manual',
        title: 'Vercel',
        message:
          'Complete import in Vercel — or save a Vercel token in Confidential Box for next time',
        url: vercelDeployUrl,
      })
    }

    progress({
      step: LaunchStep.env,
      status: hasEnv ? 'manual' : 'waiting',
      title: 'Environment',
      message: hasEnv
        ? 'Copy Supabase keys into Vercel → Environment Variables (auto when Vercel token is in the Box)'
        : 'Add Supabase keys in Confidential Box for automatic env injection',
      meta: Object.fromEntries(envVars.map((v) => [v.key, v.value])),
    })
  }

  throwIfAborted(signal)

  // ── Domain ──────────────────────────────────────────────────────────────
  progress({
    step: LaunchStep.domain,
    status: customDomain ? (vercelToken ? 'manual' : 'manual') : 'skipped',
    title: 'Domain',
    message: customDomain
      ? `Attach ${customDomain} in Vercel → Domains (one-time DNS at your registrar)`
      : 'Skipped — add a custom domain anytime in Vercel',
    url: customDomain ? AUTOPILOT_LINKS.vercelDomains : undefined,
    meta: customDomain ? { domain: customDomain } : undefined,
  })

  throwIfAborted(signal)

  // ── Done ────────────────────────────────────────────────────────────────
  const fullyAuto = Boolean(repoUrl && vercelToken && vercelProjectId)
  progress({
    step: LaunchStep.done,
    status: fullyAuto ? 'success' : 'waiting',
    title: 'Live',
    message: fullyAuto
      ? 'Ship pipeline complete — open your production URL (build may take 1–3 min)'
      : 'Paste your production URL when deploy finishes',
    url: suggestedLiveUrl,
  })

  saveAutopilotState({
    repoUrl,
    vercelDeployUrl,
    liveUrl: loadAutopilotState()?.liveUrl || '',
    lastSlug: safeSlug,
    lastLaunchedAt: Date.now(),
  })

  return { events, repoUrl, vercelDeployUrl, suggestedLiveUrl }
}

/** Build autopilot opts from Ship preferences */
export function autopilotOptsFromShip(
  prefs: ShipPreferences,
  scaffoldFiles: Record<string, string>,
  overrides?: Partial<RunLaunchAutopilotOpts>,
): RunLaunchAutopilotOpts {
  return {
    scaffoldFiles,
    appName: prefs.appName,
    slug: prefs.appSlug,
    githubToken: loadGithubToken() || undefined,
    supabaseUrl: prefs.supabase.url,
    supabaseAnonKey: prefs.supabase.anonKey,
    customDomain: prefs.customDomain,
    autonomous: true,
    existingRepoUrl: prefs.githubRepoUrl || undefined,
    ...overrides,
  }
}