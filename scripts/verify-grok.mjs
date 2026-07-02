#!/usr/bin/env bun
/** Quick Grok security + connectivity check */
const PROD = process.env.BASE_URL || 'https://ideaspeak-app.vercel.app'
const LOCAL = 'http://localhost:5173'

async function check(label, url) {
  try {
    const res = await fetch(`${url}/api/status`)
    const data = await res.json()
    const ok = data.live === true && data.source === 'server'
    console.log(`${ok ? '✓' : '✗'} ${label}:`, JSON.stringify(data))
    return ok
  } catch (e) {
    console.log(`✗ ${label}:`, e.message)
    return false
  }
}

async function checkOriginBlock() {
  const res = await fetch(`${PROD}/api/status`, {
    headers: { Origin: 'https://evil-example.com' },
  })
  const blocked = res.status === 403
  console.log(`${blocked ? '✓' : '✗'} Origin block (evil site): status ${res.status}`)
  return blocked
}

console.log('IdeaSpeak Grok security check\n')
const prodOk = await check('Production', PROD)
const localOk = await check('Local (optional)', LOCAL)
const corsOk = await checkOriginBlock()

console.log('')
if (prodOk) {
  console.log('Production Grok is live and secure (server-hosted key).')
} else {
  console.log('Production needs XAI_API_KEY on Vercel project ideaspeak-app (Production env).')
}
if (!localOk) {
  console.log('Local: run `bun run setup:grok` then `bun run dev:full`')
}
process.exit(prodOk && corsOk ? 0 : 1)