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

Rules:
- One prompt per file. Markdown. `{{variable}}` placeholders.
- Never edit a prompt inline in TypeScript — always load from here (`src/lib/claude.ts → loadPrompt()`).
- Changing a prompt = a commit with a message explaining *why*.
