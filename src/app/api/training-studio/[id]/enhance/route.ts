// P-7 Build 4 (the human half) — leader enhancements as effectiveness
// modifiers.
//
// POST { note }
//
// "I added a real defective part to the drill." That is a genuine
// improvement AND a confound: the next outcome is no longer a clean read on
// the format alone. Both facts matter, so an enhancement is captured on the
// CURRENT attempt's format-outcome row rather than buried in a comment
// field. Build 5 must know an outcome was modified by a human before it
// credits the format with the result.
//
// Deliberately additive: enhancements append, never overwrite, and never
// change the artifact — the training the leader approved is what shipped.
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { FormatOutcomeEnhancement } from "@/lib/training-studio";

type RequestRow = {
  id: string;
  org_id: string;
  attempt_count: number;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const note = typeof body?.note === "string" ? body.note.trim() : "";
    if (note.length < 3) {
      return NextResponse.json(
        { error: "Say what you added or changed — a short line is enough." },
        { status: 400 }
      );
    }

    const supabase = await createSessionClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }
    const { data: isManager } = await supabase.rpc("is_manager");
    if (isManager !== true) {
      return NextResponse.json(
        { error: "Recording an enhancement is a manager action." },
        { status: 403 }
      );
    }

    const { data: reqRaw } = await supabase
      .from("training_requests")
      .select("id, org_id, attempt_count")
      .eq("id", id)
      .maybeSingle();
    const request = reqRaw as unknown as RequestRow | null;
    if (!request) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const attempt = Math.max(1, request.attempt_count);

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();
    const displayName =
      (profile as { display_name: string | null } | null)?.display_name ?? "Org leader";

    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: rowRaw } = await service
      .from("training_format_outcomes")
      .select("id, enhancements")
      .eq("training_request_id", request.id)
      .eq("attempt", attempt)
      .maybeSingle();
    const row = rowRaw as unknown as {
      id: string;
      enhancements: FormatOutcomeEnhancement[] | null;
    } | null;
    if (!row) {
      return NextResponse.json(
        { error: "Nothing to enhance yet — choose a format first." },
        { status: 409 }
      );
    }

    const enhancement: FormatOutcomeEnhancement = {
      note: note.slice(0, 500),
      added_by: user.id,
      added_by_name: displayName,
      added_at: new Date().toISOString(),
    };
    const enhancements = [...(row.enhancements || []), enhancement];

    const { error } = await service
      .from("training_format_outcomes")
      .update({ enhancements })
      .eq("id", row.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      enhancements,
      message:
        "Logged against this attempt — so when the result comes in, your change is part of the record, not an invisible variable.",
    });
  } catch (err) {
    console.error("Unexpected error in training-studio enhance route:", err);
    const message = err instanceof Error ? err.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
