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

// Phase 5 (Step 3): consistency / integrity check. Given a NEW insight and a
// set of the user's existing approved insights on similar topics, decide
// whether the new one DIRECTLY contradicts an established pattern. Returns
// null on any model/parse failure so callers can fail open (approve normally).
export type ConsistencyResult = {
  contradicts: boolean;
  contradictedIndex: number | null; // 1-based index into `candidates`, or null
  existingPattern: string | null;
};

export async function checkConsistency(
  newContent: string,
  candidates: string[]
): Promise<ConsistencyResult | null> {
  if (candidates.length === 0) {
    return { contradicts: false, contradictedIndex: null, existingPattern: null };
  }
  const prompt = await loadPrompt("consistency-check", {
    new_insight: newContent,
    candidates: candidates.map((c, i) => `${i + 1}. ${c}`).join("\n"),
  });
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });
  const text = firstText(msg.content as { type: string; text?: string }[]);
  if (!text) return null;
  const parsed = parseJson(text) as {
    contradicts?: unknown;
    contradicted_index?: unknown;
    existing_pattern?: unknown;
  } | null;
  if (!parsed || typeof parsed.contradicts !== "boolean") return null;
  if (!parsed.contradicts) {
    return { contradicts: false, contradictedIndex: null, existingPattern: null };
  }
  const idx =
    typeof parsed.contradicted_index === "number" &&
    parsed.contradicted_index >= 1 &&
    parsed.contradicted_index <= candidates.length
      ? parsed.contradicted_index
      : null;
  return {
    contradicts: true,
    contradictedIndex: idx,
    existingPattern:
      typeof parsed.existing_pattern === "string" && parsed.existing_pattern.trim()
        ? parsed.existing_pattern.trim()
        : null,
  };
}

// Phase 5 (Step 4): identity/credential plausibility check. Compares the
// expert's claimed identity against their LinkedIn profile content and returns
// a plausibility flag + short notes + extracted structured attributes. Returns
// null on model/parse failure so the caller can leave the flag unchanged.
export type ProfileVerification = {
  flag: "consistent" | "partial_mismatch";
  notes: string | null;
  extracted: {
    title: string | null;
    industry: string | null;
    seniority: string | null;
    years_experience: number | null;
  };
};

export async function verifyProfile(
  claimed: string,
  linkedin: string
): Promise<ProfileVerification | null> {
  const prompt = await loadPrompt("verify-profile", { claimed, linkedin });
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });
  const text = firstText(msg.content as { type: string; text?: string }[]);
  if (!text) return null;
  const parsed = parseJson(text) as {
    flag?: unknown;
    notes?: unknown;
    extracted?: {
      title?: unknown;
      industry?: unknown;
      seniority?: unknown;
      years_experience?: unknown;
    };
  } | null;
  if (
    !parsed ||
    (parsed.flag !== "consistent" && parsed.flag !== "partial_mismatch")
  ) {
    return null;
  }
  const e = parsed.extracted ?? {};
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null;
  return {
    flag: parsed.flag,
    notes: str(parsed.notes),
    extracted: {
      title: str(e.title),
      industry: str(e.industry),
      seniority: str(e.seniority),
      years_experience: num(e.years_experience),
    },
  };
}

// Phase 6 Slice 2 (Step 9): Decision Simulation. Reasons through a NOVEL
// scenario using the expert's captured heuristics as its operating logic, and
// self-assesses how well the scenario maps to that captured thinking. Returns
// null on model/parse failure.
export type SimulationResult = {
  analysis: string;
  confidence: "high" | "medium" | "low";
  confidenceStatement: string;
};

export async function simulateDecision(
  scenario: string,
  insightContents: string[]
): Promise<SimulationResult | null> {
  const prompt = await loadPrompt("simulate-decision", {
    insights: formatInsights(insightContents),
    scenario,
  });
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1536,
    messages: [{ role: "user", content: prompt }],
  });
  const text = firstText(msg.content as { type: string; text?: string }[]);
  if (!text) return null;
  const parsed = parseJson(text) as {
    analysis?: unknown;
    confidence?: unknown;
    confidence_statement?: unknown;
  } | null;
  if (
    !parsed ||
    typeof parsed.analysis !== "string" ||
    (parsed.confidence !== "high" &&
      parsed.confidence !== "medium" &&
      parsed.confidence !== "low") ||
    typeof parsed.confidence_statement !== "string"
  ) {
    return null;
  }
  return {
    analysis: parsed.analysis,
    confidence: parsed.confidence,
    confidenceStatement: parsed.confidence_statement,
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

// Resume builder (free-tier lead magnet): approved insights -> structured
// resume sections. Grounded only in the insights (same doctrine as
// answerFromInsights) — no invented employers, titles, or metrics. Returns
// null on any model/parse failure so the route can fail with a clear error
// instead of shipping a half-built PDF.
export type ResumeFramework = { name: string; description: string };

export type ResumeSynthesis = {
  summary: string;
  keyExperience: string[];
  frameworks: ResumeFramework[];
  strengths: string[];
};

function isFrameworkArray(v: unknown): v is ResumeFramework[] {
  return (
    Array.isArray(v) &&
    v.every(
      (f) =>
        f &&
        typeof f === "object" &&
        typeof (f as Record<string, unknown>).name === "string" &&
        typeof (f as Record<string, unknown>).description === "string"
    )
  );
}

export async function synthesizeResume(
  insightContents: string[]
): Promise<ResumeSynthesis | null> {
  const prompt = await loadPrompt("synthesize-resume", {
    insights: insightContents.map((c, i) => `${i + 1}. ${c}`).join("\n"),
  });
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });
  const text = firstText(msg.content as { type: string; text?: string }[]);
  if (!text) return null;
  const parsed = parseJson(text) as {
    summary?: unknown;
    key_experience?: unknown;
    frameworks?: unknown;
    strengths?: unknown;
  } | null;
  if (
    !parsed ||
    typeof parsed.summary !== "string" ||
    !isStringArray(parsed.key_experience) ||
    !isFrameworkArray(parsed.frameworks) ||
    !isStringArray(parsed.strengths) ||
    parsed.frameworks.length === 0
  ) {
    return null;
  }
  return {
    summary: parsed.summary,
    keyExperience: parsed.key_experience,
    frameworks: parsed.frameworks,
    strengths: parsed.strengths,
  };
}
