import { corsHeaders, rejectBlockedOrigin } from '../security.js'
import { getOrCreateRequestId, requestIdHeaders } from '../observability.js'
import {
  createChiefSession,
  getChiefGateSecret,
  verifyOwnerSupabaseToken,
} from '../chief-auth.js'

export const config = { runtime: 'edge', maxDuration: 15 }

export default async function handler(req) {
  const requestId = getOrCreateRequestId(req)
  const baseHeaders = { ...corsHeaders(req), ...requestIdHeaders(requestId) }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: baseHeaders })
  }

  const blocked = rejectBlockedOrigin(req)
  if (blocked) return blocked

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed', requestId }), {
      status: 405,
      headers: { ...baseHeaders, 'Content-Type': 'application/json' },
    })
  }

  const secret = getChiefGateSecret()
  if (!secret) {
    return new Response(
      JSON.stringify({
        error: 'Chief desk not configured',
        hint: 'Set CHIEF_GATE_SECRET on the server',
        requestId,
      }),
      { status: 503, headers: { ...baseHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const body = await req.json().catch(() => ({}))
  const gateSecret = String(body.secret || '').trim()
  const authHeader = req.headers.get('authorization') || ''
  const bearer = authHeader.replace(/^Bearer\s+/i, '').trim()

  let allowed = false
  if (gateSecret && gateSecret === secret) {
    allowed = true
  } else if (bearer) {
    allowed = await verifyOwnerSupabaseToken(bearer)
  }

  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Access denied', requestId }), {
      status: 403,
      headers: { ...baseHeaders, 'Content-Type': 'application/json' },
    })
  }

  const session = await createChiefSession(secret)
  return new Response(
    JSON.stringify({ ok: true, token: session.token, expiresAt: session.expiresAt, requestId }),
    { headers: { ...baseHeaders, 'Content-Type': 'application/json' } },
  )
}
