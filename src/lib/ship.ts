/**
 * Ship helpers — remove pain of going from preview → live product.
 * Production ZIP, Supabase wiring, Vercel host, domains, publish checklist.
 */

import { councilExportFiles } from './council'
import { generateTenantSlug } from './fabric-tenant'
import { polishExportFiles } from './polish'

export type ShipStepId =
  | 'package'
  | 'supabase'
  | 'host'
  | 'domain'
  | 'publish'

export interface ShipStep {
  id: ShipStepId
  title: string
  subtitle: string
  pain: string
}

export interface SupabaseConfig {
  url: string
  anonKey: string
  projectRef: string
}

export interface ShipPreferences {
  appName: string
  appSlug: string
  supabase: SupabaseConfig
  customDomain: string
  githubRepoUrl: string
  vercelProjectUrl: string
  checklist: Record<string, boolean>
}

const PREFS_KEY = 'ideaspeak_ship_prefs'

export const SHIP_STEPS: ShipStep[] = [
  {
    id: 'package',
    title: 'Package',
    subtitle: 'Production-ready project',
    pain: 'No manual scaffolding',
  },
  {
    id: 'supabase',
    title: 'Backend',
    subtitle: 'Auth · DB · storage',
    pain: 'No blank Postgres pain',
  },
  {
    id: 'host',
    title: 'Host',
    subtitle: 'Deploy to Vercel',
    pain: 'One path to live URL',
  },
  {
    id: 'domain',
    title: 'Domain',
    subtitle: 'Custom domain',
    pain: 'DNS steps spelled out',
  },
  {
    id: 'publish',
    title: 'Publish',
    subtitle: 'Launch checklist',
    pain: 'Nothing forgotten',
  },
]

export const DEFAULT_CHECKLIST: Record<string, boolean> = {
  zipDownloaded: false,
  supabaseProject: false,
  supabaseEnv: false,
  supabaseSchema: false,
  vercelDeployed: false,
  envOnVercel: false,
  domainAttached: false,
  smokeTested: false,
  announced: false,
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'ideaspeak-app'
  )
}

export function loadShipPrefs(): ShipPreferences {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (raw) {
      const p = JSON.parse(raw) as Partial<ShipPreferences>
      return {
        appName: p.appName || 'My IdeaSpeak App',
        appSlug: p.appSlug || 'my-ideaspeak-app',
        supabase: {
          url: p.supabase?.url || '',
          anonKey: p.supabase?.anonKey || '',
          projectRef: p.supabase?.projectRef || '',
        },
        customDomain: p.customDomain || '',
        githubRepoUrl: p.githubRepoUrl || '',
        vercelProjectUrl: p.vercelProjectUrl || '',
        checklist: { ...DEFAULT_CHECKLIST, ...(p.checklist || {}) },
      }
    }
  } catch {
    /* ignore */
  }
  return {
    appName: 'My IdeaSpeak App',
    appSlug: 'my-ideaspeak-app',
    supabase: { url: '', anonKey: '', projectRef: '' },
    customDomain: '',
    githubRepoUrl: '',
    vercelProjectUrl: '',
    checklist: { ...DEFAULT_CHECKLIST },
  }
}

export function saveShipPrefs(prefs: ShipPreferences) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
}

export function shipReadinessScore(prefs: ShipPreferences): number {
  const keys = Object.keys(DEFAULT_CHECKLIST)
  const done = keys.filter((k) => prefs.checklist[k]).length
  return Math.round((done / keys.length) * 100)
}

/** External deep links — open real product consoles with zero friction */
export const SHIP_LINKS = {
  supabaseNew: 'https://supabase.com/dashboard/new/project',
  supabaseProjects: 'https://supabase.com/dashboard/projects',
  supabaseDocs: 'https://supabase.com/docs/guides/getting-started/quickstarts/nextjs',
  vercelNew: 'https://vercel.com/new',
  vercelImport: 'https://vercel.com/new',
  vercelDomains: 'https://vercel.com/docs/projects/domains/add-a-domain',
  vercelDashboard: 'https://vercel.com/dashboard',
  githubNew: 'https://github.com/new',
  namecheap: 'https://www.namecheap.com/domains/',
  porkbun: 'https://porkbun.com/',
  /** Deploy button template — user pastes their repo after push */
  vercelDeployButton: (repoUrl: string) => {
    if (!repoUrl) return 'https://vercel.com/new'
    const encoded = encodeURIComponent(repoUrl)
    return `https://vercel.com/new/clone?repository-url=${encoded}`
  },
}

