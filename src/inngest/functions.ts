import { inngest } from "./client";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

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

export const functions = [extractInsights];