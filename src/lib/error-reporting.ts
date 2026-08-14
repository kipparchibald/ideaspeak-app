/**
 * Client error reporting — ring buffer + optional POST to /api/report-error.
 * Wire Sentry later via VITE_SENTRY_DSN (no SDK required for basic ops).
 */

const RING_KEY = 'ideaspeak_error_ring'
const MAX_ERRORS = 40

export interface ClientErrorRecord {
  t: number
  message: string
  stack?: string
  source?: string
  url?: string
}

function readRing(): ClientErrorRecord[] {
  try {
    const raw = localStorage.getItem(RING_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeRing(events: ClientErrorRecord[]) {
  try {
    localStorage.setItem(RING_KEY, JSON.stringify(events.slice(-MAX_ERRORS)))
  } catch {
    /* ignore quota */
  }
}

function pushError(record: ClientErrorRecord) {
  writeRing([...readRing(), record])
}

async function postError(record: ClientErrorRecord) {
  try {
    await fetch('/api/report-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: record.message.slice(0, 500),
        source: record.source,
        url: record.url,
        stackPrefix: record.stack?.slice(0, 800),
      }),
      keepalive: true,
    })
  } catch {
    /* offline / blocked — ring buffer still has it */
  }
}

/** Install global handlers once — safe to call multiple times. */
let installed = false

export function initErrorReporting() {
  if (installed || typeof window === 'undefined') return
  installed = true

  window.addEventListener('error', (event) => {
    const record: ClientErrorRecord = {
      t: Date.now(),
      message: event.message || 'window.error',
      stack: event.error instanceof Error ? event.error.stack : undefined,
      source: event.filename,
      url: window.location.href,
    }
    pushError(record)
    void postError(record)
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
          ? reason
          : 'unhandledrejection'
    const record: ClientErrorRecord = {
      t: Date.now(),
      message,
      stack: reason instanceof Error ? reason.stack : undefined,
      url: window.location.href,
    }
    pushError(record)
    void postError(record)
  })
}

export function reportClientError(message: string, extra?: Partial<ClientErrorRecord>) {
  const record: ClientErrorRecord = {
    t: Date.now(),
    message,
    url: typeof window !== 'undefined' ? window.location.href : undefined,
    ...extra,
  }
  pushError(record)
  void postError(record)
}

export function getClientErrorRing(): ClientErrorRecord[] {
  return readRing()
}
