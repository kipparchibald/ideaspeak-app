/**
 * ModeBadge — Always-visible indicator for Simulator vs Real Grok
 * Part of the "build and test in one app" product clarity work.
 */

export type GrokMode = 'live' | 'simulator' | 'key-missing'

interface ModeBadgeProps {
  /** @deprecated prefer `mode` */
  hasApiKey?: boolean
  mode?: GrokMode
  compact?: boolean
}

export function ModeBadge({ hasApiKey, mode, compact = false }: ModeBadgeProps) {
  const resolved: GrokMode =
    mode ?? (hasApiKey ? 'live' : 'simulator')

  if (resolved === 'live') {
    return (
      <span
        style={{
          fontSize: compact ? 10 : 11,
          background: 'rgba(0,255,136,.12)',
          color: '#00ff88',
          border: '1px solid rgba(0,255,136,.3)',
          borderRadius: 6,
          padding: compact ? '2px 7px' : '3px 9px',
          fontWeight: 700,
          letterSpacing: '0.02em',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#00ff88',
            boxShadow: '0 0 6px #00ff88',
          }}
        />
        Real Grok
      </span>
    )
  }

  if (resolved === 'key-missing') {
    return (
      <span
        style={{
          fontSize: compact ? 10 : 11,
          background: 'rgba(255,80,80,.12)',
          color: '#f66',
          border: '1px solid rgba(255,80,80,.28)',
          borderRadius: 6,
          padding: compact ? '2px 7px' : '3px 9px',
          fontWeight: 700,
          letterSpacing: '0.02em',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
        }}
        title="Key saved but rejected by xAI. Open Settings → paste a fresh key from console.x.ai."
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#f66',
          }}
        />
        Key missing
      </span>
    )
  }

  return (
    <span
      style={{
        fontSize: compact ? 10 : 11,
        background: 'rgba(255,170,0,.12)',
        color: '#fa0',
        border: '1px solid rgba(255,170,0,.28)',
        borderRadius: 6,
        padding: compact ? '2px 7px' : '3px 9px',
        fontWeight: 700,
        letterSpacing: '0.02em',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
      }}
      title="Not talking to live Grok. Open Settings → paste a valid key from console.x.ai (Save & Verify must say Connected)."
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: '#fa0',
        }}
      />
      Simulator
    </span>
  )
}
