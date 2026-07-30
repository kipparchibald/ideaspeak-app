# Confidential Box — hands-off ship

**One vault. Zero dashboard hopping.**

## What it is
Encrypted secret storage in the browser (AES-GCM). You paste GitHub, Vercel, Supabase, and xAI keys **once**. Launch Autopilot then:

1. Creates a private GitHub repo and pushes the production scaffold  
2. Creates a Vercel project linked to that repo  
3. Sets Supabase env vars on Vercel  
4. Triggers a production deploy  

No pasting into Vercel/Supabase/GitHub UIs per app.

## Security
- Secrets never committed to git  
- Optional passphrase lock (recommended on shared machines)  
- Without passphrase: device-local encryption key (this browser only)  
- Server Autopilot (Railway) is separate — uses server env, not this box  
- Do not paste secrets into chat with agents; use the in-app Vault UI  

## Minimum for hands-off
| Secret | Required |
|--------|----------|
| GitHub PAT (`repo`) | Yes |
| Vercel token | Yes |
| Supabase URL + anon | Recommended for data apps |
| xAI key | For live Grok (simulator works without) |

## Open it
Header **Vault** · Settings → **Open Confidential Box** · Launch Autopilot tip link

## Agent note
Autonomous agents should instruct the user to fill Confidential Box once, then run Launch Autopilot — never request secrets in chat.
