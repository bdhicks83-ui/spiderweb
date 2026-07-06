// Claude API wrapper — Week 2 (OCR), Week 3 (insight extraction), Phase 3 (framework drafting),
// Phase 5 (Ask Your Spiderweb).
// Doctrine: prompts load from /prompts, never inline.
import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "fs/promises";
import path from "path";

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY from env

// Claude can return a "thinking" block before the actual "text" block.
// Always find the first text block instead of assuming content[0] is it.
function firstText(content: { type: string; text?: string }[]): string {
  const block = content.find((b) => b.type === "text");
  return block?.text ?? "";
}

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

// Week 2: image -> text (OCR/transcription)
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
  return firstText(msg.content as { type: string; text?: string }[]);
}

// Phase 3: cluster of insights -> drafted framework (name + description + write-up)
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
  const text = firstText(msg.content as { type: string; text?: string }[]);
  if (!text) return null;
  try {
    const parsed = JSON.parse(text.replace(/^```json?\n?|```$/g, "").trim());
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

// Week 3: raw text -> discrete insights
export async function extractInsights(rawText: string): Promise<string[]> {
  const prompt = await loadPrompt("extract-insights", { raw_text: rawText });
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });
  const text = firstText(msg.content as { type: string; text?: string }[]);
  if (!text) return [];
  try {
    const parsed = JSON.parse(text.replace(/^```json?\n?|```$/g, "").trim());
    return Array.isArray(parsed.insights) ? parsed.insights : [];
  } catch {
    return [];
  }
}

// Phase 6: consultative ask — shared shapes + formatting helpers.
export type QAPair = { question: string; answer: string };

function formatInsights(insightContents: string[]): string {
  return insightContents.map((c, i) => `[${i + 1}] ${c}`).join("\n\n");
}

function formatQAPairs(qaPairs: QAPair[]): string {
  if (qaPairs.length === 0) return "(none yet)";
  return qaPairs
    .map((p, i) => `${i + 1}. Q: ${p.question}\n   A: ${p.answer}`)
    .join("\n");
}

// Strip a ```json fence if the model wrapped its output in one.
function parseJson(text: string): unknown | null {
  try {
    return JSON.parse(text.replace(/^```json?\n?|```$/g, "").trim());
  } catch {
    return null;
  }
}

// Phase 6: decide whether a follow-up question is genuinely needed before
// recommending. Model-driven — no fixed script. Returns null on any failure
// so callers can fall back to synthesizing immediately.
export type FollowUpDecision = { done: boolean; question: string | null };

export async function nextFollowUp(
  question: string,
  insightContents: string[],
  qaPairs: QAPair[],
  maxRemaining: number
): Promise<FollowUpDecision | null> {
  const prompt = await loadPrompt("ask-followup", {
    insights: formatInsights(insightContents),
    question,
    qa_pairs: formatQAPairs(qaPairs),
    max_remaining: String(maxRemaining),
  });
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });
  const text = firstText(msg.content as { type: string; text?: string }[]);
  if (!text) return null;
  const parsed = parseJson(text) as {
    done?: unknown;
    question?: unknown;
  } | null;
  if (!parsed || typeof parsed.done !== "boolean") return null;
  if (parsed.done) return { done: true, question: null };
  if (typeof parsed.question !== "string" || !parsed.question.trim())
    return null;
  return { done: false, question: parsed.question.trim() };
}

// Phase 6: final synthesis — recommendation + pros/cons grounded ONLY in the
// matched insights (same "no outside knowledge" rule as answerFromInsights).
export type Recommendation = {
  recommendation: string;
  pros: string[];
  cons: string[];
  gaps: string | null;
};

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

export async function recommendFromInsights(
  question: string,
  insightContents: string[],
  qaPairs: QAPair[]
): Promise<Recommendation | null> {
  const prompt = await loadPrompt("ask-recommend", {
    insights: formatInsights(insightContents),
    question,
    qa_pairs: formatQAPairs(qaPairs),
  });
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });
  const text = firstText(msg.content as { type: string; text?: string }[]);
  if (!text) return null;
  const parsed = parseJson(text) as {
    recommendation?: unknown;
    pros?: unknown;
    cons?: unknown;
    gaps?: unknown;
  } | null;
  if (
    !parsed ||
    typeof parsed.recommendation !== "string" ||
    !isStringArray(parsed.pros) ||
    !isStringArray(parsed.cons)
  ) {
    return null;
  }
  return {
    recommendation: parsed.recommendation,
    pros: parsed.pros,
    cons: parsed.cons,
    gaps: typeof parsed.gaps === "string" && parsed.gaps.trim() ? parsed.gaps : null,
  };
}

// Phase 5: question + matched insight excerpts -> grounded answer in the
// expert's own voice. The system prompt forbids outside knowledge.
export async function answerFromInsights(
  question: string,
  insightContents: string[]
): Promise<string> {
  const system = await loadPrompt("ask-spiderweb", {
    insights: insightContents.map((c, i) => `[${i + 1}] ${c}`).join("\n\n"),
  });
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    system,
    messages: [{ role: "user", content: question }],
  });
  return firstText(msg.content as { type: string; text?: string }[]);
}
