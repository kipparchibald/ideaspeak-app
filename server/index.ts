import { serve } from 'bun'
import { BUILD_SYSTEM } from '../api/build-prompt.js'
import {
  corsHeaders,
  rejectBlockedOrigin,
  rejectRateLimited,
  shouldRateLimit,
} from '../api/security.js'
import { parseJsonFromContent } from '../api/xai.js'
import { PREVIEW_ENTRY_MAIN } from '../src/lib/preview-scaffold.ts'

// Load local secrets (Bun auto-loads .env; also try .env.local)
try {
  const local = Bun.file('.env.local')
  if (await local.exists()) {
    const text = await local.text()
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
      if (!m) continue
      if (process.env[m[1]]) continue
      let v = m[2].trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1)
      }
      process.env[m[1]] = v
    }
  }
} catch {
  /* ignore */
}

const XAI_API = 'https://api.x.ai/v1/chat/completions'
const XAI_REALTIME_SECRETS = 'https://api.x.ai/v1/realtime/client_secrets'
const CHAT_MODEL = process.env.XAI_CHAT_MODEL || 'grok-3'
const BUILD_MODEL = process.env.XAI_BUILD_MODEL || 'grok-4.5'

type FeatureFlags = {
  xai: boolean
  e2b: boolean
  stripe: boolean
  supabase: boolean
}

function getFeatureFlags(): FeatureFlags {
  return {
    xai: !!process.env.XAI_API_KEY?.trim(),
    e2b: !!process.env.E2B_API_KEY?.trim(),
    stripe: !!process.env.STRIPE_SECRET_KEY?.trim(),
    supabase: !!(
      process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_KEY?.trim()
    ),
  }
}

function validateEnv(): { port: number; features: FeatureFlags } {
  const isProd =
    process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_ENVIRONMENT
  const features = getFeatureFlags()
  const errors: string[] = []

  const rawPort = process.env.PORT || '3001'
  const port = Number(rawPort)
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    errors.push(`Invalid PORT="${rawPort}" — must be a number between 1 and 65535`)
  }

  if (isProd && !features.xai) {
    errors.push(
      'XAI_API_KEY is required in production. Add it in Railway → Variables (or .env.local for local dev).',
    )
  }

  if (errors.length > 0) {
    console.error('\n❌ IdeaSpeak server misconfigured:\n')
    for (const err of errors) console.error(`  • ${err}`)
    console.error('\nSee .env.example and docs/API_SETUP.md for the full env matrix.\n')
    process.exit(1)
  }

  console.log('IdeaSpeak feature flags:')
  console.log(`  xAI Grok:     ${features.xai ? '✅ enabled' : '⚠️  disabled — set XAI_API_KEY'}`)
  console.log(
    `  E2B sandbox:  ${features.e2b ? '✅ enabled' : '⏳ placeholder — set E2B_API_KEY (Sprint 3)'}`,
  )
  console.log(
    `  Stripe:       ${features.stripe ? '✅ enabled' : '— not configured (optional)'}`,
  )
  console.log(
    `  Supabase:     ${features.supabase ? '✅ enabled' : '— not configured (optional)'}`,
  )

  return { port, features }
}

const { port: SERVER_PORT } = validateEnv()

async function loadPrompt(file: string): Promise<string> {
  try {
    return await Bun.file(`prompts/${file}`).text()
  } catch {
    return 'You are IdeaSpeak xAI agent. Follow best practices for voice-first app building.'
  }
}

async function callXaiProxy(
  messages: any[],
  apiKey: string,
  model = CHAT_MODEL,
  opts: { temperature?: number; maxTokens?: number; reasoningEffort?: string } = {},
) {
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: opts.temperature ?? 0.85,
    max_tokens: opts.maxTokens ?? 800,
  }
  if (opts.reasoningEffort && String(model).includes('grok-4')) {
    body.reasoning_effort = opts.reasoningEffort
  }
  const res = await fetch(XAI_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) {
    const msg =
      (typeof data?.error === 'string' && data.error) ||
      data?.error?.message ||
      data?.code ||
      `xAI error ${res.status}`
    throw new Error(msg)
  }
  const content =
    data.choices?.[0]?.message?.content ||
    data.choices?.[0]?.message?.reasoning_content ||
    ''
  return String(content || '').trim()
}

