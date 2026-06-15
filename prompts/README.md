# IdeaSpeak xAI Prompts — Make It Kick Ass

These prompts are designed to make the IdeaSpeak voice + build experience **significantly better than Lovable** (and every other AI app builder).

## Files

- `IdeaSpeak-xAI-Agent-System-Prompt.md` — The main system prompt for the coding/build agent (use this with xAI/Grok models for the core builder on ideaspeak.dev).
- `IdeaSpeak-Voice-Refiner-Prompt.md` — The critical pre-processing layer. Turns raw, messy voice transcripts into rich, structured, high-signal briefs + an optimized prompt for the build agent. This layer alone makes IdeaSpeak feel magical from the first spoken word.
- `Lovable-Optimized-Refined-Prompt.md` — If you are still (or also) bridging to Lovable via the Chrome extension, use this to generate the prompt that gets auto-injected. It produces dramatically better Lovable output than raw speech.

## Why This Beats Lovable

Lovable's agent is good (opinionated React/Vite + Supabase, strong design system rules, agent mode, visual edits). But it has known weaknesses in deep systems reasoning, generic taste over time, stack lock-in, credit-burn debugging loops, and (especially) understanding messy spoken input.

IdeaSpeak with these prompts + xAI:
- Understands *spoken* ideas at a much higher level (refiner + voice-native agent).
- Superior reasoning for complex full-stack, auth, realtime, data modeling (xAI strength).
- Higher, more specific design taste (references real great products, forces semantic tokens + motion + polish).
- Proactive and ambitious (suggests and implements high-leverage features the user didn't explicitly ask for).
- Flexible modern stack (Next.js 15 default when it wins, Convex/Supabase intelligently chosen, easy xAI features *inside* the generated apps).
- Production reality from v1 (auth that works, errors handled, performance, accessibility, launch paths).
- Joyful Grok personality that matches the "speak your idea" vibe.

## Recommended Architecture on the Website

1. **Voice capture** (browser SpeechRecognition or better custom) → raw transcript + audio context if available.
2. **Voice Refiner** (this prompt, fast xAI model) → structured brief + "Prompt for Build Agent".
3. **Main IdeaSpeak xAI Build Agent** (the big system prompt) + full tool suite:
   - File system tools (read, precise edit, create, search, etc.)
   - Sandbox terminal (install, build, typecheck, logs)
   - Preview iframe control + console/network inspection
   - Web search + real-time info
   - xAI vision (analyze user screenshots or "see" the preview)
   - xAI image generation for custom assets/logos/illustrations (no placeholders)
4. Live preview + chat/voice feedback loop.
5. One-click export GitHub + deploy (Vercel or other).
6. Optional: "Send to Lovable" button using the bridge for users who want to compare or continue there.

## Quick Start

- Copy the Agent System Prompt into your main builder agent's system message.
- Implement (or call xAI with) the Voice Refiner on every voice submission.
- Feed the refiner's output + full history + current project context (file tree + key files + errors) into the agent.
- Give the agent powerful parallel tool calling and the platform primitives (edit code → instantly see in preview).
- For the Lovable bridge path: run the refiner (or the Lovable-specific version) and send the resulting optimized prompt via `sendToLovable()`.

## Iteration Tips

- Log every voice turn + the refiner output + agent actions. Use this data to further fine-tune or add memory.
- After the agent makes changes, have a lightweight "verifier" pass (another prompt or same model) that checks for build errors, missing states, accessibility, mobile issues, etc., before surfacing to the user.
- Expose "Voice mode" vs "Text mode" — in pure voice, bias the agent even more toward short speakable responses + big visible progress in the preview.
- Lean into xAI differentiators inside generated apps: "Add Grok-powered idea expander / voice command center / image understanding to this app?"

## Files to Customize for Your Platform

In the main agent prompt, append your exact tool schemas and any special response formats your frontend expects (e.g. specific XML tags for actions, or just rely on tool calling).

Update the date, current stack recommendations, and any IdeaSpeak-specific personality notes as you evolve the product.

## Next Level Ideas (Once Core Works)

- Multi-agent: one "product strategist" sub-agent, one "design system guardian", one "implementation executor".
- Persistent user voice profile: "Kipp likes dense information architecture, hates modals, loves keyboard everything."
- Automatic generation of Loom-style demo videos or beautiful marketing screenshots of the built app using image/video tools.
- "Improve this app with xAI" one-click that wires real Grok capabilities into the generated product.

These prompts are the foundation. The rest is execution on the platform side (great tools, fast feedback loops, beautiful hosting of the builder itself).

Ship something people can't stop talking about.

— Built for IdeaSpeak to own the "speak your idea → real app" category.
