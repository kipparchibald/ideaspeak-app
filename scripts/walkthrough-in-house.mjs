#!/usr/bin/env bun
/**
 * Step-by-step in-house platform walkthrough — validates config, prints exact next actions.
 *
 * Usage:
 *   bun run walkthrough:in-house           # full guided checklist
 *   bun run walkthrough:in-house --check   # validate config/in-house-setup.local only
 *   bun run walkthrough:in-house --step 4  # show one step in detail
 *   bun run walkthrough:in-house --init    # copy template + generate SHIP_WORKER_SECRET
 */

import { readFileSync, existsSync, copyFileSync, writeFileSync } from 'fs'
import { spawnSync } from 'child_process'
import { randomBytes } from 'crypto'

const ROOT = new URL('..', import.meta.url).pathname
const CONFIG_LOCAL = `${ROOT}/config/in-house-setup.local`
const CONFIG_TEMPLATE = `${ROOT}/config/in-house-setup.template`
const SCHEMA = `${ROOT}/supabase/schema.sql`
const PROD = process.env.BASE_URL || 'https://ideaspeak-app.vercel.app'

const args = new Set(process.argv.slice(2))
const checkOnly = args.has('--check')
const init = args.has('--init')
const stepArg = process.argv.find((a) => a.startsWith('--step='))
const singleStep = stepArg ? Number(stepArg.split('=')[1]) : null

