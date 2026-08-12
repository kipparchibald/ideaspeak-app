/** Parse API error messages and request IDs for user-facing toasts */

const REF_RE = /\(ref:\s*([a-f0-9-]{8,})\)/i

export function extractRequestRef(message: string): string | null {
  const m = message.match(REF_RE)
  return m?.[1]?.slice(0, 8) ?? null
}

export function stripRequestRef(message: string): string {
  return message.replace(/\s*\(ref:\s*[a-f0-9-]+\)/i, '').trim()
}

export function formatUserFacingApiError(err: unknown, fallback = 'Request failed'): string {
  const raw = err instanceof Error ? err.message : String(err || fallback)
  const clean = stripRequestRef(raw)
  const ref = extractRequestRef(raw)
  if (ref) return `${clean} · ref ${ref}`
  return clean || fallback
}
