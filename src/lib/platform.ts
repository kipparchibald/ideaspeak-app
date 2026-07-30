/**
 * IdeaSpeak platform mode — all infra runs on IdeaSpeak accounts.
 * Users never paste API keys, GitHub tokens, or env vars.
 */

/** When true: ship via Railway worker only; hide BYO credential UI */
export const IN_HOUSE_PLATFORM = true

export const PLATFORM_COPY = {
  shipHeadline: 'Ship when you are ready',
  shipSub:
    'Download a production ZIP now, or queue auto-deploy when the platform worker is live. No secrets to paste.',
  grokHeadline: 'Platform Grok',
  grokSub: 'Live on IdeaSpeak infrastructure — no API key required for the hosted demo.',
  /** Honest path while auto-deploy worker is still provisioning */
  shipHonestPath:
    'Production ZIP works today. One-click GitHub + Vercel auto-deploy goes live once the platform worker is connected.',
  zipPrimaryCta: 'Download production ZIP (works now)',
  launchWhenStub:
    'Queued for auto-deploy. Your reliable path right now is Ship → Download production ZIP, then open in Cursor or push to GitHub.',
} as const
