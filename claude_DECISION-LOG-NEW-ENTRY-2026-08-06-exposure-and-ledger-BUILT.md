# DECISION-LOG — NEW ENTRY (append-only)

**⚠️ Paste this at the BOTTOM of DECISION-LOG.md. Never replace that file.**

---

## 2026-08-06 — The Exposure Engine + The Value Ledger BUILT (v2.60)

**Status:** built locally, typechecks clean (26 scoped configs + full `tsc`), PDF rasterized and visually verified. **Two migrations pending. Nothing deployed. No browser walk. All customer-facing copy DRAFT.**

---

### ⭐⭐ THE DECISION THAT MATTERS: THE T1B3 NO-DOLLAR-FIGURE DOCTRINE WAS **AMENDED, NOT DELETED**

The Value Readout (T1B3) shipped under a hard rule recorded in MASTER-STATE and the STACK gotcha list:

> "NO DOLLAR FIGURE, ANYWHERE, EVER. Never compute a dollar figure in a customer-facing readout."

**That rule is amended. The amended rule is:**

> **The system NEVER invents a rate. The customer supplies every rate and every cost assumption. The system supplies only QUANTITIES it can observe, and multiplies. Every figure shows its inputs, its basis and its confidence tier, and every input is editable by the customer.**

**Why the amendment is not a retreat.** The original ban existed because a **computed savings claim** is a guess wearing a currency symbol, and the first buyer who checks it stops believing the rest of the page. Nothing in this build makes a savings claim. It makes an **asset-acquisition-cost** claim — *"here is what this cost to acquire, and what it would cost to acquire again"* — which is the same logic an accountant applies to inventory. **That distinction is load-bearing and must not be blurred in code or copy.** Every surface says "no saving is claimed" out loud.

**What did NOT change:**
- The `/readout` **years-of-judgment anchor is untouched** and remains the headline. The ledger block sits strictly below it.
- **The system still never invents a rate.** `value_assumptions` is seeded with NULLs, has no DEFAULT clause on any rate column, and the absence of one is the feature. Until a customer types a number, the ledger shows the quantity and the words "no rate entered."
- **The model never sees or outputs a currency figure.** The valuation scorer scores difficulty and scarcity only; the basis sentence is dropped outright if it contains a currency symbol.
- The GTM anchor stays **replacement cost, never savings**. Ramp-time remains the one safe CFO number.

---

### ARCHITECTURAL DECISIONS

1. **`value_events` stores QUANTITIES, never dollars; the dollar is computed at read time.** This was forced by an apparent contradiction: the ledger must be append-only and dated (it only goes up, every entry traces to a dated occurrence) AND a CFO must be able to edit an assumption and watch the total move. Storing dollars makes those mutually exclusive. Storing quantities makes both true — history is immutable, the *pricing* of history is not.

2. **Append-only is enforced by a database trigger, not by doctrine.** `value_events_append_only` raises on UPDATE and DELETE and binds the service role too. The escape hatch (dropping the trigger) is deliberate and loud. **Consequence:** every writer must use `ON CONFLICT DO NOTHING`; a plain upsert compiles to `DO UPDATE`, fires the trigger, and fails every row while reporting success-shaped zeroes.

3. **Live writers and the backfill share ONE dedupe-key namespace.** A `backfill:`-prefixed namespace was written first and was wrong: live and backfilled rows would never collide, so pressing the documented-safe backfill button after a month of live use would permanently **double** every tier on a table with no repair path. `answer_applied` is keyed per person / per framework / per **day** — `learning_signals` is append-only including repeats (correct for behaviour), but the REALIZED tier is the number a skeptic reads first and must not be inflatable by clicking the same card twice.

4. **The scorer emits the event; the capture route only triggers it.** Because the table is append-only there is no "insert now, score later." The Inngest job scores first and emits once. A pattern the model cannot confidently score is **still emitted**, with `reproduction_hours: null` — excluded from every total and **counted in a visible excluded number**. Silence would be worse: an invisible exclusion is an undercount nobody can audit.

5. **`gap_closed` stores the pointer, not the derived number.** It needs the resolving framework's scored hours, but a gap is often filled seconds after capture — before the scoring job runs — and an append-only null could never be corrected. It stores `resolved_record_id` and the hours resolve at read time. General rule now: **never write a derived value into an append-only row when another async job produces it.**

6. **Exposure reads as the CALLER; the ledger and readout read as SERVICE ROLE.** Deliberately opposite. Exposure is row-level and person-attributed — a surface that names people must never name someone the caller couldn't otherwise see. The ledger and readout report TOTALS, and "the total as far as you can see" presented as the total is the exact T1B3 bug.

7. **No new thresholds.** Clustering and warning-matching both reuse **0.75** (P-3, measured; already reused by P-4A, Studio grounding, Already Walked). The Exposure display floor (score ≥ 25) and the row cap (12) are ranking/display parameters and are documented as categorically different from a similarity bar.

8. **Framework warnings do zero read-time model or embed calls.** Matching is lexical containment ("mentions", which is literally what the copy claims) OR cosine against the antecedent's stored query-type vector. Recent retrieval queries are matched lexically only — an honest limitation, stated in the caveats rather than paid for in page latency.

9. **`'implied'` precedence links are stored and never shown.** Only `'stated'` fires. A warning built on an inference is a warning that teaches people to ignore warnings.

