# 🕷️ MASTER STATE — Execution Only

**v2.23 · Updated July 24, 2026 (P-4.5 Win Column shipped, deployed, seed-verified, and browser-verified end-to-end) · REPLACES all prior versions in full**
Strategy/positioning: STRATEGY.md (v3) · Core IP: ELICITATION-ENGINE-SPEC.md + ADDENDUM-2026-07-22 (v2) · Doc map: DOC-INDEX.md · North star: ENTERPRISE-OPERATING-BRAIN-CONCEPT-2026-07-21.md · Plan of record: ROADMAP-operating-brain-2026-07-22.md (v4)

⚠️ **System clarification (unchanged, still true):** This app (Supabase/Next.js) and the Airtable base `appV7vsagYFlfxLsG` ("LIT Spiderweb") are two SEPARATE systems. Airtable is a manually-curated LIT content + sales-demo tool — NOT this app's database.

---

## ⚡ 30-SECOND VERSION

⭐⭐⭐ **THE WIN COLUMN IS COMPLETE AND LIVE (P-4.5, July 24).** Mention-based recognition: experts author frameworks, everyone else named IN those frameworks gets seen without writing anything themselves. Ranked mention view · N-expert corroboration badges ("Cited by 3 experts," the headline signal, not raw count) · extractive context chips (verbatim quotes, never model-paraphrased) · cross-dept impact badge · rising signal (accelerating mention cadence) · retention watch (named win-drivers gone quiet, framed as a check-in prompt, never a judgment) · one-click evidence packet (copyable/printable promotion case). **Wins-only rollup enforced in code, not convention** — `aggregateWinColumn()` in `src/lib/win-column.ts` is the single place pattern_records become person-level data, and it filters to `trigger_type='win'` before anything else happens; both API routes additionally scope their own queries the same way (defense in depth). Seed-verified AND browser-verified live: a planted failure record naming the org's most-corroborated person (Marcus Webb) is proven absent from every rollup surface. ⏭️ Next build: **P-5 (Polish + demo)** — prompt not yet issued, no blockers.

⭐ **P-4.5 caught a real bug via the standing browser-eyeball rule, not the seed script.** The evidence-packet page double-URL-encoded a person's name in its client-side fetch ("marcus webb" → "marcus%2520webb", 404) — invisible to `scripts/seed-p4-5.mjs`'s DONE test because that harness never goes through the Next.js router/URL layer at all. Caught live clicking from the ranked list into Marcus Webb's card, fixed (decode defensively before re-encoding), redeployed, re-verified live. Filed as a standing lesson: a passing seed/API-level DONE test does not substitute for actually clicking through the deployed UI.

⭐⭐⭐ **THE PRESCRIPTION ENGINE IS COMPLETE AND LIVE (P-4A + P-4B, July 24).** Full loop shipped, deployed, seed-verified, and independently browser-verified end-to-end: detection → triage → pairing → ROI queue **(P-4A)** → manager gate → expert fidelity check → training generation (3 altitudes) → teach-back → efficacy loop + auto-escalation → regenerate **(P-4B)**.

⭐⭐⭐ **P-4B INDEPENDENT BROWSER VERIFICATION (July 24) — every build confirmed on live UI.** Walked `/prescriptions` and the clamping-drift detail page. Queue shows all four efficacy end-states simultaneously: **escalated** (rung 2→3, with the exact post-delivery recurrence record named) · **approved/in-flight** (HR capture-first) · **proven effective/closed** (conflict prescription, quiet 20 days vs. a 14-day window, labeled "Kirkpatrick Level 4, measured automatically") · **snoozed** (wakes 7/30, "snooze defers, never deletes"). Detail page confirmed: manager approval attributed to Elena Ruiz · expert fidelity check showing David Chen's ✓ *"Yes, that's how I think"* · three training altitudes (Floor / Supervisor / Executive) · **regenerate with v2/v1 versioning and the redesign reason preserved** · teach-back scored with full rubric feedback · efficacy loop state with escalation rationale.

