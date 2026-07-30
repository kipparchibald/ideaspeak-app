/**
 * Analytics funnel — privacy-friendly, optional remote + always-on local ring buffer.
 * Wire remote with VITE_PLAUSIBLE_DOMAIN and/or VITE_POSTHOG_KEY in .env.
 */

export type AnalyticsEvent =
  | 'app_open'
  | 'voice_start'
  | 'plan_message'
  | 'build_start'
  | 'build_success'
  | 'build_fail'
  | 'build_cancel'
  | 'preview_open'
  | 'test_mode'
  | 'ship_open'
  | 'ship_zip'
  | 'gallery_open'
  | 'gallery_remix'
  | 'gallery_publish'
  | 'share_copy'
  | 'autopilot_start'
  | 'autopilot_done'
  | 'pricing_open'
  | 'checkout_start'
  | 'checkout_success'
  | 'settings_open'

interface TrackProps {
  [key: string]: string | number | boolean | undefined
}

const LOCAL_KEY = 'ideaspeak_analytics_ring'
const MAX_LOCAL = 80

function readRing(): { t: number; e: string; p?: TrackProps }[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeRing(events: { t: number; e: string; p?: TrackProps }[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(events.slice(-MAX_LOCAL)))
  } catch {
    /* quota */
  }
}

function env(name: string): string {
  try {
    return (import.meta as { env?: Record<string, string> }).env?.[name] || ''
  } catch {
    return ''
  }
}

/** Optional Plausible (no cookies) */
function trackPlausible(event: string, props?: TrackProps) {
  const domain = env('VITE_PLAUSIBLE_DOMAIN')
  if (!domain || typeof window === 'undefined') return
  const w = window as unknown as { plausible?: (e: string, o?: { props?: TrackProps }) => void }
  if (typeof w.plausible === 'function') {
    w.plausible(event, props ? { props } : undefined)
    return
  }
  // Lightweight beacon without loading full script if user only set domain
  try {
    const body = JSON.stringify({
      n: event,
      u: window.location.href,
      d: domain,
      p: props ? JSON.stringify(props) : undefined,
    })
    navigator.sendBeacon?.(
      'https://plausible.io/api/event',
      new Blob([body], { type: 'application/json' }),
    )
  } catch {
    /* ignore */
  }
}

/** Optional PostHog capture if snippet loaded */
function trackPosthog(event: string, props?: TrackProps) {
  if (!env('VITE_POSTHOG_KEY') || typeof window === 'undefined') return
  const w = window as unknown as {
    posthog?: { capture?: (e: string, p?: TrackProps) => void }
  }
  w.posthog?.capture?.(event, props)
}

export function track(event: AnalyticsEvent | string, props?: TrackProps) {
  if (typeof window === 'undefined') return

  const row = { t: Date.now(), e: event, p: props }
  const ring = readRing()
  ring.push(row)
  writeRing(ring)

  if (import.meta.env?.DEV) {
    // Quiet in prod; helpful when iterating the funnel
    console.debug('[analytics]', event, props || '')
  }

  trackPlausible(event, props)
  trackPosthog(event, props)
}

export function getLocalFunnel(limit = 40) {
  return readRing().slice(-limit)
}

export function funnelSummary() {
  const events = readRing()
  const counts: Record<string, number> = {}
  for (const e of events) {
    counts[e.e] = (counts[e.e] || 0) + 1
  }
  return counts
}

/** Inject optional analytics snippets once (idempotent) */
export function initAnalytics() {
  if (typeof document === 'undefined') return
  const domain = env('VITE_PLAUSIBLE_DOMAIN')
  if (domain && !document.getElementById('plausible-script')) {
    const s = document.createElement('script')
    s.id = 'plausible-script'
    s.defer = true
    s.dataset.domain = domain
    s.src = 'https://plausible.io/js/script.js'
    document.head.appendChild(s)
  }
  const phKey = env('VITE_POSTHOG_KEY')
  const phHost = env('VITE_POSTHOG_HOST') || 'https://us.i.posthog.com'
  if (phKey && !document.getElementById('posthog-boot')) {
    const s = document.createElement('script')
    s.id = 'posthog-boot'
    s.text = `
      !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="capture identify alias people.set people.set_once register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures getActiveMatchingSurveys getSurveys getNextSurveyStep onSessionId".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
      posthog.init(${JSON.stringify(phKey)},{api_host:${JSON.stringify(phHost)},person_profiles:'identified_only'});
    `
    document.head.appendChild(s)
  }

  track('app_open', { path: window.location.pathname })
}
