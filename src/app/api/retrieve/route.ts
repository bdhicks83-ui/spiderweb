// P-3 (Build 3) — Contextual retrieval: the Copilot moment.
// POST { situation }. An employee describes a situation in natural language;
// the right org framework(s) surface, org-scoped, with author attribution and
// (surface-with-warning) any ⚠️ Contested badge intact.
//
// Grounding doctrine reused from Ask Your Spiderweb (/api/ask): embed the
// query → nearest-neighbour search → if nothing clears the honesty threshold,
// say so plainly rather than return a confident wrong match. Org scoping and
// contested badges are the exact RLS + enrichment pattern from /api/library.
//
// ─────────────────────────────────────────────────────────────────────────────
// P-7 HARDENING (2026-07-25) — the empty-with-noMatch-false bug.
//
// SYMPTOM: this route returned { noMatch: false, results: [] } — a
// CONTRADICTORY state. `noMatch:false` asserts "we found matches" while the
// array says otherwise. `/retrieve` renders results only when
// `results.length > 0` and renders the honest empty state only on
// `noMatch === true`, so that response painted a blank page with no error —
// a silent fail, the exact class P-3 Build 1 and P-4B were meant to kill.
//
// ROOT-CAUSE CLASS: the route ran TWO separate DB reads whose row sets were
// assumed to be identical but were not:
//    (a) rpc search_pattern_records_by_query  → ids + similarity
//    (b) select pattern_records .in("id", ids) → the full rows
// If (a) returns an id that (b) cannot load — because the live function is not
// actually RLS-scoped to the caller, because it returns ids from a different
// table, or because a row is visible to the ANN scan but not to the caller's
// "org library read" policy — then `strong.length > 0` (drives noMatch:false)
// while `rows.length === 0` (drives the empty array). The two numbers came
// from different sources, so they could disagree.
//
// THE FIX IS STRUCTURAL, NOT COSMETIC:
//   1. `noMatch` is DERIVED from the length of the array that is actually
//      returned. There is now exactly ONE source of truth for "did we find
//      anything," so the contradictory state is impossible by construction —
//      not merely unlikely.
//   2. An id the search returns but the record load cannot resolve is a REAL
//      DEFECT, never an empty success. It returns HTTP 500 with
//      code:"RETRIEVAL_VISIBILITY_GAP" and the offending ids, so it surfaces
//      loudly instead of painting a blank page.
//   3. A malformed match row (missing / non-uuid id, non-numeric similarity)
//      returns code:"RETRIEVAL_BAD_MATCH_SHAPE" rather than being filtered
//      away into a quiet empty result.
//   4. Every stage logs a one-line `[retrieve]` breadcrumb with counts, so a
//      future failure is diagnosable from the Vercel log alone.
// Diagnostic harness for this path: scripts/diag-retrieve.mjs (read-only).
// ─────────────────────────────────────────────────────────────────────────────
//
// ─────────────────────────────────────────────────────────────────────────────
// ⭐⭐ FLOOR GUIDE PHASE A (2026-07-29) — ONE ENGINE, TWO SURFACES.
//
// POST now accepts { situation, floor_guide?: true }. Floor Guide is NOT a
// second retrieval engine and must never become one: it is this route, with a
// beginner-framed presentation layered on the same results, and with the
// person-level writes around it suppressed. Forking the engine would mean the
// 0.75 threshold, the visibility guard, the contested badges and the
// effectiveness reader all had to be maintained twice, and the copy of them
// that a nervous new hire depends on would be the one nobody was watching.
//
// ⭐ THE WRITE-PATH AUDIT (Guardrail 4), stated so the next person does not have
// to re-derive it. Every write reachable from a retrieval call, and what
// happens to it under floor_guide:
//
//   1. THIS ROUTE — writes NOTHING. Audited line by line: the only clients it
//      constructs are for READS (the search RPC, the record load, the profile
//      load, the conflict load, and the service-role effectiveness READER,
//      which contains no insert/update/upsert). There is therefore nothing here
//      to suppress, and that is a finding, not an omission.
//   2. /api/retrieve/signal — learning_signals, actor_id = the asker, the typed
//      query in the payload. SUPPRESSED ENTIRELY on a flagged call (no row).
//   3. /api/gaps POST -> flagKnowledgeGap() — writes the org-level gap row
//      (KEPT: coverage is about the org) but SKIPS knowledge_gap_askers and
//      nulls actor_id on the knowledge_gap_opened ledger signal.
//   4. Coaching Watch / retraining_signals — NOT reachable from retrieval at
//      all. It is written only by /api/coaching/detect, which reads
//      pattern_records (concern/friction records naming a registered person).
//      Retrieval has never touched it. Nothing to suppress; confirmed, not
//      assumed.
//
// The flag itself is never trusted from the client alone — resolveFloorGuideMode
// AND-s it with the caller's own profiles.floor_guide_active, and a request that
// ASKS for Floor Guide while not being in Floor Guide is refused loudly rather
// than quietly served with the writes live. A privacy promise that silently
// degrades is worse than one that errors.
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { embedText } from "@/lib/voyage";
import type { FrameworkArtifact } from "@/lib/elicitation";
import {
  computeRetrievalEffectiveness,
  type RecordEffectiveness,
} from "@/lib/retrieval-effectiveness";
import { beginnerFrame, resolveFloorGuideMode, type BeginnerFrame } from "@/lib/floor-guide";
// Server-only (pulls fs via @/lib/claude). Safe here — this is an API route.
import { translateSymptom, lastSymptomTranslateDiagnostic } from "@/lib/claude";

