// xAI / Grok API client + simulator fallback
// Uses the exact prompts from /prompts/

const XAI_BASE = '/api/xai'; // our backend proxy stub

export interface XaiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function callXai(
  messages: XaiMessage[],
  apiKey?: string,
  options: { model?: string; temperature?: number } = {}
): Promise<{ content: string; raw?: any }> {
  const key = apiKey || localStorage.getItem('ideaspeak_xai_key');

  if (!key) {
    // Fallback to simulator (current high-fidelity one in App.tsx)
    throw new Error('NO_KEY');
  }

  try {
    const res = await fetch(XAI_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AI-Key': key,
      },
      body: JSON.stringify({
        model: options.model || 'grok-3',
        messages,
        temperature: options.temperature ?? 0.6,
        max_tokens: 6000,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `xAI error ${res.status}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    return { content, raw: data };
  } catch (e: any) {
    if (e.message === 'NO_KEY') throw e;
    console.warn('xAI proxy failed, falling back to simulator:', e.message);
    throw new Error('PROXY_FAIL');
  }
}

// Enhanced: Use backend /api/refine and /api/build for full LLM-driven structured output
export async function runIdeaSpeakAgent(
  transcript: string,
  history: any[],
  apiKey?: string
): Promise<{ brief: any; optimizedPrompt: string; plan?: string; rawResponse?: string; structured?: any }> {
  const key = apiKey || localStorage.getItem('ideaspeak_xai_key');

  if (!key) {
    return simulateLocal(transcript, history);
  }

  try {
    // Call backend which loads the exact prompt files and calls xAI with JSON instructions
    const res = await fetch('/api/refine', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AI-Key': key,
      },
      body: JSON.stringify({ transcript, history }),
    });

    const data = await res.json();
    if (data.parsed) {
      return {
        brief: data.parsed.brief || {},
        optimizedPrompt: data.parsed.optimizedPrompt || transcript,
        plan: data.parsed.plan,
        rawResponse: data.content,
        structured: data.parsed
      };
    }
    // fallback parse
    return simulateLocal(transcript, history);
  } catch (e) {
    console.warn('Backend refine failed, simulator:', e);
    return simulateLocal(transcript, history);
  }
}

// New: Full LLM-driven code gen - asks backend to use agent prompt + return JSON files
export async function generateWithLLM(
  transcript: string,
  brief: any,
  apiKey?: string,
  personality: string = 'grok'
): Promise<{ files: any; name: string; plan: string; raw: string }> {
  const key = apiKey || localStorage.getItem('ideaspeak_xai_key');
  if (!key) throw new Error('NO_KEY');

  try {
    const res = await fetch('/api/build', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AI-Key': key,
      },
      body: JSON.stringify({ transcript, brief, personality }),
    });
    const data = await res.json();

    if (data.parsed && data.parsed.files) {
      return {
        files: data.parsed.files,
        name: data.parsed.name || 'IdeaSpeak App',
        plan: data.parsed.plan || 'LLM generated',
        raw: data.content
      };
    }
    throw new Error('No structured files from LLM');
  } catch (e) {
    console.error('LLM build failed', e);
    throw e;
  }
}

export type DiscussResult = {
  content: string
  /** true only when real xAI Grok answered */
  live: boolean
  error?: string
}

function apiBase(path: string): string {
  if (typeof window !== 'undefined') return path
  // Node/Bun tests — hit local backend directly
  const base = process.env.IDEASPEAK_API || 'http://localhost:3001'
  return `${base.replace(/\/$/, '')}${path}`
}

// Collaborative plan chat — real Grok when API works; simulator only as fallback
export async function discussWithGrok(
  messages: XaiMessage[],
  apiKey?: string,
  image?: string | null,
  personality: string = 'grok',
  voiceMode?: boolean
): Promise<DiscussResult> {
  const key = (
    apiKey ||
    (typeof localStorage !== 'undefined' ? localStorage.getItem('ideaspeak_xai_key') : '') ||
    ''
  ).trim()

  // Always hit the server first — production may have XAI_API_KEY with no client key
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (key) headers['X-AI-Key'] = key

    const res = await fetch(apiBase('/api/discuss'), {
      method: 'POST',
      headers,
      body: JSON.stringify({ messages, image, personality, voiceMode }),
    })
    const data = await res.json().catch(() => ({} as any))

    if (!res.ok) {
      const errMsg =
        (typeof data?.error === 'string' && data.error) ||
        data?.error?.message ||
        `Discuss failed (${res.status})`
      console.warn('Discuss API error:', errMsg)
      return {
        content: simulateDiscuss(messages, personality, !!voiceMode),
        live: false,
        error: errMsg,
      }
    }

    const content = String(data?.content || '').trim()
    if (content) {
      return { content, live: true }
    }

    return {
      content: simulateDiscuss(messages, personality, !!voiceMode),
      live: false,
      error: 'Empty response from Grok',
    }
  } catch (e: any) {
    console.error('Discuss call failed:', e)
    return {
      content: simulateDiscuss(messages, personality, !!voiceMode),
      live: false,
      error: e?.message || 'Network error reaching Grok',
    }
  }
}

export async function generateImage(prompt: string, apiKey?: string): Promise<{ url: string; revised_prompt?: string }> {
  const key = apiKey || localStorage.getItem('ideaspeak_xai_key');
  if (!key) throw new Error('NO_KEY');

  try {
    const res = await fetch('/api/image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AI-Key': key,
      },
      body: JSON.stringify({ prompt }),
    });
    const data = await res.json();
    if (data.data && data.data[0]) {
      return { url: data.data[0].url, revised_prompt: data.data[0].revised_prompt };
    }
    throw new Error('No image returned');
  } catch (e) {
    console.error('Image gen failed', e);
    throw e;
  }
}

/** Plan-mode simulator: Grok energy, no restating, no corporate fluff */
function simulateDiscuss(
  messages: XaiMessage[],
  personality: string,
  voiceMode: boolean,
): string {
  const userTurns = messages.filter((m) => m.role === 'user')
  const last = (userTurns[userTurns.length - 1]?.content || '').toLowerCase()
  const n = userTurns.length
  const lower = last

  const isHabit = /habit|streak|daily|coach/.test(lower)
  const isCrm = /crm|client|freelancer|lead/.test(lower)
  const isVoiceApp = /voice|speak|transcript/.test(lower)
  const wantsBuild = /\b(build it|let'?s build|ready|lock it|ship it|go ahead)\b/.test(lower)

  if (wantsBuild && n >= 2) {
    return voiceMode
      ? "Cool. Plan's tight enough. Say build it and I'll drop a live preview on the right — one slice, not a science fair."
      : "Alright — plan's tight enough. Hit Build and I'll generate a live preview from what we locked."
  }

  if (n <= 1) {
    if (isHabit) {
      return voiceMode
        ? "Generic habit apps are where motivation goes to die. Make it did-you-ship-today or don't bother. Solo founder or tiny team?"
        : "Generic habit apps are graveyards. I'd bet on did-you-ship-today energy, not water glasses. Solo founder or tiny team?"
    }
    if (isCrm) {
      return voiceMode
        ? "Most CRMs are homework. v1 should feel like texting someone smart. Freelancers or a sales pod first?"
        : "Most CRMs are homework nobody does. v1: capture, status, next action — that's it. Freelancers or sales pod?"
    }
    if (isVoiceApp) {
      return voiceMode
        ? "Voice is the input, structure is the product. Speech becomes tasks, notes, or a roadmap — pick one for v1."
        : "Voice is cheap; structure is the product. For v1, speech becomes tasks, notes, or a roadmap — which one?"
    }
    if (personality === 'rebel') {
      return voiceMode
        ? "Okay, there's blood in the water. Who's bleeding without this by tomorrow?"
        : "There's blood in the water. Who's in pain without this tomorrow?"
    }
    return voiceMode
      ? "Skip the pitch deck energy. Who's it for, and what do they actually do every day?"
      : "Skip the pitch deck. Primary user — and the one daily action that makes this sticky?"
  }

  if (n === 2) {
    return voiceMode
      ? "I'd ship one hero screen, dark UI that doesn't scream AI-slop, core loop only. What's the screenshot moment?"
      : "Default: one hero screen, dark premium UI, core loop only. Auth later. What's the screenshot moment?"
  }

  return voiceMode
    ? "We've got user, loop, and a wow angle. Cut the rest. Say build it when you want the live preview."
    : "We've got enough: user, loop, wow, ruthless cut. Say build it or hit Build for the live preview."
}

function simulateLocal(transcript: string, _history: any[]) {
  // Aligned with the rich client-side simulator in App.tsx (for when no key or proxy fails)
  const cleaned = transcript.trim().replace(/\s+/g, ' ')
  const lower = cleaned.toLowerCase()
  
  let vision = "A delightful voice-first tool that turns spoken thoughts into beautiful, functional software."
  let keyFeatures = ["Instant voice capture", "AI structuring", "Premium UI with motion", "Export & share"]

  if (lower.includes('roadmap') || lower.includes('founder') || lower.includes('task')) {
    vision = "Voice-powered roadmap and task generator that turns messy spoken strategy into clear, prioritized plans."
    keyFeatures = ["Voice capture & transcription", "AI roadmap extraction", "Prioritized tasks", "Beautiful exports", "Team comments"]
  } else if (lower.includes('client') || lower.includes('portal') || lower.includes('update')) {
    vision = "Voice-first client portal with spoken updates and stunning AI summaries."
    keyFeatures = ["Speak updates", "AI summaries", "Visual timelines", "Voice attachments"]
  } else if (lower.includes('marketplace') || lower.includes('book') || lower.includes('consult') || lower.includes('session')) {
    vision = "Premium marketplace for booking voice-based strategy sessions with top indie experts."
    keyFeatures = ["Spoken expertise profiles", "Smart matching", "In-app booking + payments stub", "Post-session voice deliverables"]
  }

  const optimizedPrompt = `Build a production-grade native web app: ${vision}\n\nMust ship: ${keyFeatures.join(', ')}\n\nDesign system sacred. Follow IdeaSpeak xAI agent prompt exactly.`

  return {
    brief: { vision, keyFeatures, original: cleaned, tech: 'React + Tailwind + Framer Motion' },
    optimizedPrompt,
    plan: 'Local simulator plan: vertical slice first, polish, proactive features, voice-native where it fits.',
  }
}
