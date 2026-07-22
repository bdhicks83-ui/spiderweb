// P0 — Elicitation Engine: shared shapes and rules for the /api/codify routes.
// The ladder, the ontology, and the completion gate live here so that the
// routes, the prompts, and the UI all agree on what "complete" means.
//
// Doctrine (ELICITATION-ENGINE-SPEC.md): elicitation, not ingestion. The
// client situation is the prompt; the abstracted pattern is the payload.
// Rungs 4 (Signal Detail) and 6 (Boundaries) are the product — a record can
// NEVER complete without both.

// ─── The Pattern Record fields (mirrors pattern_records columns) ───

export type PatternFields = {
  context_summary: string | null;
  context_org_size: string | null;
  context_industry: string | null;
  context_function: string | null;
  situation_type: string | null;
  intervention_type: string | null;
  trigger_signal: string | null;
  signal_detail: string | null;
  judgment: string | null;
  rationale: string | null;
  boundaries: string | null;
};

export const EMPTY_FIELDS: PatternFields = {
  context_summary: null,
  context_org_size: null,
  context_industry: null,
  context_function: null,
  situation_type: null,
  intervention_type: null,
  trigger_signal: null,
  signal_detail: null,
  judgment: null,
  rationale: null,
  boundaries: null,
};

// The six required fields. Outcome (field 7) is deliberately absent — it's
// captured at the delayed follow-up, months later.
export const REQUIRED_FIELDS: (keyof PatternFields)[] = [
  "context_summary",
  "trigger_signal",
  "signal_detail",
  "judgment",
  "rationale",
  "boundaries",
];

export function isRecordComplete(fields: PatternFields): boolean {
  return REQUIRED_FIELDS.every((k) => {
    const v = fields[k];
    return typeof v === "string" && v.trim().length > 0;
  });
}

// Which rungs have demonstrably been reached (for the UI progress strip and
// the acceptance test's "ladder reached rung 4 AND rung 6" check).
export function rungsReached(fields: PatternFields): number[] {
  const reached: number[] = [];
  if (fields.context_summary) reached.push(1);
  if (fields.trigger_signal || fields.situation_type || fields.intervention_type)
    reached.push(2);
  if (fields.judgment) reached.push(3);
  if (fields.signal_detail) reached.push(4);
  if (fields.rationale) reached.push(5);
  if (fields.boundaries) reached.push(6);
  return reached;
}

// ─── The ladder ───

export const RUNG_LABELS: Record<number, string> = {
  1: "Situate",
  2: "Classify",
  3: "The call",
  4: "The signal",
  5: "The reasoning",
  6: "Boundaries",
  7: "Generalize",
};

// The session opener — rung 1. Fixed (no model call) so starting a session is
// instant and free. Everything after this is model-driven.
export const OPENING_QUESTION =
  "Think of a recent engagement where you made a call you'd stand behind — a " +
  "recommendation or intervention that came from your read of the situation. " +
  "To start: roughly how big was the company, what industry, and what part of " +
  "the business did this touch?";

// Hard cap on questions per session. The prompt aims for 5–7 (consultants
// hate data entry); the cap is a backstop, and the deterministic fallback
// below guarantees rungs 4/6 still get asked even at the cap.
export const MAX_QUESTIONS = 12;

// Deterministic backstop: if the model stalls or the cap nears with a
// required rung still missing, ask the scripted question for the lowest
// missing rung. Guarantees a session can always converge on completion.
export function fallbackQuestion(
  fields: PatternFields
): { rung: number; question: string } | null {
  if (!fields.context_summary) {
    return { rung: 1, question: OPENING_QUESTION };
  }
  if (!fields.trigger_signal) {
    return {
      rung: 2,
      question:
        "What did you observe that told you something needed to change — what prompted your involvement?",
    };
  }
  if (!fields.judgment) {
    return { rung: 3, question: "What did you recommend, or what call did you make?" };
  }
  if (!fields.signal_detail) {
    return {
      rung: 4,
      question:
        "What specifically did you see or hear that made you read it that way? The concrete, observable details — what would someone else have missed?",
    };
  }
  if (!fields.rationale) {
    return {
      rung: 5,
      question:
        "Why was that the right call rather than the obvious alternative? Walk me through your reasoning.",
    };
  }
  if (!fields.boundaries) {
    return {
      rung: 6,
      question:
        "Where would this same advice have been wrong? Name at least one concrete condition — a size, a regulatory context, a people factor — where you would NOT make this call.",
    };
  }
  return null;
}

// ─── Prompt formatting helpers ───

export type ElicitQA = { rung: number; question: string; answer: string };

export function formatRecordState(fields: PatternFields): string {
  return JSON.stringify(fields, null, 2);
}

export function formatElicitQAPairs(qaPairs: ElicitQA[]): string {
  if (qaPairs.length === 0) return "(none yet)";
  return qaPairs
    .map(
      (p, i) =>
        `${i + 1}. [rung ${p.rung}] Q: ${p.question}\n   A: ${p.answer}`
    )
    .join("\n");
}

// Merge model-extracted fields into the stored ones. Only non-empty strings
// land; the model is trusted to carry values forward, but a dropped key can
// never erase something already captured (fidelity > model hiccups).
export function mergeFields(
  current: PatternFields,
  incoming: Partial<Record<keyof PatternFields, unknown>>
): PatternFields {
  const out: PatternFields = { ...current };
  for (const key of Object.keys(EMPTY_FIELDS) as (keyof PatternFields)[]) {
    const v = incoming[key];
    if (typeof v === "string" && v.trim().length > 0) {
      out[key] = v.trim();
    }
  }
  return out;
}

// ─── The framework artifact (pattern_records.framework) ───

export type FrameworkArtifact = {
  name: string;
  tagline: string;
  when_to_apply: string[];
  signals: string[];
  the_play: string;
  why_it_works: string;
  boundaries: string[];
};

export function isFrameworkArtifact(v: unknown): v is FrameworkArtifact {
  if (!v || typeof v !== "object") return false;
  const f = v as Record<string, unknown>;
  const isStrArr = (x: unknown): x is string[] =>
    Array.isArray(x) && x.length > 0 && x.every((s) => typeof s === "string");
  return (
    typeof f.name === "string" &&
    typeof f.tagline === "string" &&
    isStrArr(f.when_to_apply) &&
    isStrArr(f.signals) &&
    typeof f.the_play === "string" &&
    typeof f.why_it_works === "string" &&
    isStrArr(f.boundaries)
  );
}
