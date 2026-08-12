import { BUILD_SYSTEM } from './build-prompt.js'
import { getApiKey, parseJsonFromContent } from './xai.js'
import { callGrokBuild, GROK_BUILD_MODEL } from './grok-build.js'
import { corsHeaders, isAllowedOrigin, rejectRateLimitedNode } from './security.js'
import { getOrCreateRequestId, nodeErrorJson, requestIdHeaders } from './observability.js'

/** Node runtime — Grok Build can take 60–120s; Edge times out */
export const config = { maxDuration: 120 }

export default async function handler(req, res) {
  const requestId = getOrCreateRequestId(req)
  const startedAt = Date.now()
  const cors = corsHeaders(req)
  for (const [key, value] of Object.entries({ ...cors, ...requestIdHeaders(requestId) })) {
    res.setHeader(key, value)
  }

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  const origin = req.headers.origin || ''
  if (origin && !isAllowedOrigin(origin)) {
    return res.status(403).json({ error: 'Forbidden origin' })
  }

  if (req.method === 'POST' && rejectRateLimitedNode(req, res)) {
    return
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = getApiKey(req)
  if (!apiKey) {
    return res.status(401).json({ error: 'Grok API not configured on server', requestId })
  }

  const { transcript, brief, personality = 'grok' } = req.body || {}
  const user = brief
    ? `Build production v1 from this plan and brief:\n${transcript || ''}\n\nBrief: ${JSON.stringify(brief)}`
    : `Build production v1 from this discussion/plan:\n${transcript || ''}`

  const personalityNote =
    personality === 'witty'
      ? ' Witty code comments.'
      : personality === 'mentor'
        ? ' Wise mentor tone in copy.'
        : personality === 'coach'
          ? ' Energetic motivational UI copy.'
          : personality === 'rebel'
            ? ' Bold unconventional UI choices.'
            : ''

  try {
    const { content, model, api } = await callGrokBuild(apiKey, {
      system: BUILD_SYSTEM + personalityNote,
      user,
      maxTokens: 12000,
      temperature: 0.4,
    })

    let parsed = parseJsonFromContent(content)
    if (parsed?.files && typeof parsed.files === 'object') {
      // Ensure entry always present for Sandpack
      if (!parsed.files['src/main.tsx']) {
        parsed = {
          ...parsed,
          files: {
            ...parsed.files,
            'src/main.tsx':
              parsed.files['src/main.tsx'] ||
              `import { StrictMode } from 'react'\nimport { createRoot } from 'react-dom/client'\nimport App from './App'\nimport './index.css'\ncreateRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)`,
          },
        }
      }
    }

    return res.status(200).json({
      content,
      parsed,
      model,
      api,
      engine: 'grok-build',
      defaultModel: GROK_BUILD_MODEL,
      requestId,
    })
  } catch (e) {
    return nodeErrorJson(res, req, {
      requestId,
      status: 500,
      error: e?.message || 'Grok Build failed',
      route: '/api/build',
      kind: 'build',
      transcript: user,
      model: GROK_BUILD_MODEL,
      durationMs: Date.now() - startedAt,
    })
  }
}
