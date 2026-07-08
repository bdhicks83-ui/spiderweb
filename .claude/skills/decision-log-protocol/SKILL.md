---
name: decision-log-protocol
description: How to maintain DECISION-LOG.md - the append-only record of directional decisions and reasoning, kept for future monetization as a build case study. Use whenever a real decision, pivot, or tradeoff happens in a session (log PROACTIVELY, don't wait to be asked) and whenever updating project docs.
---

# Decision Log Protocol

## Purpose
Captures the *why* — judgment calls, tradeoffs, reasoning — not the checklist. Future use: book, course, investor story, executive-acumen showcase.

## APPEND-ONLY — never replace
- **NEVER hand Brian a full replacement DECISION-LOG.md.** Older entries were once destroyed by replace-instead-of-append.
- Always deliver an **append snippet** (e.g., DECISION-LOG-NEW-ENTRY.md) to paste at the BOTTOM of the existing file.
- MASTER-STATE.md is the opposite: it's a snapshot — full replacement is correct there.

## When to log (proactively)
- Architecture/tool choices with alternatives considered
- Phase gates opened, scoped, or declared complete
- Real bugs with a lesson (not typos)
- Priority reorderings ("$0 first"), scope cuts, kill-list additions
- Anything Brian decides after seeing a tradeoff table

## Entry format
```markdown
### <Month Day, Year> — <One-line decision title>
**Context:** why the decision was needed
**Decision:** what was chosen (concrete)
**Options considered:** (when real alternatives existed)
**Reasoning:** the why — tie to doctrines where relevant
**Result:** what happened / what it unblocked
**Next:** (optional) what it points to
```

## Recovery
If entries are ever lost: search past Claude chat sessions (conversation history holds the entries) and rebuild — mark the rebuilt file as best-effort reconstruction with a GAPS section.
