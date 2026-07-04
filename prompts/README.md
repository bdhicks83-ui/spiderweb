# Prompts — versioned like code

Doctrine: prompts live in the repo, reviewed and diffed like any other source file.

| File | Used by | Phase |
|---|---|---|
| `extract-text.md` | OCR/transcription of uploads | Week 2 |
| `extract-insights.md` | Raw text → discrete insights | Week 3 |

Rules:
- One prompt per file. Markdown. `{{variable}}` placeholders.
- Never edit a prompt inline in TypeScript — always load from here (`src/lib/claude.ts → loadPrompt()`).
- Changing a prompt = a commit with a message explaining *why*.
