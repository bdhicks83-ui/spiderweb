# Prompts — versioned like code

Doctrine: prompts live in the repo, reviewed and diffed like any other source file.

| File | Used by | Phase |
|---|---|---|
| `extract-text.md` | OCR/transcription of uploads | Week 2 |
| `extract-insights.md` | Raw text → discrete insights | Week 3 |
| `draft-framework.md` | Insight cluster → framework draft | Phase 3 |
| `ask-spiderweb.md` | Single-shot grounded answer (legacy) | Phase 5 |
| `ask-followup.md` | Decide if a follow-up question is needed | Phase 6 |
| `ask-recommend.md` | Final recommendation + pros/cons | Phase 6 |
| `synthesize-resume.md` | Approved insights → resume sections (summary/experience/frameworks/strengths) | Resume builder |
| `elicit-next.md` | One elicitation turn: fold answer into Pattern Record fields, ask next ladder question (method + persona parameterized) | P0 / P-0.5 |
| `scrub-pii.md` | Legacy capture-time scrubber — no longer called from `/api/codify/answer` (see DECISION-LOG 2026-07-22); kept for other callers/history | P0 |
| `frame-pattern.md` | Completed Pattern Record → branded framework artifact | P0 |
| `method-5whys-fishbone.md` | Method character for 💥 Something broke → 5 Whys + Fishbone | P-0.5 |
| `method-aar-success-case.md` | Method character for 🏆 A win landed → After-Action Review + Success Case Method | P-0.5 |
| `method-premortem.md` | Method character for ⚠️ A concern → Pre-mortem | P-0.5 |
| `method-a3.md` | Method character for 🔁 Recurring friction → A3 Gap Analysis | P-0.5 |
| `method-cdm.md` | Method character for 🧠 A judgment call → Critical Decision Method | P-0.5 |
| `persona-exec.md` / `persona-technical-director.md` / `persona-sr-manager.md` / `persona-neutral.md` | Persona-aware wording shading for `elicit-next.md` — shades wording only, never router/ladder logic | P-0.5 |
| `scrub-for-export.md` | Strip identifying names ONLY at export time (PDF) — capture-time storage keeps names per the P-0.5 entity map decision | P-0.5 |
| `conflict-xray.md` | Cross-user conflict judgment for one candidate pair: flags ONLY overlapping-boundaries AND opposing-judgment, tuned hard against false positives | P-2 |
| `conflict-resolution-depth.md` | Depth gate for conflict resolutions (sharpen/reconcile/supersede) — belief-revision gate pattern reapplied; escalate skips it | P-2 |

Rules:
- One prompt per file. Markdown. `{{variable}}` placeholders.
- Never edit a prompt inline in TypeScript — always load from here (`src/lib/claude.ts → loadPrompt()`).
- Changing a prompt = a commit with a message explaining *why*.
