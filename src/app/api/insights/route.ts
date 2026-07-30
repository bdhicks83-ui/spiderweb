// FLOOR GUIDE / PHASE B — the explicit share, and the admin queue.
//
// POST → a contributor chose to tell us something. It ALWAYS becomes a
//        candidate. No scoring, no bar, no model call.
// GET  → the review queue. RLS decides who sees what; this route does not.
//
// ⭐ WHY THE EXPLICIT PATH IS NEVER SCORED. Somebody stopped what they were
// doing, opened a panel and typed out how they work. That act is a stronger
// signal than any confidence number a model can produce, and running their
// words through a filter that might silently drop them would be both insulting
// and self-defeating: the one person who took the trouble is the one whose idea
// gets thrown away. Passive detection has a high bar because nobody asked for
// it. This has no bar because somebody did.
//
// ⭐ WHY THE QUEUE READ USES THE SESSION CLIENT. Three different people can see
// a candidate — the org admin, the expert it was routed to, and the contributor
// who surfaced it (positive-only) — and all three rules are RLS policies in
// supabase/floorguide-b-emergent-insight.sql. Reading through the session client
// means the policy IS the authorization. A service-role read plus a hand-written
// `if` here would be a second, drifting copy of the same rule.
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { readViewerContext } from "@/lib/floor-guide";
import {
  CANDIDATE_COLUMNS,
  EXPLICIT_DETECTOR,
  createCandidateInsight,
  isCandidateSurface,
  type CandidateRow,
} from "@/lib/candidate-insights";

// ⚠️⚠️ DRAFT CUSTOMER-FACING COPY — PENDING BRIAN'S SIGN-OFF (Floor Guide B).
// Full draft set in claude/COPY-DRAFT-floorguide-phaseB.md.
const COPY = {
  empty: "Nothing to share yet — tell us what you do and we'll take it from there.",
  tooShort:
    "A bit more, if you can. What you look for, what you do, and why it beats the other way — that's what makes it usable for somebody else.",
  // A member/manager hitting this is not doing anything wrong; they just have a
  // better door available. Never a refusal, always a redirect.
  notContributor:
    "You can capture this properly yourself — it'll carry your name and go straight into the library.",
  noOrg: "You're not part of an organization yet, so there's nobody to send this to.",
  saved: "Got it — that's in front of a person now. If it becomes part of the playbook, your name goes on it.",
  repeat: "You've already sent this one up — it's still with your leadership team.",
  failed: "Couldn't send that just now. Try again in a moment and it should go.",
};

const MIN_SHARE_CHARS = 40;

type ProfileLite = { id: string; display_name: string | null; claimed_title: string | null };

