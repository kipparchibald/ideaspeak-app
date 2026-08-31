/**
 * IdeaSpeak model strategy — grok-4.6 for conversation + live preview codegen.
 *
 * Override via env:
 *   XAI_CHAT_MODEL   — discuss/plan/refine (default grok-4.6)
 *   XAI_BUILD_MODEL  — /api/build codegen (default grok-4.6; set grok-build-0.1 for specialist)
 *   XAI_BUILD_FALLBACK — failover when primary build model errors
 */

import { chatModel, buildModel, buildFallbackModel } from './model-defaults.js'

export const MODEL_STRATEGY = {
  version: 2,
  rationale: 'grok_4_6_voice_first_v1',
  chat: {
    model: chatModel(),
    role: 'plan_discuss_refine',
    why: 'Flagship grok-4.6 reasoning for collaborative voice + text planning',
    reasoningEffort: 'high',
    planLockReasoningEffort: 'xhigh',
  },
  build: {
    model: buildModel(),
    role: 'live_preview_codegen',
    why: 'grok-4.6 for production-quality scaffold JSON; override with grok-build-0.1 if desired',
    reasoningEffort: 'high',
  },
  buildFallback: {
    model: buildFallbackModel(),
    role: 'build_failover',
    why: 'Quality safety net when primary build model errors',
  },
  economics: {
    note: 'Short plan turns stay cheap; build emits large JSON — tune XAI_BUILD_MODEL for cost',
    preferBuildModelFor: ['/api/build', 'preview files', 'scaffold JSON'],
    prefer46For: ['/api/discuss', '/api/refine', 'voice co-founder', 'brief'],
  },
}
