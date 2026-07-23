# 🕷️ MASTER STATE — Execution Only

**v2.16 · Updated July 23, 2026 (evening) · REPLACES all prior versions in full**
Strategy/positioning: STRATEGY.md (v3) · Core IP: ELICITATION-ENGINE-SPEC.md + ADDENDUM-2026-07-22 (v2) · Doc map: DOC-INDEX.md · North star: ENTERPRISE-OPERATING-BRAIN-CONCEPT-2026-07-21.md · Plan of record: ROADMAP-operating-brain-2026-07-22.md (v4)

⚠️ **System clarification (unchanged, still true):** This app (Supabase/Next.js) and the Airtable base `appV7vsagYFlfxLsG` ("LIT Spiderweb") are two SEPARATE systems. Airtable is a manually-curated LIT content + sales-demo tool — NOT this app's database.

---

## ⚡ 30-SECOND VERSION

⭐⭐⭐ **P-4A (Prescription Engine, part 1 — detection → triage → pairing → ROI queue) BUILT (July 23 evening) — code on Brian's disk, NOT yet migrated/seeded/deployed.** The payoff pipeline's front half: **Build 1** detection over all three upstream inputs, stored as first-class rows (`prescription_detections`): conflict signals (open AND depth-gated-resolved P-2 rows), coverage gaps (dept in ≥2 other experts' records + zero records in its mapped ontology function + P-3 semantic confirm at the reused 0.75 threshold, with a model tiebreak when a near match ≥0.75 — close ≠ covering), entity signals (repeat error classes; trouble clusters, with duplicate-suppression so one problem = one prescription). **Build 2** triage agent → 4-rung severity-matched ladder, one-line rationale STORED, conservative bias enforced in prompt AND code (per-source rung ceilings, clamp down only; model failure = no prescription, fail open). **Build 3** deterministic auto-pairing: WHO HAS IT (framework author) ↔ WHO NEEDS IT (dept in the gap/error evidence); no expert → honest **capture-first** (DB constraint forbids invented facilitators). **Build 4** `/prescriptions` ROI-ranked queue (recurrence × severity, Thread ROI reapplied) + detail view with the full evidence chain back to source records. **Build 5** `scripts/seed-p4a.mjs` plants the entity-signal gap (3rd Shift Machining re-hitting David's solved clamping-drift error class) + the coverage gap (HR named by Tom + Elena, nothing authored) via the real pipeline, runs the engine live, and verifies all three prescription types PLUS six named non-gaps staying silent. **⏭️ To close P-4A: paste `p4a-prescription-engine.sql` → local typecheck (`tsconfig.p4a.json`) → `node scripts/seed-p4a.mjs` → git push (ships P-3 + P-4A together) → browser DONE test.** Full detail: claude/DECISION-LOG-NEW-ENTRY-2026-07-23-p4a-prescription-engine.md. **P-4B (next session): manager gate · expert fidelity check · training generation · teach-back · efficacy loop · regenerate.**

⭐⭐⭐ **P-3 (Contextual retrieval — the Copilot moment) BUILT + MIGRATED + BACKFILLED + DATA-VERIFIED (July 23) — only final deploy (git push, now shared with P-4A) + a browser DONE test remain.** Hardened Voyage client (silent-fail killed), `pattern_records` embeddings + org-scoped `search_pattern_records_by_query`, `/retrieve` UI with contested badges + honest "nothing codified" below the **0.75 tuned threshold**. Live verification passed 17/17 embedded; changeover query → contested pair @ ~0.85; unrelated @ 0.69 → nothing codified. Voyage Usage Tier 1 (2,000 RPM), voyage-large-2/1536 locked.

⭐⭐⭐ **P-2 (Conflict X-ray) DONE + DEPLOYED (July 23).** SURFACE-WITH-WARNING locked; 4 builds shipped + DONE-tested live. `framework_conflicts` rows now feed P-4A detection (consumed, live in code). Standing follow-up: no sign-out button (P-5).

⭐⭐⭐ **P-1 (Org foundation) DONE + DEPLOYED · P-0.5 DONE + DEPLOYED · P-0 DONE + DEPLOYED.** Entity Map field #8 now feeds P-2 (candidate pairing), P-3 (retrieval text), **and P-4A (detection + pairing — proven in code)**.

⭐⭐⭐ **FOCUS LOCKED (July 21):** Track B ONLY — the enterprise "operating brain." Success gate = **$250K/year income replacement — hit it or pivot.**

⭐⭐⭐ **BUILD-FIRST LOCKED (July 22):** NO pitch/pilot/GTM until a polished, demo-able prototype. Warm pilot AFTER P-5 passes.

