// Claude API wrapper — Week 2 (OCR), Week 3 (insight extraction), Phase 3 (framework drafting).
// Doctrine: prompts load from /prompts, never inline.
import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "fs/promises";
import path from "path";

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY from env

export async function loadPrompt(
  name: string,
  vars: Record<string, string> = {}
): Promise<string> {
  const raw = await readFile(
    path.join(process.cwd(), "prompts", `${name}.md`),
    "utf-8"
  );
  return Object.entries(vars).reduce(
    (p, [k, v]) => p.replaceAll(`{{${k}}}`, v),
    raw
  );
}

// Week 2: image → text (OCR/transcription)
export async function extractText(
  imageBase64: string,
  mediaType: "image/png" | "image/jpeg"
): Promise<string> {
  const system = await loadPrompt("extract-text");
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 4096,
    system,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: imageBase64 },
          },
        ],
      },
    ],
  });
  const block = msg.content[0];
  return block.type === "text" ? block.text : "";
}

// Phase 3: cluster of insights → drafted framework (name + description + write-up)
export type FrameworkDraft = {
  name: string;
  description: string;
  writeup: string;
};

export async function draftFramework(
  insightContents: string[]
): Promise<FrameworkDraft | null> {
  const prompt = await loadPrompt("draft-framework", {
    insights: insightContents.map((c, i) => `${i + 1}. ${c}`).join("\n"),
  });
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });
  const block = msg.content[0];
  if (block.type !== "text") return null;
  try {
    const parsed = JSON.parse(block.text.replace(/^```json?\n?|```$/g, "").trim());
    if (
      typeof parsed.name === "string" &&
      typeof parsed.description === "string" &&
      typeof parsed.writeup === "string"
    ) {
      return parsed as FrameworkDraft;
    }
    return null;
  } catch {
    return null;
  }
}

// Week 3: raw text → discrete insights
export async function extractInsights(rawText: string): Promise<string[]> {
  const prompt = await loadPrompt("extract-insights", { raw_text: rawText });
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });
  const block = msg.content[0];
  if (block.type !== "text") return [];
  try {
    const parsed = JSON.parse(block.text.replace(/^```json?\n?|```$/g, "").trim());
    return Array.isArray(parsed.insights) ? parsed.insights : [];
  } catch {
    return [];
  }
}
