import { inngest } from "./client";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { generateSpeech } from "@/lib/elevenlabs";
import { getPageCount, extractPageRangeBase64, PAGES_PER_CHUNK } from "@/lib/pdf";
import { evaluateUploadRisk } from "@/lib/risk";
import path from "path";
import os from "os";
import fs from "fs/promises";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// Split extracted text into segments so a very long document doesn't blow the
// insight call's output budget. ~12k chars ≈ a few thousand tokens per call.
const CHARS_PER_INSIGHT_CHUNK = 12000;

function isPdfSource(kind: string | null, filePath: string | null): boolean {
  return kind === "pdf" || (!!filePath && filePath.toLowerCase().endsWith(".pdf"));
}

function firstText(content: { type: string; text?: string }[]): string {
  return content
    .filter((b) => b.type === "text")
    .map((b) => ("text" in b ? b.text ?? "" : ""))
    .join("\n")
    .trim();
}

const PDF_TRANSCRIBE_PROMPT =
  "Transcribe all text from this PDF exactly as written. The document may have " +
  "multiple pages — transcribe every page in order. Output only the transcribed " +
  "text, no commentary.";

async function transcribePdfBase64(base64: string): Promise<string> {
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 8000,
    messages: [
      {
        role: "user",
        // The SDK's typed content union doesn't include the document block in
        // this version; cast just this payload.
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
          { type: "text", text: PDF_TRANSCRIBE_PROMPT },
        ] as unknown as Anthropic.MessageParam["content"],
      },
    ],
  });
  return firstText(msg.content as { type: string; text?: string }[]);
}

function splitText(text: string, size: number): string[] {
  if (text.length <= size) return [text];
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks;
}

// Extract insights from one text segment. Resilient: returns [] on any model
// or parse failure so one bad segment never kills the whole document.
async function insightsFromText(text: string): Promise<string[]> {
  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 8000,
      messages: [
        {
          role: "user",
          content: `Break the following text into discrete, standalone insights. Each insight should be one clear idea, framework, or takeaway that could stand on its own — not a full paragraph summary.

Return ONLY a JSON array of strings, nothing else. No markdown, no preamble, no code fences.

Text:
"""
${text}
"""`,
        },
      ],
    });
    const responseText = firstText(message.content as { type: string; text?: string }[]);
    const cleaned = responseText.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

async function downloadSourceFile(filePath: string): Promise<Buffer> {
  const { data, error } = await supabase.storage.from("uploads").download(filePath);
  if (error || !data) throw new Error(`Download failed: ${error?.message ?? "no data"}`);
  return Buffer.from(await data.arrayBuffer());
}

export const extractInsights = inngest.createFunction(
  { id: "extract-insights", retries: 3 },
  { event: "source/extract-insights" },
  async ({ event, step }) => {
    const { source_id } = event.data;

    const source = await step.run("fetch-source", async () => {
      const { data, error } = await supabase
        .from("sources")
        .select("id, user_id, kind, file_path, raw_text, extracted_text, origin")
        .eq("id", source_id)
        .single();
      if (error || !data) throw new Error("Source not found");
      return data;
    });

    // ── Phase 1: ensure we have extracted text ──
    // Images already have extracted_text (from /api/extract). PDFs are
    // extracted HERE, chunked per page-range so each Claude call is small and
    // each chunk is its own retryable step. Partial-tolerant: a failed chunk
    // leaves a marker but doesn't sink the rest.
    let extractedText = source.extracted_text as string | null;

    if (!extractedText && isPdfSource(source.kind, source.file_path) && source.file_path) {
      const filePath = source.file_path as string;

      const pageCount = await step.run("pdf-page-count", async () => {
        const buffer = await downloadSourceFile(filePath);
        return getPageCount(buffer);
      });

      const parts: string[] = [];
      for (let start = 0; start < pageCount; start += PAGES_PER_CHUNK) {
        const end = Math.min(start + PAGES_PER_CHUNK, pageCount);
        const chunkText = await step.run(`pdf-pages-${start + 1}-${end}`, async () => {
          try {
            const buffer = await downloadSourceFile(filePath);
            const base64 = await extractPageRangeBase64(buffer, start, end);
            const text = await transcribePdfBase64(base64);
            return `--- Pages ${start + 1}-${end} ---\n${text}`;
          } catch (err) {
            const message = err instanceof Error ? err.message : "unknown";
            return `--- Pages ${start + 1}-${end}: extraction failed (${message}) ---`;
          }
        });
        parts.push(chunkText);
      }

      extractedText = parts.join("\n\n");

      await step.run("save-extracted-text", async () => {
        const { error } = await supabase
          .from("sources")
          .update({ extracted_text: extractedText })
          .eq("id", source.id);
        if (error) throw new Error(error.message);
      });
    }

    const textToProcess = extractedText || (source.raw_text as string | null);
    if (!textToProcess || !textToProcess.trim()) {
      throw new Error("No text found on this source");
    }

    // Cache the upload's size for the huge-upload risk baseline (Phase 7), so
    // that query never has to pull full document text.
    const contentLength = textToProcess.length;
    await step.run("save-content-length", async () => {
      await supabase
        .from("sources")
        .update({ content_length: contentLength })
        .eq("id", source.id);
    });

    // ── Phase 2: extract insights, one segment at a time ──
    const segments = splitText(textToProcess, CHARS_PER_INSIGHT_CHUNK);
    const allInsights: string[] = [];
    for (let i = 0; i < segments.length; i++) {
      const segInsights = await step.run(`insights-segment-${i}`, async () =>
        insightsFromText(segments[i])
      );
      allInsights.push(...segInsights);
    }

    if (allInsights.length === 0) {
      throw new Error("Extraction produced no insights");
    }

    await step.run("save-insights", async () => {
      const rows = allInsights.map((content) => ({
        user_id: source.user_id,
        source_id: source.id,
        content,
        status: "pending",
      }));
      const { error } = await supabase.from("insights").insert(rows);
      if (error) throw new Error(error.message);
    });

    // ── Phase 7: per-upload risk signals ──
    // Only "own" (self_reported) uploads are scored against the user's own
    // history/voice/background. Fully fail-open — evaluateUploadRisk never
    // throws, so a flaky signal can't sink a successful extraction.
    let risk: { fired: string[] } = { fired: [] };
    if (source.origin === "self_reported") {
      risk = await step.run("evaluate-upload-risk", async () =>
        evaluateUploadRisk(
          supabase,
          source.user_id,
          source.id,
          textToProcess,
          contentLength
        )
      );
    }

    return {
      success: true,
      count: allInsights.length,
      segments: segments.length,
      riskSignals: risk.fired,
    };
  }
);

