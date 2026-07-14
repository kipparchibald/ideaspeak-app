/**
 * E2B sandbox manager — real Vite preview in isolated cloud VMs.
 * Graceful stub when E2B_API_KEY is missing.
 */

import { Sandbox } from 'e2b'
import { PREVIEW_ENTRY_MAIN } from '../src/lib/preview-scaffold.ts'

const SANDBOX_TTL_MS = 30 * 60 * 1000 // 30 minutes
const VITE_PORT = 5174
const APP_DIR = '/home/user/app'

export type SandboxStatus =
  | 'stub'
  | 'creating'
  | 'installing'
  | 'starting'
  | 'ready'
  | 'error'

export interface SandboxSession {
  sandboxId: string
  projectId: string
  createdAt: number
  expiresAt: number
  previewUrl: string | null
  status: SandboxStatus
  logs: string[]
  isStub: boolean
  error?: string
}

type FileMap = Record<string, string>

/** projectId → session */
const sessions = new Map<string, SandboxSession>()
/** sandboxId → projectId */
const sandboxIndex = new Map<string, string>()

function isE2bEnabled(): boolean {
  return !!process.env.E2B_API_KEY?.trim()
}

function appendLog(session: SandboxSession, line: string) {
  const stamped = `[${new Date().toISOString()}] ${line}`
  session.logs.push(stamped)
  if (session.logs.length > 500) session.logs.splice(0, session.logs.length - 500)
}

function viteScaffold(projectId: string): FileMap {
  const slug = projectId.replace(/[^a-z0-9-]/gi, '-').toLowerCase() || 'ideaspeak-app'
  return {
    'package.json': JSON.stringify(
      {
        name: slug,
        private: true,
        type: 'module',
        scripts: {
          dev: 'vite',
          build: 'tsc -b && vite build',
          preview: 'vite preview',
        },
        dependencies: {
          react: '^19.0.0',
          'react-dom': '^19.0.0',
        },
        devDependencies: {
          '@types/react': '^19.0.0',
          '@types/react-dom': '^19.0.0',
          '@vitejs/plugin-react': '^4.3.4',
          typescript: '^5.7.0',
          vite: '^6.0.0',
        },
      },
      null,
      2,
    ),
    'index.html': `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>IdeaSpeak Preview</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
    'vite.config.ts': `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: ${VITE_PORT},
    strictPort: true,
  },
})
`,
    'tsconfig.json': JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          lib: ['ES2022', 'DOM', 'DOM.Iterable'],
          module: 'ESNext',
          skipLibCheck: true,
          moduleResolution: 'bundler',
          allowImportingTsExtensions: true,
          isolatedModules: true,
          moduleDetection: 'force',
          noEmit: true,
          jsx: 'react-jsx',
          strict: true,
        },
        include: ['src'],
      },
      null,
      2,
    ),
    'src/main.tsx': PREVIEW_ENTRY_MAIN,
    'src/index.css': `* { box-sizing: border-box; margin: 0; padding: 0; }
html, body, #root { height: 100%; }
body {
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  background: #0a0a0f;
  color: #e8e8f0;
}
`,
    'src/App.tsx': `export default function App() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <p style={{ color: '#00ff88', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          IdeaSpeak Sandbox
        </p>
        <h1 style={{ fontSize: 28, marginTop: 8 }}>Booting real preview…</h1>
        <p style={{ color: '#888', marginTop: 12, lineHeight: 1.5 }}>
          npm install + Vite dev server running in E2B.
        </p>
      </div>
    </div>
  )
}
`,
  }
}

function normalizeUserFiles(files: FileMap): FileMap {
  const out: FileMap = {}
  for (const [rawPath, content] of Object.entries(files)) {
    const path = rawPath.replace(/^\//, '')
    if (!path || typeof content !== 'string') continue
    // Sandpack package.json is minimal — keep scaffold version
    if (path === 'package.json') continue
    out[path] = content
  }
  return out
}

function mergeFiles(projectId: string, files: FileMap): FileMap {
  return { ...viteScaffold(projectId), ...normalizeUserFiles(files) }
}

async function writeAllFiles(sandbox: Sandbox, files: FileMap, session: SandboxSession) {
  const entries = Object.entries(files).map(([path, data]) => ({
    path: `${APP_DIR}/${path}`,
    data,
  }))
  appendLog(session, `Writing ${entries.length} files to ${APP_DIR}`)
  await sandbox.files.write(entries)
}

async function bootDevServer(sandbox: Sandbox, session: SandboxSession) {
  session.status = 'installing'
  appendLog(session, 'Running npm install…')

  const install = await sandbox.commands.run(`cd ${APP_DIR} && npm install`, {
    timeoutMs: 240_000,
  })
  if (install.stdout) appendLog(session, install.stdout.slice(-4000))
  if (install.stderr) appendLog(session, install.stderr.slice(-2000))
  if (install.exitCode !== 0) {
    throw new Error(install.error || `npm install failed (exit ${install.exitCode})`)
  }

  session.status = 'starting'
  appendLog(session, `Starting Vite on port ${VITE_PORT}…`)
  await sandbox.commands.run(
    `cd ${APP_DIR} && npm run dev -- --host 0.0.0.0 --port ${VITE_PORT}`,
    { background: true },
  )

  // Give Vite a moment to bind
  await new Promise((r) => setTimeout(r, 3500))
}

function previewUrlFromSandbox(sandbox: Sandbox): string {
  return `https://${sandbox.getHost(VITE_PORT)}`
}

