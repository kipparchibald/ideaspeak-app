/**
 * Confidential Box — one encrypted vault for all ship secrets.
 * Enter once → IdeaSpeak drives GitHub / Vercel / Supabase / Grok without
 * pasting into each dashboard. Secrets never leave the browser unless you
 * opt into Server Autopilot (which uses Railway env, not this box).
 */

import { saveLocalXaiKey, saveLocalE2bKey, loadLocalXaiKey, loadLocalE2bKey } from './api-verify'
import { loadGithubToken, saveGithubToken } from './autopilot'
import { loadShipPrefs, saveShipPrefs } from './ship'

const VAULT_KEY = 'ideaspeak_confidential_box_v1'
const DEVICE_KEY_MATERIAL = 'ideaspeak_box_device_key_v1'
const META_KEY = 'ideaspeak_confidential_box_meta'

export type VaultSecretId =
  | 'xaiApiKey'
  | 'e2bApiKey'
  | 'githubToken'
  | 'vercelToken'
  | 'vercelTeamId'
  | 'supabaseUrl'
  | 'supabaseAnonKey'
  | 'supabaseServiceKey'
  | 'stripeSecretKey'
  | 'stripeWebhookSecret'
  | 'customDomain'

export interface VaultSecrets {
  xaiApiKey: string
  e2bApiKey: string
  githubToken: string
  vercelToken: string
  vercelTeamId: string
  supabaseUrl: string
  supabaseAnonKey: string
  supabaseServiceKey: string
  stripeSecretKey: string
  stripeWebhookSecret: string
  customDomain: string
}

export interface VaultMeta {
  hasVault: boolean
  locked: boolean
  updatedAt: string | null
  usePassphrase: boolean
  /** Which secret slots have non-empty values (never the values themselves) */
  filled: Partial<Record<VaultSecretId, boolean>>
}

export const EMPTY_VAULT: VaultSecrets = {
  xaiApiKey: '',
  e2bApiKey: '',
  githubToken: '',
  vercelToken: '',
  vercelTeamId: '',
  supabaseUrl: '',
  supabaseAnonKey: '',
  supabaseServiceKey: '',
  stripeSecretKey: '',
  stripeWebhookSecret: '',
  customDomain: '',
}

export const VAULT_FIELDS: {
  id: VaultSecretId
  label: string
  hint: string
  href?: string
  group: 'core' | 'ship' | 'optional'
  secret?: boolean
  placeholder?: string
}[] = [
  {
    id: 'xaiApiKey',
    label: 'xAI / Grok API key',
    hint: 'Real voice + builds (not simulator)',
    href: 'https://console.x.ai/',
    group: 'core',
    secret: true,
    placeholder: 'xai-…',
  },
  {
    id: 'githubToken',
    label: 'GitHub personal access token',
    hint: 'repo scope — Autopilot creates private repos & pushes',
    href: 'https://github.com/settings/tokens?type=beta',
    group: 'ship',
    secret: true,
    placeholder: 'ghp_… or github_pat_…',
  },
  {
    id: 'vercelToken',
    label: 'Vercel token',
    hint: 'Autonomous deploy without opening vercel.com/new',
    href: 'https://vercel.com/account/tokens',
    group: 'ship',
    secret: true,
    placeholder: '…',
  },
  {
    id: 'vercelTeamId',
    label: 'Vercel team ID (optional)',
    hint: 'Only if deploying under a team',
    href: 'https://vercel.com/docs/accounts/create-a-team',
    group: 'ship',
    placeholder: 'team_…',
  },
  {
    id: 'supabaseUrl',
    label: 'Supabase project URL',
    hint: 'Injected into exported apps + Vercel env automatically',
    href: 'https://supabase.com/dashboard/projects',
    group: 'ship',
    placeholder: 'https://xxxx.supabase.co',
  },
  {
    id: 'supabaseAnonKey',
    label: 'Supabase anon key',
    hint: 'Public client key — set on Vercel for you',
    group: 'ship',
    secret: true,
    placeholder: 'eyJ…',
  },
  {
    id: 'supabaseServiceKey',
    label: 'Supabase service role (optional)',
    hint: 'For future schema push — never expose to browser apps you ship',
    group: 'optional',
    secret: true,
  },
  {
    id: 'e2bApiKey',
    label: 'E2B sandbox key (optional)',
    hint: 'Real cloud preview instead of Sandpack stub',
    href: 'https://e2b.dev/',
    group: 'optional',
    secret: true,
  },
  {
    id: 'customDomain',
    label: 'Default custom domain (optional)',
    hint: 'Used in Ship checklists & DNS guidance',
    group: 'optional',
    placeholder: 'app.yourbrand.com',
  },
  {
    id: 'stripeSecretKey',
    label: 'Stripe secret (optional)',
    hint: 'Platform billing only — keep on server when possible',
    group: 'optional',
    secret: true,
  },
  {
    id: 'stripeWebhookSecret',
    label: 'Stripe webhook secret (optional)',
    hint: 'Platform webhooks',
    group: 'optional',
    secret: true,
  },
]

