# MASTER-STATE NOTE — fold to **v2.60** (Exposure Engine + Value Ledger)

**Full-replacement-ready blocks. Paste each into the matching section of MASTER-STATE.md, bump the header to v2.60, then delete this file.**

---

## 1. HEADER LINE — replace

> **v2.60 · Updated August 6, 2026 · REPLACES all prior versions in full.**
> This is the folded canonical: v2.59 lineage + v2.60 (Exposure Engine + Value Ledger, BUILT — local, not deployed; NAMES + PLACEMENT APPROVED, rest of copy DRAFT). Standing rule: **highest version wins; fold lower parallels in, never overwrite downward.**

## 2. VERSION LINEAGE — append

> … → v2.58 (Branch 7 win capture + 4-card dashboard SHIPPED, walk 11/11, ALL copy APPROVED) → v2.59 (fold; doc only) → **v2.60 (Exposure Engine + Value Ledger BUILT — 2 migrations PENDING, copy DRAFT, not yet deployed or browser-walked)**.

---

## 3. ⚡ 30-SECOND VERSION — insert these two blocks above the v2.58 entry

⭐⭐⭐ **THE T1B3 NO-DOLLAR-FIGURE DOCTRINE WAS AMENDED, NOT DELETED (Aug 6).** The old rule was *"NO DOLLAR FIGURE, ANYWHERE, EVER."* The amended rule is:

> **The system NEVER invents a rate. The customer supplies every rate and every cost assumption. The system supplies only QUANTITIES it can observe, and multiplies. Every figure shows its inputs, its basis and its confidence tier, and every input is editable by the customer.**

The original ban existed because a *computed savings claim* is a guess wearing a currency symbol. Nothing in this build claims a saving — it makes an **asset-acquisition-cost** claim ("what this cost to acquire, and what it would cost to acquire again"), the logic an accountant applies to inventory. **That distinction is load-bearing; do not blur it in code or copy.** The `/readout` years-of-judgment anchor is UNCHANGED and stays the headline; the ledger is additive and sits below it.

⭐⭐⭐ **v2.60 BUILT (Aug 6) — EXPOSURE + THE LEDGER. Local only, migrations pending, copy DRAFT, not walked.**

- **⚠️ `/exposure` — "What's at risk"** (manager · admin · executive seat; hidden-not-locked). **A FIFTH dashboard verb card** — the v2.58 four-card collapse becomes five, by decision on 2026-08-06, not by drift. Two blocks.
  - **Walking risk** — NO NEW SCHEMA. Read-time clustering of `pattern_records` by cosine against running topic centroids (reuses the P-3 vectors and the **0.75** bar verbatim; no new taxonomy, no second embedding model). Score = concentration × tenure weight × demand weight − second-source depth. Top 12 + "show all". ⭐ **A person is NEVER a liability here** — Dana Whitfield is the HOLDER of scarce value and the gap is always framed as *"nobody else has captured on this."* 🛑 `retraining_signals` contributes NOTHING — not aggregated, not anonymized, not counted. Every row ends in ONE action: **"Close this"** → pre-filled targeted ask through the EXISTING campaigns/`capture_requests` flow (`/campaigns?new=1&name=…&prompt=…`).
  - **Framework warnings** — the conflict engine pointed FORWARD. New `precedence_links` table; an Inngest job asks one question per capture ("does this assert that one observable condition precedes another outcome?"). **Only `'stated'` links fire; `'implied'` is stored and never shown.** Fires at ≥ 2 distinct recent items matching one antecedent. ⭐ **Every warning names and links its source pattern; an unsourceable row is DROPPED, never rendered vaguely.** Matching is lexical ("mentions") **OR** cosine against the stored antecedent vector — **zero read-time model or embed calls**.
  - **NOT exported to PDF. Does NOT appear on `/readout`.** The readout leaves the building; Exposure does not. (The Value Ledger is the opposite call and does live there — the two are separate surfaces with separate rules.)
