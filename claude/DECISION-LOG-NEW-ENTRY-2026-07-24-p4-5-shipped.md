# DECISION LOG — NEW ENTRY (append to DECISION-LOG.md)

---

## 2026-07-24 — P-4.5 Win Column DONE + DEPLOYED + BROWSER-VERIFIED

**Closes the Win Column:** mention aggregation → ranked view with N-expert corroboration → context chips → cross-dept impact badge → rising signal → retention watch → one-click evidence packet. Built in a single session against the existing Meridian demo org, reusing the P-1 seed's two corroboration clusters untouched.

### Decision 1 — One enforcement point for wins-only rollup, not a query convention

The guardrail is not "the API route happens to filter on trigger_type='win'." It's `aggregateWinColumn()` in `src/lib/win-column.ts`: the ONLY function in the codebase that turns pattern_record rows into a person-level rollup, and it filters to `trigger_type === "win"` before it ever builds a mention. Both API routes (`/api/win-column`, `/api/win-column/evidence`) additionally scope their own Supabase queries to `trigger_type='win'` — belt AND suspenders, same doctrine as P-4A's org-pinned search RPC: defense in depth, never "trust the caller got it right." A failure-record mention naming a person structurally never enters memory in the API layer, and even if it did, `aggregateWinColumn` would still exclude it. `assertWinsOnly()` is a standalone anti-leak proof (same pattern as P-4B's founding-record-exclusion check) that the seed/verify harness runs every time, not just on symptom.

### Decision 2 — Name matching: exact-normalized, deliberately NOT the P-4A department merge pattern

P-4A's department token-subset merge ("Manufacturing" folds into "Manufacturing Engineering") was explicitly reviewed as a reference pattern and rejected for people. `normalizePersonKey()` does case-fold + whitespace-collapse only — nothing fuzzier. Rationale: wrongly fusing two different people is worse than listing one person twice under near-identical spellings. Prefer under-merging to over-merging, per the build spec. If two spellings of the same person ever appear in real data, that's a display bug to notice and fix by hand, not something a fuzzy matcher should paper over silently.

### Decision 3 — Context chips are extractive, never model-paraphrased

`extractContextChip()` does a naive sentence-split on the record's own `signal_detail` (falling back to `judgment`) and picks the sentence containing the person's name — a real substring of the expert's own words, truncated with an ellipsis if long, never rewritten. "In the expert's own words" is literally true by construction; there's no summarization step that could invent or soften a quote.

### Decision 4 — Corroboration is the headline signal, not raw mention count

Ranking (`aggregateWinColumn`'s sort) and the card layout both lead with `distinctAuthorCount` ("Cited by 3 experts") ahead of `mentionCount`. Cross-dept impact is derived honestly: rather than trying to infer a single "home department" for the named person (the entity map doesn't reliably carry one), it's simply "was this person's recognition confined to one department's records, or did it span more than one" — `departmentsTouched.length >= 2`. Defensible without overclaiming.

### Decision 5 — Rising signal + retention watch windows

- **Rising signal:** needs ≥3 mentions (≥2 gaps) to say anything about acceleration at all — the most recent inter-mention gap must be strictly smaller than the one before it. Two mentions can't show a trend, only a single interval.
- **Retention watch:** most recent mention older than **45 days** with nothing since. Framed in copy as "No recent recognition — worth a check-in," never as a performance judgment — same care as P-4B's escalation copy ("records, never people").

Both are computed directly off the seed's real backdated `created_at` timestamps — no synthetic "now"-dated records were added, and Renata Silva's single mention (85 days old) genuinely exercises the retention-watch path rather than faking the date math.

### Decision 6 — Evidence packet composition

`/api/win-column/evidence?person=<name>` reuses the same aggregation (same wins-only guarantee) and returns every mention for one person, newest-first, with the quote, author, date, framework name, and method — reproduced client-side as a printable/copyable page (`window.print()`, `navigator.clipboard.writeText()`). No new state, no new persistence — it's a read-only view over the same aggregate the ranked list already computed.

### Bug found + fixed during the browser eyeball

The evidence-packet page's fetch built its URL as `encodeURIComponent(params.person)` where `params.person` (from Next's `useParams()`) was ALREADY URL-encoded by the router for names containing spaces — "marcus webb" became "marcus%2520webb" (double-encoded) and 404'd. Fixed by decoding defensively before re-encoding. Caught live clicking from the ranked list into Marcus Webb's card — exactly what the standing "always run the browser eyeball" rule exists to catch (a passing seed-script DONE test never would have surfaced this, since it never goes through the URL/router layer at all).

### Seed extension (Build 5)

`scripts/seed-p4-5.mjs` adds exactly 3 new pattern_records to the existing 14 — via the real `frame-pattern.md` pipeline, backdated, idempotent by a unique marker substring, `--force`-safe without touching the original 14 (which P-4A/P-4B detections/prescriptions reference by id):

1. **The guardrail proof** — a FAILURE record (Priya Nair, 5 days ago) naming Marcus Webb, the org's most-corroborated win-driver. Proves the wins-only filter holds even for someone prominent, not just "nobody happened to name anyone in a failure record."
2. **Jamal Foster** — single-mention person (Angela Brooks, 4 days ago) — proves low corroboration renders honestly, not inflated or hidden.
3. **Renata Silva** — single mention 85 days ago (David Chen) — the retention-watch example.

### DONE test — passed live (2026-07-24)

`node scripts/seed-p4-5.mjs` — Marcus Webb: 3-expert corroboration ✓, rising signal ✓, cross-dept ✓ · Denise Ortiz: 2-expert corroboration + cross-dept ✓ · Jamal Foster: single-mention honest render ✓ · Renata Silva: retention watch fires ✓ · wins-only rollup: zero leaks across all people/records ✓ · guardrail failure record confirmed ABSENT from Marcus's rollup ✓ · evidence packet compiles ✓.

**Browser eyeball (Claude-in-Chrome, logged in as Tom Whitfield):** `/win-column` renders all 4 people with correct badges, chips, and summary tiles (most-cited, rising signal, retention watch). Evidence packet for Marcus Webb walked live after the URL-encoding fix: 3 quotes, dated, attributed, framework-tagged, wins-only footnote present. Jamal Foster's evidence packet confirmed the single-mention honest-render case live, not just in the seed script.

Deployed: two commits (initial build + the encoding fix), pushed to `bdhicks83-ui/spiderweb main`, live on `spiderweb-nine.vercel.app`.

### Files touched this session

- `src/lib/win-column.ts` — new, the aggregation + guardrail enforcement core
- `src/app/api/win-column/route.ts` — new, ranked view + summary tiles
- `src/app/api/win-column/evidence/route.ts` — new, evidence packet
- `src/app/win-column/page.tsx` — new, ranked mention view
- `src/app/win-column/[person]/page.tsx` — new, evidence packet view (encoding bug fixed post-eyeball)
- `src/app/library/page.tsx`, `src/app/prescriptions/page.tsx` — nav links to `/win-column` added
- `tsconfig.p4-5.json` — new, scoped typecheck config
- `scripts/seed-p4-5.mjs` — new, seed extension + DONE-test verification harness

### Net

P-4.5 is **built, deployed, seed-verified, and browser-verified live. Closed.** Recognition copy (badge labels, retention-watch framing, evidence-packet header/footnote) reported to Brian and approved before shipping, per standing rule. Next build: P-5 (polish + demo).
