// P-1 Build 3 — persona picker backend.
// Same lockdown doctrine as /api/onboarding's goal_track write and Phase 4's
// `plan` column: users can't UPDATE their own profiles row directly (no
// update policy exists on purpose), so persona and display_name changes go
// through this service-role route instead. Used by both the onboarding
// persona step and the /settings page.
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { isPersona } from "@/lib/elicitation";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const persona = body?.persona;
    const displayName = body?.display_name;

    const update: Record<string, string> = {};
    if (persona !== undefined) {
      if (!isPersona(persona)) {
        return NextResponse.json({ error: "Invalid persona" }, { status: 400 });
      }
      update.persona = persona;
    }
    if (displayName !== undefined) {
      if (typeof displayName !== "string" || !displayName.trim()) {
        return NextResponse.json({ error: "Invalid display_name" }, { status: 400 });
      }
      update.display_name = displayName.trim().slice(0, 80);
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const supabase = await createSessionClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error } = await service
      .from("profiles")
      .update({ ...update, updated_at: new Date().toISOString() })
      .eq("id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