⭐⭐⭐ **PRESCRIPTION ENGINE LOCKED (July 22) — the payoff feature; expanded P-4.** Pipeline: detection → triage → ladder → auto-pairing → queue **(= P-4A, built)** → manager gate → fidelity → training → teach-back → efficacy loop → regenerate **(= P-4B, next)**. Six upgrades locked (efficacy loop ⭐ · teach-back · manager gate · fidelity check · ROI queue ✅ built · day-one onboarding 🅿️ v2).

**Data state:** real = 503 approved + 769 pending. Real = bdhicks83@gmail.com · test = bdhicks83+test1@gmail.com. **Live demo org:** "Meridian Precision Manufacturing (DEMO)" — 5 expert accounts (password `Demo-Meridian-2026!`), 17 pattern_records all embedded; **seed-p4a adds 4 more (Tom ×2, Elena ×2), embedded at insert**. Demo conflict must be **OPEN** for the conflict-sourced prescription (if a live test resolved it: `node scripts/seed-p2-conflict.mjs --force` first).

---

## 🧱 STACK (locked, unchanged)

Supabase (Postgres) · Next.js/TS · Inngest · Vercel · Claude (claude-sonnet-5) · Voyage AI (voyage-large-2 / 1536) · Remotion + ElevenLabs (deprioritized) · no agent frameworks

Local: `C:\Users\BDHIC\Claude\Projects\LIT Repository\spiderweb` · Repo: `bdhicks83-ui/spiderweb` · Host: `spiderweb-nine.vercel.app` · Dev ritual: spiderweb-dev-environment.md

