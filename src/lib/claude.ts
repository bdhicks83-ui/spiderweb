// Claude API wrapper — Week 2 (OCR), Week 3 (insight extraction), Phase 3 (framework drafting),
// Phase 5 (Ask Your Spiderweb).
// Doctrine: prompts load from /prompts, never inline.
import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "fs/promises";
import path from "path";

// timeout + maxRetries:0 — a stalled connection fails in 60s instead of
// hanging silently for up to the SDK's 10-minute default; withRetries()
// above handles our own retries with backoff.
const anthropic = new Anthropic({ timeout: 60_000, maxRetries: 0 }); // reads ANTHROPIC_API_KEY from env

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

// Models occasionally emit a literal newline/tab inside a JSON string value
// (e.g. a "feedback" field formatted with a paragraph break) instead of the
// escaped \n — that's invalid JSON and JSON.parse throws even though the
// braces are perfectly balanced. Repair pass: walk the string, and only
// while inside a quoted string literal, escape raw control characters.
function repairJsonControlChars(s: string): string {
  let out = "";
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) { out += ch; esc = false; continue; }
      if (ch === "\\") { out += ch; esc = true; continue; }
      if (ch === '"') { inStr = false; out += ch; continue; }
      if (ch === "\n") { out += "\\n"; continue; }
      if (ch === "\r") { continue; }
      if (ch === "\t") { out += "\\t"; continue; }
      out += ch;
      continue;
    }
    if (ch === '"') { inStr = true; out += ch; continue; }
    out += ch;
  }
  return out;
}

// Strip a ```json fence if the model wrapped its output in one.
function parseJson(text: string): unknown | null {
  const stripped = text.replace(/^```json?\n?|```$/g, "").trim();
  try {
    return JSON.parse(stripped);
  } catch {
    try {
      return JSON.parse(repairJsonControlChars(stripped));
    } catch {
      return null;
    }
  }
}

// Tolerant JSON extraction. parseJson only handles a clean body or a fenced
// one; real model output occasionally adds a preamble ("Here's the
// framework:") or a trailing note. When the strict parse fails, slice out the
// first balanced {...} / [...] span and parse that. This removes a whole class
// of "valid JSON, wrong wrapper" first-attempt failures without a retry.
function parseJsonLoose(text: string): unknown | null {
  const direct = parseJson(text);
  if (direct !== null) return direct;

  const stripped = text.replace(/^```json?\n?|```$/g, "").trim();
  const start = stripped.search(/[{[]/);
  if (start === -1) return null;
  const open = stripped[start];
  const close = open === "{" ? "}" : "]";

  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < stripped.length; i++) {
    const ch = stripped[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        const slice = stripped.slice(start, i + 1);
        try {
          return JSON.parse(slice);
        } catch {
          try {
            return JSON.parse(repairJsonControlChars(slice));
          } catch {
            return null;
          }
        }
      }
    }
  }
  return null; // never balanced → almost certainly a truncated body
}

