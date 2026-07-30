/**
 * IdeaSpeak model strategy — best quality per dollar for app building.
 *
 * Pricing (approx, xAI 2026):
 * | Model           | Input /1M | Output /1M | Best for              |
 * |-----------------|-----------|------------|------------------------|
 * | grok-build-0.1  | $1.00     | $2.00      | Scaffold / preview code (high output) |
 * | grok-4.5        | $2.00     | $6.00      | Plan, discuss, hard fallback |
 *
 * A typical build emits ~8–12k output tokens of JSON files:
 *   build-0.1 ≈ $0.02–0.03   ·   4.5 ≈ $0.05–0.07  (~3× more)
 * Plan/chat turns are short (~0.5–2k out) so 4.5 stays cheap in absolute $
 * while giving better briefs that feed the builder.
 *
 * Decision: build with grok-build-0.1; think with grok-4.5; fall back to 4.5
 * only if the build model is unavailable.
 */

export const MODEL_STRATEGY = {
  version: 1,
  rationale: 'build_economics_v1',
  chat: {
    model: process.env.XAI_CHAT_MODEL?.trim() || 'grok-4.5',
    role: 'plan_discuss_refine',
    why: 'Flagship reasoning for short plan/chat turns; high quality, low absolute cost',
  },
  build: {
    model: process.env.XAI_BUILD_MODEL?.trim() || 'grok-build-0.1',
    role: 'live_preview_codegen',
    why: 'Purpose-built coding model; ~½ input and ~⅓ output cost of 4.5 on large scaffolds',
  },
  buildFallback: {
    model: process.env.XAI_BUILD_FALLBACK?.trim() || 'grok-4.5',
    role: 'build_failover',
    why: 'Quality safety net only when grok-build-0.1 errors',
  },
  economics: {
    primaryBuildCostVs45: '~3× cheaper on typical preview codegen output',
    preferBuildModelFor: ['/api/build', 'preview files', 'scaffold JSON'],
    prefer45For: ['/api/discuss', '/api/refine', 'voice co-founder', 'brief'],
  },
}
