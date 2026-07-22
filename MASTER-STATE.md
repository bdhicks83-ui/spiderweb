# MASTER-STATE

Full-replacement snapshot of the current build state. Overwrite this file each
session; do not append. For the reasoning behind decisions, see `DECISION-LOG.md`
(append-only). Strategy/positioning: see the LIT Repository project docs
(STRATEGY.md v3, MASTER-STATE.md v2, ELICITATION-ENGINE-SPEC.md).

_Last updated: 2026-07-22 -- P-0 ✅ COMPLETE (base hardened; flake fixed, migration confirmed live, 10/10 done test)._

---

## P-0 -- Elicitation Engine ✅ COMPLETE (hardened 2026-07-22)

The 30-minute test: a consultant answers ladder questions about work already
done and walks out with one branded framework they'd put in a proposal.
Doctrine: elicitation not ingestion · fidelity not accuracy · rungs 4
(Signal Detail) and 6 (Boundaries) are the product.

| Piece | File(s) | Status |
|---|---|---|
| Pattern Record schema -- 7 fields, Boundaries mandatory, scrub-status flag, DB completion constraint, RLS | `supabase/p0-pattern-records.sql` | ✅ **Applied to LIVE Supabase** (all 22 columns verified over REST 2026-07-22; a real completed record with saved framework exists) |
| Ladder + ontology + completion gate + deterministic fallback questions | `src/lib/elicitation.ts` | ✅ Written |
| Claude helpers: `elicitNext` / `scrubPII` (fail-closed) / `framePattern` | `src/lib/claude.ts` (P0 section) | ✅ **Hardened 2026-07-22**: retries w/ backoff + loose JSON parse + framePattern max_tokens 1536→3072 |
| Prompts (versioned like code) | `prompts/elicit-next.md` · `scrub-pii.md` · `frame-pattern.md` | ✅ Written |
| API: start / answer / frame-retry / PDF export | `src/app/api/codify/{route,answer/route,frame/route,pdf/route}.ts` | ✅ Written |
| Branded framework PDF (same @react-pdf path as resume) | `src/lib/framework-pdf.tsx` | ✅ Written |
| Session UI: chat wizard, 7-rung ladder strip, roles-not-names nudge, framework card | `src/app/codify/page.tsx` | ✅ Written |
| Dashboard entry banner ("Codify a pattern") | `src/app/dashboard/page.tsx` | ✅ Written |
| Done-test harness (first-try render, no retry, old-vs-new pipeline) | `scripts/codify-smoke.mjs` | ✅ **PASSED 10/10** |

### Framework first-render flake -- FIXED (was 🔴)
- **Root cause (evidence, not guess):** `framePattern` was single-shot with
  `max_tokens: 1536` and strict JSON parsing. Rich records legitimately need
  >1536 output tokens → truncated JSON (`stop_reason: max_tokens`) → parse
  fail → the "generate framework" retry card. Reproduced live: old pipeline
  9/10, failing exactly this way.
- **Fix (`src/lib/claude.ts`):** max_tokens 3072 · `parseJsonLoose`
  (balanced-brace extraction, survives preambles/fences/trailing notes) ·
  `withRetries` (3 attempts, exponential backoff + jitter) on `framePattern`,
  `elicitNext`, `scrubPII`. All existing fallbacks (deterministic ladder,
  fail-closed scrub, `/api/codify/frame` retry route) remain as backstops.
- **Done test 2026-07-22:** `node scripts/codify-smoke.mjs` -- 10 varied
  complete records, ONE attempt each, zero retries: **NEW path 10/10, old
  path 9/10**. Live Anthropic API; exact same parse/validate code as the app.

### Local vs Live
- **LIVE Supabase** (`ekjhwyeipzmmncfedeqm`): P0 migration applied and
  verified. Local dev points at this same hosted instance (one DB, no drift).
- **LOCAL code:** `tsc --noEmit` clean as of 2026-07-22. P0 app code +
  hardening not yet deployed to Vercel -- deploy is the next ship step.
- **Done test:** ran locally against the live Anthropic API and the live
  frame-pattern prompt; Supabase verification hit the live REST API.

### Deliberately NOT in P0
Embeddings for `pattern_records` (Voyage rate-cap + silent-fail risk; pattern
records are not yet retrievable in `/ask`) · outcome follow-up loop (field 7
stays null by design) · archive jogger · Asset Strength · billing · client
portal · voice input.

### Next session -- P-0.5 (NOT started, by design)
Methodology router · entity map. Nothing from P-0.5 was touched this session.

---

## Everything before this session

Unchanged from the 2026-07-10 snapshot: Phase 5 Credibility v2 Blocks 1/2/4/5
shipped + live (`2a44e54`, dashboard-link fix included), Phase 6 Consultative
Ask live-tested, Phase 7 risk monitoring live, resume builder live, video
pipeline built but deprioritized. Cross-expert benchmarking deliberately
unbuilt. `insights` RLS still the single blanket ALL policy.
