---
name: deployment-workflow
description: The exact ship-to-production workflow for Spiderweb - one-block git commands, Vercel behavior, URL rules, and post-deploy verification. Use every time code needs to go live, when a deploy "didn't take," or when setting up any external service that points at the app.
---

# Deployment Workflow

## Standard ship (one paste block — always give it this way)
```powershell
cd "C:\Users\BDHIC\Claude\Projects\LIT Repository\spiderweb"
git add .
git commit -m "<what changed>"
git push
```
Vercel auto-deploys on push. About 1-2 min.

## URL rules
- **Give out / integrate ONLY:** spiderweb-nine.vercel.app
- Per-deployment URLs (spiderweb-<random>-...) rot on every deploy — never wire anything to them (this already broke Inngest once).

## Post-deploy verification
1. Hard-refresh the live page (Ctrl+Shift+R) — stale cache mimics "deploy failed"
2. If a change "isn't showing": check Vercel dashboard — did the build actually succeed?
3. **Silent build failure pattern:** a truncated file paste (Notepad bug) can fail the build while the OLD deploy keeps serving — looks like "my change did nothing." Check build logs, re-paste the FULL file via PowerShell heredoc.

## Deployment Protection
- "Require Log In" is ON — keep it on
- Inngest works with it via native integration
- Any new external service that calls the app: test WITH protection on before assuming it needs a bypass

## SQL + code deploys together
When a build needs both (e.g., new column + new UI):
1. Run SQL in Supabase FIRST (additive changes are safe before code lands)
2. Then push code
3. Then test live
