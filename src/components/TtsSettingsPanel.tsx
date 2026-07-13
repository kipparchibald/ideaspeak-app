import { useState } from 'react'
import { Volume2, Play, Loader2 } from 'lucide-react'
import {
  GROK_VOICES,
  getTtsProvider,
  setTtsProvider,
  getTtsVoice,
  setTtsVoice,
  isTtsEnabled,
  setTtsEnabled,
  testVoice,
  stopSpeaking,
  type TtsProvider,
  type GrokVoiceId,
} from '../lib/tts'

export function TtsSettingsPanel() {
  const [provider, setProviderState] = useState<TtsProvider>(() => getTtsProvider())
  const [voice, setVoiceState] = useState<GrokVoiceId>(() => getTtsVoice())
  const [enabled, setEnabledState] = useState(() => isTtsEnabled())
  const [testing, setTesting] = useState(false)
  const [testMsg, setTestMsg] = useState('')

  function onProvider(p: TtsProvider) {
    setProviderState(p)
    setTtsProvider(p)
  }

  function onVoice(v: GrokVoiceId) {
    setVoiceState(v)
    setTtsVoice(v)
  }

  function onEnabled(on: boolean) {
    setEnabledState(on)
    setTtsEnabled(on)
    if (!on) stopSpeaking()
  }

  async function handleTest() {
    setTesting(true)
    setTestMsg('')
    try {
      await testVoice(voice)
      setTestMsg('Playing…')
    } catch (e: any) {
      setTestMsg(e?.message || 'Test failed — falling back or check xAI key')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="rounded-2xl border border-[#1f1f27] bg-[#0a0a0f] p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Volume2 size={15} className="text-[#00ff88]" />
          <span className="text-[13px] font-semibold text-[#e8e8f0]">Voice Output (TTS)</span>
        </div>
        <label className="flex items-center gap-2 text-[12px] text-[#888] cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onEnabled(e.target.checked)}
            className="accent-[#00ff88]"
          />
          Enabled
        </label>
      </div>

      <p className="text-[11px] text-[#666] leading-relaxed">
        Grok TTS uses your xAI key for natural voices. Auto falls back to browser speech if Grok is unavailable.
      </p>

      <div className="space-y-1.5">
        <label className="text-[11px] text-[#555] uppercase tracking-wider">Provider</label>
        <select
          value={provider}
          onChange={(e) => onProvider(e.target.value as TtsProvider)}
          disabled={!enabled}
          className="w-full bg-[#07070c] border border-[#1f1f27] rounded-xl px-3 py-2.5 text-[13px] text-[#e8e8f0] outline-none focus:border-[#00ff88]/40 disabled:opacity-40"
        >
          <option value="auto">Auto (Grok → Browser)</option>
          <option value="grok">Grok TTS only</option>
          <option value="browser">Browser only (free)</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] text-[#555] uppercase tracking-wider">Grok Voice</label>
        <select
          value={voice}
          onChange={(e) => onVoice(e.target.value as GrokVoiceId)}
          disabled={!enabled || provider === 'browser'}
          className="w-full bg-[#07070c] border border-[#1f1f27] rounded-xl px-3 py-2.5 text-[13px] text-[#e8e8f0] outline-none focus:border-[#00ff88]/40 disabled:opacity-40"
        >
          {GROK_VOICES.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label} — {v.tone}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleTest}
          disabled={!enabled || testing}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#00ff88]/15 border border-[#00ff88]/30 text-[12px] font-semibold text-[#00ff88] hover:bg-[#00ff88]/25 disabled:opacity-40 transition-colors"
        >
          {testing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          Test voice
        </button>
        <button
          type="button"
          onClick={() => stopSpeaking()}
          className="px-3 py-2 rounded-xl border border-[#1f1f27] text-[12px] text-[#666] hover:text-[#ccc] hover:border-[#333]"
        >
          Stop
        </button>
        {testMsg && <span className="text-[11px] text-[#666]">{testMsg}</span>}
      </div>
    </div>
  )
}
