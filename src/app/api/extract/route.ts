// Extract text from an uploaded source file.
//   • images  → Claude vision (OCR), same as before
//   • PDFs    → Claude native document support; Claude reads every page, and
//               we ask it to transcribe page-by-page with "--- Page N ---"
//               markers, concatenated into one extracted_text (Step 1 spec).
//
// Session-aware client: RLS scopes the source to the logged-in user, so a
// user can only ever extract their own uploads.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Images are quick, but give large scans headroom. PDFs no longer come through
// here on the upload path — they're extracted in the Inngest pipeline.
export const maxDuration = 300;

// Claude may emit a thinking block before the text; collect ALL text blocks.
function collectText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (b): b is { type: string; text: string } =>
        !!b && typeof b === "object" && (b as { type?: unknown }).type === "text" &&
        typeof (b as { text?: unknown }).text === "string"
    )
    .map((b) => b.text)
    .join("\n")
    .trim();
}

function imageMediaType(path: string): "image/png" | "image/jpeg" | "image/webp" | "image/gif" {
  const p = path.toLowerCase();
  if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
  if (p.endsWith(".webp")) return "image/webp";
  if (p.endsWith(".gif")) return "image/gif";
  return "image/png";
}

const PDF_PROMPT =
  "Transcribe all text from this PDF exactly as written. The document may have " +
  "multiple pages — transcribe every page in order, and start each page with a " +
  "line reading '--- Page N ---' (N is the page number). Output only the " +
  "transcribed text, no commentary.";

const IMAGE_PROMPT = "Extract all text from this image, exactly as written.";

export async function POST(req: NextRequest) {
  const { sourceId } = await req.json();
  const supabase = await createClient();

  const { data: source } = await supabase
    .from("sources")
    .select("id, kind, file_path, raw_text")
    .eq("id", sourceId)
    .single();

  if (!source) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  let extractedText = source.raw_text || "";

  if (source.file_path) {
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("uploads")
      .download(source.file_path);

    if (downloadError || !fileData) {
      return NextResponse.json(
        { error: `Could not download upload: ${downloadError?.message ?? "unknown"}` },
        { status: 500 }
      );
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());
    const base64 = buffer.toString("base64");

    const isPdf =
      source.kind === "pdf" || source.file_path.toLowerCase().endsWith(".pdf");

    const fileBlock = isPdf
      ? {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: base64 },
        }
      : {
          type: "image",
          source: {
            type: "base64",
            media_type: imageMediaType(source.file_path),
            data: base64,
          },
        };

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: isPdf ? 8192 : 2048,
        messages: [
          {
            role: "user",
            content: [fileBlock, { type: "text", text: isPdf ? PDF_PROMPT : IMAGE_PROMPT }],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json(
        { error: `Extraction failed: ${errText}` },
        { status: 500 }
      );
    }

    const data = await response.json();
    const text = collectText(data.content);
    if (!text) {
      return NextResponse.json(
        { error: "Extraction returned no text" },
        { status: 500 }
      );
    }
    extractedText = text;
  }

  await supabase
    .from("sources")
    .update({ extracted_text: extractedText })
    .eq("id", sourceId);

  return NextResponse.json({ extractedText });
}
