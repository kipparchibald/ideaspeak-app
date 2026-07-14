#!/usr/bin/env bun
/**
 * IdeaSpeak in-house platform setup — audit + apply env vars to Vercel/Railway.
 *
 * Usage:
 *   bun run setup:in-house              # audit production + print checklist
 *   bun run setup:in-house --apply      # push vars from config/in-house-setup.local → Vercel
 *   bun run setup:in-house --generate-secret
 */

import { readFileSync, existsSync, writeFileSync } from 'fs'
import { spawnSync } from 'child_process'
import { randomBytes } from 'crypto'

const ROOT = new URL('..', import.meta.url).pathname
const CONFIG_LOCAL = `${ROOT}/config/in-house-setup.local`
const CONFIG_TEMPLATE = `${ROOT}/config/in-house-setup.template`
const PROD_URL = process.env.BASE_URL || 'https://ideaspeak-app.vercel.app'

const args = new Set(process.argv.slice(2))
const apply = args.has('--apply')
const genSecret = args.has('--generate-secret')

function parseEnvFile(path) {
  if (!existsSync(path)) return {}
  const out = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (v && !v.includes('YOUR_') && !v.includes('...') && !v.endsWith('...')) {
      out[m[1]] = v
    }
  }
  return out
}

async function fetchJson(url, init) {
  const res = await fetch(url, init)
  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = { raw: text.slice(0, 200) }
  }
  return { ok: res.ok, status: res.status, data }
}

function vercelEnvAdd(name, value, env = 'production') {
  const r = spawnSync('bun', ['x', 'vercel', 'env', 'add', name, env, '--yes'], {
    input: value,
    encoding: 'utf8',
    cwd: ROOT,
  })
  return { ok: r.status === 0, stderr: r.stderr, stdout: r.stdout }
}

function section(title) {
  console.log(`\n## ${title}\n`)
}

async function audit() {
  section('Production audit')
  console.log(`Target: ${PROD_URL}`)

  const status = await fetchJson(`${PROD_URL}/api/status`)
  console.log(
    status.ok
      ? `✓ Grok: live=${status.data.live} source=${status.data.source}`
      : `✗ /api/status → ${status.status}`,
  )

  const ship = await fetchJson(`${PROD_URL}/api/ship`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appName: 'Setup Audit', appSlug: 'setup-audit' }),
  })
  const job = ship.data?.job
  console.log(
    ship.ok
      ? `✓ /api/ship → job ${job?.id} status=${job?.status}${ship.data.stub ? ' (stub)' : ''}`
      : `✗ /api/ship → ${ship.status}`,
  )

  const usage = await fetchJson(`${PROD_URL}/api/usage`)
  console.log(
    usage.ok
      ? `✓ /api/usage authoritative=${usage.data.authoritative} plan=${usage.data.plan}`
      : `✗ /api/usage`,
  )

  const vercelLs = spawnSync('bun', ['x', 'vercel', 'env', 'ls', 'production'], {
    encoding: 'utf8',
    cwd: ROOT,
  })
  const vercelVars = (vercelLs.stdout || '').match(/^\s+(\S+)/gm)?.map((l) => l.trim()) || []
  console.log(`\nVercel production env (${vercelVars.length}): ${vercelVars.join(', ') || 'none'}`)

  const needVercel = [
    'XAI_API_KEY',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_KEY',
    'SHIP_WORKER_URL',
    'SHIP_WORKER_SECRET',
  ]
  for (const v of needVercel) {
    console.log(vercelVars.includes(v) ? `  ✓ ${v}` : `  ○ ${v} — missing`)
  }
}

