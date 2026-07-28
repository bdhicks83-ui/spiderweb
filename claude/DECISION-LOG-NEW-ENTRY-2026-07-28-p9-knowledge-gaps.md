# DECISION LOG — NEW ENTRY

## 2026-07-28 · P-9 — KNOWLEDGE GAPS: the demand side of the flywheel

**Status:** ✅ Built, typecheck clean (`tsconfig.p9.json` AND full `tsconfig.json`, both exit 0). ⏸️ NOT deployed, NOT browser-verified, migration NOT run. Standing rule acknowledged: **an unclicked surface is an unverified surface.**

---

### What shipped in code

A `/retrieve` query that clears nothing above the 0.75 cosine threshold used to return an honest empty state — and the moment was lost. That moment is the most precise demand signal the product can generate: somebody with a live problem went to the team's brain, and the answer is sitting in a colleague's head, uncaptured. P-9 makes it durable, shared, fillable, and countable.

| Part | What it does |
|---|---|
| **1 · Inline gap alert** | The empty state on `/retrieve` is now a highlighted **amber** panel: "No one's codified this yet — that's worth fixing." Two real exits: **Flag this as a gap** · **Answer it now**. The question is carried verbatim into whatever happens next. |
| **2 · The fill** | "Answer it now" claims the gap and hands off to `/codify?gap=<id>`, where a banner keeps the colleague's actual question on screen for the whole interview. Completion → the gap resolves and links to the framework. Optional second step: `/training-studio?gap=<id>` prefills the question and links the training back. |
| **3 · Shared queue** | `/gaps` — every unanswered question in the org, **visible to all users in the org**, ordered by `asked_count` desc so the most-demanded rise on their own. "Fill this gap" on every row. |
| **4 · The loop closed for the asker** | `/gaps/mine` — a persistent "Your questions" list, plus a nav badge on `BrandHeader`. An answered question leads with the payoff line: *"You asked this. Nobody had it. Now your team does."* + framework link + training link. |
| **5 · The gap signal** | Two new `learning_signals` types: `knowledge_gap_opened` (verdict `negative`) and `knowledge_gap_filled` (verdict `positive`), both `subject_type='retrieval_query'` with the gap id. No reader UI in v1 — same capture-now/learn-later discipline as P-8 Phase 1. |

---

### DECISIONS MADE (do not relitigate without reopening deliberately)

**1. Visible to ALL users in the org. No routing, no assignment, in v1.**
Anyone can see any gap; anyone can pick any gap up. Routing implies the system knows who the right expert is, and inventing that on day one would be a confident guess dressed as intelligence. Demand first; matching later, only if the pilot asks for it. The single concession to reality is a **soft claim** that auto-releases after `CLAIM_STALE_HOURS = 24`, so one person clicking "answer it now" and wandering off cannot park a gap forever.

**2. De-dupe = exact normalized text FIRST, cosine ≥ 0.90 as the fallback.**
`normalizeGapQuestion()` lowercases, strips punctuation, collapses whitespace — mirrored by `knowledge_gaps.question_norm` and a **PLAIN** unique index on `(org_id, question_norm)` (never partial — the PostgREST `onConflict` trap from P-7/P-8). Same-wording repeats collapse deterministically and cheaply. Different-wording repeats fall to `find_similar_knowledge_gap()` at **0.90**.

⚠️ **0.90 is NOT the retrieval threshold and must never be confused with it.** They answer different questions:
- **0.75** — "is this framework RELEVANT to this situation?" A generous bar, because a related framework still helps.
- **0.90** — "is this the SAME question?" A near-paraphrase bar.

The asymmetry is deliberate and so is the direction of the error: merging two genuinely different unanswered questions destroys a demand signal that cannot be recovered, while failing to merge two near-duplicates merely makes the queue look untidy. **When in doubt, do not merge.** Normalization is also deliberately NOT stemming or stop-word removal — aggressive normalization collapses "release *before* inspection" and "release *after* inspection," which a human would call opposite questions.

**3. Resolution is derived at READ time by a reconciler, not pushed by a client callback.**
`reconcileAnsweringGaps()` runs on every read of `/api/gaps` and `/api/gaps/mine`. For each gap in `answering` it looks for a framework the claimer completed after they claimed, and resolves the gap with it; stale claims go back on the shelf.

*Why:* "Answer it now" hands off to a multi-turn interview the person may finish minutes later, in another tab, or after a refresh. A client-side "now mark it resolved" call is exactly the kind of close-the-loop step that silently doesn't happen — the tab gets closed and the queue lies. Deriving the link from state that is already durable cannot be missed. It also meant **zero surgery inside the codify pipeline**.

