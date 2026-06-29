/** Lovable fallback — works like lovable.dev (their hosted API, zero key for visitors) */

const EXTENSION_ID = 'YOUR_EXTENSION_ID_HERE'

export function buildLovablePrompt(opts: {
  transcript?: string
  conversation?: { role: string; content: string }[]
  brief?: { vision?: string; keyFeatures?: string[] }
  projectName?: string
}): string {
  const { transcript, conversation, brief, projectName } = opts
  const vision = brief?.vision || transcript || ''
  const features = brief?.keyFeatures?.join(', ') || 'core vertical slice, beautiful UI, production patterns'
  const history = conversation?.slice(-6).map((m) => `${m.role}: ${m.content}`).join('\n') || ''

  return `Build a production-grade React + TypeScript + Tailwind web app (Lovable stack).

App: ${projectName || 'IdeaSpeak Generated App'}

Vision: ${vision}

Key features: ${features}

${history ? `Discussion context:\n${history}\n` : ''}

Requirements:
- Premium dark UI (Linear/Stripe/Arc taste), semantic design tokens, purposeful motion
- Complete vertical slice on day one — not a skeleton
- Supabase-ready patterns (auth stub, data layer notes)
- Voice-native touches where relevant
- Beautiful empty states, loading, error handling
- Mobile-friendly, accessible

Ship something that makes users say "holy shit this is already better".`
}

async function tryExtension(prompt: string): Promise<boolean> {
  type ChromeRuntime = {
    sendMessage: (
      id: string,
      msg: unknown,
      cb: (response: { success?: boolean }) => void
    ) => void
    lastError?: { message: string }
  }
  const chromeApi = (window as unknown as { chrome?: { runtime?: ChromeRuntime } }).chrome
  if (!chromeApi?.runtime?.sendMessage || EXTENSION_ID === 'YOUR_EXTENSION_ID_HERE') return false

  return new Promise((resolve) => {
    try {
      chromeApi.runtime!.sendMessage(
        EXTENSION_ID,
        { type: 'IDEASPEAK_PROMPT', prompt },
        (response) => {
          if (chromeApi.runtime?.lastError) resolve(false)
          else resolve(!!response?.success)
        }
      )
    } catch {
      resolve(false)
    }
  })
}

export async function sendToLovable(prompt: string): Promise<{ success: boolean; method: 'extension' | 'clipboard'; error?: string }> {
  if (await tryExtension(prompt)) {
    return { success: true, method: 'extension' }
  }

  try {
    await navigator.clipboard.writeText(prompt)
    window.open('https://lovable.dev/', '_blank', 'noopener,noreferrer')
    return { success: true, method: 'clipboard' }
  } catch (e) {
    return { success: false, method: 'clipboard', error: e instanceof Error ? e.message : 'Clipboard failed' }
  }
}