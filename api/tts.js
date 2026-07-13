import { getApiKey, xaiError } from './xai.js'
import { corsHeaders, rejectBlockedOrigin } from './security.js'

export const config = { runtime: 'edge', maxDuration: 60 }

const VOICES = new Set([
  'eve', 'ara', 'leo', 'rex', 'sal',
  'iris', 'luna', 'helix', 'orion', 'rigel',
  'celeste', 'cosmo', 'kepler', 'lumen', 'sirius',
  'carina', 'zagan', 'altair', 'zenith', 'atlas',
  'castor', 'naksh',
])

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) })
  }

  const blocked = rejectBlockedOrigin(req)
  if (blocked) return blocked

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })
  }

  const apiKey = getApiKey(req)
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'XAI_API_KEY not configured' }), {
      status: 401,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })
  }

  let body
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })
  }

  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!text) {
    return new Response(JSON.stringify({ error: 'text is required' }), {
      status: 400,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })
  }
  if (text.length > 15000) {
    return new Response(JSON.stringify({ error: 'text exceeds 15000 character limit' }), {
      status: 400,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })
  }

  const voiceId = VOICES.has(body.voice_id) ? body.voice_id : 'eve'
  const language = typeof body.language === 'string' ? body.language : 'en'
  const speed = typeof body.speed === 'number' && body.speed >= 0.5 && body.speed <= 2
    ? body.speed
    : 1

  try {
    const res = await fetch('https://api.x.ai/v1/tts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        voice_id: voiceId,
        language,
        speed,
        output_format: {
          codec: 'mp3',
          sample_rate: 24000,
          bit_rate: 128000,
        },
      }),
    })

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      return new Response(
        JSON.stringify({ error: xaiError(errData, `TTS failed (${res.status})`) }),
        {
          status: res.status,
          headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
        }
      )
    }

    const audio = await res.arrayBuffer()
    return new Response(audio, {
      status: 200,
      headers: {
        ...corsHeaders(req),
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message || 'TTS request failed' }), {
      status: 500,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })
  }
}
