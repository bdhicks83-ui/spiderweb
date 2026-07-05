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

    const textToProcess = source.extracted_text