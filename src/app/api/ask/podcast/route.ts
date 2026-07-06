// Phase 5 — "Ask Your Spiderweb" multi-format output: podcast audio.
// POST { question, answer } → downloadable .mp3 via the existing
// ElevenLabs wrapper (src/lib/elevenlabs.ts).
// POC scope: generated on demand, returned directly, nothing stored.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateSpeech } from "@/lib/elevenlabs";

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "answer"
  );
}

export async function POST(req: NextRequest) {
  try {
    const { question, answer } = await req.json();
    if (!answer || typeof answer !== "string" || !answer.trim()) {
      return NextResponse.json({ error: "Missing answer" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    const audio = await generateSpeech(answer.trim());

    const name =
      typeof question === "string" && question.trim()
        ? slugify(question)
        : "answer";

    return new NextResponse(new Uint8Array(audio), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": `attachment; filename="spiderweb-${name}.mp3"`,
      },
    });
  } catch (err) {
    console.error("Unexpected error in ask/podcast route:", err);
    return NextResponse.json(
      { error: "Podcast generation failed" },
      { status: 500 }
    );
  }
}
