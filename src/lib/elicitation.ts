// P0 / P-0.5 — Elicitation Engine: shared shapes and rules for the
// /api/codify routes. The ladder, the ontology, the methodology router, and
// the completion gate live here so that the routes, the prompts, and the UI
// all agree on what "complete" means.
//
// Doctrine (ELICITATION-ENGINE-SPEC.md): elicitation, not ingestion. The
// client situation is the prompt; the abstracted pattern is the payload.
// Rungs 4 (Signal Detail) and 7 (Boundaries, formerly 6 — see P-0.5 rung
// renumber below) are the product — a record can NEVER complete without
// both. P-0.5 (ELICITATION-ENGINE-SPEC-ADDENDUM-2026-07-22.md §1-2) adds:
//   - a Methodology Router: trigger type -> suggested method, offer+suggest
//     never force. Rungs 1-3 stay universal; rungs 4/5/7 (signal/reasoning/
//     boundaries) swap question templates per method.
//   - an Entity Map (Pattern Record field #8): one adaptive rung inserted
//     between reasoning and boundaries, wording adapts per method. PII
//     exception: names are KEPT here (org-scoped RLS) — the general scrub
//     doctrine does not apply to this field. See DECISION-LOG 2026-07-22.

// ─── Methodology Router (P-0.5 §1) ─────────────────────────────────────────

export type TriggerType = "broke" | "win" | "concern" | "friction" | "judgment";

export type MethodId =
  | "5whys_fishbone"
  | "aar_success_case"
  | "premortem"
  | "a3"
  | "cdm";

export type Persona = "exec" | "technical_director" | "sr_manager";

export type TriggerOption = {
  id: TriggerType;
  emoji: string;
  label: string;
  suggestedMethod: MethodId;
  /** One-line why shown to the expert when the engine suggests the method. */
  why: string;
};

// Display order for the "What are we capturing?" router screen.
export const TRIGGER_TYPES: TriggerOption[] = [
  {
    id: "broke",
    emoji: "\u{1F4A5}", // 💥
    label: "Something broke",
    suggestedMethod: "5whys_fishbone",
    why: "5 Whys traces a failure to its root cause — Fishbone joins in if the chain forks into more than one cause.",
  },
  {
    id: "win",
    emoji: "\u{1F3C6}", // 🏆
    label: "A win landed",
    suggestedMethod: "aar_success_case",
    why: "After-Action Review + Success Case Method turns what worked into a repeatable playbook.",
  },
  {
    id: "concern",
    emoji: "\u{26A0}\u{FE0F}", // ⚠️
    label: "A concern",
    suggestedMethod: "premortem",
    why: "Pre-mortem surfaces what could go wrong before it does — worry becomes a concrete risk boundary.",
  },
  {
    id: "friction",
    emoji: "\u{1F501}", // 🔁
    label: "Recurring friction",
    suggestedMethod: "a3",
    why: "A3 gap analysis is built for chronic problems — current state vs. target state vs. the correction.",
  },
  {
    id: "judgment",
    emoji: "\u{1F9E0}", // 🧠
    label: "A judgment call",
    suggestedMethod: "cdm",
    why: "Critical Decision Method reconstructs expert judgment made under uncertainty into a transferable rule.",
  },
];

export const METHODS: Record<
  MethodId,
  { name: string; origin: string; outputLabel: string; promptFile: string }
> = {
  "5whys_fishbone": {
    name: "5 Whys + Fishbone",
    origin: "Toyota Production System",
    outputLabel: "Guardrail",
    promptFile: "method-5whys-fishbone",
  },
  aar_success_case: {
    name: "After-Action Review + Success Case Method",
    origin: "US Army / Brinkerhoff",
    outputLabel: "Playbook",
    promptFile: "method-aar-success-case",
  },
  premortem: {
    name: "Pre-mortem",
    origin: "Gary Klein",
    outputLabel: "Risk boundary",
    promptFile: "method-premortem",
  },
  a3: {
    name: "A3 Gap Analysis",
    origin: "Lean",
    outputLabel: "Correction",
    promptFile: "method-a3",
  },
  cdm: {
    name: "Critical Decision Method",
    origin: "Klein (Naturalistic Decision Making)",
    outputLabel: "Framework",
    promptFile: "method-cdm",
  },
};

