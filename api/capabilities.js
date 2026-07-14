import { hasServerApiKey, MODELS } from './xai.js'
import { corsHeaders, rejectBlockedOrigin } from './security.js'

export const config = { runtime: 'edge' }

/** Public capability flags — booleans only, no secret values */
export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) })
  }
  const blocked = rejectBlockedOrigin(req)
  if (blocked) return blocked

  const grok = hasServerApiKey()

  return new Response(
    JSON.stringify({
      platform: 'vercel',
      capabilities: {
        grok,
        voice: grok,
        build: grok,
        discuss: grok,
        refine: grok,
        tts: grok,
        e2b: false,
        supabaseServer: !!(
          process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_KEY?.trim()
        ),
        shipWorker: !!(
          process.env.SHIP_WORKER_URL?.trim() && process.env.SHIP_WORKER_SECRET?.trim()
        ),
        stripe: !!process.env.STRIPE_SECRET_KEY?.trim(),
        githubServer: !!process.env.GITHUB_TOKEN?.trim(),
        vercelDeploy: !!process.env.VERCEL_TOKEN?.trim(),
      },
      models: {
        chat: MODELS.chat,
        build: MODELS.build,
      },
    }),
    { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
  )
}