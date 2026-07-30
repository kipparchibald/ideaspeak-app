/**
 * Confidential Box — one vault, hands-off ship.
 * User pastes secrets once; Autopilot uses them without opening dashboards.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Shield,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  CheckCircle2,
  Circle,
  ExternalLink,
  Trash2,
  Save,
  Rocket,
  KeyRound,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  VAULT_FIELDS,
  EMPTY_VAULT,
  autonomousShipReadiness,
  clearVault,
  lockVault,
  maskSecret,
  readVaultMeta,
  saveVault,
  seedFromLegacyStorage,
  tryAutoUnlock,
  unlockVault,
  type VaultSecrets,
  type VaultSecretId,
} from '../lib/confidential-box'
import { track } from '../lib/analytics'

interface ConfidentialBoxPanelProps {
  open: boolean
  onClose: () => void
  onSaved?: () => void
  /** Jump straight into Launch after save */
  onLaunchAutopilot?: () => void
}

export function ConfidentialBoxPanel({
  open,
  onClose,
  onSaved,
  onLaunchAutopilot,
}: ConfidentialBoxPanelProps) {
  const [secrets, setSecrets] = useState<VaultSecrets>(EMPTY_VAULT)
  const [passphrase, setPassphrase] = useState('')
  const [passphraseConfirm, setPassphraseConfirm] = useState('')
  const [usePassphrase, setUsePassphrase] = useState(false)
  const [unlockInput, setUnlockInput] = useState('')
  const [showValues, setShowValues] = useState(false)
  const [busy, setBusy] = useState(false)
  const [meta, setMeta] = useState(() => readVaultMeta())
  const [unlocked, setUnlocked] = useState(false)

  const readiness = useMemo(() => autonomousShipReadiness(secrets), [secrets])

  const bootstrap = useCallback(async () => {
    setBusy(true)
    try {
      const auto = await tryAutoUnlock()
      if (auto) {
        setSecrets(auto)
        setUnlocked(true)
        setMeta(readVaultMeta())
        return
      }
      const m = readVaultMeta()
      setMeta(m)
      if (!m.hasVault) {
        setSecrets(seedFromLegacyStorage())
        setUnlocked(true)
      } else {
        setUnlocked(false)
      }
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    if (open) void bootstrap()
  }, [open, bootstrap])

  const setField = (id: VaultSecretId, value: string) => {
    setSecrets((prev) => ({ ...prev, [id]: value }))
  }

  const handleUnlock = async () => {
    setBusy(true)
    try {
      const s = await unlockVault(unlockInput)
      setSecrets(s)
      setUnlocked(true)
      setMeta(readVaultMeta())
      toast.success('Confidential Box unlocked')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unlock failed')
    } finally {
      setBusy(false)
    }
  }

  const handleSave = async () => {
    if (usePassphrase) {
      if (passphrase.length < 6) {
        toast.error('Passphrase must be at least 6 characters')
        return
      }
      if (passphrase !== passphraseConfirm) {
        toast.error('Passphrases do not match')
        return
      }
    }
    setBusy(true)
    try {
      await saveVault(secrets, {
        passphrase: usePassphrase ? passphrase : undefined,
      })
      setMeta(readVaultMeta())
      setUnlocked(true)
      track('settings_open', { action: 'vault_save', ready: readiness.ready })
      toast.success('Confidential Box saved', {
        description: readiness.ready
          ? 'Hands-off ship is ready — Launch Autopilot won’t need dashboards'
          : readiness.message,
      })
      onSaved?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save vault')
    } finally {
      setBusy(false)
    }
  }

  const handleClear = () => {
    if (!confirm('Delete all secrets in Confidential Box on this device?')) return
    clearVault()
    setSecrets(EMPTY_VAULT)
    setUnlocked(true)
    setMeta(readVaultMeta())
    toast.message('Confidential Box cleared')
  }

  const groups = [
    { id: 'core' as const, title: 'Core (Grok)' },
    { id: 'ship' as const, title: 'Ship (hands-off deploy)' },
    { id: 'optional' as const, title: 'Optional' },
  ]

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[125] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md p-0 sm:p-6"
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            className="w-full max-w-xl max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-3xl border border-[#1f1f27] bg-[#0e0e14] shadow-2xl overflow-hidden"
          >
            <div className="shrink-0 px-5 py-4 border-b border-[#1f1f27] flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-[#00ff88]/10 border border-[#00ff88]/30 flex items-center justify-center shrink-0">
                  <Shield size={18} className="text-[#00ff88]" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-[17px] font-semibold text-[#e8e8f0]">
                    Confidential Box
                  </h2>
                  <p className="text-[12px] text-[#666] mt-0.5 leading-relaxed">
                    Enter secrets once. IdeaSpeak ships without you pasting into Vercel,
                    Supabase, or GitHub UIs.
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-[#666] hover:text-[#ccc] hover:bg-white/5"
                aria-label="Close confidential box"
              >
                <X size={18} />
              </button>
            </div>

            <div className="shrink-0 px-5 py-3 border-b border-[#1f1f27] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[12px]">
                {readiness.ready ? (
                  <CheckCircle2 size={14} className="text-[#00ff88]" />
                ) : (
                  <Circle size={14} className="text-[#fa0]" />
                )}
                <span className={readiness.ready ? 'text-[#00ff88]' : 'text-[#fa0]'}>
                  {readiness.message}
                </span>
              </div>
              <span className="text-[11px] tabular-nums text-[#555]">{readiness.score}%</span>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {!unlocked && meta.hasVault ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-[13px] text-[#e8e8f0] font-medium">
                    <Lock size={15} className="text-[#fa0]" />
                    Unlock with your passphrase
                  </div>
                  <input
                    type="password"
                    value={unlockInput}
                    onChange={(e) => setUnlockInput(e.target.value)}
                    placeholder="Passphrase"
                    className="w-full bg-[#111116] border border-[#1f1f27] rounded-xl px-3 py-2.5 text-[13px] text-[#e8e8f0] outline-none focus:border-[#00ff88]/40"
                    onKeyDown={(e) => e.key === 'Enter' && void handleUnlock()}
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleUnlock()}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#00ff88] text-[#0a0a0f] text-[13px] font-bold disabled:opacity-40"
                  >
                    <Unlock size={15} /> Unlock
                  </button>
                </div>
              ) : (
                <>
                  <div className="rounded-xl border border-[#00ff88]/20 bg-[#00ff88]/06 px-3.5 py-3 text-[12px] text-[#888] leading-relaxed">
                    <strong className="text-[#00ff88]">How this works:</strong> secrets stay
                    encrypted in this browser (AES-GCM). Autopilot uses GitHub + Vercel tokens to
                    create the repo, set env vars, and deploy — you only guide, not click through
                    each console. Never commit this box to git.
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setShowValues((v) => !v)}
                      className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#888] hover:text-[#ccc]"
                    >
                      {showValues ? <EyeOff size={13} /> : <Eye size={13} />}
                      {showValues ? 'Hide values' : 'Show values'}
                    </button>
                    {meta.updatedAt && (
                      <span className="text-[10px] text-[#555]">
                        Updated {new Date(meta.updatedAt).toLocaleString()}
                      </span>
                    )}
                  </div>

                  {groups.map((g) => {
                    const fields = VAULT_FIELDS.filter((f) => f.group === g.id)
                    return (
                      <section key={g.id} className="space-y-2.5">
                        <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#555]">
                          {g.title}
                        </h3>
                        {fields.map((f) => (
                          <label key={f.id} className="block">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="text-[12px] font-medium text-[#ccc]">{f.label}</span>
                              {f.href && (
                                <a
                                  href={f.href}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-0.5 text-[10px] text-[#00ff88]/80 hover:underline"
                                >
                                  Get <ExternalLink size={10} />
                                </a>
                              )}
                            </div>
                            <input
                              type={f.secret && !showValues ? 'password' : 'text'}
                              value={secrets[f.id]}
                              onChange={(e) => setField(f.id, e.target.value)}
                              placeholder={
                                !showValues && secrets[f.id]
                                  ? maskSecret(secrets[f.id])
                                  : f.placeholder || ''
                              }
                              autoComplete="off"
                              spellCheck={false}
                              className="w-full bg-[#111116] border border-[#1f1f27] rounded-xl px-3 py-2.5 text-[12px] text-[#e8e8f0] font-mono outline-none focus:border-[#00ff88]/40"
                            />
                            <p className="text-[10px] text-[#555] mt-1 leading-relaxed">{f.hint}</p>
                          </label>
                        ))}
                      </section>
                    )
                  })}

                  <section className="rounded-xl border border-[#1f1f27] bg-[#111116] px-3.5 py-3 space-y-2">
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={usePassphrase}
                        onChange={(e) => setUsePassphrase(e.target.checked)}
                        className="mt-0.5"
                      />
                      <span className="text-[12px] text-[#ccc] leading-relaxed">
                        <span className="font-semibold">Passphrase lock</span>
                        <span className="text-[#666]">
                          {' '}
                          — encrypt with a password you remember. Off = device-only key (easier,
                          this browser only).
                        </span>
                      </span>
                    </label>
                    {usePassphrase && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <input
                          type="password"
                          value={passphrase}
                          onChange={(e) => setPassphrase(e.target.value)}
                          placeholder="Passphrase"
                          className="bg-[#0a0a0f] border border-[#1f1f27] rounded-xl px-3 py-2 text-[12px] text-[#e8e8f0] outline-none focus:border-[#00ff88]/40"
                        />
                        <input
                          type="password"
                          value={passphraseConfirm}
                          onChange={(e) => setPassphraseConfirm(e.target.value)}
                          placeholder="Confirm"
                          className="bg-[#0a0a0f] border border-[#1f1f27] rounded-xl px-3 py-2 text-[12px] text-[#e8e8f0] outline-none focus:border-[#00ff88]/40"
                        />
                      </div>
                    )}
                  </section>
                </>
              )}
            </div>

            {unlocked && (
              <div className="shrink-0 px-5 py-3 border-t border-[#1f1f27] flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleSave()}
                  className="flex-1 min-w-[120px] inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#00ff88] text-[#0a0a0f] text-[13px] font-bold disabled:opacity-40"
                >
                  <Save size={15} /> Save box
                </button>
                {readiness.ready && onLaunchAutopilot && (
                  <button
                    type="button"
                    onClick={() => {
                      void handleSave().then(() => {
                        onClose()
                        onLaunchAutopilot()
                      })
                    }}
                    className="flex-1 min-w-[120px] inline-flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[#00ff88]/40 text-[13px] font-semibold text-[#00ff88]"
                  >
                    <Rocket size={15} /> Save & ship
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    lockVault()
                    setUnlocked(false)
                    setMeta(readVaultMeta())
                  }}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-[#1f1f27] text-[12px] text-[#888]"
                  title="Lock vault"
                >
                  <KeyRound size={14} />
                </button>
                <button
                  type="button"
                  onClick={handleClear}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-[#1f1f27] text-[12px] text-red-400/80 hover:bg-red-500/10"
                  title="Clear vault"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
