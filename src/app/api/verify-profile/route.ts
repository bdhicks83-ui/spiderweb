// Phase 5 — Step 4: identity/credential verification (Tier 1+2, AI-driven).
// POST { linkedinUrl?, linkedinText? }.
//
// LinkedIn actively blocks server-side scraping, so PASTED profile text is the
// reliable comparison input; a URL-only submit triggers a best-effort fetch and
// falls back to asking for a paste. The AI compares the profile against the
// user's claimed identity (onboarding answers + approved insights) and returns
// a plausibility flag. Writes go through the service role because profiles are
// read-only for users (same lockdown as `plan` / `goal_track`).
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { verifyProfile } from "@/lib/claude";

// Roughly strip HTML to plain text for the best-effort URL fetch fallback.
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function bestEffortFetch(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        Accept: "text/html",
      },
    });
    if (!res.ok) return null;
    const text = htmlToText(await res.text());
    // LinkedIn's auth wall is short and full of "sign in / join" copy — reject it.
    if (text.length < 400) return null;
    if (/join linkedin|sign in to (?:see|view)|authwall/i.test(text) && text.length < 2000) {
      return null;
    }
    return text.slice(0, 12000);
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const linkedinUrl = (body?.linkedinUrl as string | undefined)?.trim() || null;
    const linkedinText = (body?.linkedinText as string | undefined)?.trim() || null;

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

    // Resolve the LinkedIn content: pasted text wins; else best-effort fetch.
    let linkedin = linkedinText;
    if (!linkedin && linkedinUrl) {
      linkedin = await bestEffortFetch(linkedinUrl);
    }

    // Nothing usable → record the URL (if any) and flag as not provided.
    if (!linkedin) {
      await service
        .from("profiles")
        .update({
          linkedin_url: linkedinUrl,
          verification_flag: "no_linkedin_provided",
          verification_checked_at: new Date().toISOString(),
        })
        .eq("id", user.id);
      return NextResponse.json({
        flag: "no_linkedin_provided",
        message: linkedinUrl
          ? "Couldn't read that LinkedIn URL automatically — paste your profile text to verify."
          : "Add your LinkedIn URL or paste your profile text to verify.",
      });
    }

    // Build the "claimed identity" context from onboarding answers + insights.
    const { data: onboardingSource } = await service
      .from("sources")
      .select("raw_text")
      .eq("user_id", user.id)
      .ilike("raw_text", "Onboarding interview%")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: approved } = await service
      .from("insights")
      .select("content")
      .eq("user_id", user.id)
      .eq("status", "approved")
      .limit(20);

    const claimedParts: string[] = [];
    if (onboardingSource?.raw_text) claimedParts.push(onboardingSource.raw_text);
    if (approved && approved.length) {
      claimedParts.push(
        "Captured expertise:\n" + approved.map((a) => `- ${a.content}`).join("\n")
      );
    }
    const claimed = claimedParts.join("\n\n").slice(0, 12000) || "(no claimed details on file)";

    const result = await verifyProfile(claimed, linkedin);
    if (!result) {
      return NextResponse.json(
        { error: "Verification couldn't complete — try again." },
        { status: 500 }
      );
    }

    const { error: updateError } = await service
      .from("profiles")
      .update({
        linkedin_url: linkedinUrl,
        linkedin_text: linkedin,
        verification_flag: result.flag,
        verification_notes: result.notes,
        verification_checked_at: new Date().toISOString(),
        claimed_title: result.extracted.title,
        claimed_industry: result.extracted.industry,
        claimed_seniority: result.extracted.seniority,
        claimed_years_experience: result.extracted.years_experience,
      })
      .eq("id", user.id);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ flag: result.flag, notes: result.notes });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