**⭐ Three things the verification surfaced as genuinely strong:**
1. **Regenerate is a designer, not a re-roll.** The stored reason — *"Night crew won't sit through a walkthrough — give the facilitator something more hands-on"* — produced a materially different strategy (hands-on card-sorting diagnosis drill vs. a walkthrough). Constraint in, redesign out.
2. **Teach-back grades judgment, not recall.** Tom Whitfield's answer recited the framework correctly and still scored 40/100 — the grader caught that he treated already-given evidence as an open question, then recommended the play anyway, which is precisely the boundary violation the framework warns against. Grading *applied judgment in this situation* is the hard part of teach-back, and it worked.
3. **Blameless doctrine holds where it's most tempting to break.** The escalation names a *record* ("The Cold-Fixture Gate," dated after delivery) under evidence, with explicit copy: *"records, never people."* **P-4.5 extends this doctrine one level further: not just "name records, not people" in copy, but "never let a failure record reach a person-level view at all," enforced in code.**

⭐ **P-4B same-day correction (already fixed + pushed).** After the initial clean run, `diag-efficacy.mjs` caught the escalation case going unsatisfiable on repeat runs: `delivered_at` recomputes to `now − 10 days` every run, but the planted recurrence record was gated on an *existence* check rather than a *freshness* check — so its fixed timestamp went stale and silently stopped post-dating delivery. Fixed in `scripts/seed-p4b.mjs` (commit `4698140`, dev-only seed script — deployed app `c65000f` unaffected). Re-run verified. **Generalized gotcha filed** (see Gotchas: relative-time idempotency guards need freshness checks, not existence checks).

⭐⭐⭐ **P-4A (July 23) — the demonstration that matters.** The clamping-drift prescription reconstructs a story across three experts over three months: David Chen solves fixture thermal drift on CNC Line 2 (4/26) → Tom Whitfield recognizes the same signature on Line 5 (7/15) → Elena Ruiz reads four weeks of scrap reports and names it a *training* gap, not an engineering one (7/20). The engine independently reached Elena's conclusion **and named who should teach it**. P-4B then proved the other half: when the fix genuinely doesn't transfer, the engine catches the recurrence and escalates instead of silently declaring victory. ⭐ Second win: on the HR gap, a 0.863-similarity framework ("The Onboarding Lottery Fix") was correctly ruled **adjacent-but-not-covering** — close ≠ covering fired exactly right.

⭐ **KNOWN BIAS LOGGED — ROI ranking (deferred to P-5, not a defect):** ROI = recurrence × rung severity systematically ranks conflict-sourced prescriptions **last**, because conflicts are rung-clamped to ≤2. A live contradiction is the most *time-sensitive* item — two teams act on opposing guidance today, while "capture HR's knowledge" has no clock. Cheap-and-urgent sinks instead of floating. **Fix specced:** separate **urgency** from **effort** — urgency dimension (conflict = high · entity recurrence = medium · coverage gap = low), sort by urgency with ROI as tiebreak, or apply an urgency multiplier. Keep exec-recomputable; show both numbers.

⭐⭐⭐ **P-3 FULLY CLOSED (July 23)** — contested badges render on both sides of the Priya×Angela conflict in `/library` AND `/retrieve`; surface-with-warning holds visually across the P-2 → P-3 → P-4A chain. **P-2 · P-1 · P-0.5 · P-0 — all DONE + DEPLOYED.** Entity Map field #8 feeds P-2, P-3, P-4A pairing, and now (P-4.5) mention aggregation.

⭐⭐⭐ **FOCUS LOCKED (July 21):** Track B ONLY — the enterprise "operating brain." Success gate = **$250K/year income replacement — hit it or pivot.**

⭐⭐⭐ **BUILD-FIRST LOCKED (July 22):** NO pitch/pilot/GTM until a polished, demo-able prototype. Warm pilot AFTER P-5 passes.

