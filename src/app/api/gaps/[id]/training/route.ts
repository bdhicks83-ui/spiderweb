// P-9 Part 2 (the optional half) — link an on-demand training request to a gap.
// POST { training_request_id }
//
// The gap is closed by a CODIFIED FRAMEWORK, never by a training artifact —
// judgment first, delivery second. This route records the delivery so the
// person who originally asked gets pointed at both the answer and the training
// built from it.
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { attachTrainingToGap } from "@/lib/knowledge-gaps";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const trainingRequestId =
      typeof body?.training_request_id === "string" ? body.training_request_id : "";
    if (!UUID_RE.test(trainingRequestId)) {
      return NextResponse.json({ error: "training_request_id (uuid) is required" }, { status: 400 });
    }

    const supabase = await createSessionClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .maybeSingle();
    const orgId = (profile as { org_id: string | null } | null)?.org_id ?? null;
    if (!orgId) return NextResponse.json({ error: "Not in an org" }, { status: 409 });

    // AUTHORIZATION IS THE READ: both rows are loaded through the caller's own
    // RLS first, so neither id can be used to reach outside their org.
    const { data: gap } = await supabase
      .from("knowledge_gaps")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (!gap) return NextResponse.json({ error: "Gap not found" }, { status: 404 });

    const { data: request } = await supabase
      .from("training_requests")
      .select("id")
      .eq("id", trainingRequestId)
      .maybeSingle();
    if (!request) return NextResponse.json({ error: "Training request not found" }, { status: 404 });

    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const linked = await attachTrainingToGap(service, {
      gapId: id,
      orgId,
      trainingRequestId,
    });
    return NextResponse.json({ success: true, linked });
  } catch (err) {
    console.error("Unexpected error in gap training route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
