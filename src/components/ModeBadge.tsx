/**
 * ModeBadge — Always-visible indicator for Simulator vs Real Grok
 * Part of the "build and test in one app" product clarity work.
 */

import type { CSSProperties } from 'react'

export type GrokMode = 'live' | 'simulator' | 'key-missing'

interface ModeBadgeProps {
  /** @deprecated prefer `mode` */
  hasApiKey?: boolean
  mode?: GrokMode
  compact?: boolean
  /** Open Settings for key / connection path */
  onClick?: () => void
}

function badgeStyle(
  kind: GrokMode,
  compact: boolean,
  clickable: boolean,
): CSSProperties {
  const base: CSSProperties = {
    fontSize: compact ? 10 : 11,
    borderRadius: 6,
    padding: compact ? '2px 7px' : '3px 9px',
    fontWeight: 700,
    letterSpacing: '0.02em',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    cursor: clickable ? 'pointer' : 'default',
    fontFamily: 'inherit',
    lineHeight: 1.2,
  }
  if (kind === 'live') {
    return {
      ...base,
      background: 'rgba(0,255,136,.12)',
      color: '#00ff88',
      border: '1px solid rgba(0,255,136,.3)',
    }
  }
  if (kind === 'key-missing') {
    return {
      ...base,
      background: 'rgba(255,80,80,.12)',
      color: '#f66',
      border: '1px solid rgba(255,80,80,.28)',
    }
  }
  return {
    ...base,
    background: 'rgba(255,170,0,.12)',
    color: '#fa0',
    border: '1px solid rgba(255,170,0,.28)',
  }
}

export function ModeBadge({ hasApiKey, mode, compact = false, onClick }: ModeBadgeProps) {
  const resolved: GrokMode = mode ?? (hasApiKey ? 'live' : 'simulator')
  const clickable = typeof onClick === 'function'
  const style = badgeStyle(resolved, compact, clickable)

  const label =
    resolved === 'live' ? 'Real Grok' : resolved === 'key-missing' ? 'Key missing' : 'Simulator'
  const title =
    resolved === 'live'
      ? 'Real Grok connected — open Settings'
      : resolved === 'key-missing'
        ? 'Key saved but rejected by xAI. Open Settings → paste a fresh key from console.x.ai.'
        : 'Simulator mode. Open Settings → Save & Verify a key from console.x.ai for Real Grok. Demo loop still works.'

  const dotColor =
    resolved === 'live' ? '#00ff88' : resolved === 'key-missing' ? '#f66' : '#fa0'

  const content = (
    <>
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: dotColor,
          boxShadow: resolved === 'live' ? '0 0 6px #00ff88' : undefined,
        }}
      />
      {label}
    </>
  )

  if (clickable) {
    return (
      <button type="button" onClick={onClick} title={title} style={style} className="appearance-none">
        {content}
      </button>
    )
  }

  return (
    <span title={title} style={style}>
      {content}
    </span>
  )
}
