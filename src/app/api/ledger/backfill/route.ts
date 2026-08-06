// THE VALUE LEDGER — POST /api/ledger/backfill
//
// Kicks off the one-shot backfill for the caller's own org. Org admin only:
// this is the button that writes history, and history on an append-only table
// is not something a manager should be able to lay down by accident.
//
// Body: { with_scoring?: boolean }
//   false (default) — the five cheap event types, laid down in seconds.
//   true            — also runs the valuation scorer over every captured
//                     framework. One model call per record; run it deliberately.
//
// The job itself is idempotent (every backfilled row carries a dedupe_key), so
// pressing this twice is safe and does not double history.
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { inngest } from "@/inngest/client";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await createSessionClient();
    const {
      data: { user },
    } = await session.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

    const { data: profile } = await session
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .maybeSingle();
    const orgId = (profile as { org_id: string | null } | null)?.org_id ?? null;
    if (!orgId) {
      return NextResponse.json({ error: "You're not part of an organization yet." }, { status: 409 });
    }

    // SECURITY DEFINER, evaluated by Postgres as the caller — the same gate
    // every other admin-only write in the product uses.
    const { data: isAdmin } = await session.rpc("is_org_admin");
    if (isAdmin !== true) {
      return NextResponse.json(
        { error: "Backfilling the ledger is an account-admin action." },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const withScoring = body?.with_scoring === true;

    await inngest.send({
      name: "ledger/backfill",
      data: { org_id: orgId, with_scoring: withScoring },
    });

    return NextResponse.json({ ok: true, org_id: orgId, with_scoring: withScoring });
  } catch (err) {
    console.error("Unexpected error in ledger backfill route:", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
