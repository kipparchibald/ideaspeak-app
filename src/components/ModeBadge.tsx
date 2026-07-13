/**
 * ModeBadge — Always-visible indicator for Simulator vs Real Grok
 * Part of the "build and test in one app" product clarity work.
 */

interface ModeBadgeProps {
  hasApiKey: boolean
  compact?: boolean
}

export function ModeBadge({ hasApiKey, compact = false }: ModeBadgeProps) {
  if (hasApiKey) {
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
      title="Add your xAI API key in Settings for real Grok. Simulator still demos the full flow."
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
