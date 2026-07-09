import { serve } from 'bun'

const XAI_API = 'https://api.x.ai/v1/chat/completions'
const XAI_REALTIME_SECRETS = 'https://api.x.ai/v1/realtime/client_secrets'

async function loadPrompt(file: string): Promise<string> {
  try {
    return await Bun.file(`prompts/${file}`).text()
  } catch {
    return 'You are IdeaSpeak xAI agent. Follow best practices for voice-first app building.'
  }
}

async function callXaiProxy(messages: any[], apiKey: string, model = 'grok-3') {
  const res = await fetch(XAI_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, temperature: 0.6, max_tokens: 8000 }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || 'xAI error')
  return data.choices?.[0]?.message?.content || ''
}

function cors(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-AI-Key',
  }
}

const server = serve({
  port: 3001,
  async fetch(req) {
    const url = new URL(req.url)
    const origin = req.headers.get('origin') || '*'
    const headers = cors(origin)

    if (req.method === 'OPTIONS') return new Response(null, { headers })

    if (url.pathname === '/health') {
      return Response.json({ status: 'ok', time: new Date().toISOString() }, { headers })
    }

    // ── Ephemeral token for Grok Voice Agent ─────────────────────────────────
    // Browser connects to wss://api.x.ai using this short-lived token
    // so XAI_API_KEY never touches client-side code
    if (url.pathname === '/api/voice/token' && req.method === 'POST') {
      const apiKey = process.env.XAI_API_KEY
      if (!apiKey) {
        return Response.json(
          { error: 'XAI_API_KEY not set on server. Add it to your environment variables.' },
          { status: 401, headers }
        )
      }
      try {
        const res = await fetch(XAI_REALTIME_SECRETS, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ expires_after: { seconds: 300 } }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error?.message || 'Token fetch failed')
        return Response.json(data, { headers })
      } catch (e: any) {
        return Response.json({ error: e.message }, { status: 500, headers })
      }
    }

    // ── Chat/text proxy (existing) ────────────────────────────────────────────
    const apiKey = req.headers.get('X-AI-Key') || req.headers.get('Authorization')?.replace('Bearer ', '') || process.env.XAI_API_KEY

    if (url.pathname === '/api/xai' && req.method === 'POST') {
      if (!apiKey) return Response.json({ error: 'Missing X-AI-Key' }, { status: 401, headers })
      try {
        const body = await req.json()
        const content = await callXaiProxy(body.messages, apiKey, body.model)
        return Response.json({ choices: [{ message: { content } }] }, { headers })
      } catch (e: any) {
        return Response.json({ error: e.message }, { status: 500, headers })
      }
    }

    if (url.pathname === '/api/refine' && req.method === 'POST') {
      if (!apiKey) return Response.json({ error: 'Missing X-AI-Key' }, { status: 401, headers })
      try {
        const { transcript, history = [] } = await req.json()
        const refinerPrompt = await loadPrompt('IdeaSpeak-Voice-Refiner-Prompt.md')
        const system = refinerPrompt + '\n\nOutput ONLY valid JSON: { "brief": { "vision": "...", "users": "...", "keyFeatures": ["..."], "tech": "..." }, "optimizedPrompt": "full prompt for agent" }'
        const user = `Raw transcript: ${transcript}\nHistory: ${history.slice(-2).map((h: any) => h.content).join(' | ')}`
        const content = await callXaiProxy([{ role: 'system', content: system }, { role: 'user', content: user }], apiKey)
        let parsed
        try { const m = content.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : null } catch {}
        return Response.json({ content, parsed }, { headers })
      } catch (e: any) {
        return Response.json({ error: e.message }, { status: 500, headers })
      }
    }

    if (url.pathname === '/api/build' && req.method === 'POST') {
      if (!apiKey) return Response.json({ error: 'Missing X-AI-Key' }, { status: 401, headers })
      try {
        const { transcript, brief: inputBrief, personality = 'grok' } = await req.json()
        const agentPrompt = await loadPrompt('IdeaSpeak-xAI-Agent-System-Prompt.md')
        const system = agentPrompt + '\n\nOutput ONLY valid JSON: { "name": "...", "plan": "...", "files": { "src/App.tsx": "...", "src/index.css": "..." } }'
        const user = inputBrief ? `Build from brief: ${JSON.stringify(inputBrief)}` : `Build from spoken idea: ${transcript}`
        const content = await callXaiProxy([{ role: 'system', content: system }, { role: 'user', content: user }], apiKey)
        let parsed
        try { const m = content.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : null } catch {}
        return Response.json({ content, parsed }, { headers })
      } catch (e: any) {
        return Response.json({ error: e.message }, { status: 500, headers })
      }
    }

    if (url.pathname === '/api/discuss' && req.method === 'POST') {
      if (!apiKey) return Response.json({ error: 'Missing X-AI-Key' }, { status: 401, headers })
      try {
        const { messages, image, personality = 'grok', voiceMode } = await req.json()
        const agentPrompt = await loadPrompt('IdeaSpeak-xAI-Agent-System-Prompt.md')
        const system = agentPrompt + (voiceMode ? '\n\nVOICE MODE: Keep replies to 2-4 sentences. Conversational, end with a question.' : '')
        const fullMessages: any[] = [{ role: 'system', content: system }, ...messages]
        if (image && fullMessages.length > 1) {
          const last = fullMessages[fullMessages.length - 1]
          if (last.role === 'user') {
            last.content = [{ type: 'text', text: last.content }, { type: 'image_url', image_url: { url: image } }]
          }
        }
        const content = await callXaiProxy(fullMessages, apiKey)
        return Response.json({ content }, { headers })
      } catch (e: any) {
        return Response.json({ error: e.message }, { status: 500, headers })
      }
    }

    if (url.pathname === '/api/image' && req.method === 'POST') {
      if (!apiKey) return Response.json({ error: 'Missing X-AI-Key' }, { status: 401, headers })
      try {
        const { prompt, size = '1024x1024' } = await req.json()
        const res = await fetch('https://api.x.ai/v1/images/generations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({ model: 'grok-2-image', prompt, n: 1, size, response_format: 'url' }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error?.message || 'Image gen error')
        return Response.json(data, { headers })
      } catch (e: any) {
        return Response.json({ error: e.message }, { status: 500, headers })
      }
    }

    return new Response('IdeaSpeak API — /health /api/voice/token /api/xai /api/refine /api/build /api/discuss /api/image', { headers })
  },
})

console.log(`IdeaSpeak backend on http://localhost:${server.port}`)
console.log('Voice Agent token endpoint: POST /api/voice/token')
