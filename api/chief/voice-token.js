import { getApiKey } from '../xai.js'
import { corsHeaders, rejectBlockedOrigin } from '../security.js'
import { edgeErrorResponse, getOrCreateRequestId, requestIdHeaders } from '../observability.js'
import { requireChiefSession } from '../chief-auth.js'

export const config = { runtime: 'edge', maxDuration: 30 }

export default async function handler(req) {
  const requestId = getOrCreateRequestId(req)
  const baseHeaders = { ...corsHeaders(req), ...requestIdHeaders(requestId) }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: baseHeaders })
  }

  const blocked = rejectBlockedOrigin(req)
  if (blocked) return blocked

  const gate = await requireChiefSession(req)
  if (!gate.ok) {
    return new Response(JSON.stringify({ error: gate.error, requestId }), {
      status: gate.status,
      headers: { ...baseHeaders, 'Content-Type': 'application/json' },
    })
  }

  const apiKey = getApiKey(req)
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'XAI_API_KEY not configured', requestId }),
      { status: 401, headers: { ...baseHeaders, 'Content-Type': 'application/json' } },
    )
  }

  try {
    const res = await fetch('https://api.x.ai/v1/realtime/client_secrets', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expires_after: { seconds: 300 } }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error?.message || 'Token fetch failed')
    return new Response(JSON.stringify({ ...data, requestId }), {
      headers: { ...baseHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return edgeErrorResponse(req, corsHeaders, {
      requestId,
      status: 500,
      error: e.message,
      route: '/api/chief/voice-token',
      kind: 'chief-voice-token',
    })
  }
}
