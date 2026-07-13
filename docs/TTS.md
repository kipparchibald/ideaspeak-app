# Grok TTS Integration (IdeaSpeak)

## What shipped

1. **api/tts.js** — Edge proxy to `https://api.x.ai/v1/tts` (server key only in prod)
2. **src/lib/tts.ts** — `speak()`, `stopSpeaking()`, provider auto/grok/browser, voice prefs
3. **src/components/TtsSettingsPanel.tsx** — Settings UI (provider, voice, test)
4. Wired into **ApiSetupPanel** under API Connections

## How to use in code

```ts
import { speak, stopSpeaking } from './lib/tts'

// After assistant reply:
await speak(assistantText, { voiceMode: true })

// Cancel:
stopSpeaking()
```

## Settings (localStorage)

- `ideaspeak_tts_provider`: auto | grok | browser
- `ideaspeak_tts_voice`: eve, ara, leo, …
- `ideaspeak_tts_enabled`: true | false

## Requirements

- `XAI_API_KEY` on Vercel (or local dev) for Grok TTS
- Without key, Auto falls back to browser `speechSynthesis`

## Cost

Roughly $15 / 1M characters via xAI TTS API.

## Next (optional)

- Call `speak()` from App.tsx wherever assistant messages are appended
- Streaming WebSocket TTS for lower latency
- Wire SummitForge agent responses to same helper
