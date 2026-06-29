import { getApiKey, pingXai, xaiError, MODELS } from './xai.js'

export const config = { runtime: 'edge' }

export default async function handler(req) {
  const apiKey = getApiKey(req)

  if (!apiKey) {
    return new Response(
      JSON.stringify({
        live: false,
        source: 'none',
        model: MODELS.chat,
        message: 'Add XAI_API_KEY to Vercel env vars or paste key in Settings',
      }),
      { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )
  }

  const { ok, data } = await pingXai(apiKey)

  if (!ok) {
    return new Response(
      JSON.stringify({
        live: false,
        source: 'server',
        model: MODELS.chat,
        message: xaiError(data, 'xAI key invalid or API unreachable'),
      }),
      { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )
  }

  return new Response(
    JSON.stringify({
      live: true,
      source: 'server',
      model: MODELS.chat,
      message: 'Grok API ready via server',
    }),
    { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
  )
}