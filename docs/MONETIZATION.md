# IdeaSpeak monetization

## What we sell

**Convenience of going from spoken idea → live product**, not raw LLM tokens.

| Layer | Free | Pro ($29) | Team ($79) |
|-------|------|-----------|------------|
| Voice + preview | ✓ (limits) | Unlimited | Unlimited |
| Builds / day | 3 | ∞ | ∞ |
| Ship ZIP / day | 1 | ∞ | ∞ |
| Supabase · Vercel · domain guides | Basic | Full | Full |
| Multi-model polish (Cursor/Grok/Claude/GPT) | — | ✓ | ✓ |
| Seats | 1 | 1 | 5 |

## Why multi-model makes it more powerful

| Model | Role in the stack |
|-------|-------------------|
| **Grok** | Voice discuss, taste, v1 build, `/check-work` honesty |
| **Cursor** | Best IDE implementer after export — `.cursorrules` load automatically |
| **Claude** | Systems pass: RLS, auth, careful refactors |
| **GPT** | Fast copy/UI variants when speed matters |

IdeaSpeak owns **orchestration + Ship convenience**. Downstream models own **specialist polish**. Customers pay for the path, not for locking them to one model.

## Implementation status

- [x] Plan definitions + local usage metering (`src/lib/billing.ts`)
- [x] Feature gates on build + ship export
- [x] Pricing UI + demo Pro unlock (dev fallback when Stripe unset)
- [x] Polish panel + prompts for 4 models
- [x] ZIP includes `polish/prompts/*` + `.cursor/rules`
- [x] Stripe Checkout session API (`POST /api/stripe/checkout`)
- [x] Webhook handler stub (`POST /api/stripe/webhook`) — `checkout.session.completed`, `customer.subscription.updated/deleted`
- [x] Pricing panel wires Pro/Team → Checkout when keys present
- [ ] Server-side entitlement in Supabase (auth + subscription webhook → `profiles.plan`)
- [ ] Customer Portal link (Settings → Manage subscription)
- [ ] Remove optimistic local unlock on success URL in production
- [ ] Optional: call Claude/OpenAI from server for in-app polish (user brings keys or platform keys)

## Stripe hookup (Sprint 5)

### Env (Railway / `.env.local`)

| Variable | Purpose |
|----------|---------|
| `STRIPE_SECRET_KEY` | Server Checkout + webhook verify |
| `STRIPE_WEBHOOK_SECRET` | Signature verification (`stripe listen` or Dashboard) |
| `STRIPE_PRO_PRICE_ID` | Recurring price for Pro ($29/mo) |
| `STRIPE_TEAM_PRICE_ID` | Recurring price for Team ($79/mo) |

### API routes (Bun server)

| Route | Method | Notes |
|-------|--------|-------|
| `/api/stripe/status` | GET | `{ configured, hasSecretKey, … }` |
| `/api/stripe/checkout` | POST | Body: `{ planId: "pro" \| "team", successUrl?, cancelUrl? }` → `{ url, sessionId }` |
| `/api/stripe/webhook` | POST | Raw body + `stripe-signature` header |

### Client flow

1. `PricingPanel` calls `GET /api/stripe/status` — if configured, **Subscribe** opens Checkout.
2. `createCheckoutSession(planId)` in `billing.ts` POSTs to `/api/stripe/checkout` and redirects to Stripe.
3. Success URL `/?checkout=success&plan=pro` optimistically sets local plan (until Supabase entitlements).
4. Webhook updates in-memory entitlement stub in `server/stripe.ts` (replace with DB write).

### Webhook events handled

- `checkout.session.completed` → grant plan from session metadata
- `customer.subscription.updated` → sync plan / downgrade on inactive status
- `customer.subscription.deleted` → revert to free

### Still demo-only

When `STRIPE_SECRET_KEY` or price IDs are missing, **Unlock (demo)** uses `enableDemoPro()` for walkthroughs.

## Positioning line

> Speak it. See it live. Ship without the pain — then polish in Cursor with Grok, Claude, or GPT.