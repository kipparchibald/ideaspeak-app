/**
 * Supabase browser client — Sprint 4 auth + cloud persistence.
 * Graceful no-op when VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are unset.
 */

import { createClient, type SupabaseClient, type User, type Session } from '@supabase/supabase-js'

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || ''
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || ''

export const isSupabaseConfigured = Boolean(url && anonKey)

let client: SupabaseClient | null = null

/** Returns null when Supabase env vars are missing (local-only mode). */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null
  if (!client) {
    client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  }
  return client
}

export async function getSupabaseSession(): Promise<Session | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session
}

export async function getSupabaseUser(): Promise<User | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data } = await supabase.auth.getUser()
  return data.user
}

export type SupabaseAuthListener = (user: User | null) => void

/** Subscribe to auth changes; returns unsubscribe when configured, else no-op. */
export function onSupabaseAuthStateChange(listener: SupabaseAuthListener): () => void {
  const supabase = getSupabase()
  if (!supabase) return () => {}

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    listener(session?.user ?? null)
  })

  return () => data.subscription.unsubscribe()
}