// Retry a value-producing model call. Transient failures — API overload,
// network blips, an occasional truncated or preamble-wrapped JSON body — are
// common enough that a single shot flakes intermittently. Retry a few times
// with exponential backoff + jitter, treating BOTH a thrown error and a null
// result (parse/validation miss) as retryable. Returns null only when every
// attempt fails, so callers keep their existing "null ⇒ fall back" contract.
async function withRetries<T>(
  label: string,
  fn: () => Promise<T | null>,
  attempts = 3,
  baseDelayMs = 400
): Promise<T | null> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const result = await fn();
      if (result !== null) return result;
      if (attempt < attempts) {
        console.warn(`${label}: empty/invalid result, retry ${attempt}/${attempts - 1}`);
      }
    } catch (err) {
      if (attempt === attempts) {
        console.error(`${label}: failed after ${attempts} attempts:`, err);
        return null;
      }
      console.warn(`${label}: error, retry ${attempt}/${attempts - 1}:`, err);
    }
    if (attempt < attempts) {
      const delay = baseDelayMs * 2 ** (attempt - 1) + Math.floor(Math.random() * 150);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  return null;
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

// ─────────────────────────────────────────────────────────────────────────
// P0 — Elicitation Engine Claude helpers.
// Doctrine: elicitation, not ingestion. Fidelity, not accuracy.
// ─────────────────────────────────────────────────────────────────────────

import {
  type PatternFields,
  type ElicitQA,
  type FrameworkArtifact,
  type MethodId,
  type TriggerType,
  type Persona,
  EMPTY_FIELDS,
  TRIGGER_TYPES,
  METHODS,
  methodPromptFile,
  personaPromptFile,
  formatRecordState,
  formatElicitQAPairs,
  mergeFields,
  isFrameworkArtifact,
} from "@/lib/elicitation";

// One elicitation turn: fold the latest answer into the record fields, then
// either ask the next ladder question or declare the record complete.
// Returns null on any model/parse failure so the route can fall back to the
// deterministic ladder question instead of dead-ending the session.
export type ElicitStep = {
  fields: PatternFields;
  done: boolean;
  nextRung: number | null;
  question: string | null;
};

export async function elicitNext(
  currentFields: PatternFields,
  qaPairs: ElicitQA[],
  latestAnswer: string,
  maxRemaining: number,
  method: MethodId,
  triggerType: TriggerType,
  persona: Persona | null
): Promise<ElicitStep | null> {
  const methodMeta = METHODS[method];
  const triggerMeta = TRIGGER_TYPES.find((t) => t.id === triggerType);
  const [methodGuidance, personaGuidance] = await Promise.all([
    loadPrompt(methodPromptFile(method)),
    loadPrompt(personaPromptFile(persona)),
  ]);
  const prompt = await loadPrompt("elicit-next", {
    trigger_label: triggerMeta ? `${triggerMeta.emoji} ${triggerMeta.label}` : "a captured situation",
    method_name: methodMeta.name,
    method_origin: methodMeta.origin,
    method_guidance: methodGuidance,
    persona_guidance: personaGuidance,
    record_state: formatRecordState(currentFields),
    qa_pairs: formatElicitQAPairs(qaPairs),
    latest_answer: latestAnswer,
    max_remaining: String(maxRemaining),
  });
  // Retry + loose-parse: a flaked turn here can drop the latest answer from
  // the record (elicitNext is what folds answers into fields), which on the
  // final turn would stall completion. The deterministic ladder fallback in
  // the route is the last-resort net; these retries keep the happy path clean.
  return withRetries("elicitNext", async () => {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });
    const text = firstText(msg.content as { type: string; text?: string }[]);
    if (!text) return null;
    const parsed = parseJsonLoose(text) as {
      fields?: unknown;
      done?: unknown;
      next_rung?: unknown;
      question?: unknown;
    } | null;
    if (!parsed || typeof parsed.done !== "boolean") return null;

    const rawFields =
      parsed.fields && typeof parsed.fields === "object"
        ? (parsed.fields as Partial<Record<keyof PatternFields, unknown>>)
        : ({} as Partial<Record<keyof PatternFields, unknown>>);
    // mergeFields guarantees a dropped key never erases captured content, and
    // unions the entity map instead of overwriting it.
    const fields = mergeFields(mergeFields(EMPTY_FIELDS, currentFields), rawFields);

    if (parsed.done) {
      return { fields, done: true, nextRung: null, question: null };
    }
    if (
      typeof parsed.question !== "string" ||
      !parsed.question.trim() ||
      typeof parsed.next_rung !== "number" ||
      parsed.next_rung < 1 ||
      parsed.next_rung > 8
    ) {
      return null;
    }
    return {
      fields,
      done: false,
      nextRung: Math.round(parsed.next_rung),
      question: parsed.question.trim(),
    };
  });
}

// PII / name scrubbing at capture. Client and individual names are stripped
// BEFORE anything is stored ("roles, not names"). Returns null on failure —
// callers must FAIL CLOSED: never store an unscrubbed answer.
export type ScrubResult = { scrubbed: string; changed: boolean };