/** Canonical one-click deploy URL — always valid even without a GitHub repo */
export function vercelOneClickDeployUrl(repoUrl?: string | null): string {
  const url = (repoUrl || '').trim()
  return url ? SHIP_LINKS.vercelDeployButton(url) : SHIP_LINKS.vercelNew
}

/** Env vars to paste into Vercel project settings */
export function vercelEnvPasteLines(prefs: ShipPreferences): string {
  const { supabase } = prefs
  return [
    `NEXT_PUBLIC_SUPABASE_URL=${supabase.url || 'https://YOUR_PROJECT.supabase.co'}`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${supabase.anonKey || 'your-anon-key'}`,
  ].join('\n')
}

export function extractSupabaseRef(url: string): string {
  try {
    const m = url.match(/https?:\/\/([a-z0-9-]+)\.supabase\.co/i)
    return m?.[1] || ''
  } catch {
    return ''
  }
}

export function envLocalContents(prefs: ShipPreferences): string {
  const { supabase } = prefs
  return `# Generated by IdeaSpeak Ship
# Never commit real secrets — .env.local is gitignored

# Supabase (Project Settings → API)
NEXT_PUBLIC_SUPABASE_URL=${supabase.url || 'https://YOUR_PROJECT.supabase.co'}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${supabase.anonKey || 'your-anon-key'}

# Optional: server-only (Edge Functions / admin)
# SUPABASE_SERVICE_ROLE_KEY=

# Optional: xAI inside your product
# XAI_API_KEY=
`
}

export function envExampleContents(tenantId?: string): string {
  const tenantLine = tenantId
    ? `NEXT_PUBLIC_IDEASPEAK_TENANT_ID=${tenantId}`
    : 'NEXT_PUBLIC_IDEASPEAK_TENANT_ID=your-tenant-id'
  return `# Copy to .env.local and fill in
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
${tenantLine}
# SUPABASE_SERVICE_ROLE_KEY=
# XAI_API_KEY=
`
}

export function supabaseSchemaSql(appName: string): string {
  const tenantId = '{{TENANT_ID}}'
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

function supabaseClientTs(): string {
  return `import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }
  return createBrowserClient(url, key)
}
`
}

function supabaseServerTs(): string {
  return `import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          /* Server Component — ignore */
        }
      },
    },
  })
}
`
}

function agentsMd(appName: string): string {
  return `# AGENTS.md — ${appName}

Built with IdeaSpeak (voice → production).

## Stack
- Next.js 15 App Router + TypeScript + Tailwind
- Supabase (Auth, Postgres, RLS) — see \`supabase/schema.sql\`
- Deploy target: Vercel

## Rules for AI assistants
- Keep the design system (CSS variables / Tailwind tokens). No random colors.
- Prefer vertical slices that work end-to-end with Supabase.
- Never commit \`.env.local\` or secrets.
- After changes: run \`npm run build\` and fix errors.

## Verify
\`\`\`bash
bun install && bun dev
# or: npm install && npm run dev
# optional: grok /check-work
\`\`\`
`
}

function cursorrules(appName: string): string {
  return `# ${appName} — Cursor rules (IdeaSpeak export)
- Production-first: auth, empty states, loading, mobile.
- Use Supabase via lib/supabase/* — never hardcode keys.
- Dark-first premium UI. Motion with purpose.
- Prefer small typed modules over giant files.
`
}

function ideaSpeakContext(appName: string, idea: string): string {
  return `# IDEA-SPEAK-CONTEXT

App: ${appName}
Origin idea: ${idea || '(from IdeaSpeak session)'}

This project was generated / exported from IdeaSpeak.
Live preview lived in Sandpack; this export is the production Next.js path.

Ship path: Supabase (data) → Vercel (host) → custom domain → launch.
`
}

function vercelJson(): string {
  return JSON.stringify(
    {
      framework: 'nextjs',
      regions: ['iad1'],
    },
    null,
    2,
  )
}

function gitignore(): string {
  return `node_modules
.next
.env
.env.local
.env*.local
.DS_Store
dist
*.log
.vercel
`
}

