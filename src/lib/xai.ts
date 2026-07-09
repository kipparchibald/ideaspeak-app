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

// New: Multi-turn discussion chat like grok.com, using the full agent prompt + planning instructions
export async function discussWithGrok(
  messages: XaiMessage[],
  apiKey?: string,
  image?: string | null,
  personality: string = 'grok',
  voiceMode?: boolean
): Promise<string> {
  const key = apiKey || localStorage.getItem('ideaspeak_xai_key');
  if (!key) {
    // High-quality simulator — flavored by selected personality for fun customization
    const lastUser = messages.filter(m => m.role === 'user').pop()?.content || '';
    const historySummary = messages.length > 2 ? `We've been discussing this for a bit. ` : '';
    const isVoice = !!voiceMode;
    let prefix = `(simulator mode — add xAI key in Settings for the real Grok experience) `;
    
    if (personality === 'witty') {
      prefix = `(simulator — Witty Comedian mode) `;
      if (isVoice) return `${prefix}Haha, "${lastUser.slice(0,60)}". Bold. But seriously — what's the actual pain this fixes, and why will anyone care? What's the fastest way it could flop?`;
      return `${prefix}${historySummary}Haha, "${lastUser.slice(0, 80)}${lastUser.length > 80 ? '...' : ''}" — bold move. But tell me, what's the real pain point here and why should anyone care? What's the dumbest way this could fail spectacularly? Let's sketch a plan before you embarrass yourself in public.`;
    } else if (personality === 'mentor') {
      prefix = `(simulator — Wise Mentor mode) `;
      if (isVoice) return `${prefix}Interesting. "${lastUser.slice(0,60)}" — what's the deepest user need here? What assumption might bite us later?`;
      return `${prefix}${historySummary}Interesting direction with "${lastUser.slice(0, 80)}${lastUser.length > 80 ? '...' : ''}". Let's slow down and think: What is the deepest user need this fulfills? What assumptions are we making that could be wrong? What does meaningful success look like?`;
    } else if (personality === 'coach') {
      prefix = `(simulator — Enthusiastic Coach mode) `;
      if (isVoice) return `${prefix}Love the energy on "${lastUser.slice(0,60)}"! What's the one thing that would make users obsessed? What's blocking you right now? First step?`;
      return `${prefix}${historySummary}YES! "${lastUser.slice(0, 80)}${lastUser.length > 80 ? '...' : ''}" — I love the energy! Now let's turn that spark into a plan. What's the ONE thing that would make users obsessed? What's stopping you right now? We've got this — first step?`;
    } else if (personality === 'rebel') {
      prefix = `(simulator — Rebel Hacker mode) `;
      if (isVoice) return `${prefix}Fuck the boring path — "${lastUser.slice(0,60)}" has legs if we break the right rules. What's the contrarian angle? What should we destroy?`;
      return `${prefix}${historySummary}Fuck the rules — "${lastUser.slice(0, 80)}${lastUser.length > 80 ? '...' : ''}" could be huge if we break shit the right way. What's the contrarian take here? What's the boring corporate way everyone does it that we should destroy? Let's build something that pisses off the right people.`;
    }
    
    // Default Grok Classic
    if (isVoice) {
      return `${prefix}I like where you're going with "${lastUser.slice(0,80)}". What's the core problem this solves for the real user, and why does it matter? Biggest risk you see? What's your gut on the first user flow?`;
    }
    return `${prefix}${historySummary}I like where you're going with "${lastUser.slice(0, 100)}${lastUser.length > 100 ? '...' : ''}". 

To vet this properly: What's the core problem this solves for the user, and why does it matter emotionally? What are the biggest risks or assumptions that could sink it? 

Any constraints (time, budget, tech stack)? What would "success" look like in 3 months?

Let's map out a simple plan together — MVP scope, key flows, and one or two wow moments. What's your first thought on the main user journey?`;
  }

  try {
    const res = await fetch('/api/discuss', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AI-Key': key,
      },
      body: JSON.stringify({ messages, image, personality, voiceMode }),
    });
    const data = await res.json();
    return data.content || "The agent didn't return a response.";
  } catch (e) {
    console.error('Discuss call failed', e);
    throw e;
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
