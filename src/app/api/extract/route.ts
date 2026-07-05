import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const { sourceId } = await req.json();
  const supabase = await createClient();

  const { data: source } = await supabase
    .from("sources")
    .select("*")
    .eq("id", sourceId)
    .single();

  if (!source) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  let extractedText = source.raw_text || "";

  if (source.file_path) {
    const { data: fileData } = await supabase.storage
      .from("uploads")
      .download(source.file_path);

    if (fileData) {
      const buffer = Buffer.from(await fileData.arrayBuffer());
      const base64 = buffer.toString("base64");

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1024,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/png", data: base64 } },
              { type: "text", text: "Extract all text from this image, exactly as written." }
            ]
          }]
        })
      });

      const data = await response.json();
      extractedText = data.content?.[0]?.text || "";
    }
  }

  await supabase
    .from("sources")
    .update({ extracted_text: extractedText })
    .eq("id", sourceId);

  return NextResponse.json({ extractedText });
}