10. **⚠️ THREE CUSTOMER INPUTS ADDED BEYOND THE BRIEF** — `expert_interruption_minutes`, `annual_departure_probability`, `ramp_weeks_credited_per_track`. The brief's six assumptions leave three figures with nowhere honest to come from, and without columns for them the code would have to invent them. **Open call: keep them, or ship three of the six event types permanently dark.**

---

### GUARDRAILS RE-ASSERTED ON NEW SURFACES

- ⭐ **Exposure NEVER names a person as a liability.** The holder is the holder of scarce value; the gap is always "nobody else has captured on this." There is no copy path to a person-level negative.
- 🛑 **`retraining_signals` / Coaching Watch contributes NOTHING to Exposure** — not aggregated, not anonymized, not counted. There is no query against it and there must never be one.
- ⭐ **Every warning names and links its source pattern.** An unsourceable row is dropped, never rendered with a vague attribution.
- ⭐ **Every Exposure row ends in ONE action** ("Close this" → a pre-filled ask through the existing `capture_requests` flow). It is a to-do list, never a wall of anxiety.
- **Empty states are real results and read as good news** on both surfaces — and "unavailable" is kept distinct from "empty", because an empty warnings list would be claiming "nothing is warning you."
- **Every caveat derives from the same expression that decides what renders**, on both new pages.
- **Every emission is fail-open.** `emitValueEvent()` cannot throw; a ledger failure never costs anybody a capture.

---

### TWO BUGS FOUND BY RASTERIZING THE PDF (and why the rule exists)

1. **The ledger block ran the readout from TWO pages to THREE** — quietly breaking "the two pages they forward," which is the entire premise of T1B3. Fixed by compacting the block; height is now a documented feature constraint in `readout-pdf.tsx`.
2. **react-pdf's default Helvetica has no `≥` glyph.** The partial-years anchor — *the product's highest-stakes number* — was rendering as a mangled overlap on top of the first digit, on the one page a budget holder reads. **Pre-existing since T1B3 and invisible to every check that stops at a 200 and a `%PDF-` header.** Fixed in the PDF only; the web page keeps `≥`.

A twelve-finding adversarial review pass ran against the whole change set before this entry was written; the material findings are folded into the decisions above.

---

### WHAT SHIPPED IN FILES

**New:** `src/lib/exposure.ts` · `src/lib/precedence.ts` · `src/lib/value-ledger.ts` · `src/lib/leadership-gate.ts` · `src/inngest/ledger.ts` · `src/inngest/precedence.ts` · `src/app/exposure/page.tsx` · `src/app/ledger/page.tsx` · `src/app/api/exposure/route.ts` · `src/app/api/ledger/{route,assumptions/route,backfill/route}.ts` · `prompts/value-score.md` · `prompts/precedence-extract.md` · `supabase/value-ledger.sql` · `supabase/exposure-precedence-links.sql` · `scripts/seed-exposure-ledger-demo.mjs` · `tsconfig.exposure.json` · `tsconfig.ledger.json`

**Modified:** `codify/answer` (2 job triggers, wrapped together) · `retrieve/signal` (`answer_applied`) · `prescription.ts` (`prescription_effective`) · `training-studio/generate` (`training_generated`, transition-only) · `knowledge-gaps.ts` (`gap_closed`) · `welcome` (`ramp_compressed`) · `claude.ts` (scorer + extractor) · `training-formats.ts` (`finishedTrainingHours`) · `readout` page/route/PDF · `dashboard` (two role-hidden links) · `campaigns` (Exposure pre-fill) · `inngest/functions.ts`

**Deferred to Brian:** page/section body copy · the three added assumption inputs.

---

### DECIDED SAME DAY (Brian, 2026-08-06) — five calls, all built

| Call | Decision | Consequence |
|---|---|---|
| Nav label for `/exposure` | **"What's at risk"** | Chosen knowingly against the house opportunity-framing rule. A code comment records that it was deliberate so nobody softens it back later. |
| Ledger name | **"Value Ledger"** | — |
| Nav placement | **A fifth dashboard verb card** | **Changes the v2.58 four-card doctrine**, which was approved and walked 11/11. A decision, not a drift. |
| Where the ledger lives | **Fully inside `/readout`. The `/ledger` page is deleted.** | The tiers, drill-downs, editable rates and caveats render on the readout below the years anchor. `/api/ledger` survives as the data endpoint. The ledger's caveats merge into the readout's ONE existing limits section — two limits blocks on a page teaches the reader that neither matters. |
| PDF assumptions footnote | **Keep itemized** | Every figure stays reproducible by whoever receives the file. Accepted cost: hourly rates and loaded salary travel with a forwarded PDF. |

**And one decision the fourth call forced.** The readout was gated to managers + admins (T1B3, deliberately tight: "a readout circulating before its owner has read it is how a half-finished number ends up in front of a VP"). The ledger was specced for managers + admins + **executives**. Once they became one surface those audiences had to reconcile.

**`requireReadoutViewer` is now manager · admin · executive seat, and executives can read AND export.** The T1B3 reasoning still holds for everyone below that bar; the bar simply moved up one rung. Recorded here because it is a change to a shipped gate on the artifact that leaves the building, and it should be re-read before any future widening.
