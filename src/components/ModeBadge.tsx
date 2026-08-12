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
  onOpenSettings?: () => void
}

export function ModeBadge({ hasApiKey, mode, compact = false, onOpenSettings }: ModeBadgeProps) {
  const liveTitle =
    'Real Grok — Plan: Grok 4.5 · Build: grok-build-0.1. Voice, discuss, and codegen hit xAI.'

  const resolved: GrokMode = mode ?? (hasApiKey ? 'live' : 'simulator')

  const settingsHint = onOpenSettings ? (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onOpenSettings()
      }}
      className="underline underline-offset-2 opacity-80 hover:opacity-100"
    >
      Settings
    </button>
  ) : (
    'Settings'
  )

  if (resolved === 'live') {
    return (
      <span
        title={liveTitle}
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
        {!compact && (
          <span style={{ opacity: 0.75, fontWeight: 600 }}>· live API</span>
        )}
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
        title={`Key saved but xAI rejected it. Open ${typeof settingsHint === 'string' ? 'Settings' : 'Settings'} → paste a fresh key from console.x.ai.`}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#f66',
          }}
        />
        Key invalid
        {!compact && <span style={{ opacity: 0.7, fontWeight: 600 }}>· simulator</span>}
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
      title="Simulator — high-fidelity local templates. Add a Grok key in Settings for real planning + Grok Build codegen."
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
      {!compact && <span style={{ opacity: 0.7, fontWeight: 600 }}>· no API</span>}
    </span>
  )
}