/** Files every production ZIP must contain for `bun install && bun dev` */
export const EXPORT_SCAFFOLD_CHECKLIST = [
  'package.json',
  'tsconfig.json',
  'next.config.ts',
  'next-env.d.ts',
  'postcss.config.mjs',
  'tailwind.config.ts',
  'app/layout.tsx',
  'app/page.tsx',
  'app/globals.css',
  '.env.example',
  'README.md',
  'AGENTS.md',
  'IDEA-SPEAK-CONTEXT.md',
] as const

/** Extra paths that signal a complete IdeaSpeak ship bundle */
export const EXPORT_QUALITY_PATHS = [
  '.cursorrules',
  'vercel.json',
  'SHIP.md',
  'EXPORT_QUALITY.md',
  '.gitignore',
] as const

const PREVIEW_ENTRY_SKIP = new Set([
  'package.json',
  'src/main.tsx',
  'main.tsx',
  'index.html',
  'vite.config.ts',
  'vite.config.js',
  'tsconfig.json',
  'README.md',
])

/** Scaffold paths agent files must not overwrite */
const SCAFFOLD_PROTECTED = new Set([
  'package.json',
  'tsconfig.json',
  'next.config.ts',
  'postcss.config.mjs',
  'tailwind.config.ts',
  'next-env.d.ts',
  'vercel.json',
  '.gitignore',
  '.env.example',
  '.env.local',
  'app/layout.tsx',
  'app/globals.css',
  'lib/supabase/client.ts',
  'lib/supabase/server.ts',
  'supabase/schema.sql',
  'SHIP.md',
  'README.md',
  'AGENTS.md',
  '.cursorrules',
  'IDEA-SPEAK-CONTEXT.md',
])

function normalizePreviewPath(path: string): string {
  return path.replace(/^\/+/, '').replace(/\\/g, '/')
}

function flattenPreviewInput(
  previewFiles: Record<string, string | { code?: string }>,
): Record<string, string> {
  const flat: Record<string, string> = {}
  for (const [rawPath, value] of Object.entries(previewFiles)) {
    const path = normalizePreviewPath(rawPath)
    flat[path] = typeof value === 'string' ? value : String(value?.code ?? '')
  }
  return flat
}