**Gotchas:** SQL editor `auth.uid()` doesn't resolve — use `a7d205f0-778c-44b9-9e13-4ebd5f47e964` · never assume `content[0]` is text — find first `type:"text"` block · delete `connections` before `insights` · always say local vs. live · **P-3 threshold = 0.75 cosine (TUNED live)** — voyage-large-2 compresses cosine high (unrelated ~0.69, on-target ~0.85); **P-4A reuses it verbatim for coverage confirm — do not re-derive** · **P-3:** `search_pattern_records_by_query` is SECURITY INVOKER on purpose (user RLS scopes it) · **P-4A:** `search_pattern_records_by_query_for_org` is SECURITY DEFINER **on purpose** (detector runs as service role, needs the explicit org pin) with EXECUTE revoked from anon/authenticated — do NOT "simplify" either one into the other · **P-4A:** detections dedupe on `(org_id, dedupe_key)`; re-running detection is always safe · **P-4A:** rung ceilings (conflict ≤2, entity ≤3) clamp DOWN only; triage/coverage model failures = NO prescription (fail open) · **P-4A:** dept token-subset name merging applies to `department` entities ONLY · **P-4A:** `scripts/seed-p4a.mjs` copy-mirrors prescription.ts + pattern-embedding.ts + the two new claude.ts helpers — keep in sync · **P-3:** pattern_records embed as `document`, queries as `query` — don't mix · backfill/seed `buildEmbeddingText` is a verbatim mirror (copy-don't-import) · **P-0.5:** capture-time PII scrubbing intentionally OFF · **Supabase SQL editor runs a pasted script as ONE transaction — paste complete migrations as one block** · **`_to_delete/`** is gitignored AND tsconfig-excluded (now also holds P-4A staging debris; safe to empty) · **PowerShell 5.1: no `&&`** — separate lines or `if ($LASTEXITCODE -eq 0) { }` · raw multi-column `.select()` → cast to explicit row type · RLS on profiles querying profiles → `current_org_id()` SECURITY DEFINER · `tsconfig.p2.json` / `tsconfig.p3.json` / **`tsconfig.p4a.json`** are ready scoped typecheck configs; local typecheck is the gate · client pages must NOT import server-only libs pulling `@/lib/claude` (fs) · **cloud-session limits:** npm registry can be 403; the on-device shell sandbox has NO outbound internet — live scripts run from Brian's PowerShell · NO sign-out button — incognito windows (P-5).

---

## ✅ WHAT'S BUILT

| Built | Status | Role in Track B |
|---|---|---|
| P-4A Prescription Engine part 1 (detection rows · triage ladder w/ stored rationale · auto-pairing w/ capture-first · ROI queue + evidence-chain detail · seed/verify harness) | 🟡 **BUILT on disk Jul 23 — pending SQL paste → typecheck → seed/verify → git push → browser DONE test** | ⭐⭐⭐ The payoff feature's front half; P-4B consumes its rows |
| P-3 Contextual retrieval | 🟢 **BUILT + migrated + backfilled + data-verified Jul 23 — pending the same git push + browser DONE test** | ⭐⭐⭐ The Copilot moment; semantic substrate P-4A's gap-finder now consumes (live in code) |
| P-2 Conflict X-ray | ✅ **DONE + DEPLOYED Jul 23** | ⭐⭐⭐ Detection input #1 for P-4A (consumed) |
| P-1 Org/multi-user foundation | ✅ **DONE + DEPLOYED Jul 23** | ⭐⭐⭐ Foundation for everything org-scoped |
| P0 Elicitation Engine (/codify) | ✅ Done Jul 21 · hardened Jul 22 | ⭐⭐⭐ Capture |
| P-0.5 Methodology Router + Entity Map + guardrails | ✅ **DONE + DEPLOYED Jul 23** | ⭐⭐⭐ Entity map now feeds P-2 + P-3 + **P-4A detection/pairing** |
| Ask Your Spiderweb / Phase 6 | ✅ Built | Grounded-answer pattern reused by P-3 |
| Belief-revision depth gate | ✅ Locked · reused in P-2 · **filters P-4A resolved-conflict detections** | Conflict resolution + versioning |
| Phase 7 flag-never-block | ✅ Shipped · extended by P-2/P-3 | Doctrine |
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
| **P-3 Contextual retrieval** | Situation → framework · embeddings · silent-fail fix | 🟢 **BUILT + verified — pending git push + browser DONE test** |
| **P-4A Prescription Engine pt 1** ⭐ | Detection → triage ladder → auto-pairing → ROI queue + evidence chain | 🟡 **BUILT Jul 23 — DONE test = seed-p4a.mjs passes (3 prescription types · correct rungs w/ one-line rationales · concrete pairings or honest capture-first · ranked queue · evidence chain · 6 non-gaps silent) + browser walkthrough** |
| **P-4B Prescription Engine pt 2** ⭐ | Manager gate → expert fidelity → training generation (3 altitudes) → teach-back → efficacy loop + auto-escalation → regenerate | ⏭️ NEXT SESSION — consumes P-4A's rows |
| **P-4.5 Win Column** | Mention aggregation · corroboration · wins-only rollup | Seed clusters live |
| **P-5 Polish + demo** | Full seed · UI polish · **sign-out button** · outcome-nudge · 5-min script | DONE: full loop in 5 min |

**🅿️ v2 (post-pilot):** Day-one onboarding path.

---

## ✅ OPEN LOOPS

### 🔴 Blocking / near-term

| Loop | Note |
|---|---|
| **Close P-4A (+P-3 rides the same push)** | In order, all Brian-side: ① paste `supabase/p4a-prescription-engine.sql` (ONE block) · ② `npx tsc -p tsconfig.p4a.json` · ③ `node scripts/seed-p4a.mjs` (replant conflict first with `seed-p2-conflict.mjs --force` if it got resolved) · ④ git add/commit/push → Vercel · ⑤ browser DONE test: /prescriptions queue + detail as a Meridian expert; also P-3's pending badge-render + fresh-codify-embeds checks. |
| P-4B build session | Prompt ready on request once P-4A closes. |

### 🟠 Deferred until prototype done

Warm pilot · IP-clarity counsel · second warm lead · enterprise pricing · Win-Column-as-pitch-lead call (customer-facing → Brian)

### 🟡 Decisions not locked

Brand-voice sign-off · 769 pending insights · P-3 threshold 0.75 (revisit only on real misses) · P-4A ROI formula is recurrence × rung — revisit if the queue orders feel wrong with real data (deliberately exec-recomputable)

### 🟢 Doc + copy debt + small chores

sign-out button (P-5) · empty `_to_delete/` (P-3 tarball + P-4A staging debris) · MANIFESTO.md · marketing homepage · ARCHITECTURE.md (stale — predates P-0.5 through P-4A) · DECISION-LOG sprawl (new dated files per convention)

---

## 🅿️ PARKING LOT (recoverable)

Solo wedge · creators · teachers · L&D-standalone · Archive jogger · Asset Strength solo · consumer marketplace · Bloom Consulting · video pipeline · AI-twin · Day-one onboarding path (v2) · voyage-4 migration · all prior framings.

---

## 👤 BRIAN'S ROLE

Solo Founder & CEO — final approver. Delegates execution; autonomous within session. Report back before finalizing: brand voice · pricing · anything customer-facing.

## 🧠 HOW BRIAN WORKS BEST (standing, ADHD, non-negotiable)

Short chunks · bullets/tables · ONE question at a time · phases w/ headers, current step only · batched setup · full files never snippets · heredoc for large pastes · **PowerShell-safe paste blocks (no `&&`)** · **SQL pasted directly in chat, never "go get the file"** · proactive Decision Log entries · flag heavier-tool handoffs · secrets out of chat.