export async function scrubPII(text: string): Promise<ScrubResult | null> {
  const prompt = await loadPrompt("scrub-pii", { text });
  // Retrying is safe here: scrubPII is fail-closed, so a null after all
  // attempts still blocks storage of an unscrubbed answer — the retries only
  // reduce how often a transient hiccup forces the user to resubmit.
  return withRetries("scrubPII", async () => {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });
    const out = firstText(msg.content as { type: string; text?: string }[]);
    if (!out) return null;
    const parsed = parseJsonLoose(out) as {
      scrubbed?: unknown;
      changed?: unknown;
    } | null;
    if (
      !parsed ||
      typeof parsed.scrubbed !== "string" ||
      !parsed.scrubbed.trim() ||
      typeof parsed.changed !== "boolean"
    ) {
      return null;
    }
    return { scrubbed: parsed.scrubbed.trim(), changed: parsed.changed };
  });
}

// P-0.5 — export-time PII scrub. DECISION-LOG 2026-07-22: capture-time
// scrubbing of the entity map (and, by extension, of names an expert offers
// in any field) is deliberately OFF for internal storage — the entity map
// exists specifically to keep names, under org-scoped RLS, so pairing/Win
// Column features (P-1/P-4.5) can use them. Scrubbing only happens here, at
// the moment content is about to leave the org (currently: the framework PDF
// export in /api/codify/pdf). Returns null on failure — callers should FAIL
// CLOSED for export (better to block an export than ship an unscrubbed one).
export async function scrubForExport(text: string): Promise<ScrubResult | null> {
  const prompt = await loadPrompt("scrub-for-export", { text });
  return withRetries("scrubForExport", async () => {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });
    const out = firstText(msg.content as { type: string; text?: string }[]);
    if (!out) return null;
    const parsed = parseJsonLoose(out) as {
      scrubbed?: unknown;
      changed?: unknown;
    } | null;
    if (
      !parsed ||
      typeof parsed.scrubbed !== "string" ||
      !parsed.scrubbed.trim() ||
      typeof parsed.changed !== "boolean"
    ) {
      return null;
    }
    return { scrubbed: parsed.scrubbed.trim(), changed: parsed.changed };
  });
}

// Completed Pattern Record -> branded framework artifact (the first-session
// "aha"). Returns null on model/parse failure so the caller can offer a
// retry without losing the completed record.
export async function framePattern(
  fields: PatternFields
): Promise<FrameworkArtifact | null> {
  const prompt = await loadPrompt("frame-pattern", {
    record: formatRecordState(fields),
  });
  // max_tokens raised from 1536 → 3072: a rich 7-field record with four-bullet
  // arrays can exceed 1536, and a truncated body (stop_reason "max_tokens")
  // is unparseable JSON — that was the dominant first-render flake. The
  // retry+loose-parse below covers the residual transient cases.
  return withRetries("framePattern", async () => {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 3072,
      messages: [{ role: "user", content: prompt }],
    });
    const text = firstText(msg.content as { type: string; text?: string }[]);
    if (!text) return null;
    const parsed = parseJsonLoose(text);
    return isFrameworkArtifact(parsed) ? parsed : null;
  });
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

// ─────────────────────────────────────────────────────────────────────────
// Phase 8 — Credibility v2 Claude helpers.
// ─────────────────────────────────────────────────────────────────────────

// Block 2 — Belief-revision depth gate. An explanation only earns credibility
// if it names the prior belief, the catalyst, the current belief, and genuine
// reasoning for why the new view is better (not just a restated conclusion).
// Returns null on any model/parse failure so the caller can treat it as "not
// yet passed" without crashing.
export type BeliefRevisionScore = {
  depthOk: boolean;
  present: {
    prior_belief: boolean;
    catalyst: boolean;
    current_belief: boolean;
    reasoning: boolean;
  };
  note: string | null;
};

export async function scoreBeliefRevision(
  priorContent: string,
  newContent: string,
  explanation: string
): Promise<BeliefRevisionScore | null> {
  const prompt = await loadPrompt("belief-revision", {
    prior: priorContent,
    current: newContent,
    explanation,
  });
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });
  const text = firstText(msg.content as { type: string; text?: string }[]);
  if (!text) return null;
  const parsed = parseJson(text) as {
    depth_ok?: unknown;
    present?: {
      prior_belief?: unknown;
      catalyst?: unknown;
      current_belief?: unknown;
      reasoning?: unknown;
    };
    note?: unknown;
  } | null;
  if (!parsed || typeof parsed.depth_ok !== "boolean") return null;
  const p = parsed.present ?? {};
  const b = (v: unknown): boolean => v === true;
  return {
    depthOk: parsed.depth_ok,
    present: {
      prior_belief: b(p.prior_belief),
      catalyst: b(p.catalyst),
      current_belief: b(p.current_belief),
      reasoning: b(p.reasoning),
    },
    note: typeof parsed.note === "string" && parsed.note.trim() ? parsed.note.trim() : null,
  };
}

