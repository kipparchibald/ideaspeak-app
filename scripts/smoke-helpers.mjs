/**
 * Shared helpers for IdeaSpeak smoke / e2e tests.
 * Goals: resilient selectors, explicit waits, failure diagnostics, security probes.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const DEFAULT_PLAN_PROMPT =
  'A habit tracker that feels like texting a coach'

/** Chip labels rotate — match any discuss starter */
export const PLAN_CHIP_PATTERNS = [
  /habit tracker/i,
  /freelancers? who hate CRM/i,
  /voice notes.*roadmap/i,
  /texting a coach/i,
]

export const BUILD_TRIGGER_PATTERNS = [
  /Build live preview/i,
  /build live preview from this plan/i,
]

export async function retry(name, fn, { attempts = 2, delayMs = 1500 } = {}) {
  let lastErr
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn(i)
    } catch (e) {
      lastErr = e
      if (i < attempts - 1) {
        console.warn(`  ↻ retry ${i + 1}/${attempts - 1} for ${name}: ${e.message || e}`)
        await sleep(delayMs)
      }
    }
  }
  throw lastErr
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

export async function saveFailureArtifacts(page, label) {
  try {
    const dir = join(process.cwd(), '.smoke-artifacts')
    await mkdir(dir, { recursive: true })
    const safe = label.replace(/[^a-z0-9]+/gi, '-').slice(0, 48)
    const ts = Date.now()
    const png = join(dir, `${safe}-${ts}.png`)
    const txt = join(dir, `${safe}-${ts}.txt`)
    await page.screenshot({ path: png, fullPage: true })
    const buttons = []
    for (const b of await page.getByRole('button').all()) {
      try {
        const t = (await b.innerText()).trim()
        if (t) buttons.push(t.slice(0, 120))
      } catch {
        /* detached */
      }
    }
    const body = await page.locator('#root').innerText().catch(() => '(no #root)')
    await writeFile(
      txt,
      `URL: ${page.url()}\n\nButtons:\n${buttons.map((b) => `- ${b}`).join('\n')}\n\n#root:\n${body.slice(0, 4000)}`,
      'utf8',
    )
    console.error(`  📸 artifacts: ${png}`)
    return { png, txt }
  } catch (e) {
    console.warn('  (could not save failure artifacts)', e.message)
    return null
  }
}

/**
 * App is ready when shell is mounted and either plan chips or textarea is usable.
 */
export async function waitForAppReady(page, { timeout = 45_000 } = {}) {
  await page.waitForSelector('#root', { timeout })
  const deadline = Date.now() + timeout

  while (Date.now() < deadline) {
    const hasTextarea = (await page.locator('textarea').count()) > 0
    const hasPlanMode = (await page.getByRole('button', { name: /^Plan$/i }).count()) > 0
    const hasChip = await findPlanChip(page, { timeout: 800 })
    const rootLen = (await page.locator('#root').innerText().catch(() => '')).length

    if (hasPlanMode && rootLen > 80 && (hasTextarea || hasChip)) {
      return { hasTextarea, hasChip: !!hasChip }
    }
    await sleep(400)
  }

  throw new Error('app ready timeout — #root mounted but Plan UI / chips / textarea not available')
}

export async function findPlanChip(page, { timeout = 12_000 } = {}) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    for (const pattern of PLAN_CHIP_PATTERNS) {
      const loc = page.getByRole('button', { name: pattern }).first()
      if (await loc.count()) {
        try {
          if (await loc.isVisible()) return loc
        } catch {
          /* stale */
        }
      }
    }
    await sleep(300)
  }
  return null
}

/**
 * Send a plan message — chip if visible, else textarea (never hangs on missing chip).
 */
export async function sendPlanMessage(page, text = DEFAULT_PLAN_PROMPT) {
  await waitForAppReady(page)

  // Ensure Plan mode (chips only show in discuss / plan flow)
  const planBtn = page.getByRole('button', { name: /^Plan$/i }).first()
  if (await planBtn.count()) {
    await planBtn.click().catch(() => {})
    await sleep(300)
  }

  const chip = await findPlanChip(page, { timeout: 8_000 })
  if (chip) {
    await chip.click()
    return 'chip'
  }

  const ta = page.locator('textarea').first()
  await ta.waitFor({ state: 'visible', timeout: 10_000 })
  await ta.fill(text)
  await ta.press('Enter')
  return 'textarea'
}

