---
name: cowork-handoff
description: When and how to hand builds to Claude Cowork instead of building in chat, plus the exact prompt template that works. STANDING RULE - proactively flag Cowork whenever a task involves multi-file builds, heavy debugging, or long agentic work. Brian should never have to ask.
---

# Cowork Handoff

## When to hand off (flag proactively — standing rule)
- Touches 3+ files
- New feature spanning DB + API + UI
- Heavy debugging across the codebase
- Long agentic work (typecheck loops, refactors)

Stay in chat for: single-file edits, SQL one-liners, config tweaks, strategy.

## Prompt template (proven pattern — use every element)
```
Context: Spiderweb (Human Bloom) — Next.js/TypeScript + Supabase + Vercel.
Repo: bdhicks83-ui/spiderweb — local path: C:\Users\BDHIC\Claude\Projects\LIT Repository\spiderweb
Live: spiderweb-nine.vercel.app

Task: <one-line what + which phase>

Current state: <2-4 bullets of relevant existing state>

Build:
1. <numbered, explicit steps>
2. ...
N. Test: <a NAMED, REAL-DATA test target — never "test it works">

Follow existing patterns: session-aware Supabase client for user-facing pages,
service-role key only in backend/background jobs. Full files only, no snippets —
I'll be copy/pasting these over existing files. If any file is over ~50 lines,
note it so I use the PowerShell heredoc method instead of Notepad.
```

## Handling Cowork output
- Cowork's sandbox often **cannot preview the live app** (unsupported libs) -> "Artifact failed to load" is usually a FALSE ALARM. The real files are fine; judge by typecheck + real deploy.
- Cowork asks clarifying questions with numbered options — the recommended option is usually right, but sanity-check against project doctrine (e.g., "build the visible thing" beats "infrastructure only").
- After Cowork finishes: walk Brian through the go-live steps ONE at a time in chat (SQL -> push -> test).

## Track record (trust it)
Cowork independently caught a real timing gotcha (approve badge would not show pre-approval) before Brian hit it as a false bug. Good at flagging its own limitations.
