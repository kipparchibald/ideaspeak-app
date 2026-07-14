/**
 * Probe what IdeaSpeak features are ready — server flags + browser keys.
 */

import { verifyXaiKey, loadLocalXaiKey } from './api-verify'
import { loadGithubToken } from './autopilot'
import { isSupabaseConfigured } from './supabase'

export type CapabilityId =
  | 'grok'
  | 'voice'
  | 'build'
  | 'githubImport'
  | 'e2bSandbox'
  | 'supabaseSync'
  | 'shipAutopilot'
  | 'stripeBilling'

export type CapabilityStatus = 'ready' | 'partial' | 'missing' | 'checking'

export interface CapabilityItem {
  id: CapabilityId
  label: string
  status: CapabilityStatus
  detail: string
  unlocks: string
  envVars?: string[]
  links?: { label: string; href: string }[]
  clientOnly?: boolean
}

export interface PlatformCapabilitiesReport {
  platform: string
  grokLive: boolean
  grokModel?: string
  buildModel?: string
  items: CapabilityItem[]
  readyCount: number
  totalCount: number
  localEnvSnippet: string
}

type ServerCaps = {
  grok?: boolean
  voice?: boolean
  build?: boolean
  e2b?: boolean
  supabaseServer?: boolean
  shipWorker?: boolean
  stripe?: boolean
  githubServer?: boolean
}

