export const config = { runtime: 'edge', maxDuration: 60 }

const DISCUSS_SYSTEM = `You are IdeaSpeak in Discussion & Planning Mode powered by xAI Grok.
Have a natural back-and-forth conversation. Explore the idea, discuss risks, sketch a plan.
Do NOT generate code yet. Keep responses conversational and speakable.
When voiceMode is true, keep replies to 1-4 short sentences and end with a question.`

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

  const apiKey =
    req.headers.get('x-ai-key') ||
    req.headers.get('X-AI-Key') ||
    process.env.XAI_API_KEY

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Missing X-AI-Key' }), { status: 401 })
  }

  const { messages, image, personality = 'grok', voiceMode } = await req.json()
  const personalityNote =
    personality === 'witty' ? ' Be witty and sarcastic.' :
    personality === 'mentor' ? ' Be a wise mentor.' :
    personality === 'coach' ? ' Be an energetic coach.' :
    personality === 'rebel' ? ' Be an edgy rebel hacker.' : ''

  const fullMessages = [
    { role: 'system', content: DISCUSS_SYSTEM + personalityNote + (voiceMode ? ' VOICE MODE: 1-4 sentences max.' : '') },
    ...messages,
  ]

  if (image && messages.length > 0) {
    const last = fullMessages[fullMessages.length - 1]
    if (last.role === 'user') {
      last.content = [
        { type: 'text', text: typeof last.content === 'string' ? last.content : '' },
        { type: 'image_url', image_url: { url: image } },
      ]
    }
  }

  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'grok-3',
      messages: fullMessages,
      temperature: 0.6,
      max_tokens: 4000,
    }),
  })

  const data = await res.json()
  if (!res.ok) {
    return new Response(JSON.stringify({ error: data.error?.message || 'xAI error' }), { status: 500 })
  }

  const content = data.choices?.[0]?.message?.content || ''
  return new Response(JSON.stringify({ content }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}