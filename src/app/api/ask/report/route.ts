// Phase 5 — "Ask Your Spiderweb" multi-format output: Word report.
// POST { question, answer, sources } → downloadable .docx.
// POC scope: generated on demand, returned directly, nothing stored.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";

type Source = { id?: string; excerpt: string; similarity?: number };

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
    const { question, answer, sources } = await req.json();
    if (!question || typeof question !== "string" || !answer || typeof answer !== "string") {
      return NextResponse.json(
        { error: "Missing question or answer" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    const sourceList: Source[] = Array.isArray(sources)
      ? sources.filter((s: Source) => s && typeof s.excerpt === "string")
      : [];

    // Body: one Paragraph per paragraph of the answer.
    const answerParagraphs = answer
      .split(/\n+/)
      .map((p: string) => p.trim())
      .filter(Boolean)
      .map(
        (p: string) =>
          new Paragraph({
            children: [new TextRun({ text: p, size: 24 })], // 12pt
            spacing: { after: 200 },
          })
      );

    const appendix: Paragraph[] =
      sourceList.length > 0
        ? [
            new Paragraph({
              text: "Appendix — Source Insights",
              heading: HeadingLevel.HEADING_1,
              spacing: { before: 400, after: 200 },
            }),
            ...sourceList.map(
              (s, i) =>
                new Paragraph({
                  children: [
                    new TextRun({ text: `${i + 1}. `, bold: true, size: 22 }),
                    new TextRun({ text: s.excerpt, size: 22 }), // 11pt
                  ],
                  spacing: { after: 160 },
                })
            ),
          ]
        : [];

    const doc = new Document({
      creator: "Spiderweb",
      title: question,
      sections: [
        {
          children: [
            new Paragraph({
              text: question,
              heading: HeadingLevel.TITLE,
              spacing: { after: 120 },
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: "Answered from your Spiderweb — grounded only in your captured insights.",
                  italics: true,
                  size: 20, // 10pt
                  color: "888888",
                }),
              ],
              spacing: { after: 400 },
            }),
            ...answerParagraphs,
            ...appendix,
          ],
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="spiderweb-${slugify(question)}.docx"`,
      },
    });
  } catch (err) {
    console.error("Unexpected error in ask/report route:", err);
    return NextResponse.json(
      { error: "Report generation failed" },
      { status: 500 }
    );
  }
}
