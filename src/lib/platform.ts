/**
 * IdeaSpeak platform mode — all infra runs on IdeaSpeak accounts.
 * Users never paste API keys, GitHub tokens, or env vars.
 */

/** When true: ship via Railway worker only; hide BYO credential UI */
export const IN_HOUSE_PLATFORM = true

export const PLATFORM_COPY = {
  shipHeadline: 'IdeaSpeak ships for you',
  shipSub:
    'We provision GitHub, Vercel, Supabase, and env on our platform — you get a live URL.',
  grokHeadline: 'Platform Grok',
  grokSub: 'Live on IdeaSpeak infrastructure — no API key required.',
} as const