export const PERSONAS: Record<Persona, { label: string; promptFile: string }> = {
  exec: { label: "Executive", promptFile: "persona-exec" },
  technical_director: { label: "Technical director", promptFile: "persona-technical-director" },
  sr_manager: { label: "Senior manager", promptFile: "persona-sr-manager" },
};

// Used when the profile has no persona set yet — shades toward neither pole.
export const NEUTRAL_PERSONA_PROMPT_FILE = "persona-neutral";

export function isTriggerType(v: unknown): v is TriggerType {
  return typeof v === "string" && TRIGGER_TYPES.some((t) => t.id === v);
}

export function isMethodId(v: unknown): v is MethodId {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(METHODS, v);
}

export function isPersona(v: unknown): v is Persona {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(PERSONAS, v);
}

export function suggestedMethodFor(trigger: TriggerType): MethodId {
  return TRIGGER_TYPES.find((t) => t.id === trigger)!.suggestedMethod;
}

export function methodPromptFile(method: MethodId): string {
  return METHODS[method].promptFile;
}

export function personaPromptFile(persona: Persona | null | undefined): string {
  return persona ? PERSONAS[persona].promptFile : NEUTRAL_PERSONA_PROMPT_FILE;
}

// ─── Entity Map — Pattern Record field #8 (P-0.5 §2) ───────────────────────

export type EntityType =
  | "equipment_asset"
  | "process"
  | "error_class"
  | "role_person"
  | "department";

export const ENTITY_TYPES: EntityType[] = [
  "equipment_asset",
  "process",
  "error_class",
  "role_person",
  "department",
];

export type EntityMapEntry = {
  type: EntityType;
  name: string;
  detail: string | null;
};

function isEntityType(v: unknown): v is EntityType {
  return typeof v === "string" && (ENTITY_TYPES as string[]).includes(v);
}

function isEntityMapEntry(v: unknown): v is EntityMapEntry {
  if (!v || typeof v !== "object") return false;
  const e = v as Record<string, unknown>;
  return isEntityType(e.type) && typeof e.name === "string" && e.name.trim().length > 0;
}

function normalizeEntityMap(v: unknown): EntityMapEntry[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isEntityMapEntry).map((e) => ({
    type: e.type,
    name: e.name.trim(),
    detail: typeof e.detail === "string" && e.detail.trim() ? e.detail.trim() : null,
  }));
}

// Union two entity maps by (type, name) — never drops a previously captured
// entity, only adds new ones or fills in a missing detail. Same fidelity
// principle as mergeFields: a model hiccup can never erase captured content.
export function mergeEntityMaps(
  current: EntityMapEntry[],
  incoming: EntityMapEntry[]
): EntityMapEntry[] {
  const merged = current.map((e) => ({ ...e }));
  for (const inc of incoming) {
    const dup = merged.find(
      (e) => e.type === inc.type && e.name.toLowerCase() === inc.name.toLowerCase()
    );
    if (!dup) {
      merged.push(inc);
    } else if (!dup.detail && inc.detail) {
      dup.detail = inc.detail;
    }
  }
  return merged;
}

// ─── The Pattern Record fields (mirrors pattern_records columns) ───────────

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
  // Field #8 (P-0.5). Never null — empty array means "not yet elicited".
  entity_map: EntityMapEntry[];
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
  entity_map: [],
};

// The six original required STRING fields. Outcome (field 7) is deliberately
// absent — it's captured at the delayed follow-up, months later. entity_map
// (field #8) is checked separately in isRecordComplete because it's an array,
// not a string.
export const REQUIRED_FIELDS: (keyof PatternFields)[] = [
  "context_summary",
  "trigger_signal",
  "signal_detail",
  "judgment",
  "rationale",
  "boundaries",
];