**Data state:** real = 503 approved + 769 pending. Real = bdhicks83@gmail.com · test = bdhicks83+test1@gmail.com. **Live demo org "Meridian Precision Manufacturing (DEMO)":** 5 expert accounts (`Demo-Meridian-2026!`) — Elena Ruiz (Executive, `profiles.role='manager'`) · Priya Nair (Technical Director) · David Chen (Technical Director) · Angela Brooks (Sr. Manager) · Tom Whitfield (Sr. Manager). **20 frameworks in `/library`** (⚠️ doc previously said 21 — reconcile in P-5 seed pass; likely one record not `complete`) **+ 3 more added by P-4.5 Build 5** (1 failure record naming Marcus Webb for the guardrail proof, 2 new win records for Jamal Foster and Renata Silva) — 17 pattern_records total in the org now. All embedded. **4 prescriptions, all walked through the full lifecycle:** entity-signal clamping-drift (escalated 2→3 on a real post-delivery recurrence) · HR (capture-first, approved) · Finance/Controller (capture-first, snoozed to 7/30) · Priya×Angela conflict (delivered, quiet 20 days, marked effective/closed). Demo conflict OPEN (if resolved by a live test: `node scripts/seed-p2-conflict.mjs --force`, then `node scripts/seed-p4a.mjs`). **Win Column corroboration clusters live:** Marcus Webb (3 experts, rising signal, cross-dept) · Denise Ortiz (2 experts, cross-dept) · Jamal Foster (1 expert, single-mention honest render) · Renata Silva (1 expert, retention watch).

---

## 🧱 STACK (locked, unchanged)

Supabase (Postgres) · Next.js/TS · Inngest · Vercel · Claude (claude-sonnet-5) · Voyage AI (voyage-large-2 / 1536) · Remotion + ElevenLabs (deprioritized) · no agent frameworks

Local: `C:\Users\BDHIC\Claude\Projects\LIT Repository\spiderweb` · Repo: `bdhicks83-ui/spiderweb` · Host: `spiderweb-nine.vercel.app` · Dev ritual: spiderweb-dev-environment.md

