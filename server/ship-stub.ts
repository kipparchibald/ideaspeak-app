/** Stub ship timeline when worker / Supabase unavailable — mirrors api/ship.js */

export const STUB_PLATFORM_MESSAGE =
  'Your app is queued on IdeaSpeak. Full auto-deploy activates once our platform worker finishes connecting — no action needed from you.'

export function parseJobTimestamp(jobId: string): number | null {
  const m = String(jobId || '').match(/^job-(\d+)/)
  if (!m) return null
  const ts = Number(m[1])
  return Number.isFinite(ts) ? ts : null
}

export function stubJobProgress(jobId: string) {
  const ts = parseJobTimestamp(jobId)
  if (!ts) {
    return {
      job: {
        id: jobId,
        appName: '',
        appSlug: '',
        status: 'error',
        liveUrl: null,
        repoUrl: null,
        events: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        stub: true,
        platformMessage: 'Invalid job — please try launching again.',
      },
      stub: true,
      message: 'Invalid job — please try launching again.',
    }
  }

  const elapsed = Date.now() - ts
  const events: Array<Record<string, unknown>> = []

  events.push({
    id: 'stub-github',
    step: 'github',
    status: elapsed >= 3500 ? 'success' : 'running',
    title: 'GitHub',
    message:
      elapsed >= 3500
        ? 'Production scaffold queued for IdeaSpeak GitHub'
        : 'Packaging your production scaffold…',
    timestamp: ts + 500,
  })

  if (elapsed >= 3500) {
    events.push({
      id: 'stub-vercel',
      step: 'vercel',
      status: elapsed >= 8000 ? 'success' : 'running',
      title: 'Vercel',
      message:
        elapsed >= 8000
          ? 'Deploy pipeline ready on IdeaSpeak Vercel'
          : 'Preparing Vercel deploy…',
      timestamp: ts + 4000,
    })
  }

  if (elapsed >= 8000) {
    events.push({
      id: 'stub-env',
      step: 'env',
      status: elapsed >= 12000 ? 'success' : 'running',
      title: 'Environment',
      message:
        elapsed >= 12000
          ? 'Database and secrets configured for your tenant'
          : 'Configuring Supabase and environment…',
      timestamp: ts + 8500,
    })
  }

  if (elapsed >= 12000) {
    events.push({
      id: 'stub-done',
      step: 'done',
      status: 'waiting',
      title: 'Live',
      message: 'Queued on IdeaSpeak — your live URL will appear here when deploy finishes',
      timestamp: ts + 12500,
    })
  }

  let status = 'queued'
  if (elapsed >= 1500) status = 'running'

  const job = {
    id: jobId,
    appName: '',
    appSlug: '',
    status,
    liveUrl: null,
    repoUrl: null,
    events,
    createdAt: new Date(ts).toISOString(),
    updatedAt: new Date().toISOString(),
    stub: true,
    platformMessage: STUB_PLATFORM_MESSAGE,
  }

  return { job, stub: true, message: STUB_PLATFORM_MESSAGE }
}

export const MIN_PROBE_SCAFFOLD: Record<string, string> = {
  'package.json': JSON.stringify({ name: 'ideaspeak-probe', private: true }),
  'src/App.tsx': 'export default function App(){return <div>ok</div>}',
}