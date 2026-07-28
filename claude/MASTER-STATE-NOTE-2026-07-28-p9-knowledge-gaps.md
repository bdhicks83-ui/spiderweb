# MASTER-STATE NOTE — append to the 30-SECOND VERSION and bump to v2.39

**v2.39 · Updated July 28, 2026 (P-9 Knowledge Gaps built — code complete, typecheck clean, NOT deployed / NOT verified)**

⭐⭐⭐ **P-9 — KNOWLEDGE GAPS: THE DEMAND SIDE OF THE FLYWHEEL IS BUILT (July 28, local only).** Until now a `/retrieve` query below the 0.75 threshold returned an honest empty state and the moment was thrown away. That moment is the most precise demand signal the product can generate. It is now a durable, shared, fillable row.

- **Inline alert** on `/retrieve`: amber (attention, never error-red), opportunity-framed, with **Flag this as a gap** + **Answer it now**. The question is carried verbatim into `/codify?gap=<id>`, where a banner keeps it on screen for the whole interview.
- **`/gaps`** — the shared queue, **visible to every user in the org**, ordered by `asked_count` desc. **No routing / no assignment in v1 — a decision, not an omission.** A soft claim auto-releases after 24h.
- **`/gaps/mine`** — persistent "Your questions" + a nav badge on `BrandHeader`. The payoff line on an answered question: *"You asked this. Nobody had it. Now your team does."* → framework + training.
- **The fill produces a first-class framework** — codified by a HUMAN, embedded explicitly after the write, conflict-checkable, retrievable. **The system never fills its own gap** (fabricating the missing expertise is the one thing this product exists not to do).
- **Two new ledger signals**: `knowledge_gap_opened` (negative) / `knowledge_gap_filled` (positive), `subject_type='retrieval_query'`. Capture now, readers later — same P-8 discipline.

⏸️ **STATUS: LOCAL. Migration not run · not committed · not deployed · not browser-verified.** ⚠️ **Customer-facing copy is DRAFT pending Brian** (marked `COPY` / `GAP_COPY` blocks in six files).

---

## Add to GOTCHAS

- **P-9 — 0.90 IS THE GAP DE-DUPE THRESHOLD AND IT IS NOT THE RETRIEVAL THRESHOLD.** 0.75 asks "is this framework RELEVANT to this situation?" (generous — a related framework still helps). 0.90 asks "is this the SAME question?" (near-paraphrase). Merging two genuinely different unanswered questions destroys a demand signal that cannot be recovered; failing to merge two near-duplicates just looks untidy. **When in doubt, do not merge.** Exact normalized-text match runs FIRST and does most of the work.
- **P-9 — gap question normalization is deliberately NOT stemming/stop-word removal.** Aggressive normalization collapses "release *before* inspection" and "release *after* inspection" — opposite questions to a human.
- **P-9 — resolution is DERIVED AT READ TIME, not pushed by a client callback** (`reconcileAnsweringGaps()`). "Answer it now" hands off to a multi-turn interview the person may finish in another tab or after a refresh; a client-side "mark it resolved" is exactly the close-the-loop step that silently doesn't happen and leaves the queue lying. Known imprecision: if the claimer codifies something UNRELATED in that window, the wrong framework gets linked — the queue carries a manual "link a framework I already captured" override, and the scale fix is a similarity check, never a callback.
- **P-9 — the org-wide gap row carries a COUNT, never a NAME.** `knowledge_gaps` is org-readable; `knowledge_gap_askers` is `user_id = auth.uid()` only. A peer enumerating who kept asking about something nobody could answer is one inference from a person-level negative signal, which in this product is manager-only (P-6). This is the P-8 "an org-wide table can silently widen a narrower one" lesson applied before it bit.
- **P-9 — a RESOLVED gap that comes back REOPENS and keeps its history.** If the same question still hits the gap state after being filled, the framework that answered it is not retrieving — almost always an embedding that never landed. Loud warn + a note on the queue row pointing at `backfill-pattern-embeddings.mjs` → `verify-p3.mjs`.
- **P-9 — both new unique indexes are PLAIN, never partial** (`knowledge_gaps(org_id, question_norm)`, `knowledge_gap_askers(gap_id, user_id)`). The asker write genuinely upserts against its index, so a partial one would have been the P-7 PostgREST silent-upsert trap in its purest form.
- **P-9 — codification closes a gap; training never does.** Judgment first, delivery second. A training request can be ATTACHED to a filled gap (`resolved_training_request_id`) so the original asker sees both — it can never resolve one.
- **P-9 — `find_similar_knowledge_gap()` is SECURITY DEFINER with EXECUTE revoked from anon/authenticated**, called only by the service-role client behind `/api/gaps` after the SESSION client has proven org membership. Do NOT collapse it into the SECURITY INVOKER `search_pattern_records_by_query` — different privilege levels on purpose (same rule as P-4A).

---

## Add to PHASES

| Phase | Status |
|---|---|
| P-9 Knowledge Gaps (inline alert · shared queue · fill→framework · my-questions + badge · gap signal) | 🔨 **BUILT LOCAL, typecheck clean (p9 + full)** — migration not run, not committed, not deployed, **not browser-verified**. Copy DRAFT pending Brian |

## Add to OPEN LOOPS

1. ⏳ **Run `supabase/p9-knowledge-gaps.sql`** (one block, one run) — creates `knowledge_gaps`, `knowledge_gap_askers`, `find_similar_knowledge_gap()`, and ALTERs the `learning_signals` signal_type check.
2. ⏳ **Commit + push from Brian's PowerShell**, then browser-verify the full loop as a demo persona.
3. ⏳ **Copy approval (Brian)** — six marked `COPY`/`GAP_COPY` blocks; the opportunity framing is the bit to get right.
4. ⚠️ **Pre-existing uncommitted tree changes NOT touched by P-9**: `detect-clusters/route.ts`, `extract-insights/route.ts`, `remotion/ad/Ad90.tsx`, `remotion/ad/ad-script.ts`, `.claude/launch.json`. The P-9 commit block stages ONLY P-9 files — Brian's call whether the rest rides along.
5. 🅿️ **Deferred by decision:** routing/assignment of gaps to likely experts · a reader over the two new gap signals · email/push notification (the unread badge + persistent list is v1).