⚠️ **The known imprecision, stated plainly:** if the claimer codifies something UNRELATED between claiming and finishing, the reconciler links the wrong framework. At pilot scale that is a rounding error (you clicked "answer it now" and then captured a framework — that *is* the answer), and the queue carries a manual **"Link a framework I already captured"** override. If it ever bites at scale, the fix is a similarity check between the gap question and the new record — not a client-side callback.

**4. Two read boundaries, deliberately different — and the org-wide row carries a COUNT, never a NAME.**
- `knowledge_gaps` → **org-wide read**. The queue is a shared surface by design.
- `knowledge_gap_askers` → **own rows only** (`user_id = auth.uid()`). "My Questions" is personal.

This is the P-8 lesson applied before it could bite: *an org-wide table can silently widen a narrower one.* A peer being able to enumerate who kept asking about something nobody could answer is one inference away from a person-level negative signal — which in this product is a manager-only surface (P-6) and never a peer-visible one. So `asked_count` is an integer on the org-readable row, and no asker id, display name, or "asked by" text ever lands there.

**5. A resolved gap that comes back REOPENS, and says why.**
If the same question hits the gap state after it was filled, the framework that supposedly answered it is not retrieving — almost always an embedding that never landed. The row reopens, **keeps its resolution history**, logs loudly, and the queue shows a note pointing at it. That is a real diagnostic, not a nuisance.

**6. ⭐ The system NEVER fills its own gap.**
There is no "generate a framework for this" path anywhere in P-9 and there will not be one. Auto-answering a discovered gap would be the product fabricating the expertise it exists to capture. A human fills it, and their name goes on it. Codification closes a gap; **training is the optional second step** — judgment first, delivery second — which is why a training request can be attached to a gap but can never resolve one.

**7. Embedding runs explicitly AFTER the write, and reports honestly.**
`resolveGapWithRecord()` embeds the filling framework if it isn't already, because a framework that fills a gap but never gets a vector is invisible to the exact query that created the gap — the loop would *look* closed and would not be. The reseed step is historically unreliable, so this never assumes: on failure it warns with the exact remediation (`backfill-pattern-embeddings.mjs` → `verify-p3.mjs`) and the API returns `embedded: false`.

**8. Ledger, not a separate analytics store.** The handoff left the choice open. Chosen: **both, with distinct jobs.** `knowledge_gaps` is the operational surface (state, claims, counts); `learning_signals` gets the two new signal types so P-9 lands in the same ledger as the other eleven and a future reader sees one history, not two. `subject_type` reuses the existing `'retrieval_query'` value, so the constraint change is one line instead of two.

---

### ⚠️ PENDING BRIAN — CUSTOMER-FACING COPY (drafted, functional, NOT approved)

Every string is isolated in a marked `COPY` / `GAP_COPY` block at the top of its file so wording changes touch no logic:

| File | What |
|---|---|
| `src/app/retrieve/page.tsx` | `GAP_COPY` — the inline alert: title, body, both button labels, the flagged confirmation, the near-miss line |
| `src/app/gaps/page.tsx` | `COPY` — queue title/subtitle, empty states, status chips, "asked N times", fill/claim actions |
| `src/app/gaps/mine/page.tsx` | `COPY` — "Your questions", the payoff line, waiting states |
| `src/components/GapBadge.tsx` | `COPY` — "N answers for you" |
| `src/components/GapAnswerBanner.tsx` | `COPY` — the /codify "you're filling a gap" banner |
| `src/app/training-studio/page.tsx` | the "From a filled gap" note |

**The bit that matters most:** the opportunity framing. Nothing may read as "the search failed" or "your library is incomplete." Amber (attention), never red (error) — same treatment as contested badges and Coaching Watch. Land the point once.

---

### NOT DONE / OWED

1. **Migration not run.** `supabase/p9-knowledge-gaps.sql` — paste complete, as ONE block.
2. **Not committed, not deployed.** PowerShell block handed over separately.
3. **Not browser-verified.** Nothing here is closed until Brian clicks it on the deployed URL.
4. **Pre-existing uncommitted work found in the tree** (NOT touched, NOT staged by the P-9 commit block): `src/app/api/detect-clusters/route.ts`, `src/app/api/extract-insights/route.ts`, `src/remotion/ad/Ad90.tsx`, `src/remotion/ad/ad-script.ts`, `.claude/launch.json`, plus the untracked diagnostic `.txt`/`.log` files. Brian's call whether they ride along.
