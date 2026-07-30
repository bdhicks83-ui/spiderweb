// FLOOR GUIDE / PHASE C — one ask: answer it, or take yourself off it.
//
// GET  → the ask, for the /deep-dives/mine answer card.
// POST → { action: "answer", answer } | { action: "decline" }
//
// One route for both transitions, deliberately (the T1B2 requests/[id]
// reasoning): both are the TARGET acting on their own single ask and they
// share the same ownership check.
//
// ═══════════════════════════════════════════════════════════════════════════
// ⭐ THE ANSWER RUNS BOTH LENSES (DECISION 4), AND THEY RUN IN PARALLEL.
// Lens 1: divergence against the anchored canon — does the floor need
// teaching? Lens 2: Phase B's candidate detection, machinery reused verbatim —
// does the floor have something to teach? One response, two readings, and a
// HUMAN decides which one it is. Both calls are single-attempt fail-open
// (this is a person's critical path): a dead model means the answer lands
// unread, never that the answer bounces.
//
// ⭐ THE DECLINE WRITES NOTHING (DECISION 5). It removes the caller from the
// ask's live target list — the same array mutation answering performs — and
// that is the entire transaction. No status, no timestamp, no reason, and the
// log line below carries no ids because a decline that leaves a name in a log
// is a record of the decline.
//
// ⭐ AND NONE OF THIS IS REACHABLE FROM FLOOR GUIDE. The only door to a
// response row is this route; this route requires the caller to be on an
// admin-created target list; Floor Guide creates no target lists. The
// separation is structural, and verify-floor-guide-c.mjs exercises it.
// ═══════════════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { readViewerContext } from "@/lib/floor-guide";
import {
  assessDivergence,
  candidateClearsBar,
  detectCandidateInsight,
  lastCandidateDetectDiagnostic,
  lastDivergenceDiagnostic,
} from "@/lib/claude";
import {
  PASSIVE_DETECTOR,
  createCandidateInsight,
  vocabularyFromFrameworks,
} from "@/lib/candidate-insights";
import {
  DIVERGENCE_DETECTOR,
  MIN_ANSWER_CHARS,
  REQUEST_COLUMNS,
  RESPONSE_COLUMNS,
  canonTextFromRecord,
  removeTarget,
  type DeepDiveRequestRow,
  type DeepDiveResponseRow,
} from "@/lib/deep-dives";

// Two model calls ride on this request (in parallel); the platform ceiling is
// the gate, not an internal retry.
export const maxDuration = 60;

// ⚠️⚠️ DRAFT CUSTOMER-FACING COPY — PENDING BRIAN'S SIGN-OFF (Floor Guide C).
const COPY = {
  gone: "That ask isn't open any more.",
  notYours: "This one wasn't asked of you.",
  badAction: "Answer it, or decline it — those are the two moves.",
  tooShort:
    "A bit more, if you can. What you actually do, step by step, and what you watch for — that's what makes your answer worth asking for.",
  alreadyAnswered: "You already answered this one — it's with the person who asked.",
  answered:
    "Sent, with your name on it — exactly as it said above the box. If your way turns out to be something worth teaching, it goes through a person before it goes anywhere else.",
  declined: "Taken off your list. Nothing was recorded — that's the deal.",
  failed: "Couldn't send that just now. Nothing was saved — try again in a moment.",
};

