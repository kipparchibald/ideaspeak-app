import { serve } from 'bun';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/** Load XAI_API_KEY from project-root .env.local (bun run dev:full) */
function loadEnvLocal() {
  const p = join(import.meta.dir, '..', '.env.local');
  if (!existsSync(p)) return;
  try {
    const text = readFileSync(p, 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^XAI_API_KEY=["']?([^"'\s#]+)["']?/);
      if (m?.[1]?.trim()) {
        process.env.XAI_API_KEY = m[1].trim();
        return;
      }
    }
  } catch { /* ignore */ }
}
loadEnvLocal();

// Enhanced Bun server stub for IdeaSpeak backend
// - Proxies xAI API calls (key stays out of browser in production deploys)
// - /api/refine and /api/build : construct full prompts from local files, call xAI, return structured JSON for files when possible
// - This moves logic server-side for security and allows 100% LLM-driven code gen

const XAI_API = 'https://api.x.ai/v1/chat/completions';

function resolveApiKey(req: Request): string {
  const serverKey = process.env.XAI_API_KEY?.trim();
  if (serverKey) return serverKey;
  if (process.env.VERCEL_ENV === 'production') return '';
  return (
    req.headers.get('X-AI-Key') ||
    req.headers.get('x-ai-key') ||
    ''
  );
}

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return true;
  const allowed = new Set([
    'https://ideaspeak-app.vercel.app',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ]);
  if (allowed.has(origin)) return true;
  try {
    const { hostname } = new URL(origin);
    return (hostname.endsWith('.vercel.app') && hostname.includes('ideaspeak')) ||
      hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

function humanizeVoiceReply(text: string): string {
  if (!text) return text;
  let t = text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/\n+/g, ' ')
    .trim();
  const sentences = t.match(/[^.!?]+[.!?]+/g) || [t];
  if (sentences.length > 3) t = sentences.slice(0, 3).join(' ').trim();
  const words = t.split(/\s+/);
  if (words.length > 58) t = words.slice(0, 58).join(' ') + '?';
  return t;
}

async function pingXai(apiKey: string): Promise<boolean> {
  const res = await fetch(XAI_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'grok-4.3',
      messages: [{ role: 'user', content: 'Reply with exactly: ok' }],
      max_tokens: 8,
      reasoning_effort: 'none',
    }),
  });
  return res.ok;
}

async function loadPrompt(file: string): Promise<string> {
  try {
    const f = Bun.file(`prompts/${file}`);
    return await f.text();
  } catch {
    return `You are IdeaSpeak xAI agent. Follow best practices for voice-first app building, premium design systems, production code.`;
  }
}

async function callXaiProxy(messages: any[], apiKey: string, model = 'grok-4.3', reasoningEffort?: string) {
  const res = await fetch(XAI_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.6,
      max_tokens: 8000,
      ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'xAI error');
  const msg = data.choices?.[0]?.message;
  // Support vision responses or text
  return msg?.content || (typeof msg === 'string' ? msg : '');
}

