// FLOOR GUIDE / PHASE B — THE HUMAN ACTION.
//
// POST { action: "promote" | "route" | "dismiss", expert_id? }
//
// ═══════════════════════════════════════════════════════════════════════════
// ⭐ THIS ROUTE IS THE INTEGRITY RULE'S ONLY DOOR.
//
// Phase A made it impossible for a contributor's input to become canonical
// judgment. Phase B does not weaken that — it adds exactly one sanctioned path
// through it, and the path runs through a named human pressing a button.
//
// Which means the promote branch must NOT look like "a way around the trigger."
// It isn't one. It creates the framework as ordinary expert-authored judgment:
//   • user_id is the ACTING ADMIN OR EXPERT, never the contributor. They are
//     taking this on as their own call, which is what makes it judgment.
//   • surfaced_by_user_id credits the contributor. A second credit, not a
//     transfer of authorship.
//   • codified_from.candidate_insight_id proves which human decision produced
//     it, and the pattern_records_surfaced_guard trigger REFUSES the insert if
//     that decision doesn't exist.
// So the Phase A trigger still fires and still passes, for the ordinary reason
// that the owner is not a contributor — not because anything was bypassed.
//
// ⭐ ORDERING IS LOAD-BEARING: stamp the candidate, THEN insert the framework.
// The trigger reads the candidate to prove a human acted, so the reverse order
// cannot work. It also fails in the better direction — a crash between the two
// leaves an acted-on candidate with no framework (visible in the queue,
// re-promotable) rather than a framework nobody approved.
//
// ⭐ THE DRAFTING MODEL IS A TRANSCRIBER, NOT AN AUTHOR. It reorganises the
// person's words into the record shape every other framework has, and is
// instructed to write "not specified" rather than invent a rationale or a
// boundary (prompts/candidate-insight-draft.md). The human decided; the model
// filed. If that distinction ever blurs, this stops being promotion and starts
// being generation, which is the one thing the whole phase exists to prevent.
// ═══════════════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { canCreateCanonicalJudgment, readViewerContext } from "@/lib/floor-guide";
import { draftSurfacedInsight } from "@/lib/claude";
import { embedPatternRecord } from "@/lib/pattern-embedding";
import {
  CANDIDATE_COLUMNS,
  buildCodifiedFrom,
  isActionKind,
  revertAction,
  setPromotedRecord,
  stampActed,
  vocabularyFromFrameworks,
  withContributorCredit,
  type CandidateRow,
} from "@/lib/candidate-insights";

// ⚠️⚠️ DRAFT CUSTOMER-FACING COPY — PENDING BRIAN'S SIGN-OFF (Floor Guide B).
const COPY = {
  notAllowed: "You need admin access on this account to act on ideas from the floor.",
  gone: "That idea is no longer here.",
  badAction: "Pick one: make it a Framework, send it to an expert, or close it.",
  needExpert: "Choose who should take this on.",
  badExpert: "That person can't take this on — pick someone on your team who captures judgment.",
  cannotCodify:
    "Your own seat is set to contributor, so a framework can't be created under your name. Send it to an expert instead — they'll carry it, and the credit still goes to the person who surfaced it.",
  draftFailed:
    "Couldn't turn that into a framework just now. Nothing was changed — try again, or send it to an expert to write up properly.",
  promoted: (name: string) => `"${name}" is in the library now, credited to both of them.`,
  routed: (name: string) => `Sent to ${name}. The person who surfaced it will hear it's moving.`,
  dismissed: "Closed. They won't be told — that's deliberate.",
};

