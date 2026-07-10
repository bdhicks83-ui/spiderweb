// Phase 8 (Block 4) — Org-Fit Matching.
// POST { expertId?, teamSize, decisionStyle, pace, formality }.
//
// The EXPERT side is inferred entirely from their existing insights (no survey)
// and cached on profiles.behavioral_profile. The ORG side is this short intake.
// The output is a plain-English fit summary (NOT pass/fail) flagging likely
// friction. By design it is shown to the ORG only, BEFORE any commitment — so
// this route is unauthenticated (a prospective buyer may have no account) and
// writes the assessment through the service role. The expert never reads it.
import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { inferBehavioralProfile, assessOrgFit, type BehavioralProfile } from "@/lib/claude";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const intake = {
      teamSize: (body?.teamSize as string | undefined)?.trim() || "unspecified",
      decisionStyle: (body?.decisionStyle as string | undefined)?.trim() || "unspecified",
      pace: (body?.pace as string | undefined)?.trim() || "unspecified",
      formality: (body?.formality as string | undefined)?.trim() || "unspecified",
    };
    let expertId = (body?.expertId as string | undefined)?.trim() || null;

    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Resolve the expert. Invite-only today means one real expert, so when no id
    // is supplied we pick the account with the most approved insights.
    if (!expertId) {
      const { data: approved } = await service
        .from("insights")
        .select("user_id")
        .eq("status", "approved");
      const counts = new Map<string, number>();
      for (const r of (approved as { user_id: string }[] | null) || []) {
        counts.set(r.user_id, (counts.get(r.user_id) || 0) + 1);
      }
      expertId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    }
    if (!expertId) {
      return NextResponse.json({ error: "No expert available to match." }, { status: 404 });
    }

    // Use the cached behavioral profile if present; otherwise infer it from the
    // expert's approved insights and cache it for next time.
    const { data: profileRow } = await service
      .from("profiles")
      .select("behavioral_profile")
      .eq("id", expertId)
      .maybeSingle();

    let profile = (profileRow?.behavioral_profile as BehavioralProfile | null) || null;
    if (!profile) {
      const { data: insights } = await service
        .from("insights")
        .select("content")
        .eq("user_id", expertId)
        .eq("status", "approved")
        .limit(40);
      const contents = ((insights as { content: string }[] | null) || [])
        .map((i) => i.content)
        .filter(Boolean);
      if (contents.length === 0) {
        return NextResponse.json(
          { error: "This expert has no captured insights to profile yet." },
          { status: 422 }
        );
      }
      profile = await inferBehavioralProfile(contents);
      if (!profile) {
        return NextResponse.json(
          { error: "Couldn't build a working-style profile right now — try again." },
          { status: 500 }
        );
      }
      await service.from("profiles").update({ behavioral_profile: profile }).eq("id", expertId);
    }

    const fit = await assessOrgFit(profile, intake);
    if (!fit) {
      return NextResponse.json(
        { error: "Couldn't generate a fit summary right now — try again." },
        { status: 500 }
      );
    }

    await service.from("org_fit_assessments").insert({
      expert_id: expertId,
      team_size: intake.teamSize,
      decision_style: intake.decisionStyle,
      pace: intake.pace,
      formality: intake.formality,
      fit_summary: fit.summary,
      friction_points: fit.frictionPoints,
    });

    return NextResponse.json({
      success: true,
      summary: fit.summary,
      friction_points: fit.frictionPoints,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