const server = serve({
  port: 3001,
  async fetch(req) {
    const url = new URL(req.url);
    const origin = req.headers.get('origin') || '';

    if (origin && !isAllowedOrigin(origin)) {
      return Response.json({ error: 'Forbidden origin' }, { status: 403 });
    }

    const cors = {
      'Access-Control-Allow-Origin': origin || 'http://localhost:5173',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      Vary: 'Origin',
    };

    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    if (url.pathname === '/health') {
      return Response.json({ status: 'ok', time: new Date().toISOString() }, { headers: cors });
    }

    const apiKey = resolveApiKey(req);

    if (url.pathname === '/api/status') {
      if (!apiKey) {
        return Response.json(
          { live: false, source: 'none', model: 'grok-4.3', message: 'Add XAI_API_KEY to .env.local (run: bun run setup:grok)' },
          { headers: cors }
        );
      }
      const live = await pingXai(apiKey);
      return Response.json(
        {
          live,
          source: 'server',
          model: 'grok-4.3',
          message: live ? 'Grok API ready via server' : 'xAI key invalid or unreachable',
        },
        { headers: cors }
      );
    }

    if (url.pathname === '/api/xai' && req.method === 'POST') {
      if (!apiKey) return Response.json({ error: 'Missing X-AI-Key' }, { status: 401, headers: cors });
      try {
        const body = await req.json();
        const content = await callXaiProxy(body.messages, apiKey, body.model);
        return Response.json({ choices: [{ message: { content } }] }, { headers: cors });
      } catch (e: any) {
        return Response.json({ error: e.message }, { status: 500, headers: cors });
      }
    }

    // Full refine endpoint: uses the exact refiner prompt + calls LLM
    if (url.pathname === '/api/refine' && req.method === 'POST') {
      if (!apiKey) return Response.json({ error: 'Missing X-AI-Key' }, { status: 401, headers: cors });
      try {
        const { transcript, history = [] } = await req.json();
        const refinerPrompt = await loadPrompt('IdeaSpeak-Voice-Refiner-Prompt.md');
        
        const system = refinerPrompt + `\n\nOutput ONLY valid JSON: { "brief": { "vision": "...", "users": "...", "keyFeatures": ["..."] , "tech": "..." }, "optimizedPrompt": "full prompt for agent" }`;
        
        const user = `Raw transcript: ${transcript}\nHistory: ${history.slice(-2).map((h: any) => h.content).join(' | ')}`;
        
        const content = await callXaiProxy([
          { role: 'system', content: system },
          { role: 'user', content: user }
        ], apiKey);

        // Try to parse JSON from response
        let parsed;
        try {
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
        } catch {}
        
        return Response.json({ content, parsed }, { headers: cors });
      } catch (e: any) {
        return Response.json({ error: e.message }, { status: 500, headers: cors });
      }
    }

    // Full build endpoint: uses agent prompt, asks for structured files JSON
    if (url.pathname === '/api/build' && req.method === 'POST') {
      if (!apiKey) return Response.json({ error: 'Missing X-AI-Key' }, { status: 401, headers: cors });
      try {
        const { transcript, brief: inputBrief, personality = 'grok' } = await req.json();
        const agentPrompt = await loadPrompt('IdeaSpeak-xAI-Agent-System-Prompt.md');
        
        const personalityAddons: Record<string, string> = {
          grok: '',
          witty: ' Infuse the code and comments with witty, sarcastic humor.',
          mentor: ' Add wise, insightful comments that feel like advice from an experienced mentor.',
          coach: ' Make the UI energetic and the comments motivational and action-oriented.',
          rebel: ' Add edgy, rule-breaking comments and unconventional but delightful UI choices.',
        };
        const addon = personalityAddons[personality] || '';

        const system = agentPrompt + addon + `

CRITICAL: After understanding the idea, output ONLY a valid JSON object with NO other text:

{
  "name": "Short App Name",
  "plan": "Short 2-3 sentence plan with key decisions and wow moments",
  "files": {
    "src/App.tsx": "complete React TSX code for the main component, beautiful, follows design system with semantic tokens, includes voice if relevant, production ready",
    "src/index.css": "full CSS with design tokens, Tailwind, premium dark theme, motion",
    "src/main.tsx": "standard entry",
    "src/components/..." : "any additional components",
    "README.md": "how to run, what the app does"
  }
}

Use modern React 19 + TS + Tailwind. Make UIs stunning per the manifesto (Linear/Arc taste, no hacks). Include at least 4-6 files. Make it feel complete and delightful.`;

        const user = inputBrief 
          ? `Build the app from this brief: ${JSON.stringify(inputBrief)}` 
          : `Build from spoken idea: ${transcript}`;

        const content = await callXaiProxy([
          { role: 'system', content: system },
          { role: 'user', content: user }
        ], apiKey, 'grok-build-0.1');

        let parsed;
        try {
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
        } catch (e) { console.error('parse fail', e); }

        return Response.json({ content, parsed }, { headers: cors });
      } catch (e: any) {
        return Response.json({ error: e.message }, { status: 500, headers: cors });
      }
    }

    // New: Discuss / Planning chat endpoint (like grok.com conversation)
    // Uses the agent prompt but instructs to stay in collaborative planning mode.
    // Supports vision: if image (base64 data URL) is provided, include as vision message.
    if (url.pathname === '/api/discuss' && req.method === 'POST') {
      const body = await req.json();
      const { messages, image, personality = 'grok', voiceMode } = body;
      if (!apiKey) {
        const lastUser = (messages || []).filter((m: { role: string }) => m.role === 'user').pop()?.content || '';
        const snippet = String(lastUser).slice(0, 60).trim();
        const content = voiceMode
          ? (snippet ? `Okay — "${snippet}" — what's the one daily action users take?` : `Walk me through it — what's the one-liner?`)
          : `(offline) On "${snippet || 'your idea'}" — who's the user and what's the #1 job?`;
        return Response.json({ content, voiceMode: !!voiceMode, offline: true }, { headers: cors });
      }
      try {
        const agentPrompt = await loadPrompt('IdeaSpeak-xAI-Agent-System-Prompt.md');

        // Personality flavor for fun customization
        const personalityAddons: Record<string, string> = {
          grok: '',
          witty: ' Respond in a witty, sarcastic, humorous tone like a clever stand-up comedian who loves tech and roasting bad ideas.',
          mentor: ' Respond as a wise, patient mentor with deep experience. Be encouraging but brutally honest when needed.',
          coach: ' Be an energetic, motivational coach. Use exclamation points, celebrate small wins, and push the user to take action.',
          rebel: ' Respond in an edgy, rule-breaking, contrarian hacker tone. Challenge conventional wisdom and encourage bold moves.',
        };
        const addon = personalityAddons[personality] || '';

        const voiceInstructions = voiceMode ? `

**VOICE CONVERSATION MODE — critical for natural feel:**
- This is a live spoken conversation. Keep every reply SHORT and tight: 1 to 4 natural sentences max.
- Sound like a real smart friend on a call with you — reactive, curious, direct.
- End almost every turn with a specific question or "what do you think?" to hand the floor back immediately.
- No long explanations or lists unless the user asks. No "let's map out a full plan right now".
- Speakable language only. Fast back-and-forth is the goal. If the user interrupts you (in their next message), pivot instantly.
- When the user has a clear direction, gently confirm the key points in one sentence then ask what to explore or change next.` : '';

        const system = agentPrompt + addon + `

You are currently in **Discussion & Planning Mode** with the user (voice conversation style).

Your role right now:
- Have a natural, back-and-forth conversation like on grok.com.
- Deeply explore the idea the user is speaking about.
- Discuss limitations, risks, alternatives, user needs, scope, technical challenges, business aspects.
- Help create a clear, realistic plan together (features for MVP, data model, key flows, tech choices, wow moments, what to leave for later).
- Be maximally truthful, direct, ambitious, and collaborative.
- Use mermaid diagrams in your responses when it helps visualize architecture or flows.
- Ask smart clarifying questions.
- Celebrate good ideas and point out potential pitfalls honestly.
- **Do NOT** start generating code, components, or file structures yet.
- Only transition to building when the user explicitly says something like "let's build it", "I'm ready to build", "finalize the plan and generate the app", or "switch to build mode".

Keep responses conversational and speakable. Maintain memory of the entire thread.

When the user is ready, summarize the agreed plan clearly so it can be handed off to the build agent.` + voiceInstructions;

        const fullMessages: any[] = [
          { role: 'system', content: system }
        ];

        // Add previous messages
        messages.forEach((m: any) => fullMessages.push({ role: m.role, content: m.content }));

        // If image provided for vision (last user message), attach as vision content
        if (image && messages.length > 0) {
          const last = fullMessages[fullMessages.length - 1];
          if (last.role === 'user') {
            last.content = [
              { type: 'text', text: typeof last.content === 'string' ? last.content : '' },
              { type: 'image_url', image_url: { url: image } }
            ];
          }
        }

        let content = await callXaiProxy(fullMessages, apiKey, 'grok-4.3', voiceMode ? 'none' : 'low');
        if (voiceMode) content = humanizeVoiceReply(content);
        return Response.json({ content, voiceMode: !!voiceMode }, { headers: cors });
      } catch (e: any) {
        return Response.json({ error: e.message }, { status: 500, headers: cors });
      }
    }

    // Phase 1 additional: xAI image generation for custom assets (logos, heroes, illustrations)
    if (url.pathname === '/api/image' && req.method === 'POST') {
      if (!apiKey) return Response.json({ error: 'Missing X-AI-Key' }, { status: 401, headers: cors });
      try {
        const { prompt, size = '1024x1024' } = await req.json();
        const res = await fetch('https://api.x.ai/v1/images/generations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'grok-2-image',
            prompt,
            n: 1,
            size,
            response_format: 'url'
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || 'Image gen error');
        return Response.json(data, { headers: cors });
      } catch (e: any) {
        return Response.json({ error: e.message }, { status: 500, headers: cors });
      }
    }

    // Push notification subscription (for real background push when a voice prompt finishes)
    let pushSubscriptions: any[] = []
    if (url.pathname === '/api/push/subscribe' && req.method === 'POST') {
      try {
        const { subscription } = await req.json()
        // Avoid duplicates
        if (!pushSubscriptions.some(s => s.endpoint === subscription.endpoint)) {
          pushSubscriptions.push(subscription)
        }
        console.log('New push subscription stored. Total:', pushSubscriptions.length)
        return Response.json({ success: true }, { headers: cors })
      } catch (e: any) {
        return Response.json({ error: e.message }, { status: 500, headers: cors })
      }
    }

    // Test / trigger push (called by client or internally when a build "finishes" on server)
    if (url.pathname === '/api/push/send' && req.method === 'POST') {
      try {
        const { title, body } = await req.json()
        const payload = JSON.stringify({ title: title || 'IdeaSpeak', body: body || 'A voice prompt has finished building!' })

        // In a real production setup you would use the 'web-push' library with VAPID keys here.
        // For this demo we just log and the SW will handle if you trigger a real push.
        console.log('Would send push to', pushSubscriptions.length, 'subscribers:', payload)

        // For demo: tell all connected clients to show a notification via postMessage
        const allClients = await (self as any).clients?.matchAll?.({ type: 'window' }) || []
        for (const client of allClients) {
          client.postMessage({ type: 'SHOW_NOTIFICATION', title, body })
        }

        return Response.json({ success: true, sentTo: pushSubscriptions.length }, { headers: cors })
      } catch (e: any) {
        return Response.json({ error: e.message }, { status: 500, headers: cors })
      }
    }

    return new Response('IdeaSpeak Backend - /health, /api/xai, /api/refine, /api/build, /api/image, /api/push/subscribe, /api/push/send', { headers: cors });
  },
});

console.log(`IdeaSpeak backend running on http://localhost:${server.port}`);
console.log(process.env.XAI_API_KEY?.trim()
  ? '[IdeaSpeak] XAI_API_KEY loaded from .env.local — LIVE GROK'
  : '[IdeaSpeak] No XAI_API_KEY in .env.local — paste key in Settings or run: bun run setup:grok');
console.log('Use /api/refine and /api/build for full LLM-driven structured generation with real prompts.');