- **📒 THE VALUE LEDGER LIVES ON `/readout`. THERE IS NO `/ledger` PAGE** (Brian's call, 2026-08-06). The tiers, the drill-downs, the editable rates and the caveats all render on the readout below the years anchor; `/api/ledger` feeds it. **`requireReadoutViewer` was widened to executive seats** as a direct consequence — execs can now read AND export the readout. `value_events` is **APPEND-ONLY, enforced by a database trigger** (not just doctrine) and stores **QUANTITIES, never dollars**; `value_assumptions` is one customer-owned, NULL-seeded row per org. The dollar figure is computed at READ time — which is what lets the ledger be immutable AND lets a CFO edit a rate and watch the total move. Six event types, all emitted fail-open as side effects of actions that already succeeded. **REALIZED sits on top and is the loudest number even though it is the smallest** (a skeptic reading top-down meets the honest number first). **MODELED IS ALWAYS A RANGE (±35%), NEVER A POINT.** Every figure opens its inputs, editable in place. "What this ledger can't see" is a full section.
- **AI valuation scorer** — `claude-sonnet-5`, four dimensions (reproduction hours · scarcity · blast radius · half-life), structured JSON only, **never sees or outputs a currency figure**. A pattern it cannot confidently score is stored with `reproduction_hours: null`, excluded from every total, and **counted in a visible excluded number**.
- **Readout + PDF** get a compact three-number block **below** the anchor, with a dated, reproducible assumptions footnote. **No rates → the block does not render at all and the readout is byte-for-byte its v2.59 self.**

---

## 4. STACK — add to the "locked" line

> Local: `C:\Users\BDHIC\Claude\Projects\LIT Repository\spiderweb` · Repo: `bdhicks83-ui/spiderweb` · Host: `spiderweb-nine.vercel.app` · Supabase user id `a7d205f0-778c-44b9-9e13-4ebd5f47e964` · Dev ritual: spiderweb-dev-environment.md.
> **Scoped typechecks now number 26** (`tsconfig.exposure.json`, `tsconfig.ledger.json` added Aug 6). All 26 pass, plus a full `tsc --noEmit`.

---

## 5. 🧠 STANDING GOTCHAS — NEW ENTRIES (add these; nothing existing changes)

**Value Ledger**
- ⭐⭐ **`value_events` STORES QUANTITIES, NEVER DOLLARS.** The dollar is computed at read time against `value_assumptions`. This is what makes append-only history and a live-editable CFO model compatible. `scrubQuantity()` drops any `_rate`/`_cost`/`_dollars`-shaped key with a loud warning — the one allowed exception is `stated_problem_cost`, a figure a HUMAN typed about their own operation.
- ⭐⭐ **APPEND-ONLY IS A TRIGGER, NOT A COMMENT.** `value_events_append_only` raises on UPDATE and DELETE, and unlike RLS it binds the service role too. **Therefore every writer must use `ON CONFLICT DO NOTHING`** — supabase-js `.upsert(row, { onConflict: "dedupe_key", ignoreDuplicates: true })`. A plain `.upsert()` compiles to `DO UPDATE`, fires the trigger, and every row fails — which makes a "safe to re-run" backfill report zeroes as if nothing had ever been written.
- ⭐ **LIVE AND BACKFILL SHARE ONE KEY NAMESPACE** (`valueDedupeKey()`). Backfill-prefixed keys were the bug: live rows and backfilled rows would never collide, so one press of the backfill button after a month of live use permanently **doubled** every tier on an append-only table with no repair path. `answer_applied` is keyed **per person per framework per DAY** — `learning_signals` is append-only including repeats (correct for behaviour) but the REALIZED tier must not be inflatable by clicking the same card twice.
- ⭐ **STORE THE POINTER, NOT THE DERIVED NUMBER.** `gap_closed` needs the resolving framework's scored reproduction hours, but the scorer is an async job and the gap is often filled seconds after capture — so the value read at emission time is null forever. Store `resolved_record_id` and resolve the hours at READ time from the `pattern_captured` event. Same rule anywhere an append-only row wants a number another async job produces.
- ⭐ **TIER COMES FROM `EVENT_TIER[event_type]`, NEVER FROM THE STORED COLUMN.** Pricing branches on event_type; bucketing on a stored column lets one hand-seeded row be priced with the modeled formula and summed into Realized — where it renders as a hard point estimate with no band.
- ⭐ **NO FIGURE → NO BLOCK, AND NO ROW.** `hasAnyRate()` is true as soon as ONE of nine inputs is filled — including three that are not currency at all. On its own that is not enough to render the readout block: `toReadoutBlock()` also requires at least one tier to carry a figure, and the outbound page/PDF omit any tier row with no figure. "No rate entered" belongs on `/ledger`, where somebody can go fix it — never on the artifact that leaves the building.
- **A missing rate and a zero are different things and are never merged.** Absent → `amount: null`, the quantity shows with its unit, and the missing rate is named.

**Exposure**
- ⭐ **`/exposure` reads with the SESSION client; `/ledger` and `/readout` read with SERVICE ROLE.** Deliberately opposite, for a stated reason: Exposure is row-level and person-attributed (a surface that names people must never name someone the caller couldn't otherwise see), while the ledger and readout report TOTALS, and "the total as far as you can see" presented as the total is the exact T1B3 bug.
- ⭐ **ORDER RECORD-CAP QUERIES DESCENDING AND REPORT TRUNCATION.** `ascending: true` + `limit(400)` pins the pass to the org's OLDEST 400 records, so on a growing account every new concentration is invisible while the page reports good news. `truncated` is surfaced as a caveat, same discipline as `unembedded`.
- **UNAVAILABLE ≠ EMPTY.** Framework warnings report `available: false` when the migration hasn't run, and the page says so. An empty list would be claiming "nothing is warning you."

**Model calls**
- ⭐ **A MODEL DIAGNOSTIC MUST TRAVEL WITH ITS RESULT, NOT IN A MODULE-LEVEL GLOBAL.** Two ledger scoring jobs can run concurrently in one Node process; a shared `lastDiagnostic` lets record A's failure reason be overwritten by record B before A reads it — and that reason is written ONCE into an append-only table as the auditable explanation a CFO reads. `scorePatternValue()` and `extractPrecedenceLinks()` return discriminated results. **The older `getLast…Diagnostic()` pattern elsewhere in `claude.ts` has the same latent race.**
- Ceilings: valuation scorer **1200**, precedence extractor **1600** (several pairs can legitimately come back). Elicitation's 6144 untouched.

**PDF**
- ⭐⭐ **RASTERIZE AND COUNT PAGES.** The first render of the ledger block ran the readout from TWO pages to THREE — quietly breaking "the two pages they forward," which is the entire premise of T1B3. Height is a feature constraint in `readout-pdf.tsx`, not a style preference. If you grow that block, rasterize and count before shipping.
- ⭐ **react-pdf's default Helvetica HAS NO `≥` GLYPH.** The partial-years anchor — the product's highest-stakes number — was rendering as a mangled overlap on top of the first digit, on the one page a budget holder reads. **Pre-existing since T1B3; found only by rasterizing.** Fixed by dropping the glyph from the PDF (the lead sentence already says "At least this much experience"); the web page keeps `≥`, where the browser font has it. **Assume any non-ASCII symbol is missing until a raster proves otherwise.**

---

## 6. ✅ WHAT'S BUILT / PHASES — new rows

| Phase / build | Status |
|---|---|
| Exposure Engine Block 1 (walking risk, no schema) | 🟡 BUILT local · typechecks clean · **not deployed, not walked** · copy DRAFT |
| Exposure Engine Block 2 (`precedence_links` + framework warnings) | 🟡 BUILT local · **migration pending** · not walked · copy DRAFT |
| Value Ledger schema + 6 emission hooks + backfill | 🟡 BUILT local · **migration pending** · not walked |
| AI valuation scorer (Inngest, 4 dimensions) | 🟡 BUILT local · **never run against a live record** |
| Value Ledger **inside `/readout`** + PDF block | 🟡 BUILT local · PDF **rasterized and visually verified (2 pages)** · page not walked · copy DRAFT |
| Dashboard fifth card + readout gate widened to execs | 🟡 BUILT local · not walked · **changes two settled v2.58/T1B3 decisions, by decision** |

---

## 7. ✅ OPEN LOOPS — replace the table with this

| # | Loop | Note |
|---|---|---|
| 🔴 1 | **Run the two v2.60 migrations** | `supabase/value-ledger.sql` then `supabase/exposure-precedence-links.sql`. SQL FIRST, then push — deployed code hitting a missing table 500s. |
| 🔴 2 | **Apply the patch + push** | Git from Brian's PowerShell only. Nothing in v2.60 is live. |
| 🔴 3 | **v2.60 copy approval** | Names + placement + gate APPROVED 2026-08-06. Still open: the page/section body copy, one changed T1B3 PDF footer line, and the three added assumption inputs. |
| 🔴 4 | **Browser-walk v2.60** | `/exposure` both blocks + empty states · `/ledger` three tiers, edit a rate and watch it move, no-rates state · readout + PDF with and without rates · "Close this" → pre-filled campaign. **The browser eyeball is the only thing that closes a UI beat.** |
| 🟡 5 | **Seed + backfill the demo org** | `node scripts/seed-exposure-ledger-demo.mjs` then `POST /api/ledger/backfill` (admin), then `{with_scoring:true}` deliberately. |
| 🟡 6 | **Decide on the 3 added assumption inputs** | Keep them, or ship 3 of 6 event types dark. See copy draft §6. **The one call still open.** |
| 🟡 7 | v2.57 remaining walk beats | Opposing-position conflict → CONTESTED + compare panel · model-kill fail-open (~15 min) |
| 🟡 8 | Demo walk-order docs update | Dashboard beats changed in v2.58 — Brian's item |
| 🟡 9 | Repo copy of MASTER-STATE | Overwrite with v2.60 on next commit |
| 🟢 10 | Optional seat fix | Richard Jenkins → `persona='technical_director'` for the Expert welcome (data, not a bug) |
| 🟢 11 | Latent diagnostic race in `claude.ts` | The older `getLast…Diagnostic()` helpers share the module-global pattern v2.60 just moved away from |

**Then THE BOARD IS GTM-ONLY** *(unchanged — pick first 5 accounts · warm-pilot rate · compliance wrap · IP counsel · 10 no-discovery conversations · domain + logo export + outbound automation)*.

---

## 8. GTM — one line to fold in

The pricing anchor stays **REPLACEMENT COST, never savings claims**. The Ledger does not change that: it is the same anchor with the customer's own arithmetic attached, and it says "no saving is claimed" on every surface it appears on. **Ramp-time remains the one safe CFO number.**
