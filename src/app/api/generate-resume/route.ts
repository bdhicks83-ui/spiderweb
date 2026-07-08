// Resume builder — lead magnet, Free tier included (no plan-tier gate).
// POST (auth required) -> pulls the caller's approved insights, synthesizes
// resume sections via Claude, renders a branded PDF with @react-pdf/renderer,
// returns it as a download. Nothing is stored — generated fresh each time.
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { renderToBuffer } from "@react-pdf/renderer";
import { synthesizeResume } from "@/lib/claude";
import { ResumeDocument, type ResumeData } from "@/lib/resume-pdf";

// Cap how many approved insights feed one synthesis call — plenty of
// coverage for a one-page resume while keeping the prompt bounded.
const MAX_INSIGHTS = 100;

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "resume"
  );
}

function titleCaseFromEmail(email: string): string {
  const local = email.split("@")[0] || "Your Name";
  return local
    .replace(/[._-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const nameOverride =
      typeof body?.name === "string" && body.name.trim() ? body.name.trim() : null;
    const titleOverride =
      typeof body?.title === "string" && body.title.trim() ? body.title.trim() : null;

    // Session-aware client — confirms who's logged in.
    const supabase = await createSessionClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    // Service-role client for the backend read/synthesis work — same pattern
    // as verify-profile: bypasses RLS but every query below is scoped to
    // this user's own id.
    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: insights, error: insightsError } = await service
      .from("insights")
      .select("content")
      .eq("user_id", user.id)
      .eq("status", "approved")
      .order("created_at", { ascending: true })
      .limit(MAX_INSIGHTS);

    if (insightsError) {
      return NextResponse.json({ error: insightsError.message }, { status: 500 });
    }

    const insightContents = (insights || [])
      .map((i) => (i as { content: string }).content)
      .filter(Boolean);

    if (insightContents.length === 0) {
      return NextResponse.json(
        {
          error:
            "No approved insights yet — approve at least one insight before generating a resume.",
        },
        { status: 400 }
      );
    }

    const { data: profile } = await service
      .from("profiles")
      .select("claimed_title, claimed_industry, claimed_seniority, claimed_years_experience")
      .eq("id", user.id)
      .maybeSingle();

    const synthesis = await synthesizeResume(insightContents);
    if (!synthesis) {
      return NextResponse.json(
        { error: "Resume synthesis failed — try again." },
        { status: 500 }
      );
    }

    const name = nameOverride || titleCaseFromEmail(user.email || "");
    const title = titleOverride || profile?.claimed_title || null;
    const subtitleParts = [
      profile?.claimed_industry || null,
      profile?.claimed_seniority || null,
      profile?.claimed_years_experience
        ? `${profile.claimed_years_experience}+ yrs experience`
        : null,
    ].filter(Boolean);
    const subtitle = subtitleParts.length > 0 ? subtitleParts.join("  ·  ") : null;

    const resumeData: ResumeData = {
      name,
      title,
      subtitle,
      email: user.email || "",
      summary: synthesis.summary,
      keyExperience: synthesis.keyExperience,
      frameworks: synthesis.frameworks,
      strengths: synthesis.strengths,
    };

    const buffer = await renderToBuffer(ResumeDocument({ data: resumeData }));

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${slugify(name)}-resume.pdf"`,
      },
    });
  } catch (err) {
    console.error("Unexpected error in generate-resume route:", err);
    return NextResponse.json(
      { error: "Resume generation failed" },
      { status: 500 }
    );
  }
}
