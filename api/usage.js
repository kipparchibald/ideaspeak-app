/**
 * Server-side usage gate — authoritative when Supabase service key is set.
 * Anonymous / unsigned: returns honest defaults (client metering still applies).
 */

import { corsHeaders, rejectBlockedOrigin } from './security.js'

export const config = { runtime: 'edge' }

const LIMITS = {
  free: { builds: 25, ships: 5, polish: 0 },
  pro: { builds: 999, ships: 999, polish: 999 },
  team: { builds: 999, ships: 999, polish: 999 },
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10)
}

async function supabaseUsage(userId) {
  const url = process.env.SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_KEY?.trim()
  if (!url || !key || !userId) return null

  const date = todayUtc()
  const profileRes = await fetch(
    `${url}/rest/v1/profiles?id=eq.${userId}&select=plan`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      signal: AbortSignal.timeout(8000),
    },
  )
  const profiles = await profileRes.json().catch(() => [])
  const plan = profiles?.[0]?.plan || 'free'

  const usageRes = await fetch(
    `${url}/rest/v1/usage_daily?user_id=eq.${userId}&date=eq.${date}&select=builds,ships,polish`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      signal: AbortSignal.timeout(8000),
    },
  )
  const rows = await usageRes.json().catch(() => [])
  const usage = rows?.[0] || { builds: 0, ships: 0, polish: 0 }
  const limits = LIMITS[plan] || LIMITS.free

  return { plan, usage, limits, authoritative: true }
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) })
  }

  const blocked = rejectBlockedOrigin(req)
  if (blocked) return blocked

  if (req.method === 'GET') {
    const userId = req.headers.get('x-user-id')?.trim() || ''
    const remote = await supabaseUsage(userId)
    const body = remote || {
      plan: 'free',
      usage: { builds: 0, ships: 0, polish: 0 },
      limits: LIMITS.free,
      authoritative: false,
      message: 'Sign in + Supabase service key for server-enforced limits',
    }
    return new Response(JSON.stringify(body), {
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })
  }

  if (req.method === 'POST') {
    const { kind, userId } = await req.json().catch(() => ({}))
    if (!kind || !['build', 'ship', 'polish'].includes(kind)) {
      return new Response(JSON.stringify({ error: 'kind must be build|ship|polish' }), {
        status: 400,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      })
    }

    const remote = await supabaseUsage(userId)
    if (!remote?.authoritative) {
      return new Response(
        JSON.stringify({ ok: true, recorded: false, reason: 'client_metering_only' }),
        { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
      )
    }

    const col = kind === 'build' ? 'builds' : kind === 'ship' ? 'ships' : 'polish'
    const limit = remote.limits[col === 'polish' ? 'polish' : col]
    const current = remote.usage[col]
    if (limit < 999 && current >= limit) {
      return new Response(
        JSON.stringify({
          ok: false,
          reason: `${kind} limit reached for ${remote.plan} plan`,
          usage: remote.usage,
          limits: remote.limits,
        }),
        { status: 429, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
      )
    }

    const url = process.env.SUPABASE_URL?.trim()
    const key = process.env.SUPABASE_SERVICE_KEY?.trim()
    const date = todayUtc()
    await fetch(`${url}/rest/v1/rpc/increment_usage`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ p_user_id: userId, p_kind: kind, p_date: date }),
      signal: AbortSignal.timeout(8000),
    }).catch(() => null)

    return new Response(
      JSON.stringify({ ok: true, recorded: true, kind }),
      { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
    )
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}