const STEPS = [
  {
    id: 1,
    title: 'Local config file',
    detail: `Copy template → config/in-house-setup.local (gitignored). Never commit secrets.`,
    validate(cfg) {
      if (!existsSync(CONFIG_LOCAL)) return { ok: false, hint: 'Run: bun run walkthrough:in-house --init' }
      return Object.keys(cfg).length ? { ok: true } : { ok: false, hint: 'File exists but empty — fill values from dashboard links below' }
    },
  },
  {
    id: 2,
    title: 'Supabase project + schema',
    detail: 'Create project, run supabase/schema.sql in SQL Editor, copy URL + keys.',
    links: ['https://supabase.com/dashboard/new/project'],
    validate(cfg) {
      const url = cfg.SUPABASE_URL || ''
      const svc = cfg.SUPABASE_SERVICE_KEY || ''
      const anon = cfg.VITE_SUPABASE_ANON_KEY || ''
      if (!url.includes('.supabase.co')) return { ok: false, hint: 'Set SUPABASE_URL + VITE_SUPABASE_URL in config' }
      if (!svc.startsWith('eyJ')) return { ok: false, hint: 'Set SUPABASE_SERVICE_KEY (service_role from Settings → API)' }
      if (!anon.startsWith('eyJ')) return { ok: false, hint: 'Set VITE_SUPABASE_ANON_KEY (anon public key)' }
      if (!existsSync(SCHEMA)) return { ok: false, hint: 'Missing supabase/schema.sql in repo' }
      return { ok: true, hint: `Schema file ready (${readFileSync(SCHEMA, 'utf8').split('\n').length} lines) — paste in SQL Editor` }
    },
  },
  {
    id: 3,
    title: 'GitHub deploy token',
    detail: 'Classic PAT with repo scope, or fine-grained token with Contents R/W on your apps org.',
    links: ['https://github.com/settings/tokens'],
    validate(cfg) {
      const t = cfg.GITHUB_TOKEN || ''
      if (!t.startsWith('ghp_') && !t.startsWith('github_pat_')) {
        return { ok: false, hint: 'Set GITHUB_TOKEN in config' }
      }
      return { ok: true }
    },
  },
  {
    id: 4,
    title: 'Vercel deploy API token',
    detail: 'Used by Railway worker to create/link Vercel projects. Optional VERCEL_TEAM_ID for team deploys.',
    links: ['https://vercel.com/account/tokens'],
    validate(cfg) {
      if (!cfg.VERCEL_TOKEN?.length) return { ok: false, hint: 'Set VERCEL_TOKEN in config' }
      return { ok: true, hint: cfg.VERCEL_TEAM_ID ? `Team: ${cfg.VERCEL_TEAM_ID}` : 'Personal account token' }
    },
  },
  {
    id: 5,
    title: 'Ship worker secret',
    detail: 'Same random secret on Vercel (SHIP_WORKER_SECRET) and Railway. Generate once, reuse both places.',
    validate(cfg) {
      const s = cfg.SHIP_WORKER_SECRET || ''
      if (s.length < 32) {
        return { ok: false, hint: 'Run: bun run setup:in-house --generate-secret' }
      }
      return { ok: true }
    },
  },
  {
    id: 6,
    title: 'Railway worker deploy',
    detail: 'Bun server runs ship orchestrator. Copy public URL → RAILWAY_PUBLIC_URL in config.',
    commands: [
      'bun x @railway/cli login',
      'bun x @railway/cli init',
      'bun x @railway/cli up',
    ],
    validate(cfg) {
      const url = cfg.RAILWAY_PUBLIC_URL || ''
      if (!url.startsWith('https://')) return { ok: false, hint: 'Set RAILWAY_PUBLIC_URL after Railway deploy' }
      return { ok: true, hint: url }
    },
  },
  {
    id: 7,
    title: 'Apply Vercel production env',
    detail: 'Pushes Supabase + worker URL/secret from config to Vercel, then redeploy frontend.',
    commands: ['bun run setup:in-house --apply', 'bun x vercel env add VITE_SUPABASE_URL production', 'bun x vercel env add VITE_SUPABASE_ANON_KEY production', 'bun run deploy'],
    validate(cfg) {
      if (!cfg.SUPABASE_URL || !cfg.RAILWAY_PUBLIC_URL || !cfg.SHIP_WORKER_SECRET) {
        return { ok: false, hint: 'Complete steps 2, 5, 6 before --apply' }
      }
      const ls = spawnSync('bun', ['x', 'vercel', 'env', 'ls', 'production'], { encoding: 'utf8', cwd: ROOT })
      const vars = (ls.stdout || '').match(/^\s+(\S+)/gm)?.map((l) => l.trim()) || []
      const need = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'SHIP_WORKER_URL', 'SHIP_WORKER_SECRET']
      const missing = need.filter((v) => !vars.includes(v))
      if (missing.length) return { ok: false, hint: `Missing on Vercel: ${missing.join(', ')} — run setup:in-house --apply` }
      return { ok: true, hint: 'Vercel production env looks wired' }
    },
  },
  {
    id: 8,
    title: 'Wildcard DNS (*.ideaspeak.app)',
    detail: 'Point *.ideaspeak.app to Vercel (same team as ideaspeak.dev) so slug.ideaspeak.app resolves.',
    links: ['https://vercel.com/docs/projects/domains'],
    validate() {
      return { ok: true, hint: 'Manual DNS — verify after first real deploy' }
    },
  },
  {
    id: 9,
    title: 'Verify end-to-end',
    detail: 'Production probes: Grok live, Supabase authoritative, ship not stub, Railway /health.',
    commands: ['RAILWAY_PUBLIC_URL=<your-url> bun run verify:in-house', 'bun run smoke:ship'],
    validate() {
      return { ok: true, hint: 'Run verify:in-house after apply + deploy' }
    },
  },
]

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

function mask(value) {
  if (!value || value.length < 8) return value ? '***' : '(empty)'
  return `${value.slice(0, 4)}…${value.slice(-4)}`
}