export function isRecordComplete(fields: PatternFields): boolean {
  const stringsOk = REQUIRED_FIELDS.every((k) => {
    const v = fields[k];
    return typeof v === "string" && v.trim().length > 0;
  });
  return stringsOk && Array.isArray(fields.entity_map) && fields.entity_map.length > 0;
}

// Which rungs have demonstrably been reached (for the UI progress strip and
// the acceptance test's "ladder reached rung 4 AND rung 7" check).
// P-0.5 rung renumber: entity map is inserted as rung 6 (between reasoning
// and boundaries), pushing boundaries 6->7 and generalize 7->8.
export function rungsReached(fields: PatternFields): number[] {
  const reached: number[] = [];
  if (fields.context_summary) reached.push(1);
  if (fields.trigger_signal || fields.situation_type || fields.intervention_type)
    reached.push(2);
  if (fields.judgment) reached.push(3);
  if (fields.signal_detail) reached.push(4);
  if (fields.rationale) reached.push(5);
  if (fields.entity_map && fields.entity_map.length > 0) reached.push(6);
  if (fields.boundaries) reached.push(7);
  return reached;
}

// ─── The ladder ─────────────────────────────────────────────────────────────

export const RUNG_LABELS: Record<number, string> = {
  1: "Situate",
  2: "Classify",
  3: "The call",
  4: "The signal",
  5: "The reasoning",
  6: "Entities",
  7: "Boundaries",
  8: "Generalize",
};

// The session opener — rung 1. Fixed (no model call) so starting a session is
// instant and free. Everything after this is model-driven.
export const OPENING_QUESTION =
  "Think of a recent situation you'd want captured — the one you just flagged. " +
  "To start: roughly how big is the org, what part of the business, and what " +
  "was going on?";

// Hard cap on questions per session. The prompt aims for 6-8 (one more rung
// than P0's 5-7, now that the entity map is mandatory); the cap is a
// backstop, and the deterministic fallback below guarantees rungs 4/6/7
// still get asked even at the cap.
export const MAX_QUESTIONS = 13;

const GENERIC_CLASSIFY_QUESTION =
  "What did you observe that told you something needed to change — what prompted your involvement?";
const GENERIC_CALL_QUESTION = "What did you recommend, or what call did you make?";
const GENERIC_SIGNAL_QUESTION =
  "What specifically did you see or hear that made you read it that way? The concrete, observable details — what would someone else have missed?";
const GENERIC_REASONING_QUESTION =
  "Why was that the right call rather than the obvious alternative? Walk me through your reasoning.";
const GENERIC_ENTITY_QUESTION =
  "Which equipment, process, error type, role, or department was involved? Names are fine — they stay internal to your org.";
const GENERIC_BOUNDARIES_QUESTION =
  "Where would this same advice have been wrong? Name at least one concrete condition — a size, a regulatory context, a people factor — where you would NOT make this call.";

// Deterministic backstop, method-flavored per P-0.5 §1 (rungs 4/5/7 swap
// templates per method; the entity rung's wording also adapts per method).
// Falls back to the generic P0 wording if a method somehow isn't set yet.
type MethodQuestionSet = {
  signal: string;
  reasoning: string;
  entity: string;
  boundaries: string;
};

