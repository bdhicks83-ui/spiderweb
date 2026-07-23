# 🕷️ MASTER STATE — Execution Only

**v2.7 · Updated July 22, 2026 (evening) · REPLACES all prior versions in full**
Strategy/positioning: STRATEGY.md (v3) · Core IP: ELICITATION-ENGINE-SPEC.md + ADDENDUM-2026-07-22 (v2) · Doc map: DOC-INDEX.md · North star: ENTERPRISE-OPERATING-BRAIN-CONCEPT-2026-07-21.md · Plan of record: ROADMAP-operating-brain-2026-07-22.md (v4)

⚠️ **System clarification (unchanged, still true):** This app (Supabase/Next.js) and the Airtable base `appV7vsagYFlfxLsG` ("LIT Spiderweb") are two SEPARATE systems. Airtable is a manually-curated LIT content + sales-demo tool — NOT this app's database.

---

## ⚡ 30-SECOND VERSION

⭐⭐⭐ **P-0.5 BUILD COMPLETE (July 22, evening) — code done, engine live-tested, DB migration + click-through pending.** Methodology Router (5 methods, offer+suggest), Entity Map (field #8, names kept internally), 20-min session cap + save/resume, time-to-first-value instrumentation — all built. Live-ran all 5 trigger types end-to-end against the real Claude API: every session completed all 8 fields, the win-type session captured a named person, save/resume proved via mid-session snapshot+continuation, export-time PII scrub verified (name stripped from a synthetic exported framework). **Two things still need Brian:** (1) paste `supabase/p0.5-methodology-entity-guardrails.sql` into the Supabase SQL editor — this build could not apply it directly (no direct DB credentials, only the app's anon/service keys); (2) reconnect the desktop bridge so the finished files can land in the repo and a real browser click-through + `npm run build`/git commit can run — the bridge dropped mid-build. Full detail: DECISION-LOG 2026-07-22 (Methodology Router + Entity Map).

⭐⭐⭐ **FOCUS LOCKED (July 21):** Track B ONLY — the enterprise "operating brain." Success gate = **$250K/year income replacement — hit it or pivot.** Everything else parked, recoverable.

⭐⭐⭐ **BUILD-FIRST LOCKED (July 22):** NO pitch/pilot/GTM until a polished, demo-able prototype. Warm pilot at Brian's company opens AFTER P-5 passes.

⭐⭐⭐ **PRESCRIPTION ENGINE LOCKED (July 22 evening) — the payoff feature; expanded P-4.** The brain doesn't just store judgment and flag problems — **it prescribes the fix and knows exactly who needs it.** Pipeline: detection (conflict X-ray · coverage gaps · entity signals) → triage agent sizes the gap → severity-matched intervention ladder (clarification card → micro-training → designed session → full curriculum) → **auto-paired audience** (entity map knows who has the knowledge and who needs it: "pair Torres with the second-shift press crew, here's the session") → regenerate-on-request (L&D curriculum agent redesigns with a different approach). Six upgrades locked:
1. **Efficacy loop + auto-escalation** ⭐ — detection keeps watching post-prescription; error recurs → auto-escalate one rung + flag; goes quiet → marked effective. Kirkpatrick Level 4 measured automatically — the enterprise-pricing justifier
2. **Teach-back check** — post-training fresh scenario from the framework; retrieval practice; feeds efficacy loop
3. **Manager approval gate** — one-click approve/snooze before anything lands on a team (flag-never-block family; pilot political safety)
4. **Expert fidelity check** — 60-second expert confirmation before a curriculum built from their framework ships (fidelity doctrine at the transfer layer)
5. **Prescription queue, ROI-ranked** — recurrence × severity; execs see a prioritized list, not a firehose (reuses Thread ROI ranking)
6. **Day-one onboarding path** — 🅿️ flagged v2 (post-pilot; needs library depth): new hire tagged to role/equipment → auto-assembled curriculum

⭐⭐⭐ **ELICITATION UPGRADES — P-0.5 (built July 22, see above):**
1. **Methodology Router (P-0.5):** rung 2 routes trigger → method. 💥 5 Whys + Fishbone (Toyota) · 🏆 AAR + Success Case (Army/Brinkerhoff) · ⚠️ Pre-mortem (Klein) · 🔁 A3 (Lean) · 🧠 CDM (Klein). Rungs 1–3 universal; 4/5/7 (signal/reasoning/boundaries) swap per method; rung 6 (new) is the Entity Map. Offer + suggest, never force. Boundaries mandatory everywhere.
2. **Entity Map (P-0.5):** Pattern Record field #8, polymorphic (equipment · process · error class · role/person · department). PII exception: names kept internally under org-scoped RLS; **capture-time scrub removed entirely** — scrub now runs only at export (PDF generation), a deliberate decision (see DECISION-LOG 2026-07-22).
3. **Win Column (P-4.5):** mention-based recognition — corroboration badges · context chips · evidence packets · rising signal · retention watch · cross-dept badge. **Wins-only rollup, enforced in code.** (Not yet built — P-4.5.)

⭐⭐⭐ **EXPERT TIER:** execs + technical directors + sr. managers. Persona-aware templates — **wired in P-0.5** (profiles.persona column + 4 persona prompt fragments); no persona-picker UI yet, set manually per profile until P-1 onboarding covers it.

⭐⭐⭐ **PM ADDS:** 20-min cap + save/resume · time-to-first-value instrumentation · outcome nudge · seed with Brian's company's real domain · single-player value sacred · demo order: codify win → framework → Win Column live → retrieval → conflict → **prescription end-to-end**.

⭐⭐⭐ **P0 ENGINE DONE (July 21):** /codify built, type-clean, founder-accepted. Watch: first-render flake; confirm migration.

⭐⭐ **Elicitation, not ingestion.** ⭐⭐ **Fidelity, not accuracy.** ⭐ **Brain substrate + specialist agents** (conflict-detector · L&D/prescription · gap-finder · recognition). ⭐ **Moat:** engine + org pattern library — now also: **the prescription layer is only as good as the detection, and the detection only exists because of the upstream capture. Competitors must rebuild the whole chain.**

**Data state (unchanged):** real = 503 approved + 769 pending. Real = bdhicks83@gmail.com · test = bdhicks83+test1@gmail.com.

---

## 🧱 STACK (locked, unchanged)

Supabase (Postgres) · Next.js/TS · Inngest · Vercel · Claude (claude-sonnet-5) · Voyage AI · Remotion + ElevenLabs (deprioritized) · no agent frameworks

Local: `C:\Users\BDHIC\Claude\Projects\LIT Repository\spiderweb` · Repo: `bdhicks83-ui/spiderweb` · Host: `spiderweb-nine.vercel.app` · Dev ritual: spiderweb-dev-environment.md

**Gotchas:** SQL editor `auth.uid()` doesn't resolve — use `a7d205f0-778c-44b9-9e13-4ebd5f47e964` · never assume `content[0]` is text · Voyage rate-capped 3/min w/o payment, `/api/embed-insights` fails silently · delete `connections` before `insights` · always say local vs. live. **New (P-0.5):** capture-time PII scrubbing is intentionally OFF (see DECISION-LOG) — don't reintroduce a scrub call in `/api/codify/answer` without re-reading that decision first.

---

## ✅ WHAT'S BUILT

| Built | Status | Role in Track B |
|---|---|---|
| P0 Elicitation Engine (/codify) | ✅ Done Jul 21 | ⭐⭐⭐ Capture — base ladder + Pattern Record |
| **P-0.5 Methodology Router + Entity Map** | ✅ **Code complete + live engine-tested Jul 22.** DB migration written, not yet applied (needs Brian to paste into Supabase SQL editor). Full browser click-through + `npm run build` pending desktop reconnect. | ⭐⭐⭐ Feeds P-1 (persona/org), P-2 (conflict inputs), P-4 (entity signals + auto-pairing), P-4.5 (named mentions) |
| Phase 6 Consultative Ask | ✅ Live-tested | Chassis |
| checkConsistency | ✅ Live | → conflict X-ray (P-2) → prescription detection input |
| Clustering / connections (0.82) | ✅ Live | Conflict pairs + gap clustering |
| Belief-revision depth gate | ✅ Locked | Conflict resolution + versioning |
| Ask Your Spiderweb | ✅ Built | Copilot surface seed (P-3) |
| Multi-format output | ✅ Built | → prescription output formats (P-4) |
| Phase 7 flag-never-block | ✅ Shipped | Doctrine → manager approval gate + wins-only rollup |
| Phase 5 quality / Growth Score | ✅ Built | Asset Strength foundation (parked) |
| Upload · Dashboard · Approve | ✅ Live | Supporting surfaces |
| Marketing homepage · video | ✅ Built | Off-message / deprioritized |

**❌ Cut permanently:** benchmarking · identity verification · external proof scoring · consumer marketplace · ERP/KPI/meeting ingestion

---

## 🛣️ PROTOTYPE PHASES (plan of record: ROADMAP v4)

| Phase | What | DONE test |
|---|---|---|
| **P-0 Harden** | First-render flake fix · migration confirm | 10 consecutive first-try renders |
| **P-0.5 Capture upgrades** | Methodology router (5 methods, persona-aware) · Entity Map field #8 · 20-min cap + save/resume · time-to-first-value | ✅ **Code + live engine test done Jul 22** — 5 sessions (one per trigger) → 5 complete 8-field records, real Claude API, win-type captured a named person, save/resume proved. **Remaining before this phase can be called fully DONE:** apply the SQL migration live, run the same 5 sessions through the actual browser UI once the desktop bridge is back |
| **P-1 Org / multi-user** | Org table · org_id + RLS · shared library · seed Brian's-company domain, 3 personas, backdated timestamps | Any member sees whole org library |
| **P-2 Conflict X-ray** | Cross-user checkConsistency · candidate pairs · overlapping-boundaries + opposing-judgment only · review UI · planted conflict | Planted conflict flags in review screen |
| **P-3 Contextual retrieval** | Situation → framework · embeddings over pattern_records · **blocked on Voyage decision** | Seeded scenario returns matching framework |
| **P-4 Prescription Engine** ⭐ | Detection inputs (P-2 conflicts + coverage gaps + entity signals) → triage agent → intervention ladder (4 rungs) → auto-pairing → ROI-ranked queue → manager approval gate → expert fidelity check → training generation w/ 3 audience altitudes → teach-back check → **efficacy loop + auto-escalation** → regenerate-on-request | One prescription end-to-end from planted conflict: proposed → manager-approved → expert-confirmed → generated → teach-back runs → regenerate button produces a different strategy. Efficacy escalation demonstrable on seeded recurrence |
| **P-4.5 Win Column** | Mention aggregation · corroboration · context chips · evidence packet · rising signal · retention watch · cross-dept badge · wins-only rollup enforced | Win Column renders w/ ≥1 multi-expert corroboration; failure mention provably absent |
| **P-5 Polish + demo** | Full seed · UI polish · outcome-nudge flow · 5-min script (order: codify win → framework → Win Column live → retrieval → conflict → prescription) | Full loop in 5 min without apologizing |

**🅿️ v2 (post-pilot):** Day-one onboarding path.

**Execution:** P-0.5 onward = Claude Code / Cowork multi-file builds.

**After P-5:** warm pilot (B1) → prove value → B5 wrap (SSO/SOC2) only after.

---

## ✅ OPEN LOOPS

### 🔴 Blocking / near-term
| Loop | Note |
|---|---|
| **Apply P-0.5 SQL migration** | `supabase/p0.5-methodology-entity-guardrails.sql` — paste into Supabase SQL editor. This Cowork build session had no direct DB credentials (only anon/service-role app keys, not enough to run DDL), so it could not self-apply this one |
| **Reconnect desktop bridge** | Dropped mid-P-0.5-build. Needed to: land the finished files in the repo, run `npm run build`/`typecheck`, click through the 5 sessions in an actual browser, and `git commit` |
| P0 first-render flake | P-0. Fix first |
| Confirm P0 migration | `supabase/p0-pattern-records.sql` |
| Conflict-fire behavior | Hold vs. surface-with-warning — before P-2 |
| Voyage path A/B | Before P-3 |
| Voyage billing + silent-fail | Blocks P-3 if path A |

### 🟠 Deferred until prototype done
Warm pilot · IP-clarity counsel (parallel prep) · second warm lead · enterprise pricing · Win-Column-as-pitch-lead call (customer-facing → Brian)

### 🟡 Decisions not locked
Brand-voice sign-off · 769 pending insights · persona-picker UI (persona column exists, no UI to set it yet — manual for now)

### 🟢 Doc + copy debt
MANIFESTO.md · marketing homepage · ARCHITECTURE.md (stale) · DECISION-LOG sprawl

---

## 🅿️ PARKING LOT (recoverable)
Solo wedge · creators · teachers · L&D-standalone · Archive jogger · Asset Strength solo · consumer marketplace · Bloom Consulting · video pipeline · AI-twin · Day-one onboarding path (v2) · all prior framings.

---

## 👤 BRIAN'S ROLE
Solo Founder & CEO — final approver. Delegates execution; autonomous within session. Report back before finalizing: brand voice · pricing · anything customer-facing.

## 🧠 HOW BRIAN WORKS BEST (standing, ADHD, non-negotiable)
Short chunks · bullets/tables · ONE question at a time · phases w/ headers, current step only · batched setup · full files never snippets · heredoc for large pastes · proactive Decision Log entries · flag heavier-tool handoffs · secrets out of chat.
