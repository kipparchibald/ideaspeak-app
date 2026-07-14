/**
 * Fabric Lite — shared Supabase tenant helpers for IdeaSpeak-hosted apps.
 * Each shipped app gets a stable tenant id + *.ideaspeak.app subdomain.
 */

/** Slug safe for DNS labels on *.ideaspeak.app (max 48 chars, lowercase a-z0-9-) */
export function generateTenantSlug(appSlug: string): string {
  return (
    appSlug
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'ideaspeak-app'
  )
}

/** Live URL on IdeaSpeak Fabric (Vercel wildcard + tenant subdomain). */
export function fabricLiveUrl(tenantSlug: string): string {
  const safe = generateTenantSlug(tenantSlug)
  return `https://${safe}.ideaspeak.app`
}

/**
 * Starter schema for apps on the IdeaSpeak shared Supabase project.
 * IdeaSpeak platform uses one shared project; each app is isolated by tenant_id + RLS.
 */
export function sharedTenantSchemaSql(appName: string, tenantId: string): string {
  return `-- IdeaSpeak Fabric Lite schema for ${appName}
-- IdeaSpeak platform uses a shared Supabase project — tenant_id isolates each app.
-- Run in Supabase → SQL Editor → New query

-- Profiles (extends auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Public profiles are viewable by everyone"
  on public.profiles for select using (true);

create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert with check (auth.uid() = id);

-- Example app data table (tenant-scoped)
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default '${tenantId}',
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  body text,
  created_at timestamptz default now()
);

create index if not exists items_tenant_user_idx
  on public.items (tenant_id, user_id);

alter table public.items enable row level security;

create policy "Tenant or user read items"
  on public.items for select
  using (
    tenant_id = current_setting('app.tenant_id', true)
    or (auth.uid() = user_id and tenant_id = '${tenantId}')
  );

create policy "Tenant or user insert items"
  on public.items for insert
  with check (
    tenant_id = current_setting('app.tenant_id', true)
    or (auth.uid() = user_id and tenant_id = '${tenantId}')
  );

create policy "Tenant or user update items"
  on public.items for update
  using (
    tenant_id = current_setting('app.tenant_id', true)
    or (auth.uid() = user_id and tenant_id = '${tenantId}')
  );

create policy "Tenant or user delete items"
  on public.items for delete
  using (
    tenant_id = current_setting('app.tenant_id', true)
    or (auth.uid() = user_id and tenant_id = '${tenantId}')
  );

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
`
}