/** CORS + origin lock + rate limiting — protects hosted Grok quota */

const PRODUCTION_ORIGINS = new Set([
  'https://ideaspeak-app.vercel.app',
  'https://ideaspeak-app-voxli.vercel.app',
])

const DEV_ORIGINS = new Set([
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
])

/** POST paths that burn xAI tokens — 60 req/min/IP */
export const RATE_LIMITED_PATHS = new Set([
  '/api/build',
  '/api/discuss',
  '/api/refine',
  '/api/xai',
])

const RATE_LIMIT_MAX = 60
const RATE_LIMIT_WINDOW_MS = 60_000

/** @type {Map<string, { count: number, resetAt: number }>} */
const rateBuckets = new Map()

function isVercelPreview(hostname) {
  if (!hostname.endsWith('.vercel.app')) return false
  if (hostname === 'ideaspeak-app.vercel.app') return true
  // Preview deploys: ideaspeak-app-<hash>.vercel.app or ideaspeak-app-git-<branch>-<team>.vercel.app
  if (hostname.startsWith('ideaspeak-app-')) return true
  if (hostname.includes('ideaspeak')) return true
  return false
}

export function isAllowedOrigin(origin) {
  if (!origin) return true
  if (PRODUCTION_ORIGINS.has(origin)) return true
  if (DEV_ORIGINS.has(origin)) return true
  try {
    const { hostname, protocol } = new URL(origin)
    if (protocol !== 'http:' && protocol !== 'https:') return false
    if (isVercelPreview(hostname)) return true
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
    'Access-Control-Allow-Headers': 'Content-Type, X-AI-Key, Authorization',
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

export function getClientIp(req) {
  const forwarded =
    req?.headers?.get?.('x-forwarded-for') ||
    req?.headers?.['x-forwarded-for'] ||
    ''
  if (forwarded) return String(forwarded).split(',')[0].trim()
  const realIp = req?.headers?.get?.('x-real-ip') || req?.headers?.['x-real-ip']
  if (realIp) return String(realIp).trim()
  const cfIp = req?.headers?.get?.('cf-connecting-ip') || req?.headers?.['cf-connecting-ip']
  if (cfIp) return String(cfIp).trim()
  return 'unknown'
}

function pruneRateBuckets(now = Date.now()) {
  if (rateBuckets.size < 500) return
  for (const [ip, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(ip)
  }
}

/**
 * Fixed-window rate limiter (in-memory, per instance).
 * @returns {{ allowed: boolean, remaining: number, resetAt: number, retryAfter: number }}
 */
export function checkRateLimit(req, opts = {}) {
  const limit = opts.limit ?? RATE_LIMIT_MAX
  const windowMs = opts.windowMs ?? RATE_LIMIT_WINDOW_MS
  const ip = getClientIp(req)
  const now = Date.now()

  pruneRateBuckets(now)

  let bucket = rateBuckets.get(ip)
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs }
    rateBuckets.set(ip, bucket)
  }

  bucket.count += 1
  const allowed = bucket.count <= limit
  const remaining = Math.max(0, limit - bucket.count)
  const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))

  return { allowed, remaining, resetAt: bucket.resetAt, retryAfter }
}

export function rateLimitHeaders(result) {
  return {
    'X-RateLimit-Limit': String(RATE_LIMIT_MAX),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
    ...(result.allowed ? {} : { 'Retry-After': String(result.retryAfter) }),
  }
}

/**
 * Check rate limit once; return 429 Response or headers to attach on success.
 * @returns {{ blocked: Response | null, headers: Record<string, string> }}
 */
export function enforceRateLimit(req) {
  const result = checkRateLimit(req)
  const headers = rateLimitHeaders(result)
  if (result.allowed) return { blocked: null, headers }
  return {
    blocked: new Response(
      JSON.stringify({
        error: 'Rate limit exceeded',
        message: `Max ${RATE_LIMIT_MAX} requests per minute per IP`,
        retryAfter: result.retryAfter,
      }),
      {
        status: 429,
        headers: {
          ...corsHeaders(req),
          ...headers,
          'Content-Type': 'application/json',
        },
      },
    ),
    headers,
  }
}

/** @deprecated use enforceRateLimit */
export function rejectRateLimited(req) {
  return enforceRateLimit(req).blocked
}

/** Node serverless handler (api/build.js) — returns true when blocked */
export function rejectRateLimitedNode(req, res) {
  const result = checkRateLimit(req)
  if (result.allowed) return false
  for (const [key, value] of Object.entries(rateLimitHeaders(result))) {
    res.setHeader(key, value)
  }
  res.status(429).json({
    error: 'Rate limit exceeded',
    message: `Max ${RATE_LIMIT_MAX} requests per minute per IP`,
    retryAfter: result.retryAfter,
  })
  return true
}

export function shouldRateLimit(pathname, method = 'POST') {
  return method === 'POST' && RATE_LIMITED_PATHS.has(pathname)
}