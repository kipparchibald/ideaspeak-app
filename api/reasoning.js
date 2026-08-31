/**
 * Reasoning effort for grok-4.x models.
 * grok-4.6+ requires reasoning — never send 'none'.
 */

/** @typedef {'high' | 'xhigh'} ReasoningEffort */

const FINALIZE_RE =
  /\b(build it|let'?s build|ready to build|finalize plan|lock (the |this )?plan|go ahead and build|ship it|start building|lock it in)\b/i

/**
 * Map legacy / invalid values. grok-4.6 cannot disable reasoning.
 * @param {string | undefined | null} effort
 * @returns {string | undefined}
 */
export function normalizeReasoningEffort(effort) {
  if (!effort || effort === 'none') return effort === 'none' ? 'high' : undefined
  if (effort === 'low') return 'high'
  return effort
}

/**
 * Conversational discuss/refine turns — high by default, xhigh when locking the plan.
 * @param {Array<{ role?: string; content?: unknown }>} messages
 * @returns {ReasoningEffort}
 */
export function resolveDiscussReasoningEffort(messages = []) {
  const lastUser = [...messages].reverse().find((m) => m?.role === 'user')
  const text =
    typeof lastUser?.content === 'string'
      ? lastUser.content
      : Array.isArray(lastUser?.content)
        ? lastUser.content
            .filter((c) => c?.type === 'text')
            .map((c) => c.text)
            .join(' ')
        : ''
  if (FINALIZE_RE.test(text)) return 'xhigh'
  return 'high'
}

/** Plan synthesis / build codegen */
export const REASONING_PLAN_LOCK = 'xhigh'
export const REASONING_CONVERSATION = 'high'
export const REASONING_BUILD = 'high'
