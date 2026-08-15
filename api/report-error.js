/**
 * Lightweight client error ingest — structured logs for Vercel/Railway drains.
 * Optional Sentry forwarding when SENTRY_DSN is set (no PII; message + stack prefix only).
 */

import { corsHeaders, rejectBlockedOrigin } from './security.js'
import { createRequestId, hashForLog } from './observability.js'

export const config = { runtime: 'edge' }

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) })
  }

  const blocked = rejectBlockedOrigin(req)
  if (blocked) return blocked

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })
  }

  const body = await req.json().catch(() => ({}))
  const message = String(body.message || 'client_error').slice(0, 500)
  const stackPrefix = String(body.stackPrefix || '').slice(0, 800)
  const source = String(body.source || '').slice(0, 200)
  const url = String(body.url || '').slice(0, 300)
  const requestId = createRequestId()
  const messageHash = await hashForLog(message)

  const payload = {
    level: 'error',
    event: 'client_error',
    timestamp: new Date().toISOString(),
    service: 'ideaspeak-web',
    requestId,
    messageHash,
    source: source || null,
    urlHost: (() => {
      try {
        return new URL(url).host
      } catch {
        return null
      }
    })(),
    stackLen: stackPrefix.length || null,
  }

  console.error(JSON.stringify(payload))

  const sentryDsn = process.env.SENTRY_DSN?.trim()
  if (sentryDsn && message) {
    try {
      const dsnUrl = new URL(sentryDsn)
      const projectId = dsnUrl.pathname.replace('/', '')
      const sentryKey = dsnUrl.username
      const host = dsnUrl.host
      await fetch(`https://${host}/api/${projectId}/store/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${sentryKey}`,
        },
        body: JSON.stringify({
          event_id: requestId.replace(/-/g, '').slice(0, 32),
          message,
          platform: 'javascript',
          tags: { service: 'ideaspeak-web' },
          exception: stackPrefix
            ? { values: [{ type: 'Error', value: message, stacktrace: { frames: [] } }] }
            : undefined,
        }),
        signal: AbortSignal.timeout(4000),
      }).catch(() => null)
    } catch {
      /* optional forward */
    }
  }

  return new Response(JSON.stringify({ ok: true, requestId }), {
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}