function stubSession(projectId: string, reason: string): SandboxSession {
  const now = Date.now()
  const session: SandboxSession = {
    sandboxId: `stub-${now}`,
    projectId,
    createdAt: now,
    expiresAt: now + SANDBOX_TTL_MS,
    previewUrl: null,
    status: 'stub',
    logs: [reason],
    isStub: true,
    error: reason,
  }
  sessions.set(projectId, session)
  return session
}

export function isSandboxAvailable(): boolean {
  return isE2bEnabled()
}

export function getSession(projectId: string): SandboxSession | undefined {
  return sessions.get(projectId)
}

export function getSessionBySandboxId(sandboxId: string): SandboxSession | undefined {
  const projectId = sandboxIndex.get(sandboxId)
  if (!projectId) return undefined
  return sessions.get(projectId)
}

export async function destroySandbox(sandboxId: string): Promise<boolean> {
  const projectId = sandboxIndex.get(sandboxId)
  if (!projectId) return false

  const session = sessions.get(projectId)
  sessions.delete(projectId)
  sandboxIndex.delete(sandboxId)

  if (session?.isStub) return true

  try {
    const sandbox = await Sandbox.connect(sandboxId)
    await sandbox.kill()
    appendLog(session!, 'Sandbox destroyed')
    return true
  } catch {
    return true
  }
}

export async function destroyProjectSandbox(projectId: string): Promise<void> {
  const existing = sessions.get(projectId)
  if (existing) await destroySandbox(existing.sandboxId)
}

export function getPreviewUrl(sandboxId: string): string | null {
  const session = getSessionBySandboxId(sandboxId)
  return session?.previewUrl ?? null
}

export function getLogs(sandboxId: string): string[] {
  const session = getSessionBySandboxId(sandboxId)
  return session?.logs ?? []
}

export async function runCommand(
  sandboxId: string,
  command: string,
): Promise<{ output: string; exitCode: number; error?: string }> {
  const session = getSessionBySandboxId(sandboxId)
  if (!session) throw new Error('Sandbox session not found')
  if (session.isStub) {
    return { output: `[stub] ${command}`, exitCode: 0 }
  }

  appendLog(session, `$ ${command}`)
  const sandbox = await Sandbox.connect(sandboxId)
  const result = await sandbox.commands.run(command, { timeoutMs: 120_000 })
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n')
  appendLog(session, output.slice(-4000) || `(exit ${result.exitCode})`)
  return { output, exitCode: result.exitCode, error: result.error }
}

export async function syncFiles(sandboxId: string, files: FileMap): Promise<SandboxSession> {
  const session = getSessionBySandboxId(sandboxId)
  if (!session) throw new Error('Sandbox session not found')
  if (session.isStub) return session

  const sandbox = await Sandbox.connect(sandboxId)
  const merged = normalizeUserFiles(files)
  const entries = Object.entries(merged).map(([path, data]) => ({
    path: `${APP_DIR}/${path}`,
    data,
  }))
  appendLog(session, `Syncing ${entries.length} files`)
  await sandbox.files.write(entries)
  session.expiresAt = Date.now() + SANDBOX_TTL_MS
  await sandbox.setTimeout(SANDBOX_TTL_MS)
  return session
}

export async function createSandbox(
  projectId: string,
  files: FileMap,
): Promise<SandboxSession> {
  if (!isE2bEnabled()) {
    return stubSession(
      projectId,
      'E2B_API_KEY not configured — set it in .env.local or Railway variables.',
    )
  }

  await destroyProjectSandbox(projectId)

  const now = Date.now()
  const session: SandboxSession = {
    sandboxId: '',
    projectId,
    createdAt: now,
    expiresAt: now + SANDBOX_TTL_MS,
    previewUrl: null,
    status: 'creating',
    logs: [],
    isStub: false,
  }
  sessions.set(projectId, session)

  try {
    appendLog(session, `Creating E2B sandbox for ${projectId}`)
    const sandbox = await Sandbox.create({
      timeoutMs: SANDBOX_TTL_MS,
      metadata: { projectId, app: 'ideaspeak' },
    })

    session.sandboxId = sandbox.sandboxId
    sandboxIndex.set(sandbox.sandboxId, projectId)

    const merged = mergeFiles(projectId, files)
    await writeAllFiles(sandbox, merged, session)
    await bootDevServer(sandbox, session)

    session.previewUrl = previewUrlFromSandbox(sandbox)
    session.status = 'ready'
    appendLog(session, `Preview ready: ${session.previewUrl}`)
    return session
  } catch (e: any) {
    session.status = 'error'
    session.error = e?.message || 'Sandbox creation failed'
    appendLog(session, `Error: ${session.error}`)
    return session
  }
}

/** Evict expired sessions and kill remote sandboxes */
export async function cleanupExpiredSessions(): Promise<void> {
  const now = Date.now()
  for (const [projectId, session] of sessions.entries()) {
    if (session.expiresAt > now) continue
    await destroySandbox(session.sandboxId)
    sessions.delete(projectId)
  }
}

// Periodic TTL sweep
setInterval(() => {
  void cleanupExpiredSessions()
}, 60_000)