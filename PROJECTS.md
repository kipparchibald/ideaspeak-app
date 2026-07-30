# Kipp Archibald — Product Portfolio (DO NOT MIX)

These are **three separate businesses / products**. Never merge codebases, status docs, brands, deploys, or features across them.

| Product | What it is | Canonical repo | Live / notes |
|---------|------------|----------------|--------------|
| **IdeaSpeak** | Voice-first xAI app builder (speak → live preview → ship) | [`kipparchibald/ideaspeak-app`](https://github.com/kipparchibald/ideaspeak-app) | [ideaspeak-app.vercel.app](https://ideaspeak-app.vercel.app) · related: `ideaspeak-platform` (older batch prototype) |
| **SummitForge** | Real-estate operating system (GIS, CRM, deals, Eastern Idaho / Archibald-Bagley) | [`kipparchibald/SummitForge-RE-OS`](https://github.com/kipparchibald/SummitForge-RE-OS) | Separate product — **not** IdeaSpeak |
| **Split Rock Construction** | New-home builder website + client portal (Rigby, Idaho) | [`kipparchibald/split-rock-construction`](https://github.com/kipparchibald/split-rock-construction) | Separate brand — construction only |

## Rules for any AI / agent session

1. **One product per workspace turn.** Name the product before editing files.
2. **Only open / commit the matching repo.** Do not copy RE features into IdeaSpeak, or IdeaSpeak builder chrome into SummitForge / Split Rock.
3. **No shared “mega app.”** Shared learnings (design tokens, deploy tips) may be re-implemented per product — never import across repos.
4. **Status & polish passes stay in-repo.** `docs/STATUS.md` for IdeaSpeak ≠ SummitForge score ≠ Split Rock launch checklist.
5. **Voxli** (if present) is a separate experiment — do not treat as IdeaSpeak or SummitForge unless the user says so.
6. If the user is ambiguous, **ask which of the three** — never guess and scaffold the wrong one.

## Current workspace

This checkout is **IdeaSpeak only** (`ideaspeak-app`).  
SummitForge and Split Rock live in their own remotes; open those repos when the user asks for them.
