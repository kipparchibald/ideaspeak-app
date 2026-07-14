/**
 * ApiSetupPanel — Seamless, secure, one-site API configuration + verification
 * Includes Grok TTS voice settings
 */

import { useState, useEffect } from 'react'
import { CheckCircle2, XCircle, Loader2, Key, ExternalLink, Shield, Zap } from 'lucide-react'
import {
  verifyXaiKey,
  saveLocalXaiKey,
  loadLocalXaiKey,
  saveLocalE2bKey,
  loadLocalE2bKey,
  type ApiStatus,
  type VerifyResult,
} from '../lib/api-verify'
import { TtsSettingsPanel } from './TtsSettingsPanel'

interface ApiSetupPanelProps {
  onKeySaved?: (hasKey: boolean) => void
}

export function ApiSetupPanel({ onKeySaved }: ApiSetupPanelProps) {
  const [xaiKey, setXaiKey] = useState('')
  const [e2bKey, setE2bKey] = useState('')
  const [showXai, setShowXai] = useState(false)
  const [showE2b, setShowE2b] = useState(false)

  const [xaiStatus, setXaiStatus] = useState<ApiStatus>('unknown')
  const [xaiMessage, setXaiMessage] = useState('')
  const [xaiModel, setXaiModel] = useState<string | undefined>()
  const [xaiSource, setXaiSource] = useState<VerifyResult['source']>()
  const [verifying, setVerifying] = useState(false)
  const [justSaved, setJustSaved] = useState(false)

  useEffect(() => {
    const savedXai = loadLocalXaiKey()
    const savedE2b = loadLocalE2bKey()
    setXaiKey(savedXai)
    setE2bKey(savedE2b)
    // Always verify: may already be live via server XAI_API_KEY with no paste needed
    void runVerify(savedXai || undefined)
  }, [])

  async function runVerify(keyOverride?: string) {
    setVerifying(true)
    setXaiStatus('checking')
    setXaiMessage('Checking connection…')
    const result: VerifyResult = await verifyXaiKey(keyOverride ?? xaiKey)
    setXaiStatus(result.status)
    setXaiMessage(result.message)
    setXaiModel(result.model)
    setXaiSource(result.source)
    setVerifying(false)
    onKeySaved?.(result.status === 'live')
  }

  function handleSaveXai() {
    const trimmed = xaiKey.trim()
    if (!trimmed) return
    saveLocalXaiKey(trimmed)
    setJustSaved(true)
    void runVerify(trimmed)
  }

  function handleSaveE2b() {
    saveLocalE2bKey(e2bKey)
  }

  function handleClearXai() {
    setXaiKey('')
    saveLocalXaiKey('')
    setXaiStatus('missing')
    setXaiMessage('Key cleared from this browser')
    setXaiSource(undefined)
    setJustSaved(false)
    onKeySaved?.(false)
    // Re-check in case server still has a hosted key
    void runVerify('')
  }

  const statusIcon = () => {
    if (xaiStatus === 'checking') return <Loader2 size={16} className="animate-spin text-yellow-400" />
    if (xaiStatus === 'live') return <CheckCircle2 size={16} className="text-[#00ff88]" />
    if (xaiStatus === 'invalid') return <XCircle size={16} className="text-red-400" />
    return <Key size={16} className="text-[#666]" />
  }

  const statusColor = () => {
    if (xaiStatus === 'live') return 'border-[#00ff88]/40 bg-[#00ff88]/08'
    if (xaiStatus === 'invalid') return 'border-red-500/40 bg-red-500/08'
    if (xaiStatus === 'checking') return 'border-yellow-500/40 bg-yellow-500/08'
    return 'border-[#1f1f27] bg-[#0a0a0f]'
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#00ff88]/10 border border-[#00ff88]/25 flex items-center justify-center shrink-0">
          <Shield size={18} className="text-[#00ff88]" />
        </div>
        <div>
          <h3 className="text-[15px] font-semibold text-[#e8e8f0]">API Connections</h3>
          <p className="text-[12px] text-[#666] mt-0.5 leading-relaxed">
            Set the key <strong className="text-[#888]">once</strong> — it stays on this device
            (or on the server). You should not re-enter it every session.
          </p>
        </div>
      </div>

      {/* How persistence works */}
      <div className="rounded-xl border border-[#1f1f27] bg-[#111116] px-3 py-2.5 space-y-1.5">
        <p className="text-[11px] font-semibold text-[#888]">Never re-type — pick one path</p>
        <p className="text-[11px] text-[#666] leading-relaxed">
          <span className="text-[#00ff88]">Best:</span> put{' '}
          <code className="text-[#888]">XAI_API_KEY</code> in{' '}
          <code className="text-[#888]">.env.local</code> (local) or Vercel env (production).
          Everyone uses Grok with no paste.
        </p>
        <p className="text-[11px] text-[#666] leading-relaxed">
          <span className="text-[#00ff88]">Or:</span> Save &amp; Verify below — key is stored in
          this browser’s localStorage until you Clear or wipe site data.
        </p>
      </div>

      <div className={`rounded-2xl border p-4 transition-colors ${statusColor()}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap size={15} className="text-[#00ff88]" />
            <span className="text-[13px] font-semibold text-[#e8e8f0]">xAI Grok</span>
            <span className="text-[10px] uppercase tracking-wider text-[#555] font-medium">Required</span>
          </div>
          <div className="flex items-center gap-2 text-[12px]">
            {statusIcon()}
            <span className={
              xaiStatus === 'live' ? 'text-[#00ff88]'
              : xaiStatus === 'invalid' ? 'text-red-400'
              : xaiStatus === 'checking' ? 'text-yellow-400'
              : 'text-[#666]'
            }>
              {xaiStatus === 'live' ? 'Connected'
                : xaiStatus === 'invalid' ? 'Invalid'
                : xaiStatus === 'checking' ? 'Checking…'
                : xaiStatus === 'missing' ? 'Not set'
                : 'Unknown'}
            </span>
          </div>
        </div>

        {xaiMessage && (
          <p className="text-[11px] text-[#888] mb-3 leading-relaxed">{xaiMessage}</p>
        )}

        {xaiStatus === 'live' && (
          <p className="text-[11px] text-[#00ff88]/90 mb-3 leading-relaxed">
            {xaiSource === 'server'
              ? '✓ Using server key — no browser paste needed. Stays connected across sessions.'
              : '✓ Key remembered on this device. You won’t need to paste it again here.'}
            {xaiModel ? ` · Model: ${xaiModel}` : ''}
          </p>
        )}

        {justSaved && xaiStatus === 'live' && xaiSource !== 'server' && (
          <p className="text-[11px] text-[#888] mb-3">
            Saved to browser storage (localStorage). Survives refresh and restarts of the app.
          </p>
        )}

        {xaiStatus === 'invalid' && (
          <p className="text-[11px] text-red-400/90 mb-3 leading-relaxed">
            Key was rejected by xAI (expired/revoked/typo). Get a new one at console.x.ai, paste once,
            Save &amp; Verify — it will stick on this device.
          </p>
        )}

        <div className="space-y-2">
          <div className="relative">
            <input
              type={showXai ? 'text' : 'password'}
              value={xaiKey}
              onChange={(e) => {
                setXaiKey(e.target.value)
                setJustSaved(false)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveXai()
              }}
              placeholder={
                xaiSource === 'server' && xaiStatus === 'live'
                  ? 'Optional override (server key already live)'
                  : loadLocalXaiKey()
                    ? 'Key saved on this device — paste new to replace'
                    : 'xai-… paste once, then Save'
              }
              autoComplete="off"
              spellCheck={false}
              className="w-full bg-[#07070c] border border-[#1f1f27] rounded-xl px-3 py-2.5 text-[13px] text-[#e8e8f0] placeholder:text-[#444] outline-none focus:border-[#00ff88]/40 transition-colors font-mono"
            />
            <button
              type="button"
              onClick={() => setShowXai((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[#555] hover:text-[#888]"
            >
              {showXai ? 'Hide' : 'Show'}
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSaveXai}
              disabled={verifying || !xaiKey.trim()}
              className="flex-1 bg-[#00ff88] text-[#0a0a0f] text-[12px] font-semibold rounded-xl py-2 hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              Save & Verify
            </button>
            <button
              onClick={() => void runVerify(xaiKey || undefined)}
              disabled={verifying}
              className="px-4 border border-[#1f1f27] text-[12px] text-[#888] rounded-xl hover:border-[#333] hover:text-[#ccc] transition-colors disabled:opacity-50"
            >
              {verifying ? 'Checking…' : 'Re-check'}
            </button>
            {xaiKey && (
              <button
                onClick={handleClearXai}
                className="px-3 border border-[#1f1f27] text-[12px] text-[#666] rounded-xl hover:border-red-500/40 hover:text-red-400 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <a
          href="https://console.x.ai"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 mt-3 text-[11px] text-[#00ff88]/80 hover:text-[#00ff88]"
        >
          Get free API key at console.x.ai <ExternalLink size={11} />
        </a>
      </div>

      <TtsSettingsPanel />

      <div className="rounded-2xl border border-[#1f1f27] bg-[#0a0a0f] p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-[#e8e8f0]">E2B Sandbox</span>
            <span className="text-[10px] uppercase tracking-wider text-[#444] font-medium">Optional</span>
          </div>
        </div>
        <p className="text-[11px] text-[#666] mb-3 leading-relaxed">
          Enables secure full-environment code execution for higher-fidelity previews.
        </p>
        <div className="space-y-2">
          <div className="relative">
            <input
              type={showE2b ? 'text' : 'password'}
              value={e2bKey}
              onChange={(e) => setE2bKey(e.target.value)}
              placeholder="e2b_…"
              className="w-full bg-[#07070c] border border-[#1f1f27] rounded-xl px-3 py-2.5 text-[13px] text-[#e8e8f0] placeholder:text-[#444] outline-none focus:border-[#00ff88]/40 transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowE2b((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[#555] hover:text-[#888]"
            >
              {showE2b ? 'Hide' : 'Show'}
            </button>
          </div>
          <button
            onClick={handleSaveE2b}
            className="w-full border border-[#1f1f27] text-[12px] text-[#888] rounded-xl py-2 hover:border-[#333] hover:text-[#ccc] transition-colors"
          >
            Save E2B Key
          </button>
        </div>
        <a
          href="https://e2b.dev"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 mt-3 text-[11px] text-[#666] hover:text-[#888]"
        >
          Get key at e2b.dev <ExternalLink size={11} />
        </a>
      </div>

      <div className="rounded-xl bg-[#111116] border border-[#1f1f27] px-3 py-2.5 space-y-1">
        <p className="text-[10px] text-[#555] leading-relaxed">
          <strong className="text-[#666]">Security:</strong> Browser keys live in localStorage only
          (this site, this browser). Server keys never ship to the client.
        </p>
        <p className="text-[10px] text-[#555] leading-relaxed">
          <strong className="text-[#666]">Local one-time setup:</strong>{' '}
          <code className="text-[#666]">bun run setup:grok</code> writes{' '}
          <code className="text-[#666]">.env.local</code> — restart{' '}
          <code className="text-[#666]">dev:full</code>, then never paste in the UI again.
        </p>
        <p className="text-[10px] text-[#444] leading-relaxed">
          You’ll only re-enter a key if you Clear it, wipe site data, use another browser/profile,
          or the key is revoked at console.x.ai.
        </p>
      </div>
    </div>
  )
}
