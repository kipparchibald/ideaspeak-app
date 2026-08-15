import { getApiKey, hasServerApiKey, pingXai, xaiError, MODELS } from './xai.js'
import { corsHeaders, rejectBlockedOrigin } from './security.js'

export const config = { runtime: 'edge' }

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) })
  }

  const blocked = rejectBlockedOrigin(req)
  if (blocked) return blocked

  const apiKey = getApiKey(req)

  const health = {
    supabase: !!(
      process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_KEY?.trim()
    ),
    stripe: !!process.env.STRIPE_SECRET_KEY?.trim(),
    shipWorker: !!(
      process.env.SHIP_WORKER_URL?.trim() && process.env.SHIP_WORKER_SECRET?.trim()
    ),
    usageAuthoritative: !!(
      process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_KEY?.trim()
    ),
  }

  if (!apiKey) {
    return new Response(
      JSON.stringify({
        live: false,
        source: 'none',
        model: MODELS.chat,
        health,
        message: hasServerApiKey()
          ? 'Server key configured but unavailable'
          : 'Add XAI_API_KEY to Vercel (ideaspeak-app → Production) or .env.local for local dev',
      }),
      { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
    )
  }

  const { ok, data } = await pingXai(apiKey)

  if (!ok) {
    return new Response(
      JSON.stringify({
        live: false,
        source: 'server',
        model: MODELS.chat,
        health,
        message: xaiError(data, 'xAI key invalid or API unreachable'),
      }),
      { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({
      live: true,
      source: 'server',
      model: MODELS.chat,
      buildModel: MODELS.build,
      engine: 'grok-build',
      health,
      message: hasServerApiKey()
        ? 'Ready — plan with ' + MODELS.chat + ', build with ' + MODELS.build + ' (best $/quality)'
        : 'Dev ready — plan with ' + MODELS.chat + ', build with ' + MODELS.build + ' (best $/quality)',
    }),
    { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
  )
}