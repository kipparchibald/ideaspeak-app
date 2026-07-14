/**
 * Monetization — sell convenience (voice → live app → ship), not raw API.
 * Local tier + usage metering; Stripe Checkout via POST /api/stripe/checkout.
 */

export type PlanId = 'free' | 'pro' | 'team'

/** Env-based checkout placeholder — server creates session at this path */
export const CHECKOUT_API_PATH = '/api/stripe/checkout'

function billingApiBase(path: string): string {
  if (typeof window !== 'undefined') return path
  const base = process.env.IDEASPEAK_API || 'http://localhost:3001'
  return `${base.replace(/\/$/, '')}${path}`
}

/** Placeholder pattern for plan checkout — resolved by createCheckoutSession() */
export function planCheckoutPlaceholder(planId: PlanId): string | undefined {
  if (planId === 'free') return undefined
  return `${CHECKOUT_API_PATH}?plan=${planId}`
}

export interface PlanDefinition {
  id: PlanId
  name: string
  priceLabel: string
  priceNote: string
  tagline: string
  highlight?: boolean
  features: string[]
  limits: {
    buildsPerDay: number
    shipExportsPerDay: number
    polishPacks: boolean
    multiModel: boolean
    priorityBuild: boolean
    customDomainGuide: boolean
    teamSeats: number
  }
  /** Checkout placeholder — `${CHECKOUT_API_PATH}?plan=<id>`; session URL from server */
  checkoutUrl?: string
}

export const PLANS: PlanDefinition[] = [
  {
    id: 'free',
    name: 'Free',
    priceLabel: '$0',
    priceNote: 'forever',
    tagline: 'Feel the magic — speak, preview, try Ship.',
    features: [
      'Voice + chat with Grok (bring your key or simulator)',
      'Live Sandpack preview',
      '25 builds / day',
      '5 production ZIPs / day',
      'Basic Ship checklist',
    ],
    limits: {
      buildsPerDay: 25,
      shipExportsPerDay: 5,
      polishPacks: false,
      multiModel: false,
      priorityBuild: false,
      customDomainGuide: true,
      teamSeats: 1,
    },
  },
  {
    id: 'pro',
    name: 'Pro',
    priceLabel: '$29',
    priceNote: '/ month',
    tagline: 'Convenience is the product — ship without the pain.',
    highlight: true,
    features: [
      'Unlimited builds & Ship exports',
      'Full Ship: Supabase · Vercel · domains',
      'Multi-model polish packs (Cursor, Grok, Claude, GPT)',
      'Priority build models when available',
      'Production ZIP with AGENTS + Cursor rules',
      'Launch checklist + readiness score',
    ],
    limits: {
      buildsPerDay: 999,
      shipExportsPerDay: 999,
      polishPacks: true,
      multiModel: true,
      priorityBuild: true,
      customDomainGuide: true,
      teamSeats: 1,
    },
    checkoutUrl: planCheckoutPlaceholder('pro'),
  },
  {
    id: 'team',
    name: 'Team',
    priceLabel: '$79',
    priceNote: '/ month',
    tagline: 'Founders + operators shipping together.',
    features: [
      'Everything in Pro',
      '5 seats',
      'Shared workspace history (soon)',
      'Brand kit export (soon)',
      'Priority support',
    ],
    limits: {
      buildsPerDay: 999,
      shipExportsPerDay: 999,
      polishPacks: true,
      multiModel: true,
      priorityBuild: true,
      customDomainGuide: true,
      teamSeats: 5,
    },
    checkoutUrl: planCheckoutPlaceholder('team'),
  },
]

const PLAN_KEY = 'ideaspeak_plan'
const USAGE_KEY = 'ideaspeak_usage'
const DEMO_PRO_KEY = 'ideaspeak_demo_pro'

export type UsageKind = 'build' | 'ship' | 'polish'