// Block 4 — infer an expert's behavioral profile from their own insights.
// No survey: pace/autonomy/formality/directness are read off their captured
// thinking. Returns null on model/parse failure.
export type BehavioralProfile = {
  autonomy: string;
  pace: string;
  formality: string;
  directness: string;
  summary: string;
};

export async function inferBehavioralProfile(
  insightContents: string[]
): Promise<BehavioralProfile | null> {
  const prompt = await loadPrompt("behavioral-profile", {
    insights: formatInsights(insightContents),
  });
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 700,
    messages: [{ role: "user", content: prompt }],
  });
  const text = firstText(msg.content as { type: string; text?: string }[]);
  if (!text) return null;
  const parsed = parseJson(text) as {
    autonomy?: unknown;
    pace?: unknown;
    formality?: unknown;
    directness?: unknown;
    summary?: unknown;
  } | null;
  const s = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;
  if (
    !parsed ||
    !s(parsed.autonomy) ||
    !s(parsed.pace) ||
    !s(parsed.formality) ||
    !s(parsed.directness) ||
    !s(parsed.summary)
  ) {
    return null;
  }
  return {
    autonomy: s(parsed.autonomy)!,
    pace: s(parsed.pace)!,
    formality: s(parsed.formality)!,
    directness: s(parsed.directness)!,
    summary: s(parsed.summary)!,
  };
}

// Block 4 — plain-English org-fit summary (NOT pass/fail). Compares the
// inferred expert profile against an org's short intake and flags likely
// friction points. Returns null on model/parse failure.
export type OrgIntake = {
  teamSize: string;
  decisionStyle: string; // fast | consensus
  pace: string; // fast | deliberate
  formality: string; // formal | casual
};

export type OrgFit = {
  summary: string;
  frictionPoints: string[];
};

export async function assessOrgFit(
  profile: BehavioralProfile,
  intake: OrgIntake
): Promise<OrgFit | null> {
  const prompt = await loadPrompt("org-fit", {
    expert_autonomy: profile.autonomy,
    expert_pace: profile.pace,
    expert_formality: profile.formality,
    expert_directness: profile.directness,
    expert_summary: profile.summary,
    org_team_size: intake.teamSize,
    org_decision_style: intake.decisionStyle,
    org_pace: intake.pace,
    org_formality: intake.formality,
  });
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 700,
    messages: [{ role: "user", content: prompt }],
  });
  const text = firstText(msg.content as { type: string; text?: string }[]);
  if (!text) return null;
  const parsed = parseJson(text) as {
    summary?: unknown;
    friction_points?: unknown;
  } | null;
  if (!parsed || typeof parsed.summary !== "string" || !parsed.summary.trim()) {
    return null;
  }
  return {
    summary: parsed.summary.trim(),
    frictionPoints: isStringArray(parsed.friction_points) ? parsed.friction_points : [],
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 7 — Risk monitoring Claude helpers.
// Each is best-effort: returns null on any model/parse failure so the caller
// fails OPEN (no signal fires — never block or penalise on a flaky call).
// ─────────────────────────────────────────────────────────────────────────

// Build a compact writing-style fingerprint from the author's own approved
// writing samples. Returns the descriptor text, or null on failure.
export async function buildVoiceFingerprint(
  samples: string[]
): Promise<string | null> {
  if (samples.length === 0) return null;
  const prompt = await loadPrompt("voice-fingerprint", {
    samples: samples.map((s, i) => `${i + 1}. ${s}`).join("\n\n"),
  });
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });
  const text = firstText(msg.content as { type: string; text?: string }[]);
  return text.trim() ? text.trim() : null;
}

// Shared shape for the two "does this new upload fit the expert?" checks.
export type MatchJudgement = {
  matches: boolean;
  confidence: "low" | "medium" | "high";
  reason: string | null;
};