function printChecklist(secret) {
  section('Setup checklist (do in order)')

  console.log(`1. Supabase — create project: https://supabase.com/dashboard/new/project`)
  console.log(`   → SQL Editor → paste ALL of supabase/schema.sql → Run`)
  console.log(`   → Settings → API → copy URL, anon key, service_role key`)

  console.log(`\n2. Fill config/in-house-setup.local (copy from config/in-house-setup.template)`)
  if (secret) {
    console.log(`   SHIP_WORKER_SECRET (generated): ${secret}`)
  }

  console.log(`\n3. Railway — deploy Bun worker:`)
  console.log(`   bun x @railway/cli login`)
  console.log(`   bun x @railway/cli init   # link repo in ideaspeak-app`)
  console.log(`   bun x @railway/cli up`)
  console.log(`   → Variables: XAI_API_KEY, SUPABASE_*, SHIP_WORKER_SECRET, GITHUB_TOKEN, VERCEL_TOKEN`)
  console.log(`   → Copy public URL → RAILWAY_PUBLIC_URL in config file`)

  console.log(`\n4. GitHub token — https://github.com/settings/tokens`)
  console.log(`   Classic: repo scope. Or fine-grained on your org with Contents R/W.`)

  console.log(`\n5. Vercel token — https://vercel.com/account/tokens (for deploy API on Railway)`)

  console.log(`\n6. Apply to Vercel:`)
  console.log(`   bun run setup:in-house --apply`)
  console.log(`   bun run deploy`)

  console.log(`\n7. Verify:`)
  console.log(`   bun run verify:in-house`)

  section('Wildcard DNS (optional)')
  console.log(`Point *.ideaspeak.app → Vercel (same as ideaspeak.dev) for slug.ideaspeak.app URLs.`)
}

async function applyConfig(cfg) {
  section('Applying Vercel production env')

  const vercelMap = {
    SUPABASE_URL: cfg.SUPABASE_URL,
    SUPABASE_SERVICE_KEY: cfg.SUPABASE_SERVICE_KEY,
    SHIP_WORKER_SECRET: cfg.SHIP_WORKER_SECRET,
    SHIP_WORKER_URL: cfg.RAILWAY_PUBLIC_URL,
  }

  for (const [name, value] of Object.entries(vercelMap)) {
    if (!value) {
      console.log(`○ skip ${name} — not set in config`)
      continue
    }
    const r = vercelEnvAdd(name, value)
    console.log(r.ok ? `✓ ${name}` : `✗ ${name}: ${r.stderr || r.stdout}`)
  }

  if (cfg.VITE_SUPABASE_URL && cfg.VITE_SUPABASE_ANON_KEY) {
    console.log(
      '\nNote: VITE_SUPABASE_* require a Vercel rebuild. Add via dashboard or:',
    )
    console.log('  bun x vercel env add VITE_SUPABASE_URL production')
    console.log('  bun x vercel env add VITE_SUPABASE_ANON_KEY production')
    console.log('  bun run deploy')
  }

  section('Railway variables (manual)')
  const railwayVars = [
    'XAI_API_KEY',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_KEY',
    'SHIP_WORKER_SECRET',
    'GITHUB_TOKEN',
    'VERCEL_TOKEN',
    'VERCEL_TEAM_ID',
    'E2B_API_KEY',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
  ]
  for (const name of railwayVars) {
    const v = cfg[name] || (name === 'XAI_API_KEY' ? process.env.XAI_API_KEY : undefined)
    console.log(v ? `  set ${name}=***` : `  ○ ${name}`)
  }
  console.log('\nPaste these in Railway → Service → Variables, then redeploy.')
}

if (genSecret) {
  const secret = randomBytes(32).toString('hex')
  console.log(secret)
  process.exit(0)
}

let generatedSecret = null
if (!existsSync(CONFIG_LOCAL)) {
  generatedSecret = randomBytes(32).toString('hex')
  if (!existsSync(`${ROOT}/config`)) {
    /* ignore */
  }
  console.log(`No ${CONFIG_LOCAL} yet — generated SHIP_WORKER_SECRET for you:`)
  console.log(generatedSecret)
  console.log(`\nCopy config/in-house-setup.template → config/in-house-setup.local and fill values.`)
}

await audit()

if (apply) {
  const cfg = parseEnvFile(CONFIG_LOCAL)
  if (!Object.keys(cfg).length) {
    console.error(`\nNo values in ${CONFIG_LOCAL}. Fill the file first.`)
    process.exit(1)
  }
  await applyConfig(cfg)
} else {
  printChecklist(generatedSecret)
}