async function fetchServerCapabilities(): Promise<{
  platform: string
  capabilities: ServerCaps
  models?: { chat?: string; build?: string }
} | null> {
  try {
    const res = await fetch('/api/capabilities', { signal: AbortSignal.timeout(12_000) })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export function buildLocalEnvSnippet(missing: string[]): string {
  const lines = [
    '# IdeaSpeak — paste into .env.local then: bun run dev:full',
    '# Get xAI key: https://console.x.ai/',
    '',
  ]
  if (missing.includes('XAI_API_KEY')) {
    lines.push('XAI_API_KEY=xai-your-key-here')
    lines.push('# XAI_BUILD_MODEL=grok-4.5')
  }
  if (missing.includes('E2B_API_KEY')) {
    lines.push('')
    lines.push('# Cloud sandbox preview (optional)')
    lines.push('# E2B_API_KEY=e2b_...')
  }
  if (missing.some((v) => v.startsWith('VITE_SUPABASE'))) {
    lines.push('')
    lines.push('# Cloud project sync (optional)')
    lines.push('# VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co')
    lines.push('# VITE_SUPABASE_ANON_KEY=your-anon-key')
    lines.push('# SUPABASE_URL=https://YOUR_PROJECT.supabase.co')
    lines.push('# SUPABASE_SERVICE_KEY=your-service-role-key')
  }
  if (missing.includes('SHIP_WORKER_URL')) {
    lines.push('')
    lines.push('# Launch autopilot worker (Railway — optional)')
    lines.push('# SHIP_WORKER_URL=https://your-worker.up.railway.app')
    lines.push('# SHIP_WORKER_SECRET=random-long-secret')
    lines.push('# GITHUB_TOKEN=ghp_...')
    lines.push('# VERCEL_TOKEN=...')
  }
  if (missing.includes('STRIPE_SECRET_KEY')) {
    lines.push('')
    lines.push('# Payments (optional)')
    lines.push('# STRIPE_SECRET_KEY=sk_test_...')
  }
  return lines.join('\n')
}

export async function fetchPlatformCapabilities(): Promise<PlatformCapabilitiesReport> {
  const [server, grok] = await Promise.all([
    fetchServerCapabilities(),
    verifyXaiKey(loadLocalXaiKey() || undefined),
  ])

  const caps = server?.capabilities ?? {}
  const grokLive = grok.status === 'live'
  const hasClientKey = !!loadLocalXaiKey().trim()
  const hasGithubBrowser = !!loadGithubToken().trim()
  const supabaseClient = isSupabaseConfigured

  const items: CapabilityItem[] = [
    {
      id: 'grok',
      label: 'Grok API (plan + build)',
      status: grokLive ? 'ready' : hasClientKey ? 'partial' : 'missing',
      detail: grokLive
        ? `${grok.message}${grok.model ? ` · ${grok.model}` : ''}`
        : 'Set XAI_API_KEY on Vercel/Railway or paste key in Settings',
      unlocks: 'Live chat, Grok 4.5 build, refine, TTS, image',
      envVars: ['XAI_API_KEY'],
      links: [
        { label: 'xAI console', href: 'https://console.x.ai/' },
        { label: 'Vercel env', href: 'https://vercel.com/' },
      ],
    },
    {
      id: 'voice',
      label: 'Grok Voice (mic)',
      status: grokLive && (caps.voice ?? grokLive) ? 'ready' : grokLive ? 'partial' : 'missing',
      detail: grokLive
        ? 'Voice token endpoint uses server xAI key'
        : 'Requires XAI_API_KEY — same as Grok API',
      unlocks: 'Realtime speech ↔ speech planning',
      envVars: ['XAI_API_KEY'],
    },
    {
      id: 'build',
      label: 'Grok 4.5 live preview build',
      status: grokLive ? 'ready' : 'missing',
      detail: grokLive
        ? `Build model: ${server?.models?.build || 'grok-4.5'}`
        : 'Without API key → local template scaffold only',
      unlocks: 'AI-generated preview (not template swap)',
      envVars: ['XAI_API_KEY', 'XAI_BUILD_MODEL'],
    },
    {
      id: 'githubImport',
      label: 'GitHub import',
      status: hasGithubBrowser ? 'ready' : 'partial',
      detail: hasGithubBrowser
        ? 'Browser token saved — Projects → Connect to GitHub'
        : 'No token yet — connect in Projects library (browser only)',
      unlocks: 'Import existing repos into preview',
      clientOnly: true,
      links: [
        {
          label: 'Create GitHub token',
          href: 'https://github.com/settings/tokens/new?scopes=repo&description=IdeaSpeak%20Import',
        },
      ],
    },
    {
      id: 'e2bSandbox',
      label: 'E2B cloud sandbox',
      status: caps.e2b ? 'ready' : 'missing',
      detail: caps.e2b
        ? 'Cloud VM preview available'
        : 'Set E2B_API_KEY on Bun/Railway server',
      unlocks: 'Preview engine → Cloud VM',
      envVars: ['E2B_API_KEY'],
      links: [{ label: 'e2b.dev', href: 'https://e2b.dev/' }],
    },
    {
      id: 'supabaseSync',
      label: 'Supabase cloud sync',
      status:
        caps.supabaseServer && supabaseClient
          ? 'ready'
          : caps.supabaseServer || supabaseClient
            ? 'partial'
            : 'missing',
      detail:
        caps.supabaseServer && supabaseClient
          ? 'Server + browser Supabase configured'
          : caps.supabaseServer
            ? 'Server OK — add VITE_SUPABASE_* for sign-in'
            : supabaseClient
              ? 'Browser OK — add SUPABASE_SERVICE_KEY on server'
              : 'Projects stay on this device only',
      unlocks: 'Sign in · sync projects across devices',
      envVars: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY'],
      links: [{ label: 'Supabase', href: 'https://supabase.com/dashboard' }],
    },
    {
      id: 'shipAutopilot',
      label: 'Launch autopilot (GitHub → Vercel)',
      status: caps.shipWorker && caps.githubServer ? 'ready' : caps.shipWorker ? 'partial' : 'missing',
      detail: caps.shipWorker
        ? caps.githubServer
          ? 'Ship worker + GitHub token on server'
          : 'Worker URL set — add GITHUB_TOKEN + VERCEL_TOKEN on Railway'
        : 'Queue only — configure Railway worker + SHIP_WORKER_* on Vercel',
      unlocks: 'One-click ship to production URL',
      envVars: ['SHIP_WORKER_URL', 'SHIP_WORKER_SECRET', 'GITHUB_TOKEN', 'VERCEL_TOKEN'],
    },
    {
      id: 'stripeBilling',
      label: 'Stripe billing',
      status: caps.stripe ? 'ready' : 'missing',
      detail: caps.stripe ? 'Checkout API configured' : 'Pro/Team checkout needs STRIPE_SECRET_KEY',
      unlocks: 'Paid plans · usage limits',
      envVars: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
      links: [{ label: 'Stripe', href: 'https://dashboard.stripe.com/' }],
    },
  ]

  const readyCount = items.filter((i) => i.status === 'ready').length
  const missingEnv = new Set<string>()
  for (const item of items) {
    if (item.status !== 'ready' && item.envVars) {
      for (const v of item.envVars) missingEnv.add(v)
    }
  }

  return {
    platform: server?.platform || (typeof window !== 'undefined' ? 'browser' : 'unknown'),
    grokLive,
    grokModel: grok.model || server?.models?.chat,
    buildModel: server?.models?.build,
    items,
    readyCount,
    totalCount: items.length,
    localEnvSnippet: buildLocalEnvSnippet([...missingEnv]),
  }
}