// Below this cosine similarity a "match" is noise. A wrong framework is worse
// than an empty result (a confident wrong answer erodes trust in the brain).
//
// TUNED against live demo data (DECISION-LOG 2026-07-23): voyage-large-2
// compresses cosine similarity into a high band, so an absolute floor must sit
// well up. Empirically, on-target frameworks for the seeded changeover/QC
// situation scored ~0.85, while an unrelated cross-domain query (SaaS pricing)
// topped out at ~0.69. 0.75 clears the bullseye frameworks with ~0.10 margin
// and rejects the cross-domain query with ~0.06 margin. (An earlier 0.55 —
// borrowed from Ask Your Spiderweb's insight floor — was far too low and let
// unrelated queries through.) The noMatch response echoes the top near-miss so
// this stays re-tunable as the library grows.
const SIMILARITY_THRESHOLD = 0.75;
const MATCH_COUNT = 5;

const RESULT_COLUMNS =
  "id, user_id, org_id, created_at, trigger_type, method, context_function, " +
  "situation_type, framework, codified_from";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CodifiedFrom = {
  kind?: string;
  format_name?: string;
  training_request_id?: string;
  experts?: { name?: string }[];
} | null;

type ResultRow = {
  id: string;
  user_id: string;
  org_id: string | null;
  created_at: string;
  trigger_type: string | null;
  method: string | null;
  context_function: string | null;
  situation_type: string | null;
  framework: FrameworkArtifact | null;
  codified_from: CodifiedFrom;
};

type MatchRow = { id?: unknown; similarity?: unknown };

/** The Floor Guide display shape, exactly as this route ships it (or null). */
type BeginnerField = BeginnerFrame | null;