export async function POST(req: NextRequest) {
  try {
    const session = await createSessionClient();
    const viewer = await readViewerContext(session);
    if (!viewer) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    if (!viewer.orgId) {
      return NextResponse.json({ error: COPY.noOrg, code: "NO_ORG" }, { status: 409 });
    }
    // Not a permission check — a signpost. See COPY.notContributor.
    if (!viewer.isContributor) {
      return NextResponse.json(
        { error: COPY.notContributor, code: "CAN_CODIFY_DIRECTLY", codify_href: "/codify" },
        { status: 409 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      idea?: unknown;
      context_note?: unknown;
      surface?: unknown;
    };
    const idea = typeof body.idea === "string" ? body.idea.trim() : "";
    if (!idea) return NextResponse.json({ error: COPY.empty }, { status: 400 });
    if (idea.length < MIN_SHARE_CHARS) {
      return NextResponse.json({ error: COPY.tooShort, code: "TOO_SHORT" }, { status: 400 });
    }

    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const result = await createCandidateInsight(service, {
      orgId: viewer.orgId,
      userId: viewer.userId,
      source: "explicit",
      surface: isCandidateSurface(body.surface) ? body.surface : null,
      rawInput: idea,
      contextNote: typeof body.context_note === "string" ? body.context_note : null,
      detector: EXPLICIT_DETECTOR,
    });
    if (!result.ok) {
      console.error("[insights] explicit share failed:", result.error);
      return NextResponse.json({ error: COPY.failed }, { status: 500 });
    }

    console.log(
      `[insights] explicit share ${result.created ? "created" : "deduped"} ` +
        `(org=${viewer.orgId}, chars=${idea.length})`
    );
    return NextResponse.json({
      ok: true,
      id: result.candidate.id,
      created: result.created,
      message: result.created ? COPY.saved : COPY.repeat,
    });
  } catch (err) {
    console.error("Unexpected error in insights POST:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}

export type QueueItem = CandidateRow & {
  person: ProfileLite | null;
  routed_to: ProfileLite | null;
  acted_by_name: string | null;
  /** True when this row is in front of the caller because it was routed to them
   *  personally rather than because they administer the org. */
  routed_to_me: boolean;
};

export async function GET(req: NextRequest) {
  try {
    const session = await createSessionClient();
    const viewer = await readViewerContext(session);
    if (!viewer) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

    const url = new URL(req.url);
    const includeClosed = url.searchParams.get("include") === "closed";

    // RLS does the scoping: an admin's org queue, plus anything routed to this
    // person. A contributor's own positive-only rows also satisfy the own-row
    // policy — harmless here, and the queue page is not linked for them.
    let q = session.from("candidate_insights").select(CANDIDATE_COLUMNS);
    if (!includeClosed) {
      // 'dismissed' is never listed by default even for an admin: the point of
      // dismissing is that it leaves the queue. `?include=closed` is the audit
      // view, not the working one.
      q = q.in("status", ["new", "reviewing", "routed", "promoted"]);
    }
    const { data, error } = await q
      // Explicit shares first, then newest. An admin should meet the ideas
      // somebody chose to send before the ones we noticed.
      .order("source", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error("[insights] queue read failed:", error.message);
      return NextResponse.json(
        { error: "Could not load the queue.", details: error.message },
        { status: 500 }
      );
    }
    const rows = (data ?? []) as unknown as CandidateRow[];

    // Names. Same two-query shape as /api/library — pattern_records.user_id and
    // candidate_insights.user_id both reference auth.users, so there is no join.
    const ids = Array.from(
      new Set(
        rows.flatMap((r) =>
          [r.user_id, r.routed_to_user_id, r.acted_by].filter((v): v is string => !!v)
        )
      )
    );
    let people: Record<string, ProfileLite> = {};
    if (ids.length > 0) {
      const { data: profs } = await session
        .from("profiles")
        .select("id, display_name, claimed_title")
        .in("id", ids);
      people = Object.fromEntries(
        ((profs ?? []) as ProfileLite[]).map((p) => [p.id, p])
      );
    }

    const queue: QueueItem[] = rows.map((r) => ({
      ...r,
      person: people[r.user_id] ?? null,
      routed_to: r.routed_to_user_id ? people[r.routed_to_user_id] ?? null : null,
      acted_by_name: r.acted_by ? people[r.acted_by]?.display_name ?? null : null,
      routed_to_me: r.routed_to_user_id === viewer.userId,
    }));

    // Who may act. An admin may act on their org's queue; an expert may act on
    // what was routed to them and nothing else. The page renders from these two
    // booleans so it never offers a button the API will refuse.
    const { data: isAdmin } = await session.rpc("is_org_admin");
    const canReview = isAdmin === true;

    // Who a candidate can be routed TO: somebody in this org whose input is
    // already allowed to become judgment. A contributor cannot be routed an
    // insight to codify — that would hand the integrity rule to the exact person
    // it exists to protect from carrying that weight. Filtered here AND
    // re-validated in the action route, because a select box is not a gate.
    let experts: ProfileLite[] = [];
    if (canReview && viewer.orgId) {
      const { data: expRows } = await session
        .from("profiles")
        .select("id, display_name, claimed_title")
        .eq("org_id", viewer.orgId)
        .in("role", ["member", "manager"])
        .is("deactivated_at", null)
        .order("display_name", { ascending: true });
      experts = (expRows ?? []) as ProfileLite[];
    }

    return NextResponse.json({
      can_review: canReview,
      experts,
      viewer: { id: viewer.userId, role: viewer.role },
      counts: {
        waiting: queue.filter((q2) => q2.status === "new" || q2.status === "reviewing").length,
        explicit: queue.filter((q2) => q2.source === "explicit" && q2.status === "new").length,
        routed_to_me: queue.filter((q2) => q2.routed_to_me && q2.status === "routed").length,
      },
      queue,
    });
  } catch (err) {
    console.error("Unexpected error in insights GET:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
