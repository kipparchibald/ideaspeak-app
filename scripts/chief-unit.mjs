#!/usr/bin/env bun
/**
 * Chief of Staff desk unit tests (no browser required)
 * Run: bun run test:chief
 */

import {
  createChiefSession,
  verifyChiefSession,
  chiefIntegrationStatus,
} from '../api/chief-auth.js'
import {
  buildChiefSystem,
  chiefPromptForbidsInventedLots,
  CHIEF_HARD_RULES,
} from '../api/chief-prompts.js'

const TEST_SECRET = 'test-chief-gate-secret-unit'

let passed = 0
let failed = 0

function assert(name, condition, detail = '') {
  if (condition) {
    passed++
    console.log(`✓ ${name}`)
  } else {
    failed++
    console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

// ── Auth tokens ─────────────────────────────────────────────────────────────

const session = await createChiefSession(TEST_SECRET)
assert('createChiefSession returns token', typeof session.token === 'string' && session.token.includes('.'))
assert('verifyChiefSession accepts valid token', await verifyChiefSession(session.token, TEST_SECRET))
assert('verifyChiefSession rejects wrong secret', !(await verifyChiefSession(session.token, 'wrong')))
assert('verifyChiefSession rejects garbage', !(await verifyChiefSession('bad.token', TEST_SECRET)))

// ── Prompt hard rules ───────────────────────────────────────────────────────

const prompt = buildChiefSystem(chiefIntegrationStatus(), true)
assert('prompt says Chief of Staff', prompt.includes('Chief of Staff'))
assert('prompt forbids sending mail without explicit send', /never send email/i.test(prompt))
assert('prompt forbids inventing lots', /never invent lot/i.test(prompt))
assert('CHIEF_HARD_RULES mentions drafts only', /drafts only/i.test(CHIEF_HARD_RULES))
assert('chiefPromptForbidsInventedLots guard', chiefPromptForbidsInventedLots(prompt))

// ── Integration status truth ──────────────────────────────────────────────────

const status = chiefIntegrationStatus()
assert('default calendar not connected', status.calendarConnected === false)
assert('default gmail not connected', status.gmailConnected === false)
assert('mail send disabled by default', status.mailSendEnabled === false)
assert('timezone is America/Boise', status.timezone === 'America/Boise')

// ── API unlock gate (optional — when server running) ─────────────────────────

const API = process.env.API_URL || 'http://localhost:3001'
const runApi = process.argv.includes('--api') || process.env.CHIEF_TEST_API === '1'

if (runApi) {
  process.env.CHIEF_GATE_SECRET = process.env.CHIEF_GATE_SECRET || TEST_SECRET

  const badUnlock = await fetch(`${API}/api/chief/unlock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: 'wrong-secret' }),
  })
  assert('unlock rejects wrong secret', badUnlock.status === 403)

  const goodUnlock = await fetch(`${API}/api/chief/unlock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: TEST_SECRET }),
  })
  const unlockData = await goodUnlock.json()
  assert('unlock accepts correct secret', goodUnlock.ok && unlockData.token)

  const noSession = await fetch(`${API}/api/chief/status`)
  assert('status requires session', noSession.status === 401)

  const withSession = await fetch(`${API}/api/chief/status`, {
    headers: { 'X-Chief-Session': unlockData.token },
  })
  assert('status ok with session', withSession.ok)

  const noVoice = await fetch(`${API}/api/chief/voice-token`, { method: 'POST' })
  assert('voice-token requires session', noVoice.status === 401)
} else {
  console.log('⊘ API gate tests skipped (pass --api with server + CHIEF_GATE_SECRET)')
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
