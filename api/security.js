/** CORS + origin checks — prevents third-party sites from burning your hosted Grok quota */

const PRODUCTION_ORIGINS = new Set([
  'https://ideaspeak-app.vercel.app',
  'https://ideaspeak-app-voxli.vercel.app',
])

const DEV_ORIGINS = new Set([
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
])

function isIdeaspeakVercelPreview(hostname) {
  return hostname.endsWith('.vercel.app') && hostname.includes('ideaspeak')
}

export function isAllowedOrigin(origin) {
  if (!origin) return true
  if (PRODUCTION_ORIGINS.has(origin)) return true
  if (DEV_ORIGINS.has(origin)) return true
  try {
    const { hostname } = new URL(origin)
    if (isIdeaspeakVercelPreview(hostname)) return true
    if (hostname === 'localhost' || hostname === '127.0.0.1') return true
  } catch {
    return false
  }
  return false
}

function getOrigin(req) {
  if (req?.headers?.get) return req.headers.get('origin') || ''
  return req?.headers?.origin || ''
}

export function corsHeaders(req) {
  const origin = getOrigin(req)
  const allowed = isAllowedOrigin(origin)
  const allowOrigin = allowed && origin ? origin : 'https://ideaspeak-app.vercel.app'
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  }
}

/** Returns a 403 Response when origin is blocked, otherwise null */
export function rejectBlockedOrigin(req) {
  const origin = getOrigin(req)
  if (!origin) return null
  if (isAllowedOrigin(origin)) return null
  return new Response(JSON.stringify({ error: 'Forbidden origin' }), {
    status: 403,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}