/** Map Sandpack / agent paths into a Next.js 15 App Router tree */
function mapAgentPathToProduction(path: string): string | null {
  const p = normalizePreviewPath(path)
  if (PREVIEW_ENTRY_SKIP.has(p)) return null
  if (p === 'src/App.tsx' || p === 'App.tsx' || p === 'app/page.tsx') return null
  if (p === 'src/index.css' || p === 'index.css') return null

  if (p.startsWith('src/components/')) return p.replace('src/components/', 'components/')
  if (p.startsWith('src/hooks/')) return p.replace('src/hooks/', 'hooks/')
  if (p.startsWith('src/lib/')) return p.replace('src/lib/', 'lib/')
  if (p.startsWith('src/utils/')) return p.replace('src/utils/', 'lib/utils/')
  if (p.startsWith('src/')) return p.replace(/^src\//, '')
  return p
}

/** Rewrite preview-relative imports so they resolve from app/ and @/* */
function rewriteImportsForNext(code: string): string {
  return code
    .replace(/from\s+['"]\.\/components\//g, "from '@/components/")
    .replace(/from\s+['"]\.\.\/components\//g, "from '@/components/")
    .replace(/from\s+['"]@\/src\/components\//g, "from '@/components/")
    .replace(/from\s+['"]\.\/hooks\//g, "from '@/hooks/")
    .replace(/from\s+['"]\.\.\/hooks\//g, "from '@/hooks/")
    .replace(/from\s+['"]\.\/lib\//g, "from '@/lib/")
    .replace(/from\s+['"]\.\.\/lib\//g, "from '@/lib/")
    .replace(/from\s+['"]\.\/utils\//g, "from '@/lib/utils/")
    .replace(/from\s+['"]\.\.\/utils\//g, "from '@/lib/utils/")
    .replace(/from\s+['"]\.\/ui\//g, "from '@/components/ui/")
    .replace(/from\s+['"]\.\.\/ui\//g, "from '@/components/ui/")
    .replace(/from\s+['"]src\/components\//g, "from '@/components/")
    .replace(/from\s+['"]src\/lib\//g, "from '@/lib/")
    .replace(/from\s+['"]\.\/App['"]/g, "from '@/app/page'")
    .replace(/from\s+['"]\.\/App\.tsx['"]/g, "from '@/app/page'")
    .replace(/from\s+['"]\.\/index\.css['"]/g, "from '@/app/globals.css'")
    .replace(/from\s+['"]\.\/assets\//g, "from '@/public/")
}

function stripPreviewOnlySource(code: string): string {
  return code
    .replace(/^['"]use client['"];?\s*$/gm, '')
    .replace(/^import\s+['"]\.\/index\.css['"];?\s*$/gm, '')
    .replace(/^import\s+['"]\.\/.*\.css['"];?\s*$/gm, '')
    .replace(/^import\s+[^;]+from\s+['"]react-dom\/client['"];?\s*$/gm, '')
    .replace(/from\s+['"]react-dom\/client['"]/g, "from 'react-dom'")
    .replace(/^import\s+[^;]+from\s+['"]\.\/main['"];?\s*$/gm, '')
    .replace(/^import\s+[^;]+from\s+['"]vite\/[^'"]+['"];?\s*$/gm, '')
    .trim()
}

function defaultPageSource(appName: string): string {
  return `export default function Page() {
  return (
    <main className="min-h-screen grid place-items-center bg-canvas text-white p-8">
      <div className="text-center max-w-md">
        <h1 className="text-3xl font-semibold">${appName}</h1>
        <p className="text-white/50 mt-3 text-sm">Built with IdeaSpeak</p>
      </div>
    </main>
  )
}
`
}

function buildPageSource(appName: string, preview: Record<string, string>): string {
  const raw =
    preview['app/page.tsx'] ||
    preview['src/App.tsx'] ||
    preview['App.tsx'] ||
    ''

  const cleaned = raw ? rewriteImportsForNext(stripPreviewOnlySource(raw)) : ''
  const body =
    cleaned && cleaned.includes('export default')
      ? cleaned
      : defaultPageSource(appName)

  if (body.includes("'use client'") || body.includes('"use client"')) {
    return body.startsWith("'use client'") || body.startsWith('"use client"')
      ? body
      : `'use client'\n\n${body}`
  }

  const needsClient =
    /\buseState\b|\buseEffect\b|\buseMemo\b|\buseCallback\b|\buseRef\b|\buseReducer\b|\bonClick\b|\bonChange\b|\bonSubmit\b|\bonKeyDown\b/.test(
      body,
    )

  // Server Components by default; only mark client when interactive
  return needsClient ? `'use client'\n\n${body}` : body
}

function extractPreviewCss(preview: Record<string, string>): string {
  const css = preview['src/index.css'] || preview['index.css'] || ''
  if (!css.trim()) return ''
  const withoutTailwind = css
    .replace(/@tailwind\s+\w+;?/g, '')
    .replace(/@import\s+[^;]+;?/g, '')
    .trim()
  return withoutTailwind
}

function mergeGlobalsCss(base: string, previewCss: string): string {
  if (!previewCss) return base
  if (base.includes('/* preview-source */')) return base
  return `${base.trim()}\n\n/* preview-source — keyframes & base from Sandpack */\n${previewCss}\n`
}

function mapAgentFilesToProduction(preview: Record<string, string>): Record<string, string> {
  const mapped: Record<string, string> = {}
  for (const [rawPath, content] of Object.entries(preview)) {
    const target = mapAgentPathToProduction(rawPath)
    if (!target || !content?.trim()) continue
    if (SCAFFOLD_PROTECTED.has(target)) continue
    mapped[target] = rewriteImportsForNext(stripPreviewOnlySource(content))
  }
  return mapped
}

function ensureRequiredScaffold(
  files: Record<string, string>,
  appName: string,
  appSlug: string,
  prefs: ShipPreferences,
  idea: string,
  tenantId: string,
): void {
  const fallbacks: Record<string, () => string> = {
    'package.json': () =>
      JSON.stringify(
        {
          name: appSlug,
          version: '1.0.0',
          private: true,
          scripts: { dev: 'next dev', build: 'next build', start: 'next start', lint: 'next lint' },
          dependencies: {
            next: '^15.1.0',
            react: '^19.0.0',
            'react-dom': '^19.0.0',
            '@supabase/supabase-js': '^2.49.0',
            '@supabase/ssr': '^0.6.0',
            'framer-motion': '^11.15.0',
            'lucide-react': '^0.469.0',
          },
          devDependencies: {
            typescript: '^5.7.0',
            '@types/node': '^22.10.0',
            '@types/react': '^19.0.0',
            '@types/react-dom': '^19.0.0',
            tailwindcss: '^3.4.17',
            postcss: '^8.4.49',
            autoprefixer: '^10.4.20',
            eslint: '^9.17.0',
            'eslint-config-next': '^15.1.0',
          },
        },
        null,
        2,
      ),
    'app/page.tsx': () => `'use client'\n\n${defaultPageSource(appName)}`,
    'app/layout.tsx': () => `import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: ${JSON.stringify(appName)},
  description: 'Built with IdeaSpeak — voice to production',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  )
}
`,
    '.env.example': () => envExampleContents(tenantId),
    'README.md': () => buildReadme(appName, appSlug, prefs),
    'AGENTS.md': () => agentsMd(appName),
    'IDEA-SPEAK-CONTEXT.md': () => ideaSpeakContext(appName, idea),
  }

  for (const key of EXPORT_SCAFFOLD_CHECKLIST) {
    if (!files[key]?.trim() && fallbacks[key]) {
      files[key] = fallbacks[key]()
    }
  }
}


/** Merge agent preview package.json deps into the production Next scaffold */
function mergePreviewPackageJson(
  base: Record<string, unknown>,
  preview: Record<string, string>,
): Record<string, unknown> {
  const raw = preview['package.json']
  if (!raw?.trim()) return base
  try {
    const parsed = JSON.parse(raw) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const deps = { ...(base.dependencies as Record<string, string>) }
    const devDeps = { ...(base.devDependencies as Record<string, string>) }
    const skip = new Set([
      'react',
      'react-dom',
      'react-scripts',
      'vite',
      '@vitejs/plugin-react',
      'parcel',
      'webpack',
      'next',
    ])
    for (const [name, ver] of Object.entries(parsed.dependencies || {})) {
      if (skip.has(name) || name.startsWith('@types/')) continue
      if (!deps[name]) deps[name] = ver
    }
    for (const [name, ver] of Object.entries(parsed.devDependencies || {})) {
      if (skip.has(name)) continue
      if (!devDeps[name] && !deps[name]) devDeps[name] = ver
    }
    return { ...base, dependencies: deps, devDependencies: devDeps }
  } catch {
    return base
  }
}

/**
 * Build a production-oriented file map for ZIP export.
 * Sandpack React preview files are lifted into app/ and supporting modules.
 */
export function buildProductionScaffold(opts: {
  appName: string
  appSlug: string
  idea?: string
  previewFiles: Record<string, string | { code?: string }>
  prefs: ShipPreferences
}): Record<string, string> {
  const { appName, appSlug, idea = '', previewFiles, prefs } = opts
  const tenantId = generateTenantSlug(appSlug)
  const preview = flattenPreviewInput(previewFiles)
  const pageSource = buildPageSource(appName, preview)
  const previewCss = extractPreviewCss(preview)

  const packageJson = mergePreviewPackageJson(
    {
      name: appSlug,
      version: '1.0.0',
      private: true,
      scripts: {
        dev: 'next dev',
        build: 'next build',
        start: 'next start',
        lint: 'next lint',
        typecheck: 'tsc --noEmit',
      },
      dependencies: {
        next: '^15.1.0',
        react: '^19.0.0',
        'react-dom': '^19.0.0',
        '@supabase/supabase-js': '^2.49.0',
        '@supabase/ssr': '^0.6.0',
        'framer-motion': '^11.15.0',
        'lucide-react': '^0.469.0',
      },
      devDependencies: {
        typescript: '^5.7.0',
        '@types/node': '^22.10.0',
        '@types/react': '^19.0.0',
        '@types/react-dom': '^19.0.0',
        tailwindcss: '^3.4.17',
        postcss: '^8.4.49',
        autoprefixer: '^10.4.20',
        eslint: '^9.17.0',
        'eslint-config-next': '^15.1.0',
      },
    },
    preview,
  )

  const files: Record<string, string> = {
    'package.json': JSON.stringify(packageJson, null, 2),
    '.eslintrc.json': JSON.stringify({ extends: 'next/core-web-vitals' }, null, 2),
    'tsconfig.json': JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2017',
          lib: ['dom', 'dom.iterable', 'esnext'],
          allowJs: true,
          skipLibCheck: true,
          strict: true,
          noEmit: true,
          esModuleInterop: true,
          module: 'esnext',
          moduleResolution: 'bundler',
          resolveJsonModule: true,
          isolatedModules: true,
          jsx: 'preserve',
          incremental: true,
          plugins: [{ name: 'next' }],
          paths: { '@/*': ['./*'] },
        },
        include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
        exclude: ['node_modules'],
      },
      null,
      2,
    ),
    'next.config.ts': `import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
}

export default nextConfig
`,
    'postcss.config.mjs': `/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
export default config
`,
    'tailwind.config.ts': `import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: '#00ff88',
        canvas: '#0a0a0f',
      },
    },
  },
  plugins: [],
}
export default config
`,
    'next-env.d.ts': `/// <reference types="next" />
/// <reference types="next/image-types/global" />
`,
    'vercel.json': vercelJson(),
    '.gitignore': gitignore(),
    '.env.example': envExampleContents(tenantId),
    // Never ship real secrets in downloadable ZIPs — placeholders only
    '.env.local': envLocalContents({
      ...prefs,
      supabase: {
        url: '',
        anonKey: '',
        projectRef: prefs.supabase.projectRef || '',
      },
    }),
    'AGENTS.md': agentsMd(appName),
    '.cursorrules': cursorrules(appName),
    'IDEA-SPEAK-CONTEXT.md': ideaSpeakContext(appName, idea),
    'supabase/schema.sql': supabaseSchemaSql(appName).replace(/\{\{TENANT_ID\}\}/g, tenantId),
    'lib/supabase/client.ts': supabaseClientTs(),
    'lib/supabase/server.ts': supabaseServerTs(),
    'app/globals.css': mergeGlobalsCss(
      `@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg: #0a0a0f;
  --fg: #e8e8f0;
  --accent: #00ff88;
  --border: #1f1f27;
}

html, body {
  background: var(--bg);
  color: var(--fg);
  font-family: Inter, system-ui, sans-serif;
}
`,
      previewCss,
    ),
    'app/layout.tsx': `import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: ${JSON.stringify(appName)},
  description: 'Built with IdeaSpeak — voice to production',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  )
}
`,
    'app/page.tsx': pageSource,
    'SHIP.md': buildShipMd(appName, prefs),
    'README.md': buildReadme(appName, appSlug, prefs),
    'EXPORT_QUALITY.md': exportQualityMd(),
  }

  // Agent-generated modules (components, hooks, lib, etc.)
  const agentMapped = mapAgentFilesToProduction(preview)
  for (const [path, content] of Object.entries(agentMapped)) {
    if (!SCAFFOLD_PROTECTED.has(path)) {
      files[path] = content
    }
  }

  // Multi-model polish + Council launch review handoff
  const polishFiles = polishExportFiles({
    appName,
    idea,
    fileList: Object.keys(files),
  })
  Object.assign(files, polishFiles)

  const councilFiles = councilExportFiles({
    appName,
    files,
    transcript: idea,
    shipPrefs: prefs,
  })
  Object.assign(files, councilFiles)

  ensureRequiredScaffold(files, appName, appSlug, prefs, idea, tenantId)

  // Preserve original preview sources for reference
  for (const [path, content] of Object.entries(preview)) {
    if (path === 'package.json') continue
    files[`preview-source/${path}`] = content
  }

  return files
}


function exportQualityMd(): string {
  return [
    '# Export quality checklist',
    '',
    'This project was packaged by IdeaSpeak.',
    '',
    '## Verify locally',
    '```bash',
    'bun install   # or npm install',
    'cp .env.example .env.local   # fill Supabase if needed',
    'bun dev',
    'bun run build   # must pass before deploy',
    '```',
    '',
    '## Included',
    '- Next.js 15 App Router + TypeScript + Tailwind',
    '- Supabase client/server stubs + schema.sql',
    '- vercel.json (framework: nextjs)',
    '- Deploy with Vercel button in README',
    '- AGENTS.md + multi-model polish prompts',
    '- No real secrets (.env.local is placeholders only)',
    '',
    '## If build fails',
    '1. Check import paths use @/ aliases',
    '2. Run bun run typecheck / tsc --noEmit',
    '3. Re-export from IdeaSpeak after fixing the live preview',
    '',
  ].join('\n')
}

function buildShipMd(appName: string, prefs: ShipPreferences): string {
  return `# Ship ${appName}

IdeaSpeak removes the usual pain. Follow this order:

## 1. Package
You already have this ZIP — production Next.js + Supabase stubs + Vercel config.

## 2. Supabase (backend)
1. Open https://supabase.com/dashboard/new/project
2. Create project → wait until healthy
3. **Project Settings → API** → copy Project URL + anon key into \`.env.local\`
4. **SQL Editor** → paste \`supabase/schema.sql\` → Run
5. Auth → URL config: add \`http://localhost:3000\` and your Vercel URL

## 3. Host (Vercel) — one-click

1. Push this folder to GitHub (optional) **or** use the CLI below.
2. Click **Deploy with Vercel** in the README, or open:
   - With repo: \`https://vercel.com/new/clone?repository-url=YOUR_REPO\`
   - Without: https://vercel.com/new
3. Paste env vars from \`.env.local\` into Vercel → Project → Settings → Environment Variables.

CLI:
\`\`\`bash
bun install   # or npm install
npx vercel --yes
npx vercel --prod --yes
\`\`\`

## 4. Domain
Vercel → Project → Settings → Domains → add \`${prefs.customDomain || 'yourdomain.com'}\`
Point DNS (at your registrar):
- A record → \`76.76.21.21\` **or**
- CNAME → \`cname.vercel-dns.com\`

## 5. Publish
- [ ] Production URL loads
- [ ] Sign-up / login works (if auth enabled)
- [ ] Env vars set for Production
- [ ] Custom domain HTTPS green
- [ ] Tell the world

No mystery steps. If something fails, re-open IdeaSpeak Ship and re-copy the checklist.
`
}

function buildReadme(appName: string, appSlug: string, prefs: ShipPreferences): string {
  // Always ship a one-click Deploy button — repo-aware when GitHub URL is known
  const deployUrl = prefs.githubRepoUrl
    ? SHIP_LINKS.vercelDeployButton(prefs.githubRepoUrl)
    : SHIP_LINKS.vercelNew
  const deploy = `[![Deploy with Vercel](https://vercel.com/button)](${deployUrl})`

  return `# ${appName}

Built with [IdeaSpeak](https://ideaspeak-app.vercel.app) — speak an idea, ship a product.

## Quick start

\`\`\`bash
bun install
cp .env.example .env.local   # fill Supabase keys
bun dev
\`\`\`

Or with npm: \`npm install && npm run dev\`

Open http://localhost:3000

## Ship in 15 minutes

See **[SHIP.md](./SHIP.md)** for Supabase → Vercel → domain → launch.

${deploy}

## Stack

- Next.js 15 + React 19 + TypeScript + Tailwind
- Supabase (Auth + Postgres + RLS) — \`supabase/schema.sql\`
- Vercel-ready (\`vercel.json\`)

## AI handoff · multi-model polish

- \`AGENTS.md\` — rules for any agent
- \`.cursorrules\` + \`.cursor/rules/ideaspeak.md\` — Cursor
- \`IDEA-SPEAK-CONTEXT.md\` — product intent
- \`polish/prompts/\` — ready prompts for **Cursor, Grok, Claude, GPT**

\`\`\`bash
# optional quality loop (Grok CLI)
grok
# paste polish/prompts/grok.md then /check-work

# Cursor: open folder, paste polish/prompts/cursor.md into Agent
\`\`\`

## Project slug

\`${appSlug}\`
`
}

/** One-liner terminal commands user can copy */
export function shipCommands(prefs: ShipPreferences): { label: string; command: string }[] {
  return [
    {
      label: 'Install & run locally',
      command: 'bun install && cp .env.example .env.local && bun dev',
    },
    {
      label: 'Deploy to Vercel (CLI)',
      command: 'npx vercel --yes && npx vercel --prod --yes',
    },
    {
      label: 'Link domain (after deploy)',
      command: prefs.customDomain
        ? `npx vercel domains add ${prefs.customDomain}`
        : 'npx vercel domains add yourdomain.com',
    },
    {
      label: 'Open Supabase SQL (after login)',
      command: prefs.supabase.projectRef
        ? `# Paste supabase/schema.sql in:\n# https://supabase.com/dashboard/project/${prefs.supabase.projectRef}/sql/new`
        : '# Create project first, then open SQL Editor and run supabase/schema.sql',
    },
  ]
}
