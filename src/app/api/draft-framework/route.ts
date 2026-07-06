// Phase 3 — "It Reveals": manual trigger, cluster → drafted framework.
// POST { hub_insight_id }. Re-runs detect_clusters server-side so we never
// trust cluster contents sent from the browser.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { draftFramework } from "@/lib/claude";

export async function POST(req: NextRequest) {
  try {
    const { hub_insight_id } = await req.json();
    if (!hub_insight_id) {
      return NextResponse.json(
        { error: "Missing hub_insight_id" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    // Fresh cluster state — same params as the dashboard.
    const { data: clusters, error: clusterError } = await supabase.rpc(
      "detect_clusters",
      {
        p_user_id: user.id,
        p_min_similarity: 0.82,
        p_min_members: 2,
      }
    );
    if (clusterError) {
      return NextResponse.json(
        { error: "Cluster detection failed", details: clusterError.message },
        { status: 500 }
      );
    }

    const cluster = (clusters ?? []).find(
      (c: { hub_insight_id: string }) => c.hub_insight_id === hub_insight_id
    );
    if (!cluster) {
      return NextResponse.json(
        { error: "Cluster no longer exists — refresh the dashboard" },
        { status: 404 }
      );
    }

    const insightContents: string[] = [
      cluster.hub_content,
      ...cluster.member_contents,
    ];

    const draft = await draftFramework(insightContents);
    if (!draft) {
      return NextResponse.json(
        { error: "Claude returned an unusable draft — try again" },
        { status: 502 }
      );
    }

    // Upsert: re-drafting a cluster replaces the previous draft.
    const { data: framework, error: insertError } = await supabase
      .from("frameworks")
      .upsert(
        {
          user_id: user.id,
          hub_insight_id,
          insight_snapshot: insightContents,
          name: draft.name,
          description: draft.description,
          writeup: draft.writeup,
          status: "draft",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,hub_insight_id" }
      )
      .select()
      .single();

    if (insertError) {
      return NextResponse.json(
        { error: "Failed to save framework", details: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ framework });
  } catch (err) {
    console.error("Unexpected error in draft-framework route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
