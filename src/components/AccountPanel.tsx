/**
 * AccountPanel — magic-link email sign-in (Supabase Auth)
 * Shown in Settings → Account. Cloud sync hooks live in projects.ts.
 */

import { useEffect, useState } from 'react'
import { Mail, LogOut, Loader2, Cloud, CloudOff, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import type { User } from '@supabase/supabase-js'
import {
  getSupabase,
  getSupabaseUser,
  isSupabaseConfigured,
  onSupabaseAuthStateChange,
} from '../lib/supabase'

export function AccountPanel() {
  const [email, setEmail] = useState('')
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }

    void getSupabaseUser().then(setUser)
    return onSupabaseAuthStateChange(setUser)
  }, [])

  async function handleMagicLink() {
    const trimmed = email.trim()
    if (!trimmed) {
      toast.error('Enter your email')
      return
    }

    const supabase = getSupabase()
    if (!supabase) {
      toast.error('Supabase not configured', {
        description: 'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local',
      })
      return
    }

    setSending(true)
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        emailRedirectTo: window.location.origin,
      },
    })
    setSending(false)

    if (error) {
      toast.error('Could not send magic link', { description: error.message })
      return
    }

    toast.success('Check your inbox', {
      description: `Magic link sent to ${trimmed}`,
    })
  }

  async function handleSignOut() {
    const supabase = getSupabase()
    if (!supabase) return

    setSigningOut(true)
    const { error } = await supabase.auth.signOut()
    setSigningOut(false)

    if (error) {
      toast.error('Sign out failed', { description: error.message })
      return
    }

    setEmail('')
    toast.message('Signed out')
  }

  if (!isSupabaseConfigured) {
    return (
      <section aria-labelledby="account-heading">
        <div className="flex items-center gap-2 mb-3">
          <CloudOff size={14} className="text-[#666]" />
          <h3
            id="account-heading"
            className="text-[11px] font-semibold text-[#666] uppercase tracking-wider"
          >
            Account
          </h3>
        </div>
        <p className="text-[12px] text-[#555] leading-relaxed">
          Cloud sync is optional. Add{' '}
          <code className="text-[#888]">VITE_SUPABASE_URL</code> and{' '}
          <code className="text-[#888]">VITE_SUPABASE_ANON_KEY</code> to{' '}
          <code className="text-[#888]">.env.local</code>, then run{' '}
          <code className="text-[#888]">supabase/schema.sql</code> in your Supabase project.
        </p>
      </section>
    )
  }

  return (
    <section aria-labelledby="account-heading">
      <div className="flex items-center gap-2 mb-3">
        <Cloud size={14} className="text-[#00ff88]" />
        <h3
          id="account-heading"
          className="text-[11px] font-semibold text-[#666] uppercase tracking-wider"
        >
          Account
        </h3>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-[12px] text-[#666] py-2">
          <Loader2 size={14} className="animate-spin" />
          Checking session…
        </div>
      ) : user ? (
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-xl border border-[#1f1f27] bg-[#0c0c10] px-3 py-2.5">
            <CheckCircle2 size={16} className="text-[#00ff88] mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-[#e8e8f0] truncate">
                {user.email}
              </div>
              <div className="text-[11px] text-[#555] mt-0.5">
                Signed in — workspaces can sync to the cloud on save.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            disabled={signingOut}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] border border-[#1f1f27] text-[#888] hover:text-[#ccc] hover:border-[#333] transition-colors disabled:opacity-50"
          >
            {signingOut ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
            Sign out
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[12px] text-[#555] leading-relaxed">
            Sign in with a magic link to sync workspaces across devices. Local saves still work
            offline-first.
          </p>
          <label className="block">
            <span className="sr-only">Email</span>
            <div className="relative">
              <Mail
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555] pointer-events-none"
              />
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void handleMagicLink()}
                placeholder="you@example.com"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-[#1f1f27] bg-[#0c0c10] text-[13px] text-[#e8e8f0] placeholder:text-[#444] focus:outline-none focus:border-[#00ff88]/40"
              />
            </div>
          </label>
          <button
            type="button"
            onClick={() => void handleMagicLink()}
            disabled={sending || !email.trim()}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-medium bg-[#00ff88]/15 text-[#00ff88] border border-[#00ff88]/30 hover:bg-[#00ff88]/20 transition-colors disabled:opacity-50"
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
            Send magic link
          </button>
        </div>
      )}
    </section>
  )
}