// ── Crypto helpers ──────────────────────────────────────────────────────────

function b64encode(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!)
  return btoa(s)
}

function b64decode(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ])
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: 120_000,
      hash: 'SHA-256',
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function getOrCreateDevicePassphrase(): Promise<string> {
  let existing = localStorage.getItem(DEVICE_KEY_MATERIAL)
  if (existing) return existing
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  existing = b64encode(bytes.buffer)
  localStorage.setItem(DEVICE_KEY_MATERIAL, existing)
  return existing
}

async function encryptJson(data: unknown, passphrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(passphrase, salt)
  const plain = new TextEncoder().encode(JSON.stringify(data))
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain)
  return JSON.stringify({
    v: 1,
    s: b64encode(salt.buffer),
    i: b64encode(iv.buffer),
    c: b64encode(cipher),
  })
}

async function decryptJson<T>(blob: string, passphrase: string): Promise<T> {
  const parsed = JSON.parse(blob) as { v: number; s: string; i: string; c: string }
  const salt = b64decode(parsed.s)
  const iv = b64decode(parsed.i)
  const cipher = b64decode(parsed.c)
  const key = await deriveKey(passphrase, salt)
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    cipher as BufferSource,
  )
  return JSON.parse(new TextDecoder().decode(plain)) as T
}

// ── In-memory unlock cache (session only) ───────────────────────────────────

let sessionSecrets: VaultSecrets | null = null


export function isVaultUnlocked(): boolean {
  return sessionSecrets !== null
}

export function getSessionSecrets(): VaultSecrets | null {
  return sessionSecrets
}

export function lockVault() {
  sessionSecrets = null
}


function filledMap(s: VaultSecrets): VaultMeta['filled'] {
  const out: VaultMeta['filled'] = {}
  for (const id of Object.keys(EMPTY_VAULT) as VaultSecretId[]) {
    if (s[id]?.trim()) out[id] = true
  }
  return out
}

export function readVaultMeta(): VaultMeta {
  try {
    const raw = localStorage.getItem(META_KEY)
    if (raw) {
      const m = JSON.parse(raw) as VaultMeta
      return {
        hasVault: !!localStorage.getItem(VAULT_KEY),
        locked: !sessionSecrets,
        updatedAt: m.updatedAt || null,
        usePassphrase: !!m.usePassphrase,
        filled: m.filled || {},
      }
    }
  } catch {
    /* ignore */
  }
  return {
    hasVault: !!localStorage.getItem(VAULT_KEY),
    locked: !sessionSecrets,
    updatedAt: null,
    usePassphrase: false,
    filled: {},
  }
}

function writeMeta(secrets: VaultSecrets, usePassphrase: boolean) {
  const meta: VaultMeta = {
    hasVault: true,
    locked: false,
    updatedAt: new Date().toISOString(),
    usePassphrase,
    filled: filledMap(secrets),
  }
  localStorage.setItem(META_KEY, JSON.stringify(meta))
}

/** Seed vault draft from scattered localStorage keys (migration). */
export function seedFromLegacyStorage(): VaultSecrets {
  const prefs = loadShipPrefs()
  return {
    ...EMPTY_VAULT,
    xaiApiKey: loadLocalXaiKey(),
    e2bApiKey: loadLocalE2bKey(),
    githubToken: loadGithubToken(),
    supabaseUrl: prefs.supabase.url || '',
    supabaseAnonKey: prefs.supabase.anonKey || '',
    customDomain: prefs.customDomain || '',
  }
}

/**
 * Save vault. If passphrase is empty, uses a device-local key (still AES encrypted;
 * less portable, zero friction on this browser).
 */
