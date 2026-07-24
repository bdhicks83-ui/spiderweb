// P-4B Build 1 — the manager approval gate: snooze.
//
// POST { days?: number } (default 7, 1..90). Snooze DEFERS, never deletes —
// flag-never-block family. The row keeps everything and gets a wake date;
// the queue list route lazily flips it back to 'open' once the wake date
// passes. Who snoozed and when is recorded, same as approval.
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const rawDays = typeof body?.days === "number" ? Math.round(body.days) : 7;
    const days = Math.max(1, Math.min(90, rawDays));

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
    // Snooze from 'open' (or re-snooze to move the wake date). Anything
    // already approved/delivered is past the gate — too late to defer.
    if (rx.status !== "open" && rx.status !== "snoozed") {
      return NextResponse.json(
        { error: `Cannot snooze a prescription in status '${rx.status}'` },
        { status: 409 }
      );
    }

    const wake = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { error } = await service
      .from("prescriptions")
      .update({
        status: "snoozed",
        snoozed_by: user.id,
        snoozed_at: new Date().toISOString(),
        snoozed_until: wake.toISOString(),
      })
      .eq("id", rx.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      snoozed_until: wake.toISOString(),
      message: `Snoozed for ${days} day${days === 1 ? "" : "s"} — it drops out of the queue and wakes on its own. Nothing is deleted.`,
    });
  } catch (err) {
    console.error("Unexpected error in prescription snooze route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
