import {
  Brain,
  Sparkles,
  Package,
  GitBranch,
  Copy,
  ImageIcon,
  Eye,
  Pencil,
} from 'lucide-react'
import { toast } from 'sonner'
import type { BuildScaffoldPlan } from '../lib/projects'
import {
  hasBuildContext,
  getOptimizedPrompt,
  NATIVE_TOOL_LABELS,
  type WorkspaceBuildContext,
} from '../lib/build-tools'

export interface BuildToolsPanelProps {
  ctx: WorkspaceBuildContext
  grokLive: boolean
  isBuilding: boolean
  isPlanning: boolean
  buildPlan: BuildScaffoldPlan | null
  hasPreview: boolean
  onGeneratePlan: () => void
  onGrokBuild: () => void
  onClearPlan: () => void
  onExportZip: () => void
  onExportGitHub: () => void
  onGenerateAsset: () => void
  onOpenPreview: () => void
  onOpenRefine: () => void
}

export function BuildToolsPanel({
  ctx,
  grokLive,
  isBuilding,
  isPlanning,
  buildPlan,
  hasPreview,
  onGeneratePlan,
  onGrokBuild,
  onClearPlan,
  onExportZip,
  onExportGitHub,
  onGenerateAsset,
  onOpenPreview,
  onOpenRefine,
}: BuildToolsPanelProps) {
  if (!hasBuildContext(ctx)) return null

  const canExport = hasBuildContext(ctx)
  const hasPlan = !!buildPlan
  const planReady = buildPlan?.status === 'ready'
  const userMessages = ctx.conversation.filter(
    (m) => !String(m.id).startsWith('voice-opener') && m.role === 'user'
  ).length

  const handleCopySpec = async () => {
    const prompt = getOptimizedPrompt(ctx)
    if (!prompt) {
      toast.error('Discuss your idea first — nothing to copy yet')
      return
    }
    try {
      await navigator.clipboard.writeText(prompt)
      toast.success('Build spec copied')
    } catch {
      toast.error('Could not copy to clipboard')
    }
  }

  return (
    <div className="glass border border-[#1f1f27] rounded-3xl p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-[#00ff88] font-medium">
            Grok Build
          </div>
          <div className="text-[10px] text-[#666] mt-0.5">
            Plan with agents, build with Grok, preview, refine, and ship
          </div>
        </div>
        {grokLive && (
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#00ff88]/40 text-[#00ff88] bg-[#00ff88]/10">
            Grok live
          </span>
        )}
      </div>

      {/* Primary actions */}
      {userMessages >= 1 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
          {!hasPlan && (
            <button
              type="button"
              onClick={onGeneratePlan}
              disabled={isBuilding || isPlanning}
              className="py-3 px-4 rounded-2xl border border-[#1f1f27] font-semibold text-sm flex items-center justify-center gap-2 hover:border-[#00ff88]/50 hover:bg-white/5 disabled:opacity-50"
            >
              <Brain size={16} className="text-[#00ff88]" />
              {isPlanning
                ? 'Agents planning…'
                : grokLive
                  ? 'Multi-Agent Plan'
                  : 'Generate Plan'}
            </button>
          )}
          <button
            type="button"
            onClick={onGrokBuild}
            disabled={isBuilding || isPlanning}
            title={
              planReady
                ? NATIVE_TOOL_LABELS.build.description
                : NATIVE_TOOL_LABELS.grokBuild.description
            }
            className="py-3 px-4 rounded-2xl bg-[#00ff88] text-[#0a0a0f] font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#00ff88]/90 disabled:opacity-50 sm:col-span-2"
          >
            <Sparkles size={16} />
            {isBuilding
              ? 'Grok Build running…'
              : planReady
                ? 'Grok Build from Plan'
                : 'Grok Build'}
          </button>
          {hasPlan && (
            <button
              type="button"
              onClick={onClearPlan}
              className="py-2 px-4 rounded-2xl border border-[#1f1f27] text-xs text-[#888] hover:text-[#e8e8f0] hover:border-[#2a2a3a]"
            >
              Discard plan
            </button>
          )}
        </div>
      )}

      {/* Toolkit */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
        <button
          type="button"
          onClick={onOpenPreview}
          disabled={!hasPreview && !planReady}
          title={NATIVE_TOOL_LABELS.preview.description}
          className="py-3 px-3 rounded-2xl border border-[#1f1f27] text-sm font-medium hover:border-[#00ff88]/50 hover:bg-white/5 disabled:opacity-40 flex flex-col items-center gap-1"
        >
          <Eye size={16} className="text-[#00ff88]" />
          <span>Preview</span>
        </button>

        <button
          type="button"
          onClick={onOpenRefine}
          disabled={!hasPreview}
          title={NATIVE_TOOL_LABELS.refine.description}
          className="py-3 px-3 rounded-2xl border border-[#1f1f27] text-sm font-medium hover:border-[#00ff88]/50 hover:bg-white/5 disabled:opacity-40 flex flex-col items-center gap-1"
        >
          <Pencil size={16} className="text-[#00ff88]" />
          <span>Refine</span>
        </button>

        <button
          type="button"
          onClick={onGenerateAsset}
          disabled={!hasPreview || isBuilding}
          title={NATIVE_TOOL_LABELS.asset.description}
          className="py-3 px-3 rounded-2xl border border-[#1f1f27] text-sm font-medium hover:border-[#00ff88]/50 hover:bg-white/5 disabled:opacity-40 flex flex-col items-center gap-1"
        >
          <ImageIcon size={16} className="text-[#00ff88]" />
          <span>Assets</span>
        </button>

        <button
          type="button"
          onClick={onExportZip}
          disabled={isBuilding || !canExport}
          title={NATIVE_TOOL_LABELS.zip.description}
          className="py-3 px-3 rounded-2xl border border-[#1f1f27] text-sm font-medium hover:border-[#00ff88]/50 hover:bg-white/5 disabled:opacity-50 flex flex-col items-center gap-1"
        >
          <Package size={16} className="text-[#00ff88]" />
          <span>ZIP</span>
        </button>

        <button
          type="button"
          onClick={onExportGitHub}
          disabled={isBuilding || !canExport}
          title={NATIVE_TOOL_LABELS.github.description}
          className="py-3 px-3 rounded-2xl border border-[#1f1f27] text-sm font-medium hover:border-[#00ff88]/50 hover:bg-white/5 disabled:opacity-50 flex flex-col items-center gap-1"
        >
          <GitBranch size={16} className="text-[#00ff88]" />
          <span>GitHub</span>
        </button>

        <button
          type="button"
          onClick={handleCopySpec}
          disabled={isBuilding}
          title={NATIVE_TOOL_LABELS.copySpec.description}
          className="py-3 px-3 rounded-2xl border border-[#1f1f27] text-sm font-medium hover:border-[#00ff88]/50 hover:bg-white/5 disabled:opacity-50 flex flex-col items-center gap-1"
        >
          <Copy size={16} className="text-[#888]" />
          <span>Copy spec</span>
        </button>
      </div>

      <div className="mt-3 pt-3 border-t border-[#1f1f27] text-[10px] text-[#555]">
        {hasPreview
          ? 'Grok Build preview live · voice refine · xAI assets · Next.js export'
          : planReady
            ? 'Plan ready — hit Grok Build to execute the scaffold'
            : 'Discuss your idea, then Grok Build for a live preview'}
      </div>
    </div>
  )
}