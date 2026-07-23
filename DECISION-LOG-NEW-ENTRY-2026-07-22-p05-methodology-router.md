# Decision Log — 2026-07-22 (evening) — P-0.5 Methodology Router + Entity Map

## What was built

**Build 1 — Methodology Router.** `/codify` now opens with "What are we capturing?" (5 buttons: 💥 broke · 🏆 win · ⚠️ concern · 🔁 friction · 🧠 judgment). Picking one shows a suggested method + one-line why; the expert can accept it or swap to any of the other 4 (offer + suggest, never force). Rungs 1–3 of the ladder stay universal across methods; rungs 4 (signal), 5 (reasoning), and 7 (boundaries — see renumber below) swap question character per method. Persona (exec / technical director / sr. manager, read off the expert's profile) shades wording only, never routing logic.

**Build 2 — Entity Map.** New Pattern Record field #8: a polymorphic array of `{type, name, detail}` where type is one of `equipment_asset | process | error_class | role_person | department`. Elicited via one new adaptive rung (rung 6) inserted between reasoning and boundaries. Win-type sessions are instructed to specifically ask for the people who made it work.

**Build 3 — Session guardrails + instrumentation.** Client-side 20-minute timer (soft warning at 15, a non-blocking "pause and resume" offer at 20 — progress is already saved after every answer, so "pause" just means stop asking and come back). `/api/codify` GET checks for an existing active session and the UI offers to resume it, landing back at the exact pending question/rung. `session_start` and `framework_rendered_at` are stamped on every record; `time_to_first_value_seconds` is computed and stored the first time a framework successfully renders. No dashboard yet — just capture, per spec.

## Rung renumbering (read this before touching the ladder again)

The original P0 ladder was 1 Situate · 2 Classify · 3 Call · 4 Signal · 5 Reasoning · 6 Boundaries · 7 Generalize. P-0.5 inserts the Entity Map between reasoning and boundaries, so the ladder is now:

1 Situate · 2 Classify · 3 Call · 4 Signal · 5 Reasoning · **6 Entities (new)** · 7 Boundaries · 8 Generalize.

`rungsReached()`, `fallbackQuestion()`, `RUNG_LABELS`, and every method's fallback-question set in `lib/elicitation.ts` all use this numbering. The `elicit-next.md` prompt and the 5 `method-*.md` fragments were written against this numbering too.

## PII decision — capture-time scrubbing is now OFF (deliberate)

**Before (P0):** every answer was run through `scrubPII` before storage — client/individual names stripped unconditionally, "roles not names" was the UI's standing instruction.

**Now (P-0.5):** capture-time scrubbing is removed from `/api/codify/answer` entirely. Names an expert gives — especially in the entity map — are stored as given, under the existing per-user RLS on `pattern_records`. `scrubPII` (the old prompt/function) is left in the codebase but is no longer called from the answer route.

**Why:** the whole system pivoted (Track B) from "consultant capturing external client engagements" to "enterprise capturing its own internal operating judgment." In that context, "roles not names" was actively working against two required features: the entity map's mandate to capture who-did-what (for pairing in P-4 and for Win Column in P-4.5), and the Success Case Method's requirement that a win record name the people who drove it. Scrubbing before storage would have silently deleted that data before the model ever saw it as capturable.

**What replaces it:** a new export-time-only scrubber, `scrubForExport` (prompt: `prompts/scrub-for-export.md`), runs in `/api/codify/pdf` right before the PDF is rendered — it takes the JSON-serialized framework artifact, rewrites any identifying names/companies to generic descriptors, and the PDF renders from the scrubbed copy. The framework as stored in the DB keeps full fidelity; only the artifact leaving the org gets scrubbed, and only at the moment it leaves. This is a fail-open safety net (framePattern's own prompt already instructs it not to name people/clients in the framework it generates) — if the export scrub call itself fails, the route logs a warning and exports the framework as stored rather than blocking the download.

**Verified live:** ran a synthetic framework object containing "Dana Ruiz" through `scrubForExport` against the real Claude API — came back `changed: true` with every instance replaced by "a team member," full JSON structure intact.

**Risk flagged for whoever revisits this:** anything captured in `context_summary`, `judgment`, `rationale`, etc. (not just the entity map) can now also contain a name, since nothing scrubs those fields at capture anymore either. If an expert names an *external* customer or vendor by accident in one of those fields, it will sit in the DB unscrubbed until/unless that record is exported. This was an accepted tradeoff to make the entity map + Win Column features possible, but it's worth a second look before this goes anywhere multi-tenant (P-1) — right now `pattern_records` RLS scopes rows to `user_id`, not yet to an org, so P-1's org-scoped RLS needs to land before multiple people at the same company can see each other's captured names, which is also when the "kept internally" half of this decision actually starts being true in practice.

## Schema changes

`supabase/p0.5-methodology-entity-guardrails.sql` (one paste block, not yet applied — see below):
- `pattern_records.trigger_type` (checked enum, nullable)
- `pattern_records.method` (checked enum, nullable)
- `pattern_records.entity_map` (jsonb, default `[]`, not null)
- `pattern_records.session_start`, `.framework_rendered_at`, `.time_to_first_value_seconds`
- `profiles.persona` (checked enum, nullable — exec / technical_director / sr_manager)
- `scrub_status` check constraint extended with a new value `not_scrubbed_by_design`, and it's now the column default
- `pattern_record_complete_check` extended: a record can't be marked complete without `entity_map` having at least one entry, and without `trigger_type`/`method` both set

**Not applied yet.** This Cowork session had the app's anon key and service-role key (from `.env.local`) but no direct Postgres connection string / Supabase Management API token, so it has no way to run DDL against the live database — same as every prior migration in this repo, it needs to be pasted into the Supabase SQL editor by hand. Once it's applied, this migration is enforced everywhere it's supposed to be (the completion gate, the profiles check).

## Template design decisions

- **One shared `elicit-next.md` prompt, parameterized** — rather than 5 separate full ladder prompts. Each method's rung-4/5/6/7 character lives in its own small fragment file (`prompts/method-*.md`) that gets loaded and substituted into `elicit-next.md`'s `{{method_guidance}}` slot; persona wording is the same pattern (`prompts/persona-*.md` → `{{persona_guidance}}`). Reasoning: keeps the ladder's core logic (completion gate, JSON contract, ontology) in one diffable place instead of five drifting copies, while still giving each method genuinely distinct question character — verified live, the 5 Whys session actually asked a why-chain and offered Fishbone framing language, the AAR session asked for names, the pre-mortem session used prospective-hindsight framing, etc.
- **Method swap is a client-side state change, not a re-POST.** The suggested-method screen lets the expert click through the other 4 methods before starting; nothing hits the server until "Use this method," so swapping costs nothing.
- **Resume is intentionally shallow.** On resume, the UI shows a one-line "Resumed — picking up at rung X" note plus the pending question, not a full replay of the prior transcript. Per Brian's standing instruction (show the current step, not the whole roadmap) and because the DB row already has everything needed to continue — replaying history would be extra UI complexity for no functional gain.

## What was tested, and how (local vs. live — say this every time)

**Live** (real Claude API, real prompts, no mocking of the model): ran all 5 trigger types end-to-end through the actual `elicitNext`/`framePattern`/`scrubForExport` functions in `lib/claude.ts`, unmodified, via a standalone Node/tsx harness (this sandbox's desktop bridge dropped and its own npm registry access is blocked, so a real `npm run dev` browser click-through wasn't possible from here — see below). Every session completed with all 8 fields; the win-type session (AAR + Success Case) captured a named person (per the mandatory rule); the judgment-call session (CDM) captured two named entities unprompted; the export scrubber correctly stripped a synthetic name from a JSON framework. Save-and-resume was proven by snapshotting mid-session state (fields + qa_pairs + pending question/rung — exactly what the DB row stores) and continuing from that snapshot to full completion.

**Not yet live-tested:** the actual HTTP routes (`/api/codify*`) against a running Next.js server, real Supabase reads/writes with RLS, the real browser UI (timer, resume banner, method-swap screen), or `npm run build`/`tsc --noEmit` against the full app. All of `lib/elicitation.ts` and `lib/claude.ts` do pass a strict standalone `tsc --noEmit` with zero errors, and `codify/page.tsx` parses and its module top-level evaluates cleanly against the real `lib/elicitation.ts` exports it imports — but that's not the same as a full app build or a browser click-through, and it should not be treated as one.

**Two things need to happen, in this order, before P-0.5 can be marked fully done:** (1) paste the SQL migration into Supabase, (2) reconnect the desktop bridge so the files land in the repo and someone (Brian, or a follow-up Cowork session) runs `npm run build` + the actual 5-trigger click-through in a browser + `git commit`.