type AnchorRecord = {
  id: string;
  judgment: unknown;
  rationale: unknown;
  boundaries: unknown;
  framework: {
    name?: string;
    the_play?: unknown;
    signals?: unknown;
    when_to_apply?: unknown;
    boundaries?: unknown;
  } | null;
};

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await createSessionClient();
    const {
      data: { user },
    } = await session.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

    // Session read: the targeted/answered RLS policy decides visibility.
    const { data: raw } = await session
      .from("deep_dive_requests")
      .select(REQUEST_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    const request = (raw ?? null) as unknown as DeepDiveRequestRow | null;
    if (!request) return NextResponse.json({ error: COPY.gone }, { status: 404 });

    const { data: asker } = await session
      .from("profiles")
      .select("display_name")
      .eq("id", request.created_by)
      .maybeSingle();

    const { data: mineRaw } = await session
      .from("deep_dive_responses")
      .select(RESPONSE_COLUMNS)
      .eq("request_id", request.id)
      .eq("user_id", user.id)
      .maybeSingle();

    return NextResponse.json({
      ask: {
        id: request.id,
        topic: request.topic,
        status: request.status,
        asked_by: (asker as { display_name: string | null } | null)?.display_name ?? "Your leadership team",
        is_mine: request.targets.includes(user.id) || !!mineRaw,
        answered: !!mineRaw,
      },
    });
  } catch (err) {
    console.error("Unexpected error in deep-dive GET route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await createSessionClient();
    const viewer = await readViewerContext(session);
    if (!viewer) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as {
      action?: unknown;
      answer?: unknown;
    };
    if (body.action !== "answer" && body.action !== "decline") {
      return NextResponse.json({ error: COPY.badAction, code: "BAD_ACTION" }, { status: 400 });
    }

    // Service read, then a hand-rolled ownership check — the same shape as
    // requests/[id]: this row must be judged on what it IS, not on whether a
    // read policy happens to show it.
    const svc = service();
    const { data: raw } = await svc
      .from("deep_dive_requests")
      .select(REQUEST_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    const request = (raw ?? null) as unknown as DeepDiveRequestRow | null;
    if (!request || request.status !== "open") {
      return NextResponse.json({ error: COPY.gone }, { status: 404 });
    }

    // ⭐ Only the person asked. Not their manager, not an admin — an answer or
    // a decline given on somebody's behalf would put words (or a silence) into
    // an assessed record under their name.
    const isTarget = request.targets.includes(viewer.userId);

    // ── DECLINE — the whole branch is one array update. ──
    if (body.action === "decline") {
      if (!isTarget) {
        // Includes the already-answered case: there is nothing to decline.
        return NextResponse.json({ error: COPY.notYours, code: "NOT_YOURS" }, { status: 403 });
      }
      await removeTarget(svc, { requestId: request.id, userId: viewer.userId });
      // No ids in this line, deliberately — see the header.
      console.log("[deep-dive] an ask was declined — nothing recorded, by design.");
      return NextResponse.json({ ok: true, declined: true, message: COPY.declined });
    }

    // ── ANSWER ──
    const answer = typeof body.answer === "string" ? body.answer.trim() : "";
    if (!isTarget) {
      // Answered already? Say so kindly; a repeat submit must not error.
      const { data: existing } = await svc
        .from("deep_dive_responses")
        .select("id")
        .eq("request_id", request.id)
        .eq("user_id", viewer.userId)
        .maybeSingle();
      if (existing) {
        return NextResponse.json({ ok: true, already: true, message: COPY.alreadyAnswered });
      }
      return NextResponse.json({ error: COPY.notYours, code: "NOT_YOURS" }, { status: 403 });
    }
    if (answer.length < MIN_ANSWER_CHARS) {
      return NextResponse.json({ error: COPY.tooShort, code: "TOO_SHORT" }, { status: 400 });
    }

    // The anchor, if the ask carries one. Read fresh at answer time — the
    // reading compares against what canon says NOW, and records which record
    // that was (compared_record_id).
    let anchor: AnchorRecord | null = null;
    if (request.anchor_record_id) {
      const { data: recRaw } = await svc
        .from("pattern_records")
        .select("id, judgment, rationale, boundaries, framework")
        .eq("id", request.anchor_record_id)
        .maybeSingle();
      anchor = (recRaw ?? null) as AnchorRecord | null;
    }

    // Vocabulary for lens 2 — what this org already has, so "novel" means
    // something. Service client scoped by org (the responder is a contributor;
    // their session can read the library anyway, this is just the same list).
    const { data: fwRows } = await svc
      .from("pattern_records")
      .select("framework")
      .eq("org_id", request.org_id)
      .eq("status", "complete")
      .not("framework", "is", null)
      .order("created_at", { ascending: false })
      .limit(60);
    const vocabulary = vocabularyFromFrameworks(
      (fwRows ?? []) as { framework: { name?: unknown; tagline?: unknown } | null }[]
    );

    // ⭐ BOTH LENSES, IN PARALLEL, BEFORE ANY WRITE. Independent questions, one
    // Promise.all — the same discipline as the Phase A rephrase pass's two
    // searches. Model calls first, writes after, so a flake unwinds nothing.
    const [reading, detection] = await Promise.all([
      anchor?.framework
        ? assessDivergence({
            topic: request.topic,
            answer,
            frameworkName: anchor.framework.name ?? "(unnamed framework)",
            canon: canonTextFromRecord(anchor),
            title: viewer.claimedTitle,
          })
        : Promise.resolve(null),
      detectCandidateInsight(answer, vocabulary, viewer.claimedTitle),
    ]);

    if (anchor?.framework && !reading) {
      // Fail-open, loudly diagnosable — never a blocked answer.
      console.log(
        `[deep-dive] divergence reading unavailable — answer lands unread: ` +
          `${lastDivergenceDiagnostic ?? "no diagnostic"}`
      );
    }
    if (!detection) {
      console.log(
        `[deep-dive] candidate detection quiet: ${lastCandidateDetectDiagnostic ?? "no diagnostic"}`
      );
    }

    // No anchor at all → 'no_basis' with compared_record_id null, decided in
    // code without a model call: there is nothing to honestly compare, and the
    // surface renders that state as "nothing codified was attached."
    const divergence = anchor?.framework ? (reading?.verdict ?? null) : "no_basis";
    const divergenceNote = anchor?.framework ? (reading?.point ?? null) : null;
    const comparedRecordId = anchor?.framework && reading ? anchor.id : null;

    const { data: insRaw, error: insError } = await svc
      .from("deep_dive_responses")
      .insert({
        org_id: request.org_id,
        request_id: request.id,
        user_id: viewer.userId,
        answer: answer.slice(0, 4000),
        divergence,
        divergence_note: divergenceNote,
        compared_record_id: comparedRecordId,
        divergence_detector: anchor?.framework && reading ? DIVERGENCE_DETECTOR : null,
      })
      .select(RESPONSE_COLUMNS)
      .single();
    if (insError || !insRaw) {
      // A duplicate (unique index) means they answered in another tab.
      if (insError?.code === "23505") {
        return NextResponse.json({ ok: true, already: true, message: COPY.alreadyAnswered });
      }
      console.error("[deep-dive] response insert failed:", insError?.message);
      return NextResponse.json({ error: COPY.failed, code: "INSERT_FAILED" }, { status: 500 });
    }
    const response = insRaw as unknown as DeepDiveResponseRow;

    // ⭐ LENS 2's write — Phase B machinery verbatim, source 'deep_dive'. Only
    // above the same 0.85 bar the passive path holds; the row lands in the
    // same /insights queue, promotable through the same one door. Failure here
    // is logged and dropped: the response (the baseline) is already safe.
    let candidateId: string | null = null;
    if (detection && candidateClearsBar(detection)) {
      const created = await createCandidateInsight(svc, {
        orgId: request.org_id,
        userId: viewer.userId,
        source: "deep_dive",
        surface: "deep_dive",
        rawInput: answer,
        contextNote: `Answered a deep dive: ${request.topic.slice(0, 300)}`,
        summary: detection.summary,
        suggestedTitle: detection.suggestedTitle,
        confidence: detection.confidence,
        detector: PASSIVE_DETECTOR,
      });
      if (created.ok) {
        candidateId = created.candidate.id;
        const { error: linkError } = await svc
          .from("deep_dive_responses")
          .update({ candidate_insight_id: candidateId })
          .eq("id", response.id);
        if (linkError) {
          // Both rows exist and both readings are real; only the cross-link is
          // missing. Log, never fail the person's submit.
          console.error(`[deep-dive] candidate link failed for ${response.id}: ${linkError.message}`);
        }
      } else {
        console.error("[deep-dive] candidate write failed:", created.error);
      }
    }

    // Off the live list — the same mutation a decline performs, which is what
    // keeps the two indistinguishable from the outside (DECISION 5).
    await removeTarget(svc, { requestId: request.id, userId: viewer.userId });

    console.log(
      `[deep-dive] answered (request=${request.id}, divergence=${divergence ?? "unread"}, ` +
        `candidate=${candidateId ? "yes" : "no"})`
    );
    return NextResponse.json({
      ok: true,
      answered: true,
      message: COPY.answered,
    });
  } catch (err) {
    console.error("Unexpected error in deep-dive POST route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
