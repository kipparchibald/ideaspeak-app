/**
 * Stripe readiness — edge-safe status (no Stripe SDK).
 * Full checkout runs on Railway Bun when STRIPE_* are set there;
 * this reports what the frontend can expect on same-origin.
 */
import { corsHeaders, rejectBlockedOrigin } from '../security.js'

export const config = { runtime: 'edge' }

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) })
  }

  const blocked = rejectBlockedOrigin(req)
  if (blocked) return blocked

  const secret = !!process.env.STRIPE_SECRET_KEY?.trim()
  const pro = !!process.env.STRIPE_PRO_PRICE_ID?.trim()
  const team = !!process.env.STRIPE_TEAM_PRICE_ID?.trim()
  const webhook = !!process.env.STRIPE_WEBHOOK_SECRET?.trim()
  const configured = secret && pro && team

  return new Response(
    JSON.stringify({
      configured,
      hasSecretKey: secret,
      hasWebhookSecret: webhook,
      hasProPrice: pro,
      hasTeamPrice: team,
      message: configured
        ? 'Stripe Checkout ready'
        : 'Stripe not configured — set STRIPE_SECRET_KEY + STRIPE_PRO_PRICE_ID + STRIPE_TEAM_PRICE_ID (demo unlock still works in UI)',
    }),
    { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
  )
}
