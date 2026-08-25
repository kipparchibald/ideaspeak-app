/** Client-side Chief of Staff gate + API helpers */

const SESSION_KEY = 'ideaspeak_chief_session'
const SESSION_EXP_KEY = 'ideaspeak_chief_session_exp'

export type ChiefIntegrationStatus = {
  timezone: string
  calendarConnected: boolean
  gmailConnected: boolean
  mailSendEnabled: boolean
}

export function getChiefSessionToken(): string | null {
  if (typeof window === 'undefined') return null
  const token = sessionStorage.getItem(SESSION_KEY)
  const exp = Number(sessionStorage.getItem(SESSION_EXP_KEY) || 0)
  if (!token || !exp || Date.now() > exp) {
    clearChiefSession()
    return null
  }
  return token
}

export function storeChiefSession(token: string, expiresAt: number) {
  sessionStorage.setItem(SESSION_KEY, token)
  sessionStorage.setItem(SESSION_EXP_KEY, String(expiresAt))
}

export function clearChiefSession() {
  sessionStorage.removeItem(SESSION_KEY)
  sessionStorage.removeItem(SESSION_EXP_KEY)
}

export function isChiefUnlocked(): boolean {
  return Boolean(getChiefSessionToken())
}

function chiefHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getChiefSessionToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...extra }
  if (token) headers['X-Chief-Session'] = token
  return headers
}

export async function unlockChiefDesk(opts: {
  secret?: string
  supabaseAccessToken?: string
}): Promise<{ ok: boolean; error?: string }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (opts.supabaseAccessToken) {
    headers.Authorization = `Bearer ${opts.supabaseAccessToken}`
  }

  const res = await fetch('/api/chief/unlock', {
    method: 'POST',
    headers,
    body: JSON.stringify(opts.secret ? { secret: opts.secret } : {}),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    return { ok: false, error: (data.error as string) || `Unlock failed (${res.status})` }
  }

  if (typeof data.token === 'string' && data.expiresAt) {
    storeChiefSession(data.token, Number(data.expiresAt))
    return { ok: true }
  }

  return { ok: false, error: 'Invalid unlock response' }
}

export async function fetchChiefStatus(): Promise<ChiefIntegrationStatus | null> {
  const token = getChiefSessionToken()
  if (!token) return null

  const res = await fetch('/api/chief/status', { headers: chiefHeaders() })
  if (!res.ok) {
    if (res.status === 401) clearChiefSession()
    return null
  }
  const data = await res.json()
  return {
    timezone: data.timezone || 'America/Boise',
    calendarConnected: !!data.calendarConnected,
    gmailConnected: !!data.gmailConnected,
    mailSendEnabled: !!data.mailSendEnabled,
  }
}

export async function chiefDiscuss(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  voiceMode = false,
): Promise<string> {
  const res = await fetch('/api/chief/discuss', {
    method: 'POST',
    headers: chiefHeaders(),
    body: JSON.stringify({ messages, voiceMode }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401) clearChiefSession()
    throw new Error((data.error as string) || `Chief discuss failed (${res.status})`)
  }
  return String(data.content || '')
}

export function chiefVoiceTokenPaths(): string[] {
  return ['/api/chief/voice-token']
}

export function chiefVoiceTokenHeaders(): Record<string, string> {
  const token = getChiefSessionToken()
  return token ? { 'X-Chief-Session': token } : {}
}