const server = serve({
  port: SERVER_PORT,
  async fetch(req) {
    const url = new URL(req.url)
    const headers = corsHeaders(req)

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers })
    }

    const blocked = rejectBlockedOrigin(req)
    if (blocked) return blocked

    if (shouldRateLimit(url.pathname, req.method)) {
      const limited = rejectRateLimited(req)
      if (limited) return limited
    }

    if (url.pathname === '/health') {
      const features = getFeatureFlags()
      return Response.json(
        { status: 'ok', time: new Date().toISOString(), features },
        { headers },
      )
    }

    if (url.pathname === '/api/capabilities' && req.method === 'GET') {
      const features = getFeatureFlags()
      return Response.json(
        {
          platform: 'bun',
          capabilities: {
            grok: features.xai,
            voice: features.xai,
            build: features.xai,
            discuss: features.xai,
            refine: features.xai,
            tts: features.xai,
            e2b: features.e2b,
            supabaseServer: features.supabase,
            shipWorker: !!(
              process.env.SHIP_WORKER_URL?.trim() && process.env.SHIP_WORKER_SECRET?.trim()
            ),
            stripe: features.stripe,
            githubServer: !!process.env.GITHUB_TOKEN?.trim(),
            vercelDeploy: !!process.env.VERCEL_TOKEN?.trim(),
          },
          models: { chat: CHAT_MODEL, build: BUILD_MODEL },
          features,
        },
        { headers },
      )
    }

    // ── Status / key verification (used by Settings + ModeBadge) ─────────────
    if (url.pathname === '/api/status' && (req.method === 'GET' || req.method === 'POST')) {
      const clientKey =
        req.headers.get('X-AI-Key') ||
        req.headers.get('x-ai-key') ||
        req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ||
        ''
      // Local: prefer client key so Settings can override a bad .env.local
      const apiKey = (clientKey || process.env.XAI_API_KEY || '').trim()
      const features = getFeatureFlags()
      if (!apiKey) {
        return Response.json(
          {
            live: false,
            source: 'none',
            model: CHAT_MODEL,
            features,
            message:
              'No API key. Add one in Settings or set XAI_API_KEY in .env.local (console.x.ai)',
          },
          { headers },
        )
      }
      try {
        const content = await callXaiProxy(
          [{ role: 'user', content: 'Reply with exactly: ok' }],
          apiKey,
          CHAT_MODEL,
        )
        const live = /^ok\b/i.test(content.trim()) || content.toLowerCase().includes('ok')
        return Response.json(
          {
            live: live || content.length > 0,
            source: clientKey ? 'client' : 'server',
            model: CHAT_MODEL,
            features,
            message:
              content.length > 0
                ? clientKey
                  ? 'Grok API ready via your Settings key'
                  : 'Grok API ready via server XAI_API_KEY'
                : 'Empty response from xAI',
          },
          { headers },
        )
      } catch (e: any) {
        return Response.json(
          {
            live: false,
            source: clientKey ? 'client' : 'server',
            model: CHAT_MODEL,
            features,
            message: e?.message || 'xAI key invalid or API unreachable',
          },
          { headers },
        )
      }
    }

    // ── E2B sandbox (Sprint 3) ───────────────────────────────────────────────
    if (url.pathname.startsWith('/api/sandbox/')) {
      const {
        createSandbox,
        syncFiles,
        getPreviewUrl,
        getLogs,
        runCommand,
        destroySandbox,
        getSessionBySandboxId,
      } = await import('./sandbox-manager.js')

      if (url.pathname === '/api/sandbox/create' && req.method === 'POST') {
        try {
          const { projectId, files = {} } = await req.json()
          if (!projectId || typeof projectId !== 'string') {
            return Response.json({ error: 'projectId required' }, { status: 400, headers })
          }
          const session = await createSandbox(projectId, files)
          return Response.json(session, { headers })
        } catch (e: any) {
          return Response.json({ error: e?.message || 'Create failed' }, { status: 500, headers })
        }
      }

      if (url.pathname === '/api/sandbox/sync' && req.method === 'POST') {
        try {
          const { sandboxId, files = {} } = await req.json()
          if (!sandboxId) {
            return Response.json({ error: 'sandboxId required' }, { status: 400, headers })
          }
          const session = await syncFiles(sandboxId, files)
          return Response.json(session, { headers })
        } catch (e: any) {
          return Response.json({ error: e?.message || 'Sync failed' }, { status: 500, headers })
        }
      }

      if (url.pathname === '/api/sandbox/preview' && req.method === 'POST') {
        try {
          const { sandboxId } = await req.json()
          if (!sandboxId) {
            return Response.json({ error: 'sandboxId required' }, { status: 400, headers })
          }
          const session = getSessionBySandboxId(sandboxId)
          if (!session) {
            return Response.json({ error: 'Sandbox not found' }, { status: 404, headers })
          }
          return Response.json(
            {
              previewUrl: getPreviewUrl(sandboxId) ?? session.previewUrl,
              status: session.status,
              logs: getLogs(sandboxId),
              isStub: session.isStub,
              error: session.error,
            },
            { headers },
          )
        } catch (e: any) {
          return Response.json({ error: e?.message || 'Preview failed' }, { status: 500, headers })
        }
      }

      if (url.pathname === '/api/sandbox/run' && req.method === 'POST') {
        try {
          const { sandboxId, command } = await req.json()
          if (!sandboxId || !command) {
            return Response.json({ error: 'sandboxId and command required' }, { status: 400, headers })
          }
          const result = await runCommand(sandboxId, command)
          return Response.json(result, { headers })
        } catch (e: any) {
          return Response.json({ error: e?.message || 'Run failed' }, { status: 500, headers })
        }
      }

      if (url.pathname === '/api/sandbox/destroy' && req.method === 'DELETE') {
        try {
          const body = await req.json().catch(() => ({}))
          const sandboxId = body.sandboxId || url.searchParams.get('sandboxId')
          if (!sandboxId) {
            return Response.json({ error: 'sandboxId required' }, { status: 400, headers })
          }
          const destroyed = await destroySandbox(sandboxId)
          return Response.json({ destroyed }, { headers })
        } catch (e: any) {
          return Response.json({ error: e?.message || 'Destroy failed' }, { status: 500, headers })
        }
      }
    }

    // ── Ephemeral token for Grok Voice Agent ─────────────────────────────────
    // Browser connects to wss://api.x.ai using this short-lived token
    // so XAI_API_KEY never touches client-side code
    if (
      (url.pathname === '/api/voice/token' || url.pathname === '/api/voice-token') &&
      req.method === 'POST'
    ) {
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

    // ── Chat/text proxy — client Settings key first, then .env.local ──────────
    const apiKey =
      req.headers.get('X-AI-Key') ||
      req.headers.get('x-ai-key') ||
      req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ||
      process.env.XAI_API_KEY

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
        const parsed = parseJsonFromContent(content)
        return Response.json({ content, parsed }, { headers })
      } catch (e: any) {
        return Response.json({ error: e.message }, { status: 500, headers })
      }
    }

    if (url.pathname === '/api/build' && req.method === 'POST') {
      if (!apiKey) return Response.json({ error: 'Missing X-AI-Key' }, { status: 401, headers })
      try {
        const { transcript, brief: inputBrief, personality = 'grok' } = await req.json()
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
        const user = inputBrief
          ? `Build production v1 from this plan and brief:\n${transcript || ''}\n\nBrief: ${JSON.stringify(inputBrief)}`
          : `Build production v1 from this discussion/plan:\n${transcript || ''}`
        const content = await callXaiProxy(
          [{ role: 'system', content: BUILD_SYSTEM + personalityNote }, { role: 'user', content: user }],
          apiKey,
          BUILD_MODEL,
          { temperature: 0.55, maxTokens: 8000, reasoningEffort: 'low' },
        )
        let parsed = parseJsonFromContent(content)
        if (parsed?.files && typeof parsed.files === 'object') {
          parsed = {
            ...parsed,
            files: { ...parsed.files, 'src/main.tsx': PREVIEW_ENTRY_MAIN },
          }
        }
        return Response.json({ content, parsed }, { headers })
      } catch (e: any) {
        return Response.json({ error: e.message }, { status: 500, headers })
      }
    }

    if (url.pathname === '/api/discuss' && req.method === 'POST') {
      if (!apiKey) return Response.json({ error: 'Missing X-AI-Key' }, { status: 401, headers })
      try {
        const { messages, image, personality = 'grok', voiceMode } = await req.json()
        // Shared Grok-native prompt (same as Vercel edge)
        const { buildDiscussSystem, humanizeVoiceReply, voicePrimingMessages } = await import(
          '../api/prompts.js'
        )
        const isVoice = !!voiceMode
        const fullMessages: any[] = [
          { role: 'system', content: buildDiscussSystem(personality, isVoice) },
          ...(isVoice ? voicePrimingMessages() : []),
          ...messages,
        ]
        if (image && fullMessages.length > 1) {
          const last = fullMessages[fullMessages.length - 1]
          if (last.role === 'user') {
            last.content = [
              { type: 'text', text: typeof last.content === 'string' ? last.content : '' },
              { type: 'image_url', image_url: { url: image } },
            ]
          }
        }
        // Higher temp = more Grok, less corporate autocomplete
        const raw = await callXaiProxy(fullMessages, apiKey, CHAT_MODEL, {
          temperature: isVoice ? 0.95 : 0.85,
          maxTokens: isVoice ? 180 : 900,
        })
        let content = raw
        if (isVoice) content = humanizeVoiceReply(content)
        if (!content) {
          return Response.json(
            { error: 'Empty model response', content: '' },
            { status: 502, headers },
          )
        }
        return Response.json({ content }, { headers })
      } catch (e: any) {
        return Response.json(
          { error: e?.message || 'Discuss failed', content: '' },
          { status: 500, headers },
        )
      }
    }

    // ── Stripe billing (Sprint 5) ───────────────────────────────────────────
    if (url.pathname === '/api/stripe/status' && req.method === 'GET') {
      const { getStripeStatus } = await import('./stripe.js')
      return Response.json(getStripeStatus(), { headers })
    }

    if (url.pathname === '/api/stripe/checkout' && req.method === 'POST') {
      const { isStripeConfigured, createCheckoutSession } = await import('./stripe.js')
      if (!isStripeConfigured()) {
        return Response.json(
          {
            error: 'Stripe not configured',
            message:
              'Set STRIPE_SECRET_KEY, STRIPE_PRO_PRICE_ID, and STRIPE_TEAM_PRICE_ID in .env.local',
          },
          { status: 503, headers },
        )
      }
      try {
        const body = await req.json()
        const planId = body.planId
        if (planId !== 'pro' && planId !== 'team') {
          return Response.json({ error: 'planId must be "pro" or "team"' }, { status: 400, headers })
        }
        const origin = req.headers.get('origin') || 'http://localhost:5173'
        const successUrl = body.successUrl || `${origin}/?checkout=success&plan=${planId}`
        const cancelUrl = body.cancelUrl || `${origin}/?checkout=cancel`
        const session = await createCheckoutSession({
          planId,
          successUrl,
          cancelUrl,
          customerEmail: body.customerEmail,
        })
        if (!session.url) {
          return Response.json({ error: 'Stripe returned no checkout URL' }, { status: 502, headers })
        }
        return Response.json(session, { headers })
      } catch (e: any) {
        return Response.json({ error: e?.message || 'Checkout failed' }, { status: 500, headers })
      }
    }

    if (url.pathname === '/api/stripe/webhook' && req.method === 'POST') {
      const { handleStripeWebhook } = await import('./stripe.js')
      const signature = req.headers.get('stripe-signature')
      const rawBody = await req.text()
      const result = await handleStripeWebhook(rawBody, signature)
      if (!result.ok) {
        return Response.json({ error: result.error }, { status: result.status, headers })
      }
      return Response.json({ received: true }, { headers })
    }

    if (url.pathname === '/api/usage') {
      const { default: usageHandler } = await import('../api/usage.js')
      return usageHandler(req)
    }

    if (url.pathname === '/api/local-preview/sync' && req.method === 'POST') {
      try {
        const body = await req.json()
        const files =
          body.files && typeof body.files === 'object'
            ? (body.files as Record<string, string>)
            : {}
        const { syncLocalPreview } = await import('./local-preview.js')
        const result = await syncLocalPreview(files)
        return Response.json(result, { headers })
      } catch (e: any) {
        return Response.json(
          { error: e?.message || 'Local preview sync failed', ready: false },
          { status: 500, headers },
        )
      }
    }

    if (url.pathname === '/api/local-preview/status' && req.method === 'GET') {
      try {
        const { getLocalPreviewStatus } = await import('./local-preview.js')
        const status = await getLocalPreviewStatus()
        return Response.json(status, { headers })
      } catch (e: any) {
        return Response.json(
          { error: e?.message || 'Local preview status failed', ready: false },
          { status: 500, headers },
        )
      }
    }

    // ── Ship orchestrator (GitHub → Vercel → env → live) ───────────────────
    if (url.pathname === '/api/ship' && req.method === 'GET') {
      const jobId = url.searchParams.get('jobId')?.trim() || ''
      if (!jobId) {
        return Response.json({ error: 'jobId query param required' }, { status: 400, headers })
      }
      try {
        const { getShipJob, serializeShipJob } = await import('./ship-orchestrator.js')
        const job = await getShipJob(jobId)
        if (job) {
          return Response.json({ job: serializeShipJob(job) }, { headers })
        }
        const { stubJobProgress } = await import('./ship-stub.js')
        const stub = stubJobProgress(jobId)
        return Response.json({ job: stub.job, stub: stub.stub, message: stub.message }, { headers })
      } catch (e: any) {
        return Response.json({ error: e?.message || 'Status failed' }, { status: 500, headers })
      }
    }

    if (url.pathname === '/api/ship' && req.method === 'POST') {
      try {
        const workerSecret = process.env.SHIP_WORKER_SECRET?.trim()
        if (workerSecret) {
          const provided =
            req.headers.get('SHIP_WORKER_SECRET') ||
            req.headers.get('x-ship-worker-secret') ||
            ''
          if (provided !== workerSecret) {
            return Response.json({ error: 'Unauthorized' }, { status: 401, headers })
          }
        }

        const body = await req.json()
        const appName = typeof body.appName === 'string' ? body.appName.trim() : ''
        const appSlug = typeof body.appSlug === 'string' ? body.appSlug.trim() : ''
        const jobIdFromBody = typeof body.jobId === 'string' ? body.jobId.trim() : undefined
        const { MIN_PROBE_SCAFFOLD } = await import('./ship-stub.js')
        let scaffoldFiles: Record<string, string> | null =
          body.scaffoldFiles && typeof body.scaffoldFiles === 'object'
            ? (body.scaffoldFiles as Record<string, string>)
            : null
        if (!scaffoldFiles || Object.keys(scaffoldFiles).length === 0) {
          if (body.scaffoldFileCount != null) {
            scaffoldFiles = { ...MIN_PROBE_SCAFFOLD }
          }
        }

        if (!appName) {
          return Response.json({ error: 'appName required' }, { status: 400, headers })
        }
        if (!appSlug) {
          return Response.json({ error: 'appSlug required' }, { status: 400, headers })
        }
        if (!scaffoldFiles || Object.keys(scaffoldFiles).length === 0) {
          return Response.json(
            { error: 'scaffoldFiles or scaffoldFileCount required' },
            { status: 400, headers },
          )
        }

        const { createShipJob, getShipJob, runShipJob, serializeShipJob } = await import(
          './ship-orchestrator.js'
        )

        const jobId = await createShipJob({
          jobId: jobIdFromBody,
          appName,
          appSlug,
          idea: typeof body.idea === 'string' ? body.idea : undefined,
          userId: typeof body.userId === 'string' ? body.userId : undefined,
        })

        void runShipJob(jobId, {
          appName,
          appSlug,
          idea: typeof body.idea === 'string' ? body.idea : undefined,
          scaffoldFiles,
          userId: typeof body.userId === 'string' ? body.userId : undefined,
        }).catch((err: unknown) => {
          console.error(`[ship] job ${jobId} failed:`, err)
        })

        const job = await getShipJob(jobId)
        return Response.json(
          {
            jobId,
            status: job?.status ?? 'pending',
            job: job ? serializeShipJob(job) : null,
          },
          { status: 202, headers },
        )
      } catch (e: any) {
        return Response.json({ error: e?.message || 'Ship job failed' }, { status: 500, headers })
      }
    }

    const shipJobMatch = url.pathname.match(/^\/api\/ship\/([^/]+)$/)
    if (shipJobMatch && req.method === 'GET') {
      try {
        const { getShipJob, serializeShipJob } = await import('./ship-orchestrator.js')
        const job = await getShipJob(shipJobMatch[1])
        if (!job) {
          return Response.json({ error: 'Job not found' }, { status: 404, headers })
        }
        return Response.json({ job: serializeShipJob(job) }, { headers })
      } catch (e: any) {
        return Response.json({ error: e?.message || 'Status failed' }, { status: 500, headers })
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

    return new Response(
      'IdeaSpeak API — /health /api/voice/token /api/xai /api/refine /api/build /api/discuss /api/usage /api/ship /api/image /api/sandbox/* /api/stripe/checkout /api/stripe/webhook',
      { headers },
    )
  },
})

console.log(`IdeaSpeak backend on http://localhost:${server.port}`)
console.log('Voice Agent token endpoint: POST /api/voice/token')
