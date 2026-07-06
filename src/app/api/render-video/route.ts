import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { inngest } from "@/inngest/client";

export async function POST(req: NextRequest) {
  const { insightId } = await req.json();

  if (!insightId || typeof insightId !== "string") {
    return NextResponse.json({ error: "insightId is required" }, { status: 400 });
  }

  // Session-aware client — RLS scopes reads to the logged-in user.
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: insight } = await supabase
    .from("insights")
    .select("id, user_id, content, status")
    .eq("id", insightId)
    .single();

  if (!insight) {
    return NextResponse.json({ error: "Insight not found" }, { status: 404 });
  }

  if (insight.status !== "approved") {
    return NextResponse.json(
      { error: "Only approved insights can be rendered" },
      { status: 400 }
    );
  }

  await inngest.send({
    name: "video/render-video",
    data: { insight_id: insight.id, user_id: insight.user_id },
  });

  return NextResponse.json({ queued: true, insightId: insight.id });
}
