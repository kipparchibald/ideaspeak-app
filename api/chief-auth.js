/** Chief of Staff gate — HMAC session tokens (edge + Bun safe) */

const SESSION_TTL_MS = 12 * 60 * 60 * 1000

function b64urlEncode(bytes) {
  const bin = String.fromCharCode(...bytes)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/')
  const pad = padded.length % 4 === 0 ? padded : padded + '='.repeat(4 - (padded.length % 4))
  const bin = atob(pad)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

async function hmacSign(secret, data) {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data))
  return b64urlEncode(new Uint8Array(sig))
}

export function getChiefGateSecret() {
  return process.env.CHIEF_GATE_SECRET?.trim() || ''
}

export function getChiefOwnerEmail() {
  return (process.env.CHIEF_OWNER_EMAIL || 'kipp@kipparchibald.com').trim().toLowerCase()
}

export async function createChiefSession(secret) {
  const exp = Date.now() + SESSION_TTL_MS
  const payloadB64 = b64urlEncode(new TextEncoder().encode(JSON.stringify({ exp, v: 1 })))
  const sig = await hmacSign(secret, payloadB64)
  return { token: `${payloadB64}.${sig}`, expiresAt: exp }
}

export async function verifyChiefSession(token, secret) {
  if (!token || !secret) return false
  const parts = String(token).split('.')
  if (parts.length !== 2) return false
  const [payloadB64, sig] = parts
  const expected = await hmacSign(secret, payloadB64)
  if (sig !== expected) return false
  try {
    const json = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadB64)))
    if (json.v !== 1 || !json.exp || Date.now() > json.exp) return false
    return true
  } catch {
    return false
  }
}

export function chiefSessionHeader(req) {
  if (req?.headers?.get) {
    return (
      req.headers.get('x-chief-session')?.trim() ||
      req.headers.get('X-Chief-Session')?.trim() ||
      ''
    )
  }
  return req?.headers?.['x-chief-session']?.trim() || ''
}

export async function requireChiefSession(req) {
  const secret = getChiefGateSecret()
  if (!secret) {
    return {
      ok: false,
      status: 503,
      error: 'Chief desk is not configured (CHIEF_GATE_SECRET missing on server)',
    }
  }
  const token = chiefSessionHeader(req)
  if (!token) {
    return { ok: false, status: 401, error: 'Chief session required' }
  }
  const valid = await verifyChiefSession(token, secret)
  if (!valid) {
    return { ok: false, status: 401, error: 'Invalid or expired Chief session' }
  }
  return { ok: true }
}

/** Verify Supabase access token and match owner email */
export async function verifyOwnerSupabaseToken(accessToken) {
  const url = process.env.SUPABASE_URL?.trim()
  const serviceKey = process.env.SUPABASE_SERVICE_KEY?.trim()
  const ownerEmail = getChiefOwnerEmail()
  if (!url || !serviceKey || !accessToken) return false

  try {
    const res = await fetch(`${url}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: serviceKey,
      },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return false
    const data = await res.json()
    const email = String(data?.email || '').trim().toLowerCase()
    return email.length > 0 && email === ownerEmail
  } catch {
    return false
  }
}

export function chiefIntegrationStatus() {
  const calendarConnected = Boolean(
    process.env.GOOGLE_CALENDAR_REFRESH_TOKEN?.trim() ||
      process.env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim(),
  )
  const gmailConnected = Boolean(
    process.env.GMAIL_REFRESH_TOKEN?.trim() ||
      process.env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim(),
  )
  return {
    timezone: 'America/Boise',
    calendarConnected,
    gmailConnected,
    mailSendEnabled: false,
  }
}
