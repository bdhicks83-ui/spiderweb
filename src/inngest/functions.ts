import { inngest } from "./client";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { generateSpeech } from "@/lib/elevenlabs";
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

export const extractInsights = inngest.createFunction(
  { id: "extract-insights" },
  { event: "source/extract-insights" },
  async ({ event, step }) => {
    const { source_id } = event.data;

    const source = await step.run("fetch-source", async () => {
      const { data, error } = await supabase
        .from("sources")
        .select("id, user_id, raw_text, extracted_text")
        .eq("id", source_id)
        .single();

      if (error || !data) throw new Error("Source not found");
      return data;
    });

    const textToProcess = source.extracted_text || source.raw_text;
    if (!textToProcess) throw new Error("No text found on this source");

    const insightTexts = await step.run("extract-with-claude", async () => {
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: `Break the following text into discrete, standalone insights. Each insight should be one clear idea, framework, or takeaway that could stand on its own — not a full paragraph summary.

Return ONLY a JSON array of strings, nothing else. No markdown, no preamble, no code fences.

Text:
"""
${textToProcess}
"""`,
          },
        ],
      });

      const responseText = message.content
        .filter((block) => block.type === "text")
        .map((block) => ("text" in block ? block.text : ""))
        .join("");

      const cleaned = responseText.replace(/```json|```/g, "").trim();
      return JSON.parse(cleaned) as string[];
    });

    await step.run("save-insights", async () => {
      const rows = insightTexts.map((content) => ({
        user_id: source.user_id,
        source_id: source.id,
        content,
        status: "pending",
      }));

      const { error } = await supabase.from("insights").insert(rows);
      if (error) throw new Error(error.message);
    });

    return { success: true, count: insightTexts.length };
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
