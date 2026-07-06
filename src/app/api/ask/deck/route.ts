// Phase 5 — "Ask Your Spiderweb" multi-format output: slide deck.
// POST { question, answer } → downloadable .pptx via pptxgenjs.
// Title slide → 2-4 content slides (answer split into digestible points)
// → closing slide. POC scope: on-demand, returned directly, nothing stored.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import PptxGenJS from "pptxgenjs";

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "answer"
  );
}

// Break the answer into 2-4 groups of sentences — one group per slide.
function splitIntoSlides(answer: string): string[][] {
  const sentences = answer
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (sentences.length === 0) return [];

  // 2-4 slides: aim for ~3 sentences per slide, clamp slide count.
  const slideCount = Math.min(4, Math.max(2, Math.ceil(sentences.length / 3)));
  const perSlide = Math.ceil(sentences.length / slideCount);

  const groups: string[][] = [];
  for (let i = 0; i < sentences.length; i += perSlide) {
    groups.push(sentences.slice(i, i + perSlide));
  }
  return groups;
}

export async function POST(req: NextRequest) {
  try {
    const { question, answer } = await req.json();
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

    const pres = new PptxGenJS();
    pres.layout = "LAYOUT_16x9";

    // Title slide — the question.
    const title = pres.addSlide();
    title.background = { color: "111111" };
    title.addText(question.trim(), {
      x: 0.6,
      y: 1.6,
      w: 8.8,
      h: 1.8,
      fontSize: 32,
      bold: true,
      color: "FFFFFF",
      align: "left",
      valign: "middle",
    });
    title.addText("Answered from my Spiderweb", {
      x: 0.6,
      y: 3.6,
      w: 8.8,
      h: 0.5,
      fontSize: 14,
      italic: true,
      color: "AAAAAA",
    });

    // Content slides — answer broken into digestible points.
    const groups = splitIntoSlides(answer);
    groups.forEach((group, i) => {
      const slide = pres.addSlide();
      slide.addText(`Point ${i + 1} of ${groups.length}`, {
        x: 0.6,
        y: 0.4,
        w: 8.8,
        h: 0.5,
        fontSize: 14,
        bold: true,
        color: "888888",
      });
      slide.addText(
        group.map((sentence) => ({
          text: sentence,
          options: { bullet: true, breakLine: true },
        })),
        {
          x: 0.6,
          y: 1.1,
          w: 8.8,
          h: 3.8,
          fontSize: 18,
          color: "222222",
          valign: "top",
          paraSpaceAfter: 12,
        }
      );
    });

    // Closing slide.
    const closing = pres.addSlide();
    closing.background = { color: "111111" };
    closing.addText("Grounded in my own captured expertise.", {
      x: 0.6,
      y: 2.2,
      w: 8.8,
      h: 1.0,
      fontSize: 24,
      bold: true,
      color: "FFFFFF",
      align: "center",
      valign: "middle",
    });

    const buffer = (await pres.write({ outputType: "nodebuffer" })) as Buffer;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="spiderweb-${slugify(question)}.pptx"`,
      },
    });
  } catch (err) {
    console.error("Unexpected error in ask/deck route:", err);
    return NextResponse.json(
      { error: "Deck generation failed" },
      { status: 500 }
    );
  }
}