// ─── Video rendering: script → ElevenLabs audio → Remotion render → Storage ───
//
// NOTE: the render step needs a real Chromium environment. It works on any
// long-running Node host (local machine, Railway, a render worker). Vercel's
// serverless functions can't run Remotion's headless browser — see
// scripts/render-test.mjs for the local path, and @remotion/lambda as the
// scale-up path when we outgrow local rendering.

export const renderVideo = inngest.createFunction(
  { id: "render-video", retries: 2 },
  { event: "video/render-video" },
  async ({ event, step }) => {
    const { insight_id } = event.data;

    // Step 1 — fetch the approved script text.
    const insight = await step.run("fetch-insight", async () => {
      const { data, error } = await supabase
        .from("insights")
        .select("id, user_id, content, status")
        .eq("id", insight_id)
        .single();

      if (error || !data) throw new Error("Insight not found");
      if (data.status !== "approved")
        throw new Error("Insight is not approved");
      if (!data.content) throw new Error("Insight has no content");
      return data;
    });

    // Step 2 — generate narration audio, upload to Storage, return a signed URL.
    // (Step outputs must be JSON-serializable, so the buffer never crosses steps.)
    const audio = await step.run("generate-audio", async () => {
      const mp3 = await generateSpeech(insight.content);
      const audioPath = `${insight.user_id}/${insight.id}/audio.mp3`;

      const { error: uploadError } = await supabase.storage
        .from("videos")
        .upload(audioPath, mp3, {
          contentType: "audio/mpeg",
          upsert: true,
        });
      if (uploadError) throw new Error(uploadError.message);

      const { data: signed, error: signError } = await supabase.storage
        .from("videos")
        .createSignedUrl(audioPath, 60 * 60);
      if (signError || !signed) throw new Error("Could not sign audio URL");

      return { path: audioPath, signedUrl: signed.signedUrl };
    });

    // Step 3 — render the Remotion composition and upload it.
    // (Render + upload stay in ONE step: each step.run is a separate
    // invocation, so a /tmp file from one step may not exist in the next.)
    const rendered = await step.run("render-video", async () => {
      // Dynamic imports keep the heavy Remotion tooling out of the
      // serverless bundle for every other function in this file.
      const { bundle } = await import("@remotion/bundler");
      const { renderMedia, selectComposition } = await import(
        "@remotion/renderer"
      );

      const entry = path.join(process.cwd(), "src/remotion/index.ts");
      const bundleLocation = await bundle({ entryPoint: entry });

      const inputProps = {
        audioUrl: audio.signedUrl,
        scriptText: insight.content,
        audioDurationSeconds: 0, // overwritten by calculateMetadata
      };

      const composition = await selectComposition({
        serveUrl: bundleLocation,
        id: "InsightVideo",
        inputProps,
      });

      const outPath = path.join(os.tmpdir(), `insight-${insight.id}.mp4`);
      await renderMedia({
        composition,
        serveUrl: bundleLocation,
        codec: "h264",
        outputLocation: outPath,
        inputProps,
      });

      const file = await fs.readFile(outPath);
      const videoPath = `${insight.user_id}/${insight.id}/video.mp4`;

      const { error: uploadError } = await supabase.storage
        .from("videos")
        .upload(videoPath, file, {
          contentType: "video/mp4",
          upsert: true,
        });
      if (uploadError) throw new Error(uploadError.message);

      await fs.unlink(outPath).catch(() => {});
      return { videoPath };
    });

    // Step 4 — stamp the insight row with the finished video's location.
    await step.run("save-video-record", async () => {
      const { error } = await supabase
        .from("insights")
        .update({ video_path: rendered.videoPath })
        .eq("id", insight.id);
      if (error) throw new Error(error.message);
    });

    return { success: true, videoPath: rendered.videoPath };
  }
);

export const functions = [extractInsights, renderVideo];