export async function waitForAssistantSignal(page, { timeout = 45_000 } = {}) {
  const deadline = Date.now() + timeout
  let lastLen = 0

  while (Date.now() < deadline) {
    const text = await page.locator('#root').innerText().catch(() => '')
    const grew = text.length > lastLen + 40
    lastLen = text.length

    const hasReply =
      text.length > 200 &&
      (/Grok|assistant|founder|v1|loop|ship|daily|streak|coach|user|plan|Who|What/i.test(text) ||
        /simulator/i.test(text))

    if (grew && hasReply) return text
    await sleep(500)
  }

  throw new Error('assistant reply not detected within timeout')
}

export async function triggerBuildPreview(page) {
  for (const pattern of BUILD_TRIGGER_PATTERNS) {
    const btn = page.getByRole('button', { name: pattern }).first()
    if (await btn.count()) {
      try {
        if (await btn.isEnabled()) {
          await btn.click()
          return 'button'
        }
      } catch {
        /* retry below */
      }
    }
  }

  const ta = page.locator('textarea').first()
  if (await ta.count()) {
    await ta.fill('build it now')
    await ta.press('Enter')
    return 'textarea-build'
  }

  throw new Error('no build trigger — missing Build live preview button and textarea')
}

export async function waitForSandpackOrBuildUI(page, { timeout = 60_000 } = {}) {
  const deadline = Date.now() + timeout

  while (Date.now() < deadline) {
    const rootText = await page.locator('#root').innerText().catch(() => '')

    if (/Compiling live preview|Booting real sandbox|Building/i.test(rootText)) {
      await sleep(800)
      continue
    }

    for (const frame of page.frames()) {
      try {
        const t = await frame.locator('body').innerText({ timeout: 1200 })
        if (
          t &&
          t.length > 30 &&
          (/Live preview|habit|streak|ship|focus|Add task|coach/i.test(t) ||
            (/\bAdd\b/i.test(t) && t.length > 50))
        ) {
          return { kind: 'iframe', sample: t.slice(0, 80) }
        }
      } catch {
        /* frame loading */
      }
    }

    if (
      /Live preview|preview ready|files · in-browser|Next · make it real|Sandpack|Test\b/i.test(
        rootText,
      )
    ) {
      return { kind: 'chrome', sample: rootText.slice(0, 80) }
    }

    await sleep(600)
  }

  throw new Error('no live preview signals after build (iframe + chrome)')
}

export function attachPageDiagnostics(page, errors = []) {
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`)
  })
  return errors
}

export async function withBrowser(fn) {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: true })
  try {
    return await fn(browser)
  } finally {
    await browser.close()
  }
}

/** Security: evil origin must not get a successful discuss response */
export async function probeBlockedOrigin(apiUrl) {
  const res = await fetch(`${apiUrl}/api/discuss`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://evil-attacker.example',
    },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'test' }] }),
    signal: AbortSignal.timeout(15_000),
  })
  if (res.status !== 403) {
    const body = await res.text().catch(() => '')
    throw new Error(`expected 403 for evil origin, got ${res.status}: ${body.slice(0, 80)}`)
  }
  return '403 Forbidden'
}

/** Security: status must never echo raw API key material */
export async function probeStatusNoSecretLeak(apiUrl) {
  const res = await fetch(`${apiUrl}/api/status`, { signal: AbortSignal.timeout(15_000) })
  const text = await res.text()
  if (/xai-[a-zA-Z0-9]{20,}/i.test(text)) {
    throw new Error('status response appears to leak xAI key prefix')
  }
  if (/sk_(live|test)_[a-zA-Z0-9]+/.test(text)) {
    throw new Error('status response appears to leak Stripe secret')
  }
  const data = JSON.parse(text)
  if (!('live' in data) || !('model' in data)) {
    throw new Error('status missing expected fields')
  }
  return `live=${data.live}`
}

/** Security: rate-limit headers should appear on expensive routes (when not blocked) */
export async function probeRateLimitHeaders(apiUrl) {
  const res = await fetch(`${apiUrl}/api/status`, { signal: AbortSignal.timeout(15_000) })
  // status is GET — not rate limited; probe discuss OPTIONS/POST for headers
  const discuss = await fetch(`${apiUrl}/api/discuss`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: apiUrl.includes('localhost') ? 'http://localhost:5173' : 'https://ideaspeak-app.vercel.app',
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: 'ping' }],
      voiceMode: false,
    }),
    signal: AbortSignal.timeout(45_000),
  })
  const limit = discuss.headers.get('x-ratelimit-limit')
  const remaining = discuss.headers.get('x-ratelimit-remaining')
  if (!limit && discuss.status !== 401) {
    // 401 when no key — still acceptable in CI without secrets
    if (discuss.status === 401) return '401 (no key) — rate headers N/A'
    throw new Error(`missing X-RateLimit-Limit on discuss (status ${discuss.status})`)
  }
  return `limit=${limit} remaining=${remaining ?? '?'}`
}