type ProfileLite = {
  id: string;
  display_name: string | null;
  claimed_title: string | null;
  role: string | null;
  org_id: string | null;
  deactivated_at: string | null;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await createSessionClient();
    const viewer = await readViewerContext(session);
    if (!viewer) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as {
      action?: unknown;
      expert_id?: unknown;
    };
    if (!isActionKind(body.action)) {
      return NextResponse.json({ error: COPY.badAction, code: "BAD_ACTION" }, { status: 400 });
    }
    const action = body.action;

    // The candidate, read through the session client so RLS is the gate.
    const { data: candidateRaw, error: readError } = await session
      .from("candidate_insights")
      .select(CANDIDATE_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (readError) {
      return NextResponse.json(
        { error: "Could not load that idea.", details: readError.message },
        { status: 500 }
      );
    }
    const candidate = (candidateRaw ?? null) as unknown as CandidateRow | null;
    if (!candidate) return NextResponse.json({ error: COPY.gone }, { status: 404 });

    // ── AUTHORITY. Two kinds of person may act, and an expert's authority is
    //    scoped to the single candidate that was handed to them.
    const { data: isAdminRaw } = await session.rpc("is_org_admin");
    const isAdmin = isAdminRaw === true && candidate.org_id === viewer.orgId;
    const isRoutedExpert = candidate.routed_to_user_id === viewer.userId;
    if (!isAdmin && !isRoutedExpert) {
      return NextResponse.json({ error: COPY.notAllowed, code: "NOT_ORG_ADMIN" }, { status: 403 });
    }
    // Re-routing is an admin decision. An expert who doesn't want it should say
    // so to a person, not bounce it onward through the queue.
    if (action === "route" && !isAdmin) {
      return NextResponse.json({ error: COPY.notAllowed, code: "NOT_ORG_ADMIN" }, { status: 403 });
    }

    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // ── DISMISS. Quiet, and quiet is the whole feature. stampActed() clears the
    //    notification stamp; RLS already hides the row from the person.
    if (action === "dismiss") {
      const stamped = await stampActed(service, {
        candidateId: candidate.id,
        orgId: candidate.org_id,
        action: "dismiss",
        actorId: viewer.userId,
      });
      if (!stamped.ok) {
        return NextResponse.json({ error: stamped.error }, { status: stamped.status });
      }
      return NextResponse.json({ ok: true, status: "dismissed", message: COPY.dismissed });
    }

    // ── ROUTE TO AN EXPERT.
    if (action === "route") {
      const expertId = typeof body.expert_id === "string" ? body.expert_id : "";
      if (!expertId) {
        return NextResponse.json({ error: COPY.needExpert, code: "NEED_EXPERT" }, { status: 400 });
      }
      const { data: expRaw } = await session
        .from("profiles")
        .select("id, display_name, claimed_title, role, org_id, deactivated_at")
        .eq("id", expertId)
        .maybeSingle();
      const expert = (expRaw ?? null) as unknown as ProfileLite | null;
      const usable =
        !!expert &&
        expert.org_id === candidate.org_id &&
        !expert.deactivated_at &&
        canCreateCanonicalJudgment(expert.role) &&
        expert.id !== candidate.user_id;
      if (!usable) {
        return NextResponse.json({ error: COPY.badExpert, code: "BAD_EXPERT" }, { status: 400 });
      }
      const stamped = await stampActed(service, {
        candidateId: candidate.id,
        orgId: candidate.org_id,
        action: "route",
        actorId: viewer.userId,
        routedToUserId: expert!.id,
      });
      if (!stamped.ok) {
        return NextResponse.json({ error: stamped.error }, { status: stamped.status });
      }
      return NextResponse.json({
        ok: true,
        status: "routed",
        routed_to: expert!.display_name,
        message: COPY.routed(expert!.display_name ?? "them"),
      });
    }

    // ── PROMOTE. The only path in the product where floor input becomes judgment.

    // The actor owns the record, so the actor must be allowed to own judgment.
    // A contributor who also administers the account hits this — the Phase A
    // trigger would refuse the insert anyway, and a sentence beats an exception.
    if (!canCreateCanonicalJudgment(viewer.role)) {
      return NextResponse.json(
        { error: COPY.cannotCodify, code: "CONTRIBUTOR_CANNOT_CODIFY" },
        { status: 403 }
      );
    }

    // Already done? Say so and return the framework rather than making a second one.
    if (candidate.status === "promoted" && candidate.promoted_record_id) {
      return NextResponse.json({
        ok: true,
        status: "promoted",
        already: true,
        record_id: candidate.promoted_record_id,
      });
    }

    const { data: peopleRaw } = await session
      .from("profiles")
      .select("id, display_name, claimed_title, role, org_id, deactivated_at")
      .in("id", [candidate.user_id, viewer.userId]);
    const people = (peopleRaw ?? []) as unknown as ProfileLite[];
    const contributor = people.find((p) => p.id === candidate.user_id) ?? null;
    const contributorName = contributor?.display_name ?? "A contributor";
    const expertName = viewer.displayName ?? "An expert";

    const { data: fwRows } = await session
      .from("pattern_records")
      .select("framework")
      .eq("org_id", candidate.org_id)
      .eq("status", "complete")
      .not("framework", "is", null)
      .order("created_at", { ascending: false })
      .limit(60);
    const vocabulary = vocabularyFromFrameworks(
      (fwRows ?? []) as { framework: { name?: unknown; tagline?: unknown } | null }[]
    );

    const draft = await draftSurfacedInsight({
      idea: candidate.raw_input,
      context: candidate.context_note,
      contributor: contributorName,
      contributorTitle: contributor?.claimed_title ?? null,
      expert: expertName,
      vocabulary,
    });
    if (!draft) {
      // Nothing has been stamped yet, so nothing needs unwinding. This is why
      // the drafting happens BEFORE the stamp even though the insert happens
      // after it.
      return NextResponse.json({ error: COPY.draftFailed, code: "DRAFT_FAILED" }, { status: 502 });
    }

    // ⭐ STAMP FIRST. The trigger will read this.
    const stamped = await stampActed(service, {
      candidateId: candidate.id,
      orgId: candidate.org_id,
      action: "promote",
      actorId: viewer.userId,
    });
    if (!stamped.ok) {
      return NextResponse.json({ error: stamped.error }, { status: stamped.status });
    }
    if (stamped.alreadyActed && stamped.candidate.promoted_record_id) {
      return NextResponse.json({
        ok: true,
        status: stamped.candidate.status,
        already: true,
        record_id: stamped.candidate.promoted_record_id,
      });
    }

    const nowIso = new Date().toISOString();
    const record = {
      // The expert/admin taking it on. NEVER the contributor — that is the
      // Phase A rule and it is not relaxed here.
      user_id: viewer.userId,
      org_id: candidate.org_id,
      status: "complete",
      // 'win' so the Win Column picks it up (it is derived from wins that name
      // people, and the role_person credit below is the contributor). See
      // withContributorCredit() for why this needs no Win Column code.
      trigger_type: "win",
      method: "floor_surfaced",
      situation_type: draft.situation_type || null,
      intervention_type: draft.intervention_type || null,
      context_summary: draft.context_summary,
      context_function: contributor?.claimed_title ?? null,
      trigger_signal: draft.trigger_signal,
      signal_detail: draft.signal_detail,
      judgment: draft.judgment,
      rationale: draft.rationale,
      boundaries: draft.boundaries,
      outcome: draft.outcome,
      qa_pairs: [],
      entity_map: withContributorCredit(draft.entity_map, contributorName),
      framework: draft.framework,
      framework_rendered_at: nowIso,
      // ⚠️ candidate_insight_id in here is what the DB trigger reads to prove a
      // human acted. Renaming the key breaks every promotion.
      codified_from: buildCodifiedFrom({
        candidateId: candidate.id,
        source: candidate.source,
        surface: candidate.surface,
        confidence: candidate.confidence,
        detector: candidate.detector,
        surfacedByUserId: candidate.user_id,
        surfacedByName: contributorName,
        promotedByUserId: viewer.userId,
        promotedByName: expertName,
        routedToUserId: candidate.routed_to_user_id,
        rawInput: candidate.raw_input,
      }),
      surfaced_by_user_id: candidate.user_id,
    };

    const { data: insRaw, error: insError } = await service
      .from("pattern_records")
      .insert(record)
      .select("id")
      .single();
    if (insError || !insRaw) {
      // Put the candidate back in the queue. An acted-on candidate with no
      // framework is invisible and un-retryable, which is worse than a retry.
      await revertAction(service, candidate.id);
      console.error("[insights] promote insert failed:", insError?.message);
      return NextResponse.json(
        { error: COPY.draftFailed, code: "INSERT_FAILED", details: insError?.message },
        { status: 500 }
      );
    }
    const recordId = (insRaw as { id: string }).id;
    await setPromotedRecord(service, { candidateId: candidate.id, recordId });

    // Embedding is unreliable on the codify path (documented in MASTER-STATE) and
    // it is not this request's job to be sure. A framework that exists but isn't
    // yet retrievable is fixed by scripts/backfill-pattern-embeddings.mjs; a
    // failed promotion because an embedding call flaked would not be.
    const embed = await embedPatternRecord(service, recordId);
    if (!embed.ok) {
      console.error(
        `[insights] embed failed for ${recordId} (${embed.error}) — run ` +
          `scripts/backfill-pattern-embeddings.mjs then scripts/verify-p3.mjs`
      );
    }

    console.log(
      `[insights] promoted ${candidate.id} -> pattern_record ${recordId} ` +
        `(surfaced_by=${candidate.user_id}, codified_with=${viewer.userId}, embedded=${embed.ok})`
    );
    return NextResponse.json({
      ok: true,
      status: "promoted",
      record_id: recordId,
      framework_name: draft.framework.name,
      embedded: embed.ok,
      surfaced_by: contributorName,
      codified_with: expertName,
      message: COPY.promoted(draft.framework.name),
    });
  } catch (err) {
    console.error("Unexpected error in insights action route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