function parseMatchJudgement(text: string): MatchJudgement | null {
  const parsed = parseJson(text) as {
    matches?: unknown;
    confidence?: unknown;
    reason?: unknown;
  } | null;
  if (
    !parsed ||
    typeof parsed.matches !== "boolean" ||
    (parsed.confidence !== "low" &&
      parsed.confidence !== "medium" &&
      parsed.confidence !== "high")
  ) {
    return null;
  }
  return {
    matches: parsed.matches,
    confidence: parsed.confidence,
    reason:
      typeof parsed.reason === "string" && parsed.reason.trim()
        ? parsed.reason.trim()
        : null,
  };
}

// Does a new upload plausibly match the author's established writing style?
export async function checkVoiceMatch(
  fingerprint: string,
  sample: string
): Promise<MatchJudgement | null> {
  const prompt = await loadPrompt("voice-match", { fingerprint, sample });
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 256,
    messages: [{ role: "user", content: prompt }],
  });
  const text = firstText(msg.content as { type: string; text?: string }[]);
  if (!text) return null;
  return parseMatchJudgement(text);
}

// Is a new upload consistent with the expert's established professional
// background (built from their approved insights)?
export async function checkBackgroundMatch(
  background: string,
  upload: string
): Promise<MatchJudgement | null> {
  const prompt = await loadPrompt("background-match", { background, upload });
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 256,
    messages: [{ role: "user", content: prompt }],
  });
  const text = firstText(msg.content as { type: string; text?: string }[]);
  if (!text) return null;
  return parseMatchJudgement(text);
}

// ─────────────────────────────────────────────────────────────────────────
// P-2 — Conflict X-ray Claude helpers.
// Doctrine: surface-with-warning (never hold), flag-never-block family.
// False positives are the failure mode — the prompt and the two-condition
// AND below are both tuned conservative on purpose.
// ─────────────────────────────────────────────────────────────────────────

// Cross-user conflict judgment for ONE candidate pair. This is the P-2
// extension of checkConsistency: instead of "does a new insight contradict
// the SAME user's approved insights", it asks "do two DIFFERENT experts'
// frameworks claim the same territory AND prescribe opposing plays". A pair
// only counts as a conflict when BOTH booleans come back true — the caller
// must AND them; similar-topic-but-compatible must never flag. Returns null
// on any model/parse failure so detection fails open (no flag).
export type ConflictJudgement = {
  overlappingBoundaries: boolean;
  opposingJudgment: boolean;
  territory: string | null;
  rationale: string | null;
};

export async function checkFrameworkConflict(
  frameworkA: string,
  frameworkB: string
): Promise<ConflictJudgement | null> {
  const prompt = await loadPrompt("conflict-xray", {
    framework_a: frameworkA,
    framework_b: frameworkB,
  });
  return withRetries("checkFrameworkConflict", async () => {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 768,
      messages: [{ role: "user", content: prompt }],
    });
    const text = firstText(msg.content as { type: string; text?: string }[]);
    if (!text) return null;
    const parsed = parseJsonLoose(text) as {
      overlapping_boundaries?: unknown;
      opposing_judgment?: unknown;
      territory?: unknown;
      rationale?: unknown;
    } | null;
    if (
      !parsed ||
      typeof parsed.overlapping_boundaries !== "boolean" ||
      typeof parsed.opposing_judgment !== "boolean"
    ) {
      return null;
    }
    const str = (v: unknown): string | null =>
      typeof v === "string" && v.trim() ? v.trim() : null;
    return {
      overlappingBoundaries: parsed.overlapping_boundaries,
      opposingJudgment: parsed.opposing_judgment,
      territory: str(parsed.territory),
      rationale: str(parsed.rationale),
    };
  });
}

// Depth gate for conflict RESOLUTIONS — the belief-revision gate pattern
// reapplied where a resolution changes a framework (sharpen_boundaries /
// reconcile / supersede; escalate is a handoff and skips the gate). A
// resolution only clears the contested badge when the note names both
// positions, the dividing line, the resolved guidance, and real reasoning.
// Returns null on model/parse failure — the caller treats that as "not yet
// passed" (conflict stays open), mirroring /api/explain-revision.
export type ConflictResolutionScore = {
  depthOk: boolean;
  present: {
    both_positions: boolean;
    dividing_line: boolean;
    resolved_guidance: boolean;
    reasoning: boolean;
  };
  note: string | null;
};

