export const config = { runtime: 'edge' }

export default function handler() {
  const hasKey = !!process.env.XAI_API_KEY
  return new Response(
    JSON.stringify({
      live: hasKey,
      source: hasKey ? 'server' : 'none',
      message: hasKey
        ? 'Grok API ready via server'
        : 'Add XAI_API_KEY to Vercel env vars or paste key in Settings',
    }),
    { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
  )
}