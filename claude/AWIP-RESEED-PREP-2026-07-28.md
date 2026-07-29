# AWIP Reseed — Prep State (2026-07-28)

Session prep for the Meridian → AWIP/IMP demo reseed. Wipe SQL is READY
(`claude/AWIP-RESEED-WIPE.sql`). Seed is BLOCKED on the two content docs.

## ⛔ Blocker

`IMP-DEMO-DATA-DESIGN.md` and `IMP-DEMO-FRAMEWORK-CONTENT.md` are NOT on
disk anywhere (searched repo, C:\Users\BDHIC recursively, OneDrive,
Downloads, Documents). The handoff's two trailing ``` blocks arrived
empty — likely where they were meant to be pasted. Framework text must be
VERBATIM → cannot be reconstructed. Waiting on Brian.

## ✅ Verified live (read-only, scripts/diag-awip-reseed-introspect.mjs — kept, re-runnable)

- Demo org: `0722f2f8-ecff-4ae3-81ea-1350454e9d54` "Meridian Precision Manufacturing (DEMO)" (is_demo=true)
- Grandfathered org: `b61aa646-5dcd-4ea1-8915-db36727a3063` (never touch)
- Demo profiles (5, kept by the wipe, to be repurposed/renamed by the seed):
  - David Chen `876f3bdb-87cd-4750-886e-fc8ee5cb0a0b` (technical_director, member, mgr=Elena)
  - Priya Nair `7f30f60f-2984-42e9-b976-98c3cfadcbc3` (technical_director, member, mgr=Elena)
  - Tom Whitfield `3c3ade58-a60c-48fe-b8a4-11aa7301806c` (sr_manager, manager, mgr=David)
  - Angela Brooks `c0c8dd9b-a311-44e0-9d71-967e1f70d5ce` (sr_manager, manager, mgr=David)
  - Elena Ruiz `9af4a566-b4cf-4bd2-a025-bb032a444ad7` (exec, manager, no mgr)
- Demo-org content counts pre-wipe: pattern_records 32 · framework_conflicts 1 ·
  prescription_detections 9 · prescriptions 9 · fidelity 3 · trainings 7 ·
  teachbacks 4 · retraining_signals 1 · learning_signals 18 · knowledge_gaps 1 ·
  gap_askers 1 · training_requests 5 · format_outcomes 4
- Demo users own ZERO legacy rows (sources/insights/frameworks/ask_sessions/
  query_gaps/credibility_scores/contradiction_events) → wipe never goes near
  the insight web.
- `+test1` = `d7addc39-cb5f-4d0b-a029-7a6e9007407e`: 29 sources → 1,248 of the
  1,272 global insights. Main account = `a7d205f0-778c-44b9-9e13-4ebd5f47e964`.
  Wipe has a DO-block SAFETY GATE asserting all three numbers before deleting.

## FK graph (org content, from supabase/*.sql)

- pattern_records ← framework_conflicts (record_a/b CASCADE) · knowledge_gaps
  (claimed/resolved_record SET NULL)
- prescription_detections ← prescriptions (CASCADE) · training_requests
  (SET NULL) · detections.conflict_id → framework_conflicts (CASCADE)
- prescriptions ← fidelity/trainings/teachbacks (CASCADE) ·
  training_requests.prescription_id (SET NULL) · format_outcomes (SET NULL)
- training_requests ← format_outcomes (CASCADE) · knowledge_gaps.resolved_training_request_id (SET NULL)
- knowledge_gaps ← knowledge_gap_askers (CASCADE)
- learning_signals: subject_id is TEXT (no FK) — plain org_id delete
- All 13 content tables carry org_id → every delete is `where org_id = <demo>`

## Decisions taken (report-back items: none customer-facing)

- Wipe does NOT touch profiles/orgs/auth. The 5 existing accounts get
  repurposed (renamed) by the seed; 10 new auth users created via
  service-role API (can't be done in SQL editor).
- Wipe SQL includes defensive legacy-pipeline deletes scoped to the 5 demo
  user ids (verified no-ops) to honor the "connections before insights" rule.

## Next turn (once docs land)

1. Read both docs; map 10 frameworks → experts → pattern_records fields
   (context_summary, trigger_signal, signal_detail, judgment, rationale,
   boundaries, entity_map, framework JSON {name, tagline, when_to_apply,
   signals, the_play, why_it_works, boundaries}) — VERBATIM.
2. Build `scripts/seed-awip-demo.mjs` modeled on seed-p1-demo.mjs (skip
   framePattern model generation — framework JSON comes from the doc), plus
   conflict wiring (seed-p2-conflict.mjs shape), prescriptions
   (seed-p4a/p4b), coaching (seed-p6), gap (p9 schema), win-column mentions
   (3 leader records naming Marcus Webb).
3. Embedding: `node scripts/backfill-pattern-embeddings.mjs` then
   `node scripts/verify-p3.mjs` — done only when all seeded records embedded.
4. Verify shoot query ("delamination escape … Little Rock line …") returns
   "The Controlled Restart Release" (Brian Ng) + CONTESTED via
   diag-retrieve-style authed check; verify both conflicts OPEN on /conflicts.
5. Re-run diag-awip-reseed-introspect.mjs: insight count still 1,272.
6. Write-back: DECISION-LOG entry + MASTER-STATE note/version bump (new
   shoot query + AWIP cast/spine), hand Brian SQL + commands.

## 15 AWIP experts (from handoff; roles/emails finalized against the design doc)

Brian Ng · Brian Hicks · Zach Davis · Klaudia Donaghy · Joe Paparella ·
Brian Montes · Chuck Milner · John Dial · Kim Harrell · Ben Seger ·
Carlos Ramos · Richard Jenkins · Dana Whitfield (fictional) ·
Marcus Webb (win-column subject) · Tyler Brooks (fictional, coaching subject,
role=member). Manager requirement: ≥1 of Chuck Milner / Brian Montes /
Brian Hicks with role=manager + manager_id chain for Tyler.