export async function scoreConflictResolution(
  frameworkA: string,
  frameworkB: string,
  resolutionType: string,
  explanation: string
): Promise<ConflictResolutionScore | null> {
  const prompt = await loadPrompt("conflict-resolution-depth", {
    framework_a: frameworkA,
    framework_b: frameworkB,
    resolution_type: resolutionType,
    explanation,
  });
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });
  const text = firstText(msg.content as { type: string; text?: string }[]);
  if (!text) return null;
  const parsed = parseJson(text) as {
    depth_ok?: unknown;
    present?: {
      both_positions?: unknown;
      dividing_line?: unknown;
      resolved_guidance?: unknown;
      reasoning?: unknown;
    };
    note?: unknown;
  } | null;
  if (!parsed || typeof parsed.depth_ok !== "boolean") return null;
  const p = parsed.present ?? {};
  const b = (v: unknown): boolean => v === true;
  return {
    depthOk: parsed.depth_ok,
    present: {
      both_positions: b(p.both_positions),
      dividing_line: b(p.dividing_line),
      resolved_guidance: b(p.resolved_guidance),
      reasoning: b(p.reasoning),
    },
    note: typeof parsed.note === "string" && parsed.note.trim() ? parsed.note.trim() : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// P-4A — Prescription Engine Claude helpers.
// Doctrine: conservative bias — when torn between two rungs, choose the
// LOWER; a wrong prescription wastes real people's time, so every helper
// here fails open (model hiccup ⇒ no prescription, never a spurious one).
// ─────────────────────────────────────────────────────────────────────────

// Triage: size one detection onto the severity-matched intervention ladder.
// Returns the chosen rung (1-4) plus a one-line rationale a human can read.
// Returns null on any model/parse failure so the caller SKIPS the detection
// (it stays open for the next run) rather than guessing a rung.
export type PrescriptionTriage = {
  rung: 1 | 2 | 3 | 4;
  rationale: string;
};

export async function triagePrescriptionGap(
  sourceType: string,
  detectionSummary: string,
  evidence: string
): Promise<PrescriptionTriage | null> {
  const prompt = await loadPrompt("prescription-triage", {
    source_type: sourceType,
    detection_summary: detectionSummary,
    evidence,
  });
  return withRetries("triagePrescriptionGap", async () => {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });
    const text = firstText(msg.content as { type: string; text?: string }[]);
    if (!text) return null;
    const parsed = parseJsonLoose(text) as {
      rung?: unknown;
      rationale?: unknown;
    } | null;
    if (
      !parsed ||
      typeof parsed.rung !== "number" ||
      ![1, 2, 3, 4].includes(parsed.rung) ||
      typeof parsed.rationale !== "string" ||
      !parsed.rationale.trim()
    ) {
      return null;
    }
    // One line, always — collapse any stray newlines and cap the length so
    // the stored rationale stays scannable in the queue.
    const rationale = parsed.rationale.trim().replace(/\s*\n+\s*/g, " ").slice(0, 300);
    return { rung: parsed.rung as 1 | 2 | 3 | 4, rationale };
  });
}

// Coverage tiebreak: a semantic near-match cleared the similarity threshold —
// does that framework actually COVER the department's own territory, or just
// sit near it? Doubt resolves to covers=true (suppress the prescription);
// null (model failure) is treated by the caller the same way — fail open,
// no prescription.
export type CoverageJudgement = {
  covers: boolean;
  reason: string | null;
};

