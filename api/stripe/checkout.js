/**
 * Stripe Checkout session creator for Vercel edge.
 * Uses Stripe REST API (no Node SDK) so it works on edge runtime.
 */
import { corsHeaders, rejectBlockedOrigin } from '../security.js'

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

  const secret = process.env.STRIPE_SECRET_KEY?.trim()
  const proPrice = process.env.STRIPE_PRO_PRICE_ID?.trim()
  const teamPrice = process.env.STRIPE_TEAM_PRICE_ID?.trim()

  if (!secret || !proPrice || !teamPrice) {
    return new Response(
      JSON.stringify({
        error: 'Stripe not configured',
        configured: false,
      }),
      { status: 503, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
    )
  }

  let body
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })
  }

  const planId = body.planId === 'team' ? 'team' : 'pro'
  const priceId = planId === 'team' ? teamPrice : proPrice
  const origin = body.origin || req.headers.get('origin') || 'https://ideaspeak-app.vercel.app'
  const successUrl =
    body.successUrl ||
    `${origin}/?checkout=success&plan=${planId}`
  const cancelUrl = body.cancelUrl || `${origin}/?checkout=cancel`

  const params = new URLSearchParams()
  params.set('mode', 'subscription')
  params.set('success_url', successUrl)
  params.set('cancel_url', cancelUrl)
  params.set('line_items[0][price]', priceId)
  params.set('line_items[0][quantity]', '1')
  params.set('allow_promotion_codes', 'true')
  params.set('metadata[planId]', planId)
  params.set('subscription_data[metadata][planId]', planId)
  if (body.customerEmail) params.set('customer_email', String(body.customerEmail))

  const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })

  const data = await stripeRes.json().catch(() => ({}))
  if (!stripeRes.ok) {
    return new Response(
      JSON.stringify({
        error: data?.error?.message || 'Stripe checkout failed',
      }),
      { status: 502, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
    )
  }

  return new Response(
    JSON.stringify({ url: data.url, sessionId: data.id }),
    { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
  )
}
