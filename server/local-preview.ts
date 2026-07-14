/**
 * Local Vite preview — real localhost dev server for generated app files.
 * Iframe in IdeaSpeak points at :5174 (proxied as /preview in Vite dev).
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Subprocess } from 'bun'

const PREVIEW_PORT = Number(process.env.IDEASPEAK_PREVIEW_PORT || 5174)
const PREVIEW_URL = `http://localhost:${PREVIEW_PORT}`
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const RUNTIME_DIR = join(ROOT, '.preview-runtime')

type FileMap = Record<string, string>

let viteProc: Subprocess | null = null
let booting: Promise<void> | null = null
let lastSyncAt = 0
let lastError: string | null = null

function viteScaffold(): FileMap {
  return {
    'index.html': `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>IdeaSpeak Live Preview</title>
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
    host: '127.0.0.1',
    port: ${PREVIEW_PORT},
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
    'src/main.tsx': `import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
`,
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
      <p style={{ color: '#888' }}>Waiting for IdeaSpeak build…</p>
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
    if (path === 'package.json' || path === 'vite.config.ts') continue
    out[path] = content
  }
  return out
}

async function writeMergedFiles(files: FileMap) {
  const merged = { ...viteScaffold(), ...normalizeUserFiles(files) }
  for (const [rel, data] of Object.entries(merged)) {
    const full = join(RUNTIME_DIR, rel)
    await mkdir(dirname(full), { recursive: true })
    await writeFile(full, data, 'utf8')
  }
}

async function probePreviewReady(): Promise<boolean> {
  try {
    const res = await fetch(PREVIEW_URL, { signal: AbortSignal.timeout(1200) })
    return res.ok
  } catch {
    return false
  }
}

async function ensureViteRunning(): Promise<void> {
  if (await probePreviewReady()) return
  if (booting) return booting

  booting = (async () => {
    lastError = null
    await mkdir(RUNTIME_DIR, { recursive: true })

    if (viteProc) {
      try {
        viteProc.kill()
      } catch {
        /* ignore */
      }
      viteProc = null
    }

    const viteBin = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')
    viteProc = Bun.spawn(['bun', viteBin, '--config', 'vite.config.ts'], {
      cwd: RUNTIME_DIR,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, FORCE_COLOR: '0' },
    })

    const deadline = Date.now() + 20_000
    while (Date.now() < deadline) {
      if (await probePreviewReady()) return
      await Bun.sleep(400)
    }
    lastError = 'Local preview server did not start in time'
    throw new Error(lastError)
  })()

  try {
    await booting
  } finally {
    booting = null
  }
}

export async function syncLocalPreview(files: FileMap) {
  await writeMergedFiles(files)
  lastSyncAt = Date.now()
  await ensureViteRunning()
  // Brief pause for Vite HMR after file writes
  await Bun.sleep(350)
  const ready = await probePreviewReady()
  return {
    previewUrl: PREVIEW_URL,
    proxyPath: '/preview/',
    ready,
    port: PREVIEW_PORT,
    syncedAt: lastSyncAt,
    error: ready ? null : lastError,
  }
}

export async function getLocalPreviewStatus() {
  const ready = await probePreviewReady()
  return {
    previewUrl: PREVIEW_URL,
    proxyPath: '/preview/',
    port: PREVIEW_PORT,
    running: ready || viteProc != null,
    ready,
    lastSyncAt,
    error: lastError,
  }
}

export async function waitForLocalPreviewReady(timeoutMs = 25_000): Promise<string | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await probePreviewReady()) return PREVIEW_URL
    await Bun.sleep(400)
  }
  return null
}