**Gotchas:** SQL editor `auth.uid()` doesn't resolve — use `a7d205f0-778c-44b9-9e13-4ebd5f47e964` · never assume `content[0]` is text — find first `type:"text"` block · delete `connections` before `insights` · always say local vs. live · **P-3 threshold = 0.75 cosine (TUNED live)** — voyage-large-2 compresses cosine high (unrelated ~0.62–0.69, on-target ~0.85); P-4A reuses it verbatim — do not re-derive · **P-3:** `search_pattern_records_by_query` is SECURITY INVOKER on purpose (user RLS scopes it) · **P-4A:** `search_pattern_records_by_query_for_org` is SECURITY DEFINER **on purpose** (service-role detector, explicit org pin), EXECUTE revoked from anon/authenticated — do NOT collapse either into the other · **P-4A:** detections dedupe on `(org_id, dedupe_key)`; re-running detection is always safe · **P-4A:** rung ceilings (conflict ≤2, entity ≤3) clamp DOWN only; triage/coverage model failures = NO prescription (fail open) · **P-4A:** dept token-subset name merging applies to `department` entities ONLY — **people need their own conservative matcher (P-4.5 shipped this: exact-normalized-string only, deliberately not fuzzy — see DECISION-LOG) — prefer under-merging to over-merging** · **P-4A:** `scripts/seed-p4a.mjs` copy-mirrors prescription.ts + pattern-embedding.ts + the two claude.ts helpers — keep in sync · **P-4A (fixed):** `let rung: number` needs explicit annotation (TS2322) · **P-3:** pattern_records embed as `document`, queries as `query` — don't mix · backfill/seed `buildEmbeddingText` is a verbatim mirror (copy-don't-import) · **P-0.5:** capture-time PII scrubbing intentionally OFF · **Supabase SQL editor runs a pasted script as ONE transaction — paste complete migrations as one block** · `_to_delete/` gitignored AND tsconfig-excluded (safe to empty) · **PowerShell 5.1: no `&&`** — separate lines or `if ($LASTEXITCODE -eq 0) { }` · raw multi-column `.select()` → cast to explicit row type · RLS on profiles querying profiles → `current_org_id()` SECURITY DEFINER · `tsconfig.p2/p3/p4a/p4b/p4-5.json` are ready scoped typecheck configs; local typecheck is the gate · client pages must NOT import server-only libs pulling `@/lib/claude` (fs) · **browser autofill hazard:** `/login` re-injects Brian's saved creds — set fields programmatically then submit · **device bridge limits:** npm registry can be 403; NO outbound internet AND cannot git commit (no identity, object-permission errors on mounted `.git`) — live scripts AND git commands run from Brian's PowerShell · NO sign-out button — incognito (or `/login` replaces the session) for user switching (P-5) · **browser-verify note:** clicking the queue's ROI/evidence text does not navigate — grab the row's `<a href>` directly when driving programmatically · **P-4B (confirmed):** Anthropic client needs explicit `timeout: 60_000` + `maxRetries: 0` on BOTH `src/lib/claude.ts` and seeds — with no timeout a stalled connection hangs up to the SDK's 10-min default and looks like a frozen terminal · **P-4B (confirmed):** any reasoning-heavy scoring/judging call needs `max_tokens: 8000`, not ~1000 — sonnet-5 can burn the whole budget on internal reasoning and emit an EMPTY text block at `stop_reason=max_tokens`, which looks like a parse failure but isn't · **P-4B (confirmed):** `parseJson`/`parseJsonLoose` run a `repairJsonControlChars` pass (escapes raw newlines/tabs inside JSON string literals) — keep mirrored between `src/lib/claude.ts` and seeds · **P-4B (confirmed):** `runEfficacyLoop` must exclude a prescription's own founding records (`detection.evidence_record_ids`) from its recurrence match — otherwise backdated demo `delivered_at` makes founding records look like recurrences; keep mirrored between `src/lib/prescription.ts` and the seed · **P-4B:** any seeded timestamp computed as "N days before now" on EVERY run (e.g. `delivered_at`) must be paired with a **freshness check**, not just an existence check, on any OTHER planted record whose relative timing matters against it — an idempotency guard that only asks "does this exist" goes silently wrong once the sibling value moves and the planted one doesn't · **P-4B:** `scripts/diag-efficacy.mjs` is a READ-ONLY diagnostic (no model calls, no writes) dumping exactly what the efficacy loop would match, with a FOUNDING/not-founding flag per record — run it whenever efficacy escalation looks wrong, before touching code; it caught the freshness bug. · **P-4.5 (NEW, July 24):** a client-side page that re-encodes a dynamic route param (e.g. `useParams().person`) must decode it defensively FIRST — Next's router may hand back an already-encoded segment, and `encodeURIComponent` on top of that double-encodes (`%20` → `%2520`) and silently 404s. Caught only by clicking through the deployed UI, not by any API-level or seed-script test — reinforces the standing browser-eyeball rule rather than replacing it. · **P-4.5:** the wins-only guardrail is enforced ONCE, in `aggregateWinColumn()` (`src/lib/win-column.ts`) — every future person-level surface (evidence packet, any future export) MUST route through this function rather than re-deriving its own trigger_type filter, or the single-enforcement-point guarantee breaks.

---

## ✅ WHAT'S BUILT

| Built | Status | Role in Track B |
|---|---|---|
| P-4.5 Win Column (mention aggregation · ranked view · corroboration badges · context chips · cross-dept badge · rising signal · retention watch · evidence packet · wins-only rollup enforced in code) | ✅ **DONE + DEPLOYED + seed-verified + browser-verified Jul 24** | ⭐⭐⭐ Unsolicited third-party attribution — a recognition signal no self-nomination can match |
| P-4B Prescription Engine pt 2 (manager gate · fidelity check · training gen 3 altitudes · teach-back · efficacy loop + auto-escalation · regenerate · seed/verify harness) | ✅ **DONE + DEPLOYED + seed-verified + independently browser-verified Jul 24** | ⭐⭐⭐ Closes the full Prescription Engine loop |
| P-4A Prescription Engine pt 1 (detection rows · triage ladder w/ stored rationale · auto-pairing w/ capture-first · ROI queue + evidence-chain detail) | ✅ **DONE + DEPLOYED + browser-verified Jul 23** | ⭐⭐⭐ The payoff feature's front half |
| P-3 Contextual retrieval | ✅ **FULLY CLOSED Jul 23** | ⭐⭐⭐ The Copilot moment; semantic substrate for gap-finding |
| P-2 Conflict X-ray | ✅ **DONE + DEPLOYED Jul 23** — badges confirmed in `/library` AND `/retrieve` | ⭐⭐⭐ Detection input #1 for P-4A |
| P-1 Org/multi-user foundation | ✅ **DONE + DEPLOYED Jul 23** — org isolation browser-verified | ⭐⭐⭐ Foundation for everything org-scoped |
| P0 Elicitation Engine (/codify) | ✅ Done Jul 21 · hardened Jul 22 | ⭐⭐⭐ Capture |
| P-0.5 Methodology Router + Entity Map + guardrails | ✅ **DONE + DEPLOYED Jul 23** | ⭐⭐⭐ Entity map feeds P-2, P-3, P-4A, P-4.5 |
| Ask Your Spiderweb / Phase 6 | ✅ Built | Grounded-answer pattern reused by P-3 |
| Belief-revision depth gate | ✅ Locked · reused in P-2 | Conflict resolution + versioning |
| Phase 7 flag-never-block | ✅ Shipped · extended by P-2/P-3/P-4B snooze AND P-4.5 wins-only rollup | Doctrine |
| Multi-format output | ✅ Built | → P-4B training altitudes |
| Upload · Dashboard · Approve | ✅ Live | Supporting surfaces |

**❌ Cut permanently:** benchmarking · identity verification · external proof scoring · consumer marketplace · ERP/KPI/meeting ingestion

---

## 🛣️ PROTOTYPE PHASES (plan of record: ROADMAP v4)

| Phase | What | Status / DONE test |
|---|---|---|
| **P-0 Harden** | Flake fix · migration confirm | ✅ **DONE + DEPLOYED Jul 22** |
| **P-0.5 Capture upgrades** | Methodology router · Entity Map · caps · TTFV | ✅ **DONE + DEPLOYED Jul 23** |
| **P-1 Org / multi-user** | Org table · RLS · shared library · demo seed · persona picker | ✅ **DONE + DEPLOYED Jul 23** |
| **P-2 Conflict X-ray** | Cross-user detection · surface-with-warning badge · review UI | ✅ **DONE + DEPLOYED Jul 23** |
| **P-3 Contextual retrieval** | Situation → framework · embeddings · silent-fail fix · contested badges | ✅ **FULLY CLOSED Jul 23** |
| **P-4A Prescription Engine pt 1** ⭐ | Detection → triage ladder → auto-pairing → ROI queue + evidence chain | ✅ **DONE + DEPLOYED + browser-verified Jul 23** |
| **P-4B Prescription Engine pt 2** ⭐ | Manager gate → fidelity check → training (3 altitudes) → teach-back → efficacy loop + escalation → regenerate | ✅ **FULLY CLOSED Jul 24** — seed PASSED, deployed `c65000f`, same-day freshness fix `4698140`, re-verified, and independently browser-walked: all 4 efficacy end-states + v2/v1 regenerate + rubric-scored teach-back confirmed live. Training copy + manager-role model approved by Brian |
| **P-4.5 Win Column** | Mention aggregation · corroboration badges · context chips · evidence packet · rising signal · retention watch · **wins-only rollup enforced in code** | ✅ **FULLY CLOSED Jul 24** — DONE test PASSED, deployed, browser-verified live (logged in as Tom Whitfield): 3-expert Marcus Webb corroboration + rising signal + cross-dept ✓ · 2-expert Denise Ortiz + cross-dept ✓ · single-mention Jamal Foster renders honestly ✓ · Renata Silva retention watch fires ✓ · evidence packet compiles ✓ · guardrail failure record confirmed absent from every rollup surface ✓. One bug (double URL-encoding on the evidence-packet route) caught live by the browser eyeball, fixed same-session, redeployed. Recognition copy approved by Brian before shipping |
| **P-5 Polish + demo** | See P-5 list below | Final phase. DONE: full loop in 5 min without apologizing |

**🅿️ v2 (post-pilot):** Day-one onboarding path · voyage-4 migration.

### P-5 punch list (accumulating)
- Sign-out button
- ROI urgency-vs-effort ranking fix
- **Escalated prescription cards still show stale rung-2 language** — pairing text says "Micro-training" and the ROI line says "severity 2" after escalating to rung 3 (cosmetic, but a demo watcher will catch it)
- **Seed a PASSING teach-back score** — currently only a 40/100 failing example exists; the demo should show both outcomes
- Reconcile `/library` framework count (20+3 shown vs 21 originally expected before P-4.5's 3 additions — recount from scratch in the P-5 seed pass)
- "Yours" badge as seen from a non-author account
- Vary the `/retrieve` placeholder scenario so demo search doesn't look pre-loaded
- Outcome-nudge flow (6-month one-click follow-up)
- Replant the demo conflict if a live test resolves it
- Whether Win Column leads the pitch (open, customer-facing → Brian, deferred from P-4.5 spec)
- Full clean seed + UI polish pass + 5-minute demo script in locked order (now includes the Win Column moment per the addendum's demo script order)

---

## ✅ OPEN LOOPS

### 🔴 Blocking / near-term

| Loop | Note |
|---|---|
| **P-5 build session** | Prompt not yet issued. Nothing blocking — P-4.5 closed clean. |

### 🟠 Deferred until prototype done

Warm pilot · IP-clarity counsel (parallel prep) · second warm lead · enterprise pricing · Win-Column-as-pitch-lead call (customer-facing → Brian)

### 🟡 Decisions not locked

Brand-voice sign-off · 769 pending insights · P-3 threshold 0.75 (revisit only on real misses) · ROI ranking urgency-vs-effort fix (specced, deferred to P-5)

### 🟢 Doc + copy debt

Empty `_to_delete/` · MANIFESTO.md · marketing homepage · ARCHITECTURE.md (stale — predates P-0.5 through P-4.5) · DECISION-LOG sprawl · repo copy of this file trails the project copy by doc-only edits — fold in on next commit

---

## 🅿️ PARKING LOT (recoverable)

Solo wedge · creators · teachers · L&D-standalone · Archive jogger · Asset Strength solo · consumer marketplace · Bloom Consulting · video pipeline · AI-twin · Day-one onboarding path (v2) · voyage-4 migration · all prior framings.

---

## 👤 BRIAN'S ROLE

Solo Founder & CEO — final approver. Delegates execution; autonomous within session. Report back before finalizing: brand voice · pricing · anything customer-facing.

## 🧠 HOW BRIAN WORKS BEST (standing, ADHD, non-negotiable)

Short chunks · bullets/tables · ONE question at a time · phases w/ headers, current step only · batched setup · full files never snippets · heredoc for large pastes · **PowerShell-safe paste blocks (no `&&`)** · **SQL pasted directly in chat, never "go get the file"** · proactive Decision Log entries · flag heavier-tool handoffs · secrets out of chat.

**⭐ STANDING (July 23): ALWAYS run the browser eyeball myself.** Every build's DONE test includes driving Claude-in-Chrome to load the deployed UI, walk the feature's pages + one detail view, and visually confirm — never offer it as optional or hand it to Brian. Note: I cannot type passwords into fields — if no session is live, Brian logs in once and I drive everything after. **Reinforced by P-4.5 (July 24): the eyeball caught a real 404 bug (double URL-encoding on the evidence-packet route) that a passing seed-script DONE test never would have surfaced, because the seed script never goes through the router/URL layer. A passing API-level test is not a substitute for actually clicking through the deployed UI.**

**⭐ STANDING (July 24): git commits/pushes run from Brian's PowerShell, never the device bridge.** The bridge's mounted `.git` lacks a configured identity and hits object-permission errors — read/write files through it freely, but hand Brian the exact `git add`/`commit`/`push` paste block.
