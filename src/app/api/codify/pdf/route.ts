// P0 — Elicitation Engine: export a completed Pattern Record's framework as
// a branded PDF. POST { recordId } → application/pdf download. Same
// @react-pdf/renderer path as the resume builder. Nothing extra is stored —
// the PDF renders fresh from the saved record + framework each time.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { FrameworkDocument, type FrameworkPdfData } from "@/lib/framework-pdf";
import { isFrameworkArtifact } from "@/lib/elicitation";

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "framework"
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
    const recordId = body?.recordId;
    if (!recordId || typeof recordId !== "string") {
      return NextResponse.json({ error: "Missing recordId" }, { status: 400 });
    }
    const nameOverride =
      typeof body?.name === "string" && body.name.trim() ? body.name.trim() : null;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    // RLS scopes the read to the owner.
    const { data: record, error: loadError } = await supabase
      .from("pattern_records")
      .select(
        "id, status, framework, context_org_size, context_industry, context_function"
      )
      .eq("id", recordId)
      .single();

    if (loadError || !record) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }
    if (record.status !== "complete" || !isFrameworkArtifact(record.framework)) {
      return NextResponse.json(
        { error: "This record doesn't have a framework yet" },
        { status: 409 }
      );
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("claimed_title")
      .eq("id", user.id)
      .maybeSingle();

    const contextParts = [
      record.context_industry,
      record.context_function,
      record.context_org_size ? `${record.context_org_size} people` : null,
    ].filter(Boolean) as string[];

    const data: FrameworkPdfData = {
      consultantName: nameOverride || titleCaseFromEmail(user.email || ""),
      consultantTitle: profile?.claimed_title || null,
      framework: record.framework,
      contextLine: contextParts.length > 0 ? contextParts.join(" · ") : null,
    };

    const buffer = await renderToBuffer(FrameworkDocument({ data }));

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${slugify(
          record.framework.name
        )}-framework.pdf"`,
      },
    });
  } catch (err) {
    console.error("Unexpected error in codify/pdf route:", err);
    return NextResponse.json({ error: "PDF generation failed" }, { status: 500 });
  }
}
