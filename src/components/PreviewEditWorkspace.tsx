/**
 * Preview + manual code edit — split editor and live preview in one panel.
 */

import { useEffect, useRef } from 'react'
import {
  SandpackProvider,
  SandpackLayout,
  SandpackCodeEditor,
  SandpackPreview,
  SandpackFileExplorer,
  useSandpack,
} from '@codesandbox/sandpack-react'
import { sandpackDark } from '@codesandbox/sandpack-themes'

type PreviewEngine = 'local' | 'sandpack' | 'sandbox'
type WorkspaceTab = 'preview' | 'code'

type FileMap = Record<string, string>

interface PreviewEditWorkspaceProps {
  workspaceTab: WorkspaceTab
  previewEngine: PreviewEngine
  hasBuilt: boolean
  files: FileMap
  visibleFiles: string[]
  previewRevision: number
  onFilesChange: (files: FileMap) => void
  localPreviewSrc?: string | null
  sandboxPreviewSrc?: string | null
}

/** Bubble Sandpack editor changes up to IdeaSpeak state (projects + localhost sync). */
function SandpackFilesBridge({ onFilesChange }: { onFilesChange: (files: FileMap) => void }) {
  const { sandpack } = useSandpack()
  const lastEmit = useRef('')
  const booted = useRef(false)

  useEffect(() => {
    const flat: FileMap = {}
    for (const [path, file] of Object.entries(sandpack.files)) {
      if (file?.code != null) flat[path] = file.code
    }
    const sig = JSON.stringify(flat)
    if (!booted.current) {
      booted.current = true
      lastEmit.current = sig
      return
    }
    if (sig === lastEmit.current) return
    lastEmit.current = sig
    onFilesChange(flat)
  }, [sandpack.files, onFilesChange])

  return null
}

function PreviewChrome() {
  return (
    <div className="shrink-0 flex items-center justify-between gap-2 py-2 px-3 border-b border-[#14141c] bg-[#0a0a0f]">
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-[#ff5f57]" />
        <span className="w-2 h-2 rounded-full bg-[#febc2e]" />
        <span className="w-2 h-2 rounded-full bg-[#28c840]" />
        <span className="ml-2 text-[10px] text-[#3a3a45] font-medium tracking-wide">
          LIVE PREVIEW
        </span>
      </div>
      <span className="text-[10px] text-[#555]">Edit code · preview updates live</span>
    </div>
  )
}

function ExternalPreviewFrame({ src, title }: { src: string; title: string }) {
  return (
    <iframe
      src={src}
      title={title}
      className="w-full h-full border-0 bg-[#0a0a0f]"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
    />
  )
}

function WorkspaceBody({
  workspaceTab,
  previewEngine,
  localPreviewSrc,
  sandboxPreviewSrc,
}: {
  workspaceTab: WorkspaceTab
  previewEngine: PreviewEngine
  localPreviewSrc?: string | null
  sandboxPreviewSrc?: string | null
}) {
  const useExternalPreview =
    workspaceTab === 'preview' &&
    ((previewEngine === 'local' && localPreviewSrc) ||
      (previewEngine === 'sandbox' && sandboxPreviewSrc))

  if (workspaceTab === 'code') {
    return (
      <SandpackLayout style={{ height: '100%', border: 'none', borderRadius: 0 }}>
        <SandpackFileExplorer style={{ minWidth: 140, maxWidth: 180 }} />
        <SandpackCodeEditor
          showTabs
          showLineNumbers
          closableTabs
          style={{ flex: 1, height: '100%' }}
        />
      </SandpackLayout>
    )
  }

  if (useExternalPreview) {
    const src = previewEngine === 'local' ? localPreviewSrc! : sandboxPreviewSrc!
    return (
      <div className="h-full flex flex-col min-h-0">
        <PreviewChrome />
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          <div className="h-[38%] lg:h-full lg:w-[44%] shrink-0 border-b lg:border-b-0 lg:border-r border-[#14141c] min-h-0">
            <SandpackLayout style={{ height: '100%', border: 'none', borderRadius: 0 }}>
              <SandpackFileExplorer style={{ minWidth: 120, maxWidth: 150 }} />
              <SandpackCodeEditor
                showTabs
                showLineNumbers
                closableTabs
                style={{ flex: 1, height: '100%' }}
              />
            </SandpackLayout>
          </div>
          <div className="flex-1 min-h-0 min-w-0">
            <ExternalPreviewFrame
              src={src}
              title={previewEngine === 'local' ? 'Localhost preview' : 'Sandbox preview'}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <PreviewChrome />
      <SandpackLayout style={{ height: '100%', flex: 1, border: 'none', borderRadius: 0 }}>
        <SandpackFileExplorer style={{ minWidth: 120, maxWidth: 150 }} />
        <SandpackCodeEditor
          showTabs
          showLineNumbers
          closableTabs
          style={{ flex: 1, height: '100%', minWidth: 0 }}
        />
        <SandpackPreview
          style={{ height: '100%', flex: 1, minHeight: 0, minWidth: 0 }}
          showOpenInCodeSandbox={false}
          showRefreshButton
          showNavigator={false}
          showOpenNewtab={false}
        />
      </SandpackLayout>
    </div>
  )
}

export function PreviewEditWorkspace({
  workspaceTab,
  previewEngine,
  hasBuilt,
  files,
  visibleFiles,
  previewRevision,
  onFilesChange,
  localPreviewSrc,
  sandboxPreviewSrc,
}: PreviewEditWorkspaceProps) {
  const appTsxLength = (files['src/App.tsx'] || '').length

  return (
    <div className="absolute inset-0 h-full w-full min-h-0">
      <SandpackProvider
        key={`edit-${previewRevision}-${hasBuilt}-${appTsxLength}`}
        template="react-ts"
        theme={sandpackDark}
        files={files}
        className="!h-full !min-h-0"
        options={{
          activeFile: 'src/App.tsx',
          visibleFiles,
          recompileMode: 'immediate',
          recompileDelay: 120,
          autorun: true,
          autoReload: true,
          initMode: 'immediate',
        }}
        customSetup={{
          dependencies: {
            react: '^18.2.0',
            'react-dom': '^18.2.0',
          },
          entry: '/src/main.tsx',
        }}
      >
        <SandpackFilesBridge onFilesChange={onFilesChange} />
        <WorkspaceBody
          workspaceTab={workspaceTab}
          previewEngine={previewEngine}
          localPreviewSrc={localPreviewSrc}
          sandboxPreviewSrc={sandboxPreviewSrc}
        />
      </SandpackProvider>
    </div>
  )
}