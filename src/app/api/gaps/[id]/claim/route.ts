// P-9 — "I'll answer this." POST, no body.
//
// A SOFT claim, not an assignment. It exists so the queue can show that someone
// is already on it (and so the reconciler knows whose next completed framework
// closes this gap) — not to lock anyone out. There is no routing in v1 and a
// claim that goes nowhere is released automatically after CLAIM_STALE_HOURS.
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { claimGap } from "@/lib/knowledge-gaps";
import { requireCanCodify } from "@/lib/floor-guide";

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
    if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .maybeSingle();
    const orgId = (profile as { org_id: string | null } | null)?.org_id ?? null;
    if (!orgId) return NextResponse.json({ error: "Not in an org" }, { status: 409 });

    // ─── FLOOR GUIDE PHASE A ───
    // Claiming a gap means "I'll answer this," and answering it means codifying
    // a framework. A contributor who could claim would park a gap they are not
    // permitted to fill — the claim would sit there until CLAIM_STALE_HOURS
    // released it, which is worse than an honest refusal. Contributors CAN and
    // should still FLAG gaps; that is the half of the loop that is theirs.
    const codifyGate = await requireCanCodify(supabase);
    if (!codifyGate.ok) {
      return NextResponse.json(
        { error: codifyGate.error, code: codifyGate.code },
        { status: codifyGate.status }
      );
    }

    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const result = await claimGap(service, { gapId: id, orgId, userId: user.id });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({
      gap_id: result.gap.id,
      question: result.gap.question_text,
      status: result.gap.status,
    });
  } catch (err) {
    console.error("Unexpected error in gap claim route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
