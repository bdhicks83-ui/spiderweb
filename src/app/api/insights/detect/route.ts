// FLOOR GUIDE / PHASE B — PASSIVE DETECTION.
//
// POST → score one piece of contributor input. Usually returns nothing, and
//        that is the point.
//
// ═══════════════════════════════════════════════════════════════════════════
// ⭐ WHY THIS IS A SEPARATE ROUTE THE CLIENT CALLS AFTERWARDS, rather than a few
// lines bolted onto /api/retrieve.
//
// The requirement is that scoring must not delay the answer the person actually
// asked for. Inside a route handler the only ways to do that are to await it
// (which delays the answer) or to float the promise (which on a serverless
// runtime may be killed the instant the response is sent — a detector that
// silently does nothing in production and works perfectly in dev). Neither is
// acceptable for something whose failure mode is invisible.
//
// So the page renders the answer FIRST and then calls this. The work is genuinely
// off the critical path, the timing is observable, and /api/retrieve — which is
// the most load-bearing route in the product — is not touched at all.
//
// ⭐ THE CLIENT CANNOT FORGE A CANDIDATE. It supplies the text and a similarity
// number; the server re-reads who they are, re-runs the same scoring, and
// applies the same bar. The similarity number is only ever used to SKIP work
// (high similarity ⇒ the library already covers this ⇒ don't bother the model),
// so the worst a forged value can do is suppress a candidate. Nothing a browser
// can send makes one exist.
//
// ⭐ AND ON FLOOR GUIDE IT WRITES NOTHING. See PASSIVE_SURFACES in
// src/lib/candidate-insights.ts for the whole argument. Short version: Phase A
// promises that screen keeps no record of what you said, so this returns an
// INVITATION and lets the person choose.
// ═══════════════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { readViewerContext } from "@/lib/floor-guide";
import {
  CANDIDATE_INSIGHT_MIN_CHARS,
  candidateClearsBar,
  detectCandidateInsight,
  lastCandidateDetectDiagnostic,
} from "@/lib/claude";
import {
  PASSIVE_DETECTOR,
  createCandidateInsight,
  isCandidateSurface,
  passiveAllowedOn,
  vocabularyFromFrameworks,
} from "@/lib/candidate-insights";

/**
 * If retrieval already answered this well, the library covers it and there is
 * nothing novel to find. Same 0.75 the rest of the product treats as "this is a
 * confident answer" (P-3 / P-9), reused rather than re-picked.
 */
const ALREADY_COVERED_SIMILARITY = 0.75;

/**
 * Cheap question-shape rejection, run before any model call.
 *
 * Most contributor input is somebody asking for help, and asking for help is not
 * novel judgment. Catching it with a regex instead of a model call is the
 * difference between a detector that costs nothing on the common path and one
 * that taxes every interaction in the product.
 */
const INTERROGATIVE =
  /^(what|how|why|when|where|who|which|is|are|do|does|did|can|could|should|would|will|any|anyone|anybody|help)\b/i;

function looksLikeAQuestion(text: string): boolean {
  const t = text.trim();
  if (t.endsWith("?")) return true;
  return INTERROGATIVE.test(t);
}

/** Reasons are returned to the client for observability and are never shown to
 *  a person. Nothing here is a failure — "nothing to escalate" is the norm. */
type Skip =
  | "not_contributor"
  | "no_org"
  | "too_short"
  | "reads_as_question"
  | "already_answered"
  | "detector_quiet"
  | "below_bar";

function quiet(reason: Skip, extra?: Record<string, unknown>) {
  return NextResponse.json({ candidate: false, invite: false, reason, ...extra });
}