interface DayUsage {
  date: string // YYYY-MM-DD
  build: number
  ship: number
  polish: number
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

function loadUsage(): DayUsage {
  try {
    const raw = localStorage.getItem(USAGE_KEY)
    if (raw) {
      const u = JSON.parse(raw) as DayUsage
      if (u.date === todayKey()) return u
    }
  } catch {
    /* ignore */
  }
  return { date: todayKey(), build: 0, ship: 0, polish: 0 }
}

function saveUsage(u: DayUsage) {
  localStorage.setItem(USAGE_KEY, JSON.stringify(u))
}

export function getPlanId(): PlanId {
  try {
    if (localStorage.getItem(DEMO_PRO_KEY) === '1') return 'pro'
    const p = localStorage.getItem(PLAN_KEY) as PlanId | null
    if (p === 'free' || p === 'pro' || p === 'team') return p
  } catch {
    /* ignore */
  }
  return 'free'
}

export function setPlanId(id: PlanId) {
  localStorage.setItem(PLAN_KEY, id)
  if (id === 'free') localStorage.removeItem(DEMO_PRO_KEY)
}

/** Local unlock for demos / founders testing Pro UX */
export function enableDemoPro() {
  localStorage.setItem(DEMO_PRO_KEY, '1')
  localStorage.setItem(PLAN_KEY, 'pro')
}

export function disableDemoPro() {
  localStorage.removeItem(DEMO_PRO_KEY)
  localStorage.setItem(PLAN_KEY, 'free')
}

export function isDemoPro(): boolean {
  return localStorage.getItem(DEMO_PRO_KEY) === '1'
}

export function getPlan(): PlanDefinition {
  const id = getPlanId()
  return PLANS.find((p) => p.id === id) || PLANS[0]
}

export function getUsage(): DayUsage {
  return loadUsage()
}

/** Remaining daily quota for UI (null = unlimited) */
export function remainingQuota(kind: UsageKind): number | null {
  const plan = getPlan()
  const usage = loadUsage()
  if (kind === 'build') {
    const limit = plan.limits.buildsPerDay
    if (limit >= 999) return null
    return Math.max(0, limit - usage.build)
  }
  if (kind === 'ship') {
    const limit = plan.limits.shipExportsPerDay
    if (limit >= 999) return null
    return Math.max(0, limit - usage.ship)
  }
  return plan.limits.polishPacks ? null : 0
}

export function canUse(kind: UsageKind): { ok: boolean; reason?: string; remaining?: number } {
  const plan = getPlan()
  const usage = loadUsage()

  if (kind === 'build') {
    const limit = plan.limits.buildsPerDay
    if (usage.build >= limit) {
      return {
        ok: false,
        reason: `Free plan: ${limit} builds/day. Upgrade to Pro for unlimited.`,
        remaining: 0,
      }
    }
    return { ok: true, remaining: limit - usage.build }
  }

  if (kind === 'ship') {
    const limit = plan.limits.shipExportsPerDay
    if (usage.ship >= limit) {
      return {
        ok: false,
        reason: `Free plan: ${limit} production export/day. Upgrade to Pro for unlimited Ship.`,
        remaining: 0,
      }
    }
    return { ok: true, remaining: limit - usage.ship }
  }

  if (kind === 'polish') {
    if (!plan.limits.polishPacks) {
      return {
        ok: false,
        reason: 'Multi-model polish packs are a Pro feature.',
        remaining: 0,
      }
    }
    return { ok: true, remaining: 999 }
  }

  return { ok: true }
}

export function recordUsage(kind: UsageKind) {
  const u = loadUsage()
  u[kind] = (u[kind] || 0) + 1
  saveUsage(u)
  // Best-effort server record when signed in (authoritative when Supabase configured)
  void recordUsageOnServer(kind).catch(() => {})
  return u
}

/** POST /api/usage — server-enforced when Supabase service key + user id present */
export async function recordUsageOnServer(
  kind: UsageKind,
  userId?: string | null,
): Promise<{ recorded: boolean }> {
  const uid =
    userId ||
    (typeof window !== 'undefined'
      ? (window as unknown as { __ideaspeakUserId?: string }).__ideaspeakUserId
      : null)
  if (!uid) return { recorded: false }
  try {
    const res = await fetch(billingApiBase('/api/usage'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, userId: uid }),
    })
    const data = await res.json().catch(() => ({}))
    return { recorded: !!data.recorded }
  } catch {
    return { recorded: false }
  }
}

export async function fetchServerUsage(userId?: string | null) {
  const uid = userId || null
  const headers: Record<string, string> = {}
  if (uid) headers['X-User-Id'] = uid
  const res = await fetch(billingApiBase('/api/usage'), { headers })
  if (!res.ok) return null
  return res.json()
}

let stripeConfiguredCache: boolean | null = null

/** True when server has STRIPE_SECRET_KEY + price IDs (cached after first check). */
export async function isStripeCheckoutAvailable(): Promise<boolean> {
  if (stripeConfiguredCache !== null) return stripeConfiguredCache
  try {
    const res = await fetch(billingApiBase('/api/stripe/status'))
    if (!res.ok) {
      stripeConfiguredCache = false
      return false
    }
    const data = (await res.json()) as { configured?: boolean }
    stripeConfiguredCache = !!data.configured
    return stripeConfiguredCache
  } catch {
    stripeConfiguredCache = false
    return false
  }
}

export function clearStripeStatusCache() {
  stripeConfiguredCache = null
}

export interface CheckoutSessionResult {
  url: string | null
  sessionId?: string
  error?: string
}

/** Create Stripe Checkout session via server; redirect user to returned url. */
export async function createCheckoutSession(
  planId: 'pro' | 'team',
  opts?: { successUrl?: string; cancelUrl?: string; customerEmail?: string },
): Promise<CheckoutSessionResult> {
  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'
  const successUrl = opts?.successUrl || `${origin}/?checkout=success&plan=${planId}`
  const cancelUrl = opts?.cancelUrl || `${origin}/?checkout=cancel`

  try {
    const res = await fetch(billingApiBase('/api/stripe/checkout'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        planId,
        successUrl,
        cancelUrl,
        customerEmail: opts?.customerEmail,
      }),
    })
    const data = (await res.json()) as { url?: string | null; sessionId?: string; error?: string }
    if (!res.ok) {
      return { url: null, error: data.error || `Checkout failed (${res.status})` }
    }
    return { url: data.url ?? null, sessionId: data.sessionId }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Network error'
    return { url: null, error: msg }
  }
}

/** After Stripe redirect — optimistic local unlock until Supabase entitlements ship. */
export function handleCheckoutReturn(): PlanId | null {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  if (params.get('checkout') !== 'success') return null

  const plan = params.get('plan')
  if (plan !== 'pro' && plan !== 'team') return null

  setPlanId(plan)
  localStorage.removeItem(DEMO_PRO_KEY)
  const url = new URL(window.location.href)
  url.searchParams.delete('checkout')
  url.searchParams.delete('plan')
  window.history.replaceState({}, '', url.pathname + url.search + url.hash)
  return plan
}

export function monetizationValueProps(): string[] {
  return [
    'Time is the product — speak → live preview → Ship in one surface',
    'Supabase + Vercel + domain path without tab-hopping chaos',
    'Multi-model polish: Grok for taste, Cursor for IDE, Claude/GPT for second opinions',
    'Exports that hand off cleanly to any agent (AGENTS.md, .cursorrules)',
    'Usage that scales with founders who ship weekly, not hobbyists who dabble once',
  ]
}