export async function saveVault(
  secrets: VaultSecrets,
  opts?: { passphrase?: string },
): Promise<void> {
  const pass = opts?.passphrase?.trim() || (await getOrCreateDevicePassphrase())
  const usePassphrase = Boolean(opts?.passphrase?.trim())
  const blob = await encryptJson(secrets, pass)
  localStorage.setItem(VAULT_KEY, blob)
  writeMeta(secrets, usePassphrase)
  sessionSecrets = { ...secrets }
  applyVaultToRuntime(secrets)
}

export async function unlockVault(passphrase?: string): Promise<VaultSecrets> {
  const blob = localStorage.getItem(VAULT_KEY)
  if (!blob) {
    const seeded = seedFromLegacyStorage()
    sessionSecrets = seeded
    return seeded
  }
  const meta = readVaultMeta()
  const pass =
    passphrase?.trim() ||
    (meta.usePassphrase ? '' : await getOrCreateDevicePassphrase())
  if (!pass) throw new Error('Passphrase required to unlock Confidential Box')
  try {
    const secrets = await decryptJson<VaultSecrets>(blob, pass)
    sessionSecrets = { ...EMPTY_VAULT, ...secrets }
      applyVaultToRuntime(sessionSecrets)
    return sessionSecrets
  } catch {
    throw new Error('Wrong passphrase or corrupted vault')
  }
}

/** Try unlock without UI — device key or already-unlocked session. */
export async function tryAutoUnlock(): Promise<VaultSecrets | null> {
  if (sessionSecrets) return sessionSecrets
  if (!localStorage.getItem(VAULT_KEY)) {
    const seeded = seedFromLegacyStorage()
    if (Object.values(seeded).some((v) => v.trim())) {
      // Migrate legacy keys into a device-encrypted vault silently
      await saveVault(seeded)
      return seeded
    }
    return null
  }
  const meta = readVaultMeta()
  if (meta.usePassphrase) return null
  try {
    return await unlockVault()
  } catch {
    return null
  }
}

export function clearVault() {
  localStorage.removeItem(VAULT_KEY)
  localStorage.removeItem(META_KEY)
  sessionSecrets = null
}

/**
 * Push vault values into the rest of IdeaSpeak so existing code paths work
 * without reading the vault directly.
 */
export function applyVaultToRuntime(secrets: VaultSecrets) {
  if (secrets.xaiApiKey.trim()) saveLocalXaiKey(secrets.xaiApiKey.trim())
  if (secrets.e2bApiKey.trim()) saveLocalE2bKey(secrets.e2bApiKey.trim())
  if (secrets.githubToken.trim()) saveGithubToken(secrets.githubToken.trim())

  const prefs = loadShipPrefs()
  saveShipPrefs({
    ...prefs,
    supabase: {
      ...prefs.supabase,
      url: secrets.supabaseUrl.trim() || prefs.supabase.url,
      anonKey: secrets.supabaseAnonKey.trim() || prefs.supabase.anonKey,
    },
    customDomain: secrets.customDomain.trim() || prefs.customDomain,
  })
}

/** Readiness for hands-off ship (no dashboard clicking). */
export function autonomousShipReadiness(secrets?: VaultSecrets | null): {
  ready: boolean
  score: number
  missing: string[]
  optional: string[]
  message: string
} {
  const s = secrets || sessionSecrets || seedFromLegacyStorage()
  const missing: string[] = []
  const optional: string[] = []
  if (!s.githubToken.trim()) missing.push('GitHub token')
  if (!s.vercelToken.trim()) missing.push('Vercel token')
  if (!s.supabaseUrl.trim() || !s.supabaseAnonKey.trim()) {
    optional.push('Supabase URL + anon (apps with auth/data need these)')
  }
  if (!s.xaiApiKey.trim()) optional.push('xAI key (simulator works without it)')
  if (!s.e2bApiKey.trim()) optional.push('E2B (Sandpack preview works without it)')

  const required = 2
  const have = required - missing.length
  const score = Math.round((have / required) * 100)
  const ready = missing.length === 0
  return {
    ready,
    score,
    missing,
    optional,
    message: ready
      ? 'Confidential Box can ship without opening Vercel or GitHub UIs'
      : `Add ${missing.join(' + ')} for hands-off deploy`,
  }
}

export function maskSecret(value: string): string {
  const v = value.trim()
  if (!v) return ''
  if (v.length <= 8) return '••••••••'
  return `${v.slice(0, 4)}…${v.slice(-4)}`
}