export async function POST(req: NextRequest) {
  try {
    const session = await createSessionClient();
    const viewer = await readViewerContext(session);
    if (!viewer) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

    // Only a contributor's input is a candidate. A member or manager saying the
    // same thing should CAPTURE it — they have the door and the authority.
    if (!viewer.isContributor) return quiet("not_contributor");
    if (!viewer.orgId) return quiet("no_org");
    const orgId = viewer.orgId;

    const body = (await req.json().catch(() => ({}))) as {
      observation?: unknown;
      surface?: unknown;
      context_note?: unknown;
      top_similarity?: unknown;
    };
    const observation = typeof body.observation === "string" ? body.observation.trim() : "";
    const surface = isCandidateSurface(body.surface) ? body.surface : null;
    const contextNote = typeof body.context_note === "string" ? body.context_note : null;
    const topSimilarity =
      typeof body.top_similarity === "number" && Number.isFinite(body.top_similarity)
        ? body.top_similarity
        : null;

    if (observation.length < CANDIDATE_INSIGHT_MIN_CHARS) return quiet("too_short");
    if (looksLikeAQuestion(observation)) return quiet("reads_as_question");
    if (topSimilarity !== null && topSimilarity >= ALREADY_COVERED_SIMILARITY) {
      return quiet("already_answered");
    }

    // What this org already knows, for the "is it novel" comparison. Session
    // client: the existing "org library read" policy is exactly the right scope.
    const { data: fwRows } = await session
      .from("pattern_records")
      .select("framework")
      .eq("org_id", orgId)
      .eq("status", "complete")
      .not("framework", "is", null)
      .order("created_at", { ascending: false })
      .limit(60);
    const vocabulary = vocabularyFromFrameworks(
      (fwRows ?? []) as { framework: { name?: unknown; tagline?: unknown } | null }[]
    );

    const detection = await detectCandidateInsight(observation, vocabulary, viewer.claimedTitle);
    if (!detection) {
      // FAIL-OPEN. A detector that is down means no candidate this turn — never
      // an error, never anything the person notices. Logged so a permanently
      // dead detector is distinguishable from a genuinely quiet week.
      console.log(
        `[insights] detector returned nothing (surface=${surface ?? "unknown"}): ` +
          `${lastCandidateDetectDiagnostic ?? "no diagnostic"}`
      );
      return quiet("detector_quiet");
    }
    if (!candidateClearsBar(detection)) {
      console.log(
        `[insights] below bar (confidence=${detection.confidence.toFixed(2)}, ` +
          `practice=${detection.isPractice}, novel=${detection.novel}, ` +
          `covered=${detection.alreadyCovered})`
      );
      return quiet("below_bar", { confidence: detection.confidence });
    }

    // ⭐ THE PRIVACY FORK. On a surface that promises no record, we ask instead
    // of writing. Nothing about this request is persisted — not the text, not
    // the score, not the fact that it cleared.
    if (!passiveAllowedOn(surface)) {
      console.log(
        `[insights] cleared the bar on a private surface (${surface ?? "unknown"}) — ` +
          `inviting the person to share it themselves. No write.`
      );
      return NextResponse.json({
        candidate: false,
        invite: true,
        summary: detection.summary,
        suggested_title: detection.suggestedTitle,
      });
    }

    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const created = await createCandidateInsight(service, {
      orgId,
      userId: viewer.userId,
      source: "passive",
      surface,
      rawInput: observation,
      contextNote,
      summary: detection.summary,
      suggestedTitle: detection.suggestedTitle,
      confidence: detection.confidence,
      detector: PASSIVE_DETECTOR,
    });
    if (!created.ok) {
      // Still fail-open: the person's actual request already succeeded and this
      // is a side channel. Log it and say nothing.
      console.error("[insights] passive candidate write failed:", created.error);
      return quiet("detector_quiet");
    }

    console.log(
      `[insights] passive candidate ${created.created ? "created" : "deduped"} ` +
        `(confidence=${detection.confidence.toFixed(2)}, surface=${surface})`
    );
    // noticed:false ALWAYS on the passive path. The candidate exists and the
    // admin will see it; the person who said it is told nothing until somebody
    // acts. Brian's call (2026-07-30) — see createCandidateInsight for the why.
    return NextResponse.json({
      candidate: true,
      invite: false,
      noticed: false,
      id: created.candidate.id,
    });
  } catch (err) {
    // Fail-open at the outermost layer too. Nothing about detection is allowed
    // to surface as an error to somebody who was just asking a question.
    console.error("[insights] detect threw and was swallowed:", err);
    return NextResponse.json({ candidate: false, invite: false, reason: "detector_quiet" });
  }
}
