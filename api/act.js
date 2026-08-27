import { chatCompletion, getApiKey, xaiError, parseJsonFromContent } from './xai.js'
import { corsHeaders, rejectBlockedOrigin, enforceRateLimit } from './security.js'
import {
  edgeErrorResponse,
  getOrCreateRequestId,
  requestIdHeaders,
} from './observability.js'
import {
  ACT_SYSTEM,
  validateActRequest,
  resolveActKind,
  buildReceipt,
  userAskedToSend,
  extractPastedThreads,
  executeActLocal,
  guardActWorkProduct,
  formatWorkProductContent,
  ACT_SECONDS,
  synthesizeActWorkProduct,
} from './voice-work.js'

export const config = { runtime: 'edge', maxDuration: 60 }

export default async function handler(req) {
  const requestId = getOrCreateRequestId(req)
  const startedAt = Date.now()
  const baseHeaders = { ...corsHeaders(req), ...requestIdHeaders(requestId) }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: baseHeaders })
  }

  const blocked = rejectBlockedOrigin(req)
  if (blocked) return blocked

  const { blocked: limited, headers: rateHeaders } = enforceRateLimit(req)
  if (limited) return limited

  const body = await req.json()
  const { refine, userIntent = '', history = [], pastedThreads: pastedOverride } = body

  const validation = validateActRequest(refine)
  if (!validation.ok) {
    return new Response(
      JSON.stringify({ error: validation.error, missing: validation.missing, requestId }),
      { status: 400, headers: { ...baseHeaders, ...rateHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const guarded = validation.refine
  const { effectiveKind, desk, repoName } = resolveActKind(guarded)
  const pasted = Array.isArray(pastedOverride)
    ? pastedOverride
    : extractPastedThreads(history)
  const askedSend = userAskedToSend(userIntent)
  const seconds = ACT_SECONDS[effectiveKind] || 30
  const receipt = buildReceipt({ effectiveKind, userAskedSend: askedSend, seconds, desk, repoName })

  // BUILD (toy) — no LLM; client runs Sandpack
  if (effectiveKind === 'BUILD') {
    return new Response(
      JSON.stringify({
        receipt,
        action: 'BUILD',
        effectiveKind,
        buildPrompt: guarded.optimizedPrompt,
        spokenFinish: 'Preview compiling on the right — click around when it lands.',
        requestId,
      }),
      { headers: { ...baseHeaders, ...rateHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const apiKey = getApiKey(req)
  if (!apiKey) {
    const local = executeActLocal(guarded, { userIntent, pastedThreads: pasted })
    return new Response(JSON.stringify({ ...local, requestId }), {
      headers: { ...baseHeaders, ...rateHeaders, 'Content-Type': 'application/json' },
    })
  }

  const user = `Ready brief (JSON):
${JSON.stringify(guarded.brief, null, 2)}

Optimized prompt:
${guarded.optimizedPrompt}

Effective kind: ${effectiveKind}
${desk ? `Route desk: ${desk}` : ''}
${repoName ? `Production repo detected: ${repoName}` : ''}
User intent: ${userIntent || '(act)'}
Pasted threads: ${pasted.length ? pasted.join('\n---\n') : '(none — Gmail not wired)'}

Produce the work product for ${effectiveKind}.`

  const { ok, status, data } = await chatCompletion(apiKey, {
    messages: [
      { role: 'system', content: ACT_SYSTEM },
      { role: 'user', content: user },
    ],
    temperature: 0.45,
    maxTokens: 2500,
    reasoningEffort: 'low',
  })

  if (!ok) {
    const local = executeActLocal(guarded, { userIntent, pastedThreads: pasted })
    return new Response(
      JSON.stringify({
        ...local,
        fallback: true,
        warning: xaiError(data),
        requestId,
      }),
      { headers: { ...baseHeaders, ...rateHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const content = data.choices?.[0]?.message?.content || ''
  const raw = parseJsonFromContent(content)
  let workProduct = guardActWorkProduct(raw, effectiveKind)
  if (!workProduct) {
    workProduct = synthesizeActWorkProduct(guarded, {
      userIntent,
      pastedThreads: pasted,
      desk,
      repoName,
    })
  }
  if (workProduct) {
    workProduct.content = formatWorkProductContent(workProduct)
  }

  return new Response(
    JSON.stringify({
      ok: true,
      receipt,
      action: 'WORK',
      effectiveKind,
      workProduct,
      spokenFinish:
        typeof raw?.spokenFinish === 'string'
          ? raw.spokenFinish
          : 'Work product is in the pane — review before any send.',
      requestId,
    }),
    {
      headers: { ...baseHeaders, ...rateHeaders, 'Content-Type': 'application/json' },
    },
  )
}
