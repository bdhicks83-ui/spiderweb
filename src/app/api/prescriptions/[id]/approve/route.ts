// P-4B Build 1 — the manager approval gate: one-click approve.
//
// POST, no body. Approve → status 'approved' + WHO approved + WHEN — the
// human-in-the-loop record the pilot's political safety depends on.
//
// ROLE MODEL (DECISION 2026-07-23, deliberately minimal): profiles.role is a
// 'manager' | 'member' label, not a permissions system. For the demo ANY org
// member may approve — what matters is that the approver + timestamp are
// recorded on the row. Membership is proven the P-4A way: the prescription
// is fetched through the SESSION client, so RLS ("org prescriptions read")
// decides whether it exists for this caller at all. The write then goes
// through the service role (prescriptions has no update policy on purpose).
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createSessionClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    const { data: rxRaw } = await supabase
      .from("prescriptions")
      .select("id, status")
      .eq("id", id)
      .maybeSingle();
    const rx = rxRaw as unknown as { id: string; status: string } | null;
    if (!rx) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // Approve from 'open', or from 'snoozed' (waking it early is fine —
    // snooze defers, it never blocks a manager who changed their mind).
    if (rx.status !== "open" && rx.status !== "snoozed") {
      return NextResponse.json(
        { error: `Cannot approve a prescription in status '${rx.status}'` },
        { status: 409 }
      );
    }

    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { error } = await service
      .from("prescriptions")
      .update({
        status: "approved",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      })
      .eq("id", rx.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message:
        "Approved — recorded who and when. Next: the authoring expert's fidelity check (capture-first prescriptions skip it).",
    });
  } catch (err) {
    console.error("Unexpected error in prescription approve route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
