import { getApiKey, xaiError } from './xai.js'

export const config = { runtime: 'edge', maxDuration: 60 }

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-AI-Key',
      },
    })
  }

  const apiKey = getApiKey(req)
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Missing X-AI-Key' }), { status: 401 })
  }

  const { prompt, size = '1024x1024' } = await req.json()

  const res = await fetch('https://api.x.ai/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'grok-imagine-image',
      prompt,
      n: 1,
      size,
      response_format: 'url',
    }),
  })

  const data = await res.json()
  if (!res.ok) {
    return new Response(JSON.stringify({ error: xaiError(data, 'Image gen failed') }), { status: 500 })
  }

  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}