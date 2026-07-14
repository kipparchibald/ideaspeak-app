/**
 * PricingPanel — monetize convenience of speak → preview → Ship → polish
 */

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Check, Sparkles, Zap, Users, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  PLANS,
  getPlanId,
  setPlanId,
  enableDemoPro,
  disableDemoPro,
  isDemoPro,
  getUsage,
  monetizationValueProps,
  isStripeCheckoutAvailable,
  createCheckoutSession,
  handleCheckoutReturn,
  type PlanId,
} from '../lib/billing'

interface PricingPanelProps {
  open: boolean
  onClose: () => void
  onPlanChange?: (id: PlanId) => void
}

const ICONS = { free: Sparkles, pro: Zap, team: Users }

export function PricingPanel({ open, onClose, onPlanChange }: PricingPanelProps) {
  const [planId, setLocalPlan] = useState<PlanId>(() => getPlanId())
  const [stripeReady, setStripeReady] = useState<boolean | null>(null)
  const [checkoutLoading, setCheckoutLoading] = useState<PlanId | null>(null)
  const usage = getUsage()
  const demo = isDemoPro()

  useEffect(() => {
    if (!open) return
    let cancelled = false
    isStripeCheckoutAvailable().then((ok) => {
      if (!cancelled) setStripeReady(ok)
    })
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    const returned = handleCheckoutReturn()
    if (returned) {
      setLocalPlan(returned)
      onPlanChange?.(returned)
      toast.success(`${returned === 'team' ? 'Team' : 'Pro'} plan active`, {
        description: 'Thanks for subscribing — unlimited builds & Ship unlocked.',
      })
    }
  }, [onPlanChange])

  const startCheckout = async (id: 'pro' | 'team') => {
    setCheckoutLoading(id)
    try {
      const { url, error } = await createCheckoutSession(id)
      if (error || !url) {
        toast.error('Checkout unavailable', {
          description: error || 'Stripe did not return a checkout URL.',
        })
        return
      }
      window.location.href = url
    } finally {
      setCheckoutLoading(null)
    }
  }

  const select = async (id: PlanId) => {
    if (id === 'free') {
      setPlanId('free')
      setLocalPlan('free')
      onPlanChange?.('free')
      toast.success('Free plan active')
      return
    }

    if (id === 'pro' || id === 'team') {
      const plan = PLANS.find((p) => p.id === id)
      const hasCheckoutPlaceholder = !!plan?.checkoutUrl

      if (hasCheckoutPlaceholder && stripeReady) {
        await startCheckout(id)
        return
      }

      // Dev fallback when STRIPE_SECRET_KEY / price IDs are not configured
      enableDemoPro()
      if (id === 'team') setPlanId('team')
      else setPlanId('pro')
      setLocalPlan(id === 'team' ? 'team' : 'pro')
      onPlanChange?.(id === 'team' ? 'team' : 'pro')
      toast.success(id === 'team' ? 'Team (demo) unlocked' : 'Pro unlocked (demo)', {
        description: stripeReady === false
          ? 'Add Stripe keys to .env.local for real billing.'
          : 'Checking Stripe… use demo unlock for walkthroughs.',
      })
      return
    }

    setPlanId(id)
    setLocalPlan(id)
    onPlanChange?.(id)
    toast.success(`${id} plan active`)
  }

  const revertFree = () => {
    disableDemoPro()
    setLocalPlan('free')
    onPlanChange?.('free')
    toast.message('Back on Free plan')
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-md p-0 sm:p-6"
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 12, opacity: 0 }}
            className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-[#1f1f27] bg-[#0e0e14] shadow-2xl"
          >
            <div className="sticky top-0 z-10 bg-[#0e0e14]/95 backdrop-blur border-b border-[#1f1f27] px-5 py-4 flex items-start justify-between">
              <div>
                <h2 className="text-[18px] font-semibold tracking-tight text-[#e8e8f0]">
                  Plans
                </h2>
                <p className="text-[12px] text-[#666] mt-0.5">
                  Monetize convenience — not another raw chat box
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-[#666] hover:text-[#ccc] hover:bg-white/5"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-5">
              <div className="rounded-xl border border-[#1f1f27] bg-[#111116] px-4 py-3">
                <div className="text-[11px] font-semibold text-[#00ff88] uppercase tracking-wider mb-2">
                  Why people pay
                </div>
                <ul className="space-y-1.5">
                  {monetizationValueProps().map((v) => (
                    <li key={v} className="text-[12px] text-[#999] flex gap-2">
                      <Check size={14} className="text-[#00ff88] shrink-0 mt-0.5" />
                      {v}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="text-[11px] text-[#555]">
                Today · builds {usage.build} · ship exports {usage.ship} · polish {usage.polish}
                {demo && (
                  <span className="ml-2 text-[#00ff88]">· Demo Pro on</span>
                )}
                {stripeReady === true && (
                  <span className="ml-2 text-[#00ff88]">· Stripe checkout ready</span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {PLANS.map((plan) => {
                  const Icon = ICONS[plan.id]
                  const active = planId === plan.id || (demo && plan.id === 'pro' && planId !== 'team')
                  const loading = checkoutLoading === plan.id
                  return (
                    <div
                      key={plan.id}
                      className={`rounded-2xl border p-4 flex flex-col ${
                        plan.highlight
                          ? 'border-[#00ff88]/40 bg-[#00ff88]/06'
                          : 'border-[#1f1f27] bg-[#111116]'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Icon
                          size={16}
                          className={plan.highlight ? 'text-[#00ff88]' : 'text-[#888]'}
                        />
                        <span className="text-[14px] font-semibold text-[#e8e8f0]">
                          {plan.name}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-1 mb-1">
                        <span className="text-2xl font-bold text-[#e8e8f0]">{plan.priceLabel}</span>
                        <span className="text-[11px] text-[#666]">{plan.priceNote}</span>
                      </div>
                      <p className="text-[11px] text-[#777] mb-3 leading-relaxed">{plan.tagline}</p>
                      <ul className="space-y-1.5 flex-1 mb-4">
                        {plan.features.map((f) => (
                          <li key={f} className="text-[11px] text-[#aaa] flex gap-1.5">
                            <Check size={12} className="text-[#00ff88] shrink-0 mt-0.5" />
                            {f}
                          </li>
                        ))}
                      </ul>
                      <button
                        onClick={() => select(plan.id)}
                        disabled={loading || (active && plan.id !== 'free')}
                        className={`w-full py-2.5 rounded-xl text-[12px] font-bold transition-opacity flex items-center justify-center gap-2 ${
                          active
                            ? 'bg-[#1a1a22] border border-[#333] text-[#888]'
                            : plan.highlight
                              ? 'bg-[#00ff88] text-[#0a0a0f] hover:opacity-90'
                              : 'border border-[#1f1f27] text-[#ccc] hover:border-[#00ff88]/40'
                        } ${loading ? 'opacity-70 cursor-wait' : ''}`}
                      >
                        {loading && <Loader2 size={14} className="animate-spin" />}
                        {active
                          ? 'Current plan'
                          : plan.id === 'free'
                            ? 'Use Free'
                            : stripeReady
                              ? 'Subscribe'
                              : 'Unlock (demo)'}
                      </button>
                    </div>
                  )
                })}
              </div>

              {(demo || planId !== 'free') && (
                <button
                  onClick={revertFree}
                  className="text-[11px] text-[#555] hover:text-[#888] underline underline-offset-2"
                >
                  Reset to Free
                </button>
              )}

              <div className="rounded-xl border border-[#1f1f27] bg-[#0a0a0f] px-3 py-2.5 mb-2">
                <p className="text-[11px] text-[#666] leading-relaxed">
                  <span className="text-[#888] font-medium">What unlocks revenue:</span> unlimited
                  builds, full Ship (Supabase · Vercel · domain), and multi-model polish packs
                  (Cursor / Grok / Claude / GPT). Free is the taste; Pro is the convenience.
                </p>
              </div>
              <p className="text-[10px] text-[#444] leading-relaxed pb-2">
                Stripe: set{' '}
                <code className="text-[#666]">STRIPE_SECRET_KEY</code>,{' '}
                <code className="text-[#666]">STRIPE_PRO_PRICE_ID</code>, and{' '}
                <code className="text-[#666]">STRIPE_TEAM_PRICE_ID</code> in{' '}
                <code className="text-[#666]">.env.local</code>. Unlock opens Checkout when
                configured; otherwise demo Pro for walkthroughs. Webhook:{' '}
                <code className="text-[#666]">POST /api/stripe/webhook</code>.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}