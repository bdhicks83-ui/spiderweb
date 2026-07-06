// Phase 6 Slice 1 — saves the onboarding goal + answers.
//
// 1. Auth via the session-aware server client (user-facing request).
// 2. Service role writes profiles.goal_track (users can't update their own
//    profile row — same lockdown that protects `plan`).
// 3. Answers become a normal `sources` row (raw_text), then flow through the
//    existing source/extract-insights Inngest pipeline. No new ingestion path.
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { inngest } from "@/inngest/client";

const VALID_TRACKS = ["content", "career", "licensing", "recruiter"] as const;
type Track = (typeof VALID_TRACKS)[number];

const TRACK_LABELS: Record<Track, string> = {
  content: "Turn my knowledge into content (YouTube/blog/social)",
  career: "Build my professional reputation & career story",
  licensing: "License my expertise to organizations",
  recruiter: "Get visibility for my next role (recruiters)",
};

type Answer = { question: string; answer: string };

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const goalTrack = body?.goal_track as Track | undefined;
    const answers = body?.answers as Answer[] | undefined;

    if (!goalTrack || !VALID_TRACKS.includes(goalTrack)) {
      return NextResponse.json({ error: "Invalid goal_track" }, { status: 400 });
    }
    if (
      !Array.isArray(answers) ||
      answers.length === 0 ||
      answers.some(
        (a) =>
          typeof a?.question !== "string" ||
          typeof a?.answer !== "string" ||
          !a.answer.trim()
      )
    ) {
      return NextResponse.json({ error: "Invalid answers" }, { status: 400 });
    }

    // Who is asking? (session cookie)
    const supabase = await createSessionClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    // Backend writes use the service role (RLS bypass, matches Inngest jobs).
    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Stamp the goal on the profile.
    const { error: profileError } = await service
      .from("profiles")
      .update({ goal_track: goalTrack, updated_at: new Date().toISOString() })
      .eq("id", user.id);
    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    // 2. Answers become the user's first source (plain text Q&A).
    const rawText = [
      `Onboarding interview — goal: ${TRACK_LABELS[goalTrack]}`,
      "",
      ...answers.map((a) => `Q: ${a.question}\nA: ${a.answer.trim()}`),
    ].join("\n\n");

    const { data: source, error: sourceError } = await service
      .from("sources")
      .insert({ user_id: user.id, raw_text: rawText })
      .select()
      .single();
    if (sourceError || !source) {
      return NextResponse.json(
        { error: sourceError?.message ?? "Could not save answers" },
        { status: 500 }
      );
    }

    // 3. Kick off the existing insight-extraction pipeline.
    await inngest.send({
      name: "source/extract-insights",
      data: { source_id: source.id },
    });

    return NextResponse.json({ success: true, source_id: source.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