export async function checkCoverageGap(
  department: string,
  evidence: string,
  frameworkText: string
): Promise<CoverageJudgement | null> {
  const prompt = await loadPrompt("coverage-check", {
    department,
    evidence,
    framework: frameworkText,
  });
  return withRetries("checkCoverageGap", async () => {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 384,
      messages: [{ role: "user", content: prompt }],
    });
    const text = firstText(msg.content as { type: string; text?: string }[]);
    if (!text) return null;
    const parsed = parseJsonLoose(text) as {
      covers?: unknown;
      reason?: unknown;
    } | null;
    if (!parsed || typeof parsed.covers !== "boolean") return null;
    return {
      covers: parsed.covers,
      reason:
        typeof parsed.reason === "string" && parsed.reason.trim()
          ? parsed.reason.trim()
          : null,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────
// P-4B — Prescription Engine part 2 Claude helpers: training generation
// (3 audience altitudes), regenerate-on-request, and the teach-back check.
// Doctrine: grounded ONLY in the paired expert's framework material (same
// no-outside-knowledge rule as /retrieve and Ask Your Spiderweb); every
// helper fails open (null ⇒ the route surfaces a retryable error, nothing
// half-built is ever stored or shipped).
// ─────────────────────────────────────────────────────────────────────────

export type TrainingAltitude = { title: string; body: string };

export type TrainingArtifact = {
  strategy: string;
  title: string;
  altitudes: {
    floor: TrainingAltitude;
    supervisor: TrainingAltitude;
    exec: TrainingAltitude;
  };
};

function isTrainingAltitude(v: unknown): v is TrainingAltitude {
  if (!v || typeof v !== "object") return false;
  const a = v as Record<string, unknown>;
  return (
    typeof a.title === "string" &&
    a.title.trim().length > 0 &&
    typeof a.body === "string" &&
    a.body.trim().length > 0
  );
}

export function isTrainingArtifact(v: unknown): v is TrainingArtifact {
  if (!v || typeof v !== "object") return false;
  const t = v as Record<string, unknown>;
  if (typeof t.strategy !== "string" || !t.strategy.trim()) return false;
  if (typeof t.title !== "string" || !t.title.trim()) return false;
  const alts = t.altitudes as Record<string, unknown> | undefined;
  if (!alts || typeof alts !== "object") return false;
  return (
    isTrainingAltitude(alts.floor) &&
    isTrainingAltitude(alts.supervisor) &&
    isTrainingAltitude(alts.exec)
  );
}

export type TrainingGenerationInput = {
  rung: number;
  formatName: string;
  formatInstructions: string;
  sourceType: string;
  gapSummary: string;
  pairingSummary: string;
  audience: string;
  /** The expert framework material — the ONLY permitted source of substance. */
  frameworks: string;
};

// Generate the intervention at the prescribed rung in three altitudes.
// One call for all three so the substance stays aligned across framings.
export async function generateTraining(
  input: TrainingGenerationInput
): Promise<TrainingArtifact | null> {
  const prompt = await loadPrompt("training-generate", {
    rung: String(input.rung),
    format_name: input.formatName,
    format_instructions: input.formatInstructions,
    source_type: input.sourceType,
    gap_summary: input.gapSummary,
    pairing_summary: input.pairingSummary,
    audience: input.audience,
    frameworks: input.frameworks,
    strategy_instruction:
      "This is the FIRST version. Choose the instructional-design strategy that best fits the material and the audience, and name it in the strategy field.",
  });
  return withRetries("generateTraining", async () => {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 6000,
      messages: [{ role: "user", content: prompt }],
    });
    const text = firstText(msg.content as { type: string; text?: string }[]);
    if (!text) return null;
    const parsed = parseJsonLoose(text);
    return isTrainingArtifact(parsed) ? parsed : null;
  });
}

