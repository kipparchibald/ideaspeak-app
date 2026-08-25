import { corsHeaders, rejectBlockedOrigin } from '../security.js'
import { getOrCreateRequestId, requestIdHeaders } from '../observability.js'
import { chiefIntegrationStatus, requireChiefSession } from '../chief-auth.js'

export const config = { runtime: 'edge', maxDuration: 10 }

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

  return new Response(
    JSON.stringify({ ok: true, ...chiefIntegrationStatus(), requestId }),
    { headers: { ...baseHeaders, 'Content-Type': 'application/json' } },
  )
}