const METHOD_FALLBACK_QUESTIONS: Record<MethodId, MethodQuestionSet> = {
  "5whys_fishbone": {
    signal:
      "What broke, specifically — what did you see, hear, or measure that told you something had failed?",
    reasoning:
      "Why did that actually cause the failure — walk the chain of causes, not just the first domino.",
    entity:
      "Which machine or equipment, which process step, and what error type was this? Name the specific asset if there is one.",
    boundaries:
      "Where would this same fix NOT hold — a different machine, a different failure mode, a different scale?",
  },
  aar_success_case: {
    signal:
      "What specifically happened that made this a win — the concrete moment or decision, not just the outcome?",
    reasoning: "Why did that approach work — what made it the right move rather than the default one?",
    entity:
      "Who was involved in making this work, and who else benefits downstream? Names are fine — they stay internal to your org.",
    boundaries:
      "Under what conditions would this NOT work as well — a different team, a different starting point, a different scale?",
  },
  premortem: {
    signal:
      "What specifically are you worried could go wrong — the concrete failure mode, not just a general worry?",
    reasoning: "Why is that risk real — what would have to be true for it to actually happen?",
    entity: "What equipment, process, team, or department would bear this risk if it played out?",
    boundaries: "Under what conditions would this risk NOT apply, or your mitigation fail?",
  },
  a3: {
    signal:
      "What specifically keeps recurring — the concrete gap between what should happen and what actually does?",
    reasoning: "Why does that gap keep recurring instead of getting fixed for good?",
    entity: "Which process, department, or role does this friction keep showing up in?",
    boundaries: "Where does this correction NOT apply — a different process, or a different root cause?",
  },
  cdm: {
    signal:
      "What specifically did you notice that told you this was a critical moment — the cue someone else might have missed?",
    reasoning: "Why was that the right call rather than the obvious alternative?",
    entity:
      "Who made this call, who else was involved, and who's affected by it? Names are fine — they stay internal to your org.",
    boundaries: "Where would this same call have been the WRONG one?",
  },
};

export function fallbackQuestion(
  fields: PatternFields,
  method: MethodId | null
): { rung: number; question: string } | null {
  const m = method ? METHOD_FALLBACK_QUESTIONS[method] : null;
  if (!fields.context_summary) {
    return { rung: 1, question: OPENING_QUESTION };
  }
  if (!fields.trigger_signal) {
    return { rung: 2, question: GENERIC_CLASSIFY_QUESTION };
  }
  if (!fields.judgment) {
    return { rung: 3, question: GENERIC_CALL_QUESTION };
  }
  if (!fields.signal_detail) {
    return { rung: 4, question: m?.signal ?? GENERIC_SIGNAL_QUESTION };
  }
  if (!fields.rationale) {
    return { rung: 5, question: m?.reasoning ?? GENERIC_REASONING_QUESTION };
  }
  if (!fields.entity_map || fields.entity_map.length === 0) {
    return { rung: 6, question: m?.entity ?? GENERIC_ENTITY_QUESTION };
  }
  if (!fields.boundaries) {
    return { rung: 7, question: m?.boundaries ?? GENERIC_BOUNDARIES_QUESTION };
  }
  return null;
}

// ─── Prompt formatting helpers ──────────────────────────────────────────────

export type ElicitQA = { rung: number; question: string; answer: string };

export function formatRecordState(fields: PatternFields): string {
  return JSON.stringify(fields, null, 2);
}

export function formatElicitQAPairs(qaPairs: ElicitQA[]): string {
  if (qaPairs.length === 0) return "(none yet)";
  return qaPairs
    .map((p, i) => `${i + 1}. [rung ${p.rung}] Q: ${p.question}\n   A: ${p.answer}`)
    .join("\n");
}

// Merge model-extracted fields into the stored ones. Only non-empty strings
// land; the model is trusted to carry values forward, but a dropped key can
// never erase something already captured (fidelity > model hiccups). The
// entity map merges by union instead of overwrite, for the same reason.
export function mergeFields(
  current: PatternFields,
  incoming: Partial<Record<keyof PatternFields, unknown>>
): PatternFields {
  const out: PatternFields = { ...current };
  for (const key of Object.keys(EMPTY_FIELDS) as (keyof PatternFields)[]) {
    if (key === "entity_map") continue;
    const v = incoming[key];
    if (typeof v === "string" && v.trim().length > 0) {
      out[key] = v.trim();
    }
  }
  const incomingEntities = normalizeEntityMap(incoming.entity_map);
  if (incomingEntities.length > 0) {
    out.entity_map = mergeEntityMaps(current.entity_map, incomingEntities);
  }
  return out;
}

// ─── The framework artifact (pattern_records.framework) ────────────────────

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
