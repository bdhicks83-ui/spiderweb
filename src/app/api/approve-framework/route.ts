// Phase 3 — "It Reveals": mark a drafted framework as approved.
// POST { framework_id }. RLS ("own frameworks") plus an explicit user_id
// filter ensure a user can only approve their own frameworks.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const { framework_id } = await req.json();
    if (!framework_id) {
      return NextResponse.json(
        { error: "Missing framework_id" },
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

    const { data: framework, error: updateError } = await supabase
      .from("frameworks")
      .update({
        status: "approved",
        updated_at: new Date().toISOString(),
      })
      .eq("id", framework_id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (updateError) {
      // PGRST116 = no rows matched (wrong id, someone else's row, or deleted)
      if (updateError.code === "PGRST116") {
        return NextResponse.json(
          { error: "Framework not found — refresh the dashboard" },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: "Failed to approve framework", details: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ framework });
  } catch (err) {
    console.error("Unexpected error in approve-framework route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