function printStep(step, cfg, { verbose = false } = {}) {
  const result = step.validate(cfg)
  const icon = result.ok ? '✓' : '○'
  console.log(`\n${icon} Step ${step.id}: ${step.title}`)
  console.log(`   ${step.detail}`)
  if (step.links?.length) {
    for (const link of step.links) console.log(`   → ${link}`)
  }
  if (step.commands?.length && (verbose || !result.ok)) {
    console.log('   Commands:')
    for (const cmd of step.commands) console.log(`     ${cmd}`)
  }
  if (result.hint) console.log(`   ${result.ok ? 'Note' : 'Next'}: ${result.hint}`)
  return result.ok
}

function initConfig() {
  if (!existsSync(CONFIG_TEMPLATE)) {
    console.error('Missing config/in-house-setup.template')
    process.exit(1)
  }
  if (existsSync(CONFIG_LOCAL)) {
    console.log(`Already exists: ${CONFIG_LOCAL}`)
    return
  }
  copyFileSync(CONFIG_TEMPLATE, CONFIG_LOCAL)
  const secret = randomBytes(32).toString('hex')
  let content = readFileSync(CONFIG_LOCAL, 'utf8')
  content = content.replace(/^SHIP_WORKER_SECRET=$/m, `SHIP_WORKER_SECRET=${secret}`)
  writeFileSync(CONFIG_LOCAL, content)
  console.log(`Created ${CONFIG_LOCAL}`)
  console.log(`Generated SHIP_WORKER_SECRET=${secret}`)
  console.log('Fill remaining values, then: bun run walkthrough:in-house --check')
}

async function probeProduction() {
  console.log(`\n## Production snapshot (${PROD})\n`)
  try {
    const status = await fetch(`${PROD}/api/status`, { signal: AbortSignal.timeout(12_000) })
    const s = await status.json()
    console.log(`Grok: live=${s.live} source=${s.source || '?'}`)
  } catch (e) {
    console.log(`Grok: unreachable (${e.message})`)
  }
  try {
    const usage = await fetch(`${PROD}/api/usage`, { signal: AbortSignal.timeout(12_000) })
    const u = await usage.json()
    console.log(`Usage: authoritative=${u.authoritative} plan=${u.plan}`)
  } catch {
    console.log('Usage: unreachable')
  }
}

if (init) {
  initConfig()
  process.exit(0)
}

const cfg = parseEnvFile(CONFIG_LOCAL)

if (checkOnly) {
  console.log(`Checking ${CONFIG_LOCAL}\n`)
  for (const key of [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_KEY',
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
    'GITHUB_TOKEN',
    'VERCEL_TOKEN',
    'SHIP_WORKER_SECRET',
    'RAILWAY_PUBLIC_URL',
  ]) {
    console.log(`  ${cfg[key] ? '✓' : '○'} ${key}${cfg[key] ? ` = ${mask(cfg[key])}` : ''}`)
  }
  process.exit(0)
}

console.log('IdeaSpeak in-house platform walkthrough')
console.log('=====================================')
console.log(`Config: ${existsSync(CONFIG_LOCAL) ? CONFIG_LOCAL : '(missing — run --init)'}`)
console.log(`Production: ${PROD}`)

if (singleStep) {
  const step = STEPS.find((s) => s.id === singleStep)
  if (!step) {
    console.error(`Unknown step ${singleStep}`)
    process.exit(1)
  }
  printStep(step, cfg, { verbose: true })
  process.exit(0)
}

let done = 0
let nextStep = null
for (const step of STEPS) {
  const ok = printStep(step, cfg)
  if (ok) done++
  else if (!nextStep) nextStep = step
}

await probeProduction()

console.log('\n=====================================')
console.log(`${done}/${STEPS.length} steps complete`)
if (nextStep) {
  console.log(`\n→ Do next: Step ${nextStep.id} — ${nextStep.title}`)
  console.log(`  bun run walkthrough:in-house --step=${nextStep.id}`)
} else {
  console.log('\n→ All config steps look good. Run:')
  console.log('  bun run setup:in-house --apply')
  console.log('  bun run deploy')
  console.log('  RAILWAY_PUBLIC_URL=<url> bun run verify:in-house')
}