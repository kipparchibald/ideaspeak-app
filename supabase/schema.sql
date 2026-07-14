-- IdeaSpeak builder — Sprint 4 auth + persistence
-- Run in Supabase → SQL Editor → New query

-- ── Profiles ────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  plan text not null default 'free' check (plan in ('free', 'pro', 'team')),
  stripe_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- ── Projects (workspace snapshots) ───────────────────────────────────────────
create table if not exists public.projects (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  files_json jsonb not null default '{}'::jsonb,
  conversation_json jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists projects_user_updated_idx
  on public.projects (user_id, updated_at desc);

alter table public.projects enable row level security;

create policy "Users read own projects"
  on public.projects for select
  using (auth.uid() = user_id);

create policy "Users insert own projects"
  on public.projects for insert
  with check (auth.uid() = user_id);

create policy "Users update own projects"
  on public.projects for update
  using (auth.uid() = user_id);

create policy "Users delete own projects"
  on public.projects for delete
  using (auth.uid() = user_id);

-- ── Daily usage (server-enforced limits) ────────────────────────────────────
create table if not exists public.usage_daily (
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null default (timezone('utc', now())::date),
  builds int not null default 0 check (builds >= 0),
  ships int not null default 0 check (ships >= 0),
  polish int not null default 0 check (polish >= 0),
  primary key (user_id, date)
);

alter table public.usage_daily enable row level security;

create policy "Users read own usage"
  on public.usage_daily for select
  using (auth.uid() = user_id);

-- Inserts/updates for usage_daily should go through service role (Railway server).

create or replace function public.increment_usage(
  p_user_id uuid,
  p_kind text,
  p_date date default (timezone('utc', now())::date)
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.usage_daily (user_id, date, builds, ships, polish)
  values (
    p_user_id,
    p_date,
    case when p_kind = 'build' then 1 else 0 end,
    case when p_kind = 'ship' then 1 else 0 end,
    case when p_kind = 'polish' then 1 else 0 end
  )
  on conflict (user_id, date) do update set
    builds = usage_daily.builds + case when p_kind = 'build' then 1 else 0 end,
    ships = usage_daily.ships + case when p_kind = 'ship' then 1 else 0 end,
    polish = usage_daily.polish + case when p_kind = 'polish' then 1 else 0 end;
end;
$$;

-- ── Auto-create profile on signup ───────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, plan)
  values (new.id, new.email, 'free')
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Touch updated_at on profile / project writes ─────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- ── Deploy jobs (server ship orchestrator) ───────────────────────────────────
create table if not exists public.deploy_jobs (
  id text primary key,
  user_id uuid references auth.users (id) on delete set null,
  app_name text not null,
  app_slug text not null,
  status text not null default 'queued',
  live_url text,
  repo_url text,
  events_json jsonb not null default '[]'::jsonb,
  error text,
  tenant_slug text,
  vercel_project_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.deploy_jobs add column if not exists tenant_slug text;
alter table public.deploy_jobs add column if not exists vercel_project_id text;

create index if not exists deploy_jobs_user_created_idx
  on public.deploy_jobs (user_id, created_at desc);

alter table public.deploy_jobs enable row level security;

create policy "Users read own deploy jobs"
  on public.deploy_jobs for select
  using (auth.uid() = user_id);

-- Inserts/updates for deploy_jobs should go through service role (Railway server).

drop trigger if exists deploy_jobs_set_updated_at on public.deploy_jobs;
create trigger deploy_jobs_set_updated_at
  before update on public.deploy_jobs
  for each row execute function public.set_updated_at();

-- ── App tenants (Fabric Lite — shared Supabase project) ─────────────────────
create table if not exists public.app_tenants (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  app_slug text not null unique,
  app_name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create index if not exists app_tenants_user_created_idx
  on public.app_tenants (user_id, created_at desc);

alter table public.app_tenants enable row level security;

create policy "Users read own app tenants"
  on public.app_tenants for select
  using (auth.uid() = user_id);

-- Inserts/updates for app_tenants should go through service role (Railway server).

-- ── Deploy jobs — Fabric Lite columns ────────────────────────────────────────
alter table public.deploy_jobs add column if not exists tenant_slug text;
alter table public.deploy_jobs add column if not exists vercel_project_id text;
alter table public.deploy_jobs add column if not exists changelog_json jsonb not null default '[]'::jsonb;