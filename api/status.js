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

  if (!apiKey) {
    return new Response(
      JSON.stringify({
        live: false,
        source: 'none',
        model: MODELS.chat,
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
      message: hasServerApiKey()
        ? 'Grok API ready — key hosted securely on server'
        : 'Grok API ready via dev proxy',
    }),
    { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
  )
}