function log(msg: string, extra?: Record<string, unknown>) {
  console.log(`[retrieve] ${msg}${extra ? ` ${JSON.stringify(extra)}` : ""}`);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { situation } = body ?? {};
    if (!situation || typeof situation !== "string" || !situation.trim()) {
      return NextResponse.json({ error: "Describe a situation first." }, { status: 400 });
    }
    const query = situation.trim();

    const supabase = await createClient();

    // Identity + privacy mode in one own-row read.
    const mode = await resolveFloorGuideMode(supabase, body?.floor_guide);
    if (!mode) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }
    const { viewer, floorGuide, requestedButInactive } = mode;

    // A surface that asked for privacy and cannot have it must NOT be quietly
    // served without it — the Floor Guide page renders "nobody's grading you"
    // and that sentence has to be true of the request that comes back.
    if (requestedButInactive) {
      return NextResponse.json(
        {
          error:
            "Floor Guide isn't switched on for this account, so this can't be run privately. Ask whoever administers your account to turn it on.",
          code: "FLOOR_GUIDE_NOT_ACTIVE",
        },
        { status: 403 }
      );
    }
    const userId = viewer.userId;
    log("start", { user: userId, chars: query.length, floorGuide });

    // ── 1 + 2. EMBED AND SEARCH, as one reusable step.
    //
    // Extracted into a local helper because Floor Guide may run it TWICE: once on
    // the translated reading, and once on the person's raw words as a fallback.
    // Every guard from the P-7 hardening lives inside it, so both calls get the
    // same protection rather than the second one getting a hand-rolled copy.
    //
    // (pattern_records embed as `document`, queries as `query` — do not mix;
    // mixing quietly degrades every similarity score.)
    type SearchOutcome =
      | { ok: true; scored: { id: string; similarity: number }[] }
      | { ok: false; response: NextResponse };

    const runSearch = async (text: string): Promise<SearchOutcome> => {
      const embed = await embedText(text, { inputType: "query" });
      if (!embed.ok) {
        log("embed FAILED", {
          status: embed.status,
          rateLimited: embed.rateLimited,
          error: embed.error,
        });
        return {
          ok: false,
          response: NextResponse.json(
            {
              error: embed.rateLimited
                ? "The search service is busy right now — try again in a moment."
                : "Could not run the search. Please try again.",
              code: embed.rateLimited ? "EMBED_RATE_LIMITED" : "EMBED_FAILED",
              details: embed.error,
            },
            { status: 502 }
          ),
        };
      }

      // SECURITY INVOKER by design, so the caller's "org library read" RLS scopes
      // this — see p3-pattern-record-embeddings.sql.
      const { data: matches, error: matchError } = await supabase.rpc(
        "search_pattern_records_by_query",
        { query_embedding: embed.vector, match_count: MATCH_COUNT }
      );
      if (matchError) {
        log("rpc FAILED", { error: matchError.message });
        return {
          ok: false,
          response: NextResponse.json(
            { error: "Search failed", code: "SEARCH_RPC_FAILED", details: matchError.message },
            { status: 500 }
          ),
        };
      }

      const rawMatches = (matches ?? []) as MatchRow[];

      // A malformed match row is a schema/contract break (e.g. the live function
      // no longer returns an `id` column, or returns it under another name). That
      // must NOT be silently filtered into an empty result — it is the exact
      // failure mode that produced the blank-page bug.
      const malformed = rawMatches.filter(
        (m) =>
          typeof m.similarity !== "number" ||
          typeof m.id !== "string" ||
          !UUID_RE.test(m.id as string)
      );
      if (malformed.length > 0) {
        log("rpc returned malformed rows", { count: malformed.length, sample: malformed[0] });
        return {
          ok: false,
          response: NextResponse.json(
            {
              error: "Search returned an unexpected result shape.",
              code: "RETRIEVAL_BAD_MATCH_SHAPE",
              details:
                "search_pattern_records_by_query must return (id uuid, similarity float). " +
                `Got ${malformed.length} row(s) that do not match — sample keys: ` +
                Object.keys(malformed[0] ?? {}).join(", "),
            },
            { status: 500 }
          ),
        };
      }

      return { ok: true, scored: rawMatches as { id: string; similarity: number }[] };
    };

    const aboveBar = (rows: { similarity: number }[]) =>
      rows.filter((m) => m.similarity >= SIMILARITY_THRESHOLD);

    // ── 1b. ⭐ FLOOR GUIDE — CLOSE THE VOCABULARY GAP ON THE QUERY, NOT THE BAR.
    //
    // Measured on this library (MASTER-STATE note 2026-07-29): expert phrasing of
    // the delamination question scores 0.823; the beginner phrasing of the SAME
    // problem scores 0.665–0.691, against an org holding two frameworks on
    // exactly it. Unrelated cross-domain queries also land at 0.62–0.69 on this
    // model, so a bar low enough to catch the beginner is a bar low enough to
    // serve confident nonsense to the person least able to spot it.
    //
    // So the threshold does NOT move — 0.75 still governs both surfaces, and
    // /retrieve is untouched. What changes is the QUERY: the observation is
    // restated in the org's own captured vocabulary and that is what gets
    // embedded. Fails open in every direction (see translateSymptom).
    let reading: string | null = null;
    let readingTerms: string[] = [];
    let readingConfident = false;
    let readingDiagnostic: string | null = null;

    if (floorGuide) {
      // The vocabulary the translation is allowed to use: this org's OWN framework
      // names and taglines, read through the session client so RLS is the gate.
      // Deliberately not the model's own industry knowledge — see the prompt.
      const { data: vocabRows } = await supabase
        .from("pattern_records")
        .select("framework")
        .eq("status", "complete")
        .order("created_at", { ascending: false })
        .limit(24);
      const vocabulary = ((vocabRows ?? []) as { framework: { name?: string; tagline?: string } | null }[])
        .map((r) => {
          const n = typeof r.framework?.name === "string" ? r.framework.name : "";
          const t = typeof r.framework?.tagline === "string" ? r.framework.tagline : "";
          return n ? (t ? `${n} — ${t}` : n) : "";
        })
        .filter(Boolean);

      const translated = await translateSymptom(query, vocabulary, viewer.claimedTitle);
      if (translated?.reading) {
        reading = translated.reading;
        readingTerms = translated.terms;
        readingConfident = translated.confident;
        log("symptom translated", { confident: readingConfident, terms: readingTerms.length });
      } else {
        // A null reading is a legitimate outcome, not only an error — the prompt
        // is explicitly told to return one when the words map onto nothing.
        readingDiagnostic = lastSymptomTranslateDiagnostic;
        log("no translation — searching the raw words", { diagnostic: readingDiagnostic });
      }
    }

    // ── 2. The search itself. Translated reading first when we have one.
    const primary = await runSearch(reading ?? query);
    if (!primary.ok) return primary.response;
    let scored = primary.scored;
    let searchedRaw = reading === null;

    // The reading found nothing above the bar → try the person's own words before
    // declaring a gap. This can only ADD recall: the raw search is exactly what
    // would have run without any of this, so Floor Guide can never end up worse
    // off than /retrieve on the same question.
    if (floorGuide && reading !== null && aboveBar(scored).length === 0) {
      const rawAttempt = await runSearch(query);
      if (!rawAttempt.ok) return rawAttempt.response;
      searchedRaw = true;
      if (aboveBar(rawAttempt.scored).length > 0) {
        log("reading missed, raw words hit — using the raw search");
        scored = rawAttempt.scored;
        reading = null; // don't show a reading that didn't produce the answer
      } else {
        // Keep whichever near-miss was closer, purely so the honest empty state
        // reports the better number.
        const bestRaw = rawAttempt.scored[0]?.similarity ?? 0;
        const bestReading = scored[0]?.similarity ?? 0;
        if (bestRaw > bestReading) scored = rawAttempt.scored;
      }
    }

    const strong = scored.filter((m) => m.similarity >= SIMILARITY_THRESHOLD);
    log("search", {
      returned: scored.length,
      aboveThreshold: strong.length,
      top: scored.length ? Number(scored[0].similarity.toFixed(3)) : null,
    });

    // ── 3. Nothing codified on this yet → say so honestly. Echo the near-miss
    //    so the threshold can be tuned against real demo data.
    if (strong.length === 0) {
      return NextResponse.json({
        noMatch: true,
        floor_guide: floorGuide,
        reading,
        reading_terms: readingTerms,
        reading_confident: readingConfident,
        reading_diagnostic: readingDiagnostic,
        searched_raw: searchedRaw,
        message:
          "Nothing codified on this yet. No one on your team has captured a framework that matches this situation — this is a gap worth codifying.",
        topSimilarity: scored.length ? Math.round(scored[0].similarity * 1000) / 1000 : null,
      });
    }

    const simById = new Map(strong.map((m) => [m.id, m.similarity]));
    const ids = strong.map((m) => m.id);

    // ── 4. Load the full records (RLS re-scopes to the caller's org + own rows).
    const { data: records, error: recError } = await supabase
      .from("pattern_records")
      .select(RESULT_COLUMNS)
      .in("id", ids);
    if (recError) {
      log("record load FAILED", { error: recError.message });
      return NextResponse.json(
        { error: "Could not load frameworks", code: "RECORD_LOAD_FAILED", details: recError.message },
        { status: 500 }
      );
    }
    const rows = (records || []) as unknown as ResultRow[];

    // ── 4b. THE GUARD. The search said these ids match; the record load could
    //    not resolve some of them. That is never an empty success — it means
    //    the two reads disagree about what the caller can see (RLS asymmetry,
    //    a non-invoker search function, or foreign-table ids). Surface it.
    const loaded = new Set(rows.map((r) => r.id));
    const unresolved = ids.filter((id) => !loaded.has(id));
    if (unresolved.length > 0) {
      log("VISIBILITY GAP", { matched: ids.length, loaded: rows.length, unresolved });
    }
    if (rows.length === 0) {
      return NextResponse.json(
        {
          error:
            "Search found matches but none of them could be loaded. This is a server-side data-visibility fault, not an empty library.",
          code: "RETRIEVAL_VISIBILITY_GAP",
          details:
            `search_pattern_records_by_query returned ${ids.length} id(s) above the ` +
            `${SIMILARITY_THRESHOLD} threshold, but a SELECT on pattern_records as this ` +
            `user returned 0 of them. Run scripts/diag-retrieve.mjs. Unresolved ids: ` +
            unresolved.join(", "),
        },
        { status: 500 }
      );
    }

    // ── 5. Author attribution (same two-query pattern as /api/library — user_id
    //    references auth.users, not profiles, so no auto-embed join).
    const authorIds = Array.from(new Set(rows.map((r) => r.user_id)));
    let authors: Record<
      string,
      { display_name: string | null; persona: string | null; claimed_title: string | null }
    > = {};
    if (authorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, persona, claimed_title")
        .in("id", authorIds);
      authors = Object.fromEntries(
        (profiles || []).map((p) => [
          p.id,
          { display_name: p.display_name, persona: p.persona, claimed_title: p.claimed_title },
        ])
      );
    }

    // ── 6. Contested badges (P-2, surface-with-warning). Open conflicts
    //    annotate a record — they never remove it from results.
    const contestedBy: Record<string, { conflict_id: string; other_record_id: string }[]> = {};
    if (rows.length > 0) {
      const idList = rows.map((r) => r.id).join(",");
      const { data: conflicts } = await supabase
        .from("framework_conflicts")
        .select("id, record_a_id, record_b_id")
        .eq("status", "open")
        .or(`record_a_id.in.(${idList}),record_b_id.in.(${idList})`);
      for (const c of (conflicts || []) as {
        id: string;
        record_a_id: string;
        record_b_id: string;
      }[]) {
        (contestedBy[c.record_a_id] ??= []).push({ conflict_id: c.id, other_record_id: c.record_b_id });
        (contestedBy[c.record_b_id] ??= []).push({ conflict_id: c.id, other_record_id: c.record_a_id });
      }
    }

    // ── 7. P-8 PHASE 2 — the effectiveness reader (the first reader).
    //    Computes a per-record signal from what the org actually experienced
    //    (watch-verified resolutions + explicit "this helped" judgments) and
    //    re-ranks WITHIN the matches that already cleared the 0.75 gate. The
    //    thin-data guardrail lives in the reader: below the confidence bar the
    //    signal is 'early', never 'proven'. A reader failure degrades to
    //    similarity-only ranking — it can never take retrieval down.
    let effectiveness: Record<string, RecordEffectiveness> = {};
    try {
      const orgId = rows.find((r) => r.org_id)?.org_id ?? null;
      const orgRecordIds = rows.filter((r) => r.org_id).map((r) => r.id);
      if (orgId && orgRecordIds.length > 0) {
        const service = createServiceClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
        effectiveness = await computeRetrievalEffectiveness(service, orgId, orgRecordIds);
      }
    } catch (err) {
      log("effectiveness reader failed (degrading to similarity-only)", {
        error: err instanceof Error ? err.message : String(err),
      });
      effectiveness = {};
    }

    const results = rows
      .map((r) => {
        const eff = effectiveness[r.id] ?? null;
        // Training-derived provenance, shipped only in the safe display shape.
        const provenance =
          r.codified_from && r.codified_from.kind === "training_studio"
            ? {
                format_name: r.codified_from.format_name ?? "training",
                expert_names: [
                  ...new Set(
                    (r.codified_from.experts ?? [])
                      .map((e) => e?.name)
                      .filter((n): n is string => typeof n === "string" && n.trim().length > 0)
                  ),
                ],
                training_request_id: r.codified_from.training_request_id ?? null,
              }
            : null;
        return {
          id: r.id,
          similarity: Math.round((simById.get(r.id) ?? 0) * 1000) / 1000,
          trigger_type: r.trigger_type,
          method: r.method,
          context_function: r.context_function,
          situation_type: r.situation_type,
          framework: r.framework,
          // ⭐ Beginner framing — the SAME framework, same words, reordered so
          // the call and the name of the person who owns it come first. Computed
          // server-side and shipped as its own display shape, so the page needs
          // no knowledge of the artifact's structure. Null off the Floor Guide
          // surface: the expert-facing card is already right for experts.
          beginner: (floorGuide
            ? beginnerFrame(r.framework, authors[r.user_id] ?? null)
            : null) as BeginnerField,
          is_mine: r.user_id === userId,
          author: authors[r.user_id] ?? null,
          contested: contestedBy[r.id] ?? [],
          effectiveness: eff,
          codified_from: provenance,
        };
      })
      // Re-rank WITHIN matches: similarity + the (small, explained) boost.
      // The displayed similarity never changes; only the order can.
      .sort(
        (a, b) =>
          b.similarity + (b.effectiveness?.boost ?? 0) - (a.similarity + (a.effectiveness?.boost ?? 0))
      );

    // THE INVARIANT: noMatch is derived from the array being returned — the one
    // and only source of truth. { noMatch: false, results: [] } cannot be
    // constructed from here, and neither can { noMatch: true, results: [...] }.
    const noMatch = results.length === 0;
    log("done", {
      results: results.length,
      noMatch,
      contested: Object.keys(contestedBy).length,
      withEffectiveness: Object.keys(effectiveness).length,
      proven: Object.values(effectiveness).filter((e) => e.level === "proven").length,
    });

    // `floor_guide` is echoed so the surface can pass the SAME resolved value
    // back on its follow-up calls (the "this helped" control, the gap flag)
    // instead of each of them re-deriving what mode this search was in.
    return NextResponse.json({
      noMatch,
      query,
      results,
      floor_guide: floorGuide,
      // ⭐ Shown to the new hire as "here's how I read that" — the translation is
      // deliberately visible, because handing somebody the words their colleagues
      // use is half the value of onboarding. A silent rewrite would search just as
      // well and teach them nothing. Null on /retrieve and whenever the raw words
      // were what actually found the answer.
      reading,
      reading_terms: readingTerms,
      reading_confident: readingConfident,
      searched_raw: searchedRaw,
    });
  } catch (err) {
    console.error("[retrieve] Unexpected error in retrieve route:", err);
    return NextResponse.json(
      { error: "Unexpected server error", code: "UNEXPECTED" },
      { status: 500 }
    );
  }
}
