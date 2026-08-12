/**
 * Structured observability for failed Grok generations.
 * Logs JSON to stdout (Vercel/Railway log drains) with request IDs for support correlation.
 * Never logs raw transcripts — only SHA-256 prefix hashes.
 */

import { getClientIp } from './security.js'

export function createRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

export function getOrCreateRequestId(req) {
  const header =
    req?.headers?.get?.('x-request-id') ||
    req?.headers?.get?.('X-Request-Id') ||
    req?.headers?.['x-request-id'] ||
    req?.headers?.['X-Request-Id']
  if (typeof header === 'string' && header.trim()) {
    return header.trim().slice(0, 64)
  }
  return createRequestId()
}

/** Hash transcript/sample for log correlation without storing PII */
export async function hashForLog(text, maxLen = 500) {
  const sample = String(text || '').slice(0, maxLen)
  if (!sample) return null
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle?.digest) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sample))
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 16)
    }
  } catch {
    /* fall through */
  }
  return `len:${sample.length}`
}

/** Last user message from discuss messages array */
export function lastUserMessage(messages) {
  if (!Array.isArray(messages)) return ''
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m?.role === 'user') {
      const c = m.content
      if (typeof c === 'string') return c
      if (Array.isArray(c)) {
        const text = c.find((p) => p?.type === 'text')?.text
        if (typeof text === 'string') return text
      }
    }
  }
  return ''
}

export function logGenerationFailure(entry) {
  const payload = {
    level: 'error',
    event: 'generation_failed',
    timestamp: new Date().toISOString(),
    service: 'ideaspeak-api',
    ...entry,
  }
  console.error(JSON.stringify(payload))
}

export function requestIdHeaders(requestId) {
  return { 'X-Request-Id': requestId }
}

export function jsonErrorBody({ requestId, error, code }) {
  const body = { error: String(error || 'Request failed'), requestId }
  if (code) body.code = code
  return body
}

/**
 * Log + build context for a failed generation route.
 * @param {object} opts
 */
export async function recordGenerationFailure(req, opts) {
  const requestId = opts.requestId || getOrCreateRequestId(req)
  const transcriptHash = await hashForLog(opts.transcript || opts.sample || '')
  logGenerationFailure({
    requestId,
    route: opts.route,
    kind: opts.kind || 'generation',
    status: opts.status ?? 500,
    error: String(opts.error || 'unknown'),
    model: opts.model || null,
    xaiStatus: opts.xaiStatus ?? null,
    transcriptHash,
    messageCount: opts.messageCount ?? null,
    ip: getClientIp(req),
    durationMs: opts.durationMs ?? null,
  })
  return requestId
}

/** Edge / Web Response error */
export async function edgeErrorResponse(
  req,
  corsHeaders,
  {
    status = 500,
    error,
    route,
    kind,
    transcript,
    sample,
    model,
    xaiStatus,
    messageCount,
    rateHeaders = {},
    requestId,
    durationMs,
  },
) {
  const rid = await recordGenerationFailure(req, {
    requestId,
    route,
    kind,
    status,
    error,
    model,
    xaiStatus,
    transcript,
    sample,
    messageCount,
    durationMs,
  })
  return new Response(JSON.stringify(jsonErrorBody({ requestId: rid, error })), {
    status,
    headers: {
      ...corsHeaders(req),
      ...rateHeaders,
      ...requestIdHeaders(rid),
      'Content-Type': 'application/json',
    },
  })
}

/** Node serverless handler (api/build.js) */
export async function nodeErrorJson(res, req, opts) {
  const rid = await recordGenerationFailure(req, opts)
  res.setHeader('X-Request-Id', rid)
  return res.status(opts.status ?? 500).json(jsonErrorBody({ requestId: rid, error: opts.error }))
}

/** Bun server Response.json helper */
export async function bunErrorJson(req, headers, opts) {
  const rid = await recordGenerationFailure(req, opts)
  return Response.json(jsonErrorBody({ requestId: rid, error: opts.error }), {
    status: opts.status ?? 500,
    headers: { ...headers, ...requestIdHeaders(rid) },
  })
}