// Regenerate-on-request: a VISIBLY different strategy, never a re-roll. The
// prompt receives every prior version's strategy + title and must avoid them
// all; the route additionally rejects a result whose strategy label matches
// a prior one (belt and braces — the history is the product).
export async function regenerateTraining(
  input: TrainingGenerationInput & {
    priorVersions: { version: number; strategy: string; title: string }[];
    regenerateNote: string | null;
  }
): Promise<TrainingArtifact | null> {
  const prompt = await loadPrompt("training-regenerate", {
    rung: String(input.rung),
    format_name: input.formatName,
    format_instructions: input.formatInstructions,
    source_type: input.sourceType,
    gap_summary: input.gapSummary,
    pairing_summary: input.pairingSummary,
    audience: input.audience,
    frameworks: input.frameworks,
    prior_versions: input.priorVersions
      .map((p) => `- v${p.version}: strategy "${p.strategy}" — "${p.title}"`)
      .join("\n"),
    regenerate_note:
      input.regenerateNote?.trim() ||
      "(no specific note — the requester wants a structurally different design)",
  });
  return withRetries("regenerateTraining", async () => {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 6000,
      messages: [{ role: "user", content: prompt }],
    });
    const text = firstText(msg.content as { type: string; text?: string }[]);
    if (!text) return null;
    const parsed = parseJsonLoose(text);
    if (!isTrainingArtifact(parsed)) return null;
    // A "different" strategy that string-matches a prior one is a re-roll —
    // treat as a failed attempt so withRetries asks again.
    const norm = (s: string) => s.trim().toLowerCase();
    if (input.priorVersions.some((p) => norm(p.strategy) === norm(parsed.strategy))) {
      return null;
    }
    return parsed;
  });
}

export type TeachbackScenario = { scenario: string; question: string };

// Fresh scenario from the framework's signal/play/boundaries — retrieval
// practice, never a restatement of the training's own examples.
export async function generateTeachbackScenario(
  frameworks: string,
  audience: string,
  trainingTitle: string,
  trainingStrategy: string
): Promise<TeachbackScenario | null> {
  const prompt = await loadPrompt("teachback-scenario", {
    frameworks,
    audience,
    training_title: trainingTitle,
    training_strategy: trainingStrategy,
  });
  return withRetries("generateTeachbackScenario", async () => {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });
    const text = firstText(msg.content as { type: string; text?: string }[]);
    if (!text) return null;
    const parsed = parseJsonLoose(text) as {
      scenario?: unknown;
      question?: unknown;
    } | null;
    if (
      !parsed ||
      typeof parsed.scenario !== "string" ||
      !parsed.scenario.trim() ||
      typeof parsed.question !== "string" ||
      !parsed.question.trim()
    ) {
      return null;
    }
    return { scenario: parsed.scenario.trim(), question: parsed.question.trim() };
  });
}

export type TeachbackScore = {
  score: number;
  feedback: string;
  missed: string[];
};

// Score the learner's answer against the framework: signal read (40) + play
// applied (40) + boundaries respected (20). The route derives passed from
// TEACHBACK_PASS_SCORE — the threshold lives in prescription.ts, not here.
export async function scoreTeachback(
  frameworks: string,
  scenario: string,
  question: string,
  answer: string
): Promise<TeachbackScore | null> {
  const prompt = await loadPrompt("teachback-score", {
    frameworks,
    scenario,
    question,
    answer,
  });
  return withRetries("scoreTeachback", async () => {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-5",
      // Scoring is reasoning-heavy (grading against a 3-part rubric).
      // claude-sonnet-5 reasons in a thinking channel and can burn the whole
      // budget before emitting the JSON — 8000 leaves room for both. See the
      // seed's scoreTeachback for the diagnosis.
      max_tokens: 8000,
      messages: [{ role: "user", content: prompt }],
    });
    const text = firstText(msg.content as { type: string; text?: string }[]);
    if (!text) return null;
    const parsed = parseJsonLoose(text) as {
      score?: unknown;
      feedback?: unknown;
      missed?: unknown;
    } | null;
    // Tolerate a numeric string ("85") or an arithmetic total the model
    // occasionally emits ("40 + 35 + 15") — parseFloat on the first number
    // after collapsing whitespace-separated sums keeps a stray format from
    // wasting a whole retry. A non-numeric score is still rejected.
    const rawScore =
      typeof parsed?.score === "number"
        ? parsed.score
        : typeof parsed?.score === "string"
          ? (parsed.score as string)
              .split(/[+]/)
              .reduce((sum, part) => sum + (parseFloat(part) || 0), 0)
          : NaN;
    if (
      !parsed ||
      !Number.isFinite(rawScore) ||
      typeof parsed.feedback !== "string" ||
      !parsed.feedback.trim()
    ) {
      return null;
    }
    const score = Math.max(0, Math.min(100, Math.round(rawScore)));
    return {
      score,
      feedback: parsed.feedback.trim(),
      missed: isStringArray(parsed.missed) ? parsed.missed : [],
    };
  }, 5);
}
