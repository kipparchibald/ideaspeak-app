/**
 * Stripe billing — Checkout sessions + webhook entitlement stubs.
 * Replace in-memory store with Supabase profiles when auth ships (Sprint 5.4).
 */

import Stripe from 'stripe'

const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim()
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim()
const proPriceId = process.env.STRIPE_PRO_PRICE_ID?.trim()
const teamPriceId = process.env.STRIPE_TEAM_PRICE_ID?.trim()

export type BillablePlanId = 'pro' | 'team'

export interface EntitlementRecord {
  planId: BillablePlanId | 'free'
  customerId: string
  subscriptionId?: string
  updatedAt: string
}

/** In-memory entitlement stub — keyed by customerId or email */
const entitlementStore = new Map<string, EntitlementRecord>()

export function isStripeConfigured(): boolean {
  return !!(stripeSecretKey && proPriceId && teamPriceId)
}

export function getStripeStatus() {
  return {
    configured: isStripeConfigured(),
    hasSecretKey: !!stripeSecretKey,
    hasWebhookSecret: !!webhookSecret,
    hasProPrice: !!proPriceId,
    hasTeamPrice: !!teamPriceId,
  }
}

function getStripe(): Stripe {
  if (!stripeSecretKey) {
    throw new Error('STRIPE_SECRET_KEY not set')
  }
  return new Stripe(stripeSecretKey)
}

export function getPriceIdForPlan(planId: BillablePlanId): string | null {
  if (planId === 'pro') return proPriceId || null
  if (planId === 'team') return teamPriceId || null
  return null
}

export async function createCheckoutSession(opts: {
  planId: BillablePlanId
  successUrl: string
  cancelUrl: string
  customerEmail?: string
}): Promise<{ url: string | null; sessionId: string }> {
  const stripe = getStripe()
  const priceId = getPriceIdForPlan(opts.planId)
  if (!priceId) {
    throw new Error(`STRIPE_${opts.planId.toUpperCase()}_PRICE_ID not set`)
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    customer_email: opts.customerEmail,
    allow_promotion_codes: true,
    metadata: { planId: opts.planId },
    subscription_data: {
      metadata: { planId: opts.planId },
    },
  })

  return { url: session.url, sessionId: session.id }
}

function entitlementKey(customerId: string, email?: string | null): string {
  return email?.trim() || customerId
}

function upsertEntitlement(
  customerId: string,
  planId: BillablePlanId | 'free',
  subscriptionId?: string,
  email?: string | null,
) {
  const key = entitlementKey(customerId, email)
  entitlementStore.set(key, {
    planId,
    customerId,
    subscriptionId,
    updatedAt: new Date().toISOString(),
  })
  // Also index by customerId for subscription events that lack email
  if (email) {
    entitlementStore.set(customerId, entitlementStore.get(key)!)
  }
  console.log(`[stripe] entitlement ${planId} → ${key}`)
}

export function getEntitlement(customerIdOrEmail: string): EntitlementRecord | null {
  return entitlementStore.get(customerIdOrEmail) || null
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const planId = (session.metadata?.planId ||
    session.subscription_data?.metadata?.planId) as BillablePlanId | undefined
  const customerId =
    typeof session.customer === 'string' ? session.customer : session.customer?.id
  const subscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id
  const email = session.customer_details?.email || session.customer_email

  if (!planId || (planId !== 'pro' && planId !== 'team')) {
    console.warn('[stripe] checkout.session.completed missing planId', session.id)
    return
  }
  if (!customerId) {
    console.warn('[stripe] checkout.session.completed missing customerId', session.id)
    return
  }

  upsertEntitlement(customerId, planId, subscriptionId, email)
}

async function handleSubscriptionUpdated(sub: Stripe.Subscription) {
  const planId = sub.metadata?.planId as BillablePlanId | undefined
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id
  if (!customerId) return

  const active = sub.status === 'active' || sub.status === 'trialing'
  if (active && (planId === 'pro' || planId === 'team')) {
    upsertEntitlement(customerId, planId, sub.id)
  } else {
    upsertEntitlement(customerId, 'free', sub.id)
  }
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id
  if (!customerId) return
  upsertEntitlement(customerId, 'free')
}

async function processWebhookEvent(event: Stripe.Event) {
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session)
      break
    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(event.data.object as Stripe.Subscription)
      break
    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
      break
    default:
      console.log(`[stripe] unhandled event ${event.type}`)
  }
}

/**
 * Verify Stripe webhook signature and dispatch handlers.
 * Caller must pass raw request body (not parsed JSON).
 */
export async function handleStripeWebhook(
  rawBody: string,
  signature: string | null,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!stripeSecretKey || !webhookSecret) {
    return { ok: false, status: 503, error: 'Stripe webhooks not configured' }
  }
  if (!signature) {
    return { ok: false, status: 400, error: 'Missing stripe-signature header' }
  }

  const stripe = getStripe()
  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Invalid signature'
    console.error('[stripe] webhook verify failed:', msg)
    return { ok: false, status: 400, error: `Webhook signature verification failed: ${msg}` }
  }

  try {
    await processWebhookEvent(event)
    return { ok: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Handler error'
    console.error('[stripe] webhook handler error:', msg)
    return { ok: false, status: 500, error: msg }
  }
}