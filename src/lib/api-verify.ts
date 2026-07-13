/**
 * IdeaSpeak — API verification helpers
 * Secure, one-site verification of required keys.
 */

export type ApiStatus = 'unknown' | 'checking' | 'live' | 'invalid' | 'missing'

export interface VerifyResult {
  status: ApiStatus
  message: string
  source?: 'server' | 'client' | 'none'
  model?: string
}

/**
 * Call the existing secure /api/status endpoint.
 * - Prefers server-hosted XAI_API_KEY (production)
 * - Falls back to client-provided key only in local/dev
 */
export async function verifyXaiKey(clientKey?: string): Promise<VerifyResult> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (clientKey?.trim()) {
      headers['x-ai-key'] = clientKey.trim()
    }

    const res = await fetch('/api/status', {
      method: 'GET',
      headers,
    })

    const data = await res.json()

    if (data.live === true) {
      return {
        status: 'live',
        message: data.message || 'Grok API is working',
        source: data.source,
        model: data.model,
      }
    }

    if (!clientKey && data.source === 'none') {
      return {
        status: 'missing',
        message: data.message || 'No API key configured',
        source: 'none',
      }
    }

    return {
      status: 'invalid',
      message: data.message || 'API key invalid or unreachable',
      source: data.source,
    }
  } catch (err: any) {
    return {
      status: 'invalid',
      message: err?.message || 'Could not reach verification endpoint',
    }
  }
}

export function saveLocalXaiKey(key: string) {
  if (typeof window === 'undefined') return
  if (key.trim()) {
    localStorage.setItem('ideaspeak_xai_key', key.trim())
  } else {
    localStorage.removeItem('ideaspeak_xai_key')
  }
}

export function loadLocalXaiKey(): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem('ideaspeak_xai_key') || ''
}

export function saveLocalE2bKey(key: string) {
  if (typeof window === 'undefined') return
  if (key.trim()) {
    localStorage.setItem('ideaspeak_e2b_key', key.trim())
  } else {
    localStorage.removeItem('ideaspeak_e2b_key')
  }
}

export function loadLocalE2bKey(): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem('ideaspeak_e2b_key') || ''
}
