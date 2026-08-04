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

// ─── Capture branches — "Capture your judgment" (2026-08-03) ───────────────
// The user-facing entry to /codify is now a picker ("What are you bringing?")
// that selects an interview BRANCH by what the expert is bringing. Six
// branches (4-6 added 2026-08-03, same day as 1-3): a live problem, a past
// resolution, a general strategy, a most-asked topic, a mistake they can
// catch, or an early-warning tell. Each branch runs a tuned question script
// (prompts/capture-*.md — approved copy, near-verbatim from
// CAPTURE-JUDGMENT-interview-branches.md). The branches change the ENTRY and
// FRAMING only — all six drive to the same CDM destination (signals, the
// call, the failure mode, a concrete anchor), and the downstream
// extraction/synthesis (framePattern) is UNCHANGED.
//
// Internally every branch runs the CDM engine (trigger_type='judgment',
// method='cdm') so downstream consumers of those columns see nothing new —
// and, deliberately, so no branch feeds the Win Column ('win') or Coaching
// Watch ('concern'/'friction') side channels by accident. The Methodology
// Router below stays intact in code for in-flight legacy sessions.
//
// ⭐ THE ONE DELIBERATE EXCEPTION (Branch 7, 2026-08-04): "A win worth
// telling" (capture_type='win') runs trigger_type='win' — because the Win
// Column (src/lib/win-column.ts) aggregates ONLY trigger_type='win' records
// (wins-only blameless doctrine), and the Aug-3 branching build had left the
// column with no feed at all. Every OTHER branch still deliberately runs
// 'judgment' so a person named in a problem/mistake record can never reach a
// person-level surface. The per-branch trigger is table-driven via the
// optional `triggerType` column below (default: CAPTURE_BRANCH_TRIGGER) —
// use captureTriggerType(), never a special-case if.

export type CaptureType =
  | "current_issue"
  | "past_resolution"
  | "strategy"
  | "top_topic"
  | "common_mistake"
  | "tell_early"
  | "win";

export type CaptureOption = {
  id: CaptureType;
  /** Picker card title (approved copy). */
  label: string;
  /** Picker card subline (approved copy). */
  subline: string;
  /** prompts/<file>.md — the branch's interview script (replaces method guidance). */
  promptFile: string;
  /** Fixed rung-1 opener — instant, no model call (approved copy; the
   *  strategy opener is adapted to be self-contained, flagged DRAFT). */
  opening: string;
  /** Closing frame shown when the capture completes (approved copy). */
  closing: string;
  /** trigger_type this branch runs. Omitted = CAPTURE_BRANCH_TRIGGER
   *  ('judgment'). ONLY the win branch sets this — see the block comment at
   *  the top of this file for why that exception exists. */
  triggerType?: TriggerType;
};

export const CAPTURE_PICKER_PROMPT = "What are you bringing?";
export const CAPTURE_PICKER_MICROCOPY =
  "Either way, it takes a few minutes, and it ends as a framework with your name on it.";

export const CAPTURE_TYPES: CaptureOption[] = [
  {
    id: "current_issue",
    label: "A problem I’m facing now",
    subline: "Something on your plate right now that you know how to handle.",
    promptFile: "capture-current-issue",
    opening:
      "Tell me about the problem you’re looking at right now — the one you already know how to handle. What’s going on?",
    closing:
      "Got it. I’ll turn this into a framework in your words — so the next person who hits this doesn’t have to come find you.",
  },
  {
    id: "past_resolution",
    label: "Something I solved before",
    subline: "A problem you worked through in the past, and how it turned out.",
    promptFile: "capture-past-resolution",
    opening:
      "Walk me through something you solved — a problem you worked through, start to finish. Take me back to when it started.",
    closing:
      "That’s a good one. I’ll capture how you worked through it — so it’s not just in your head anymore.",
  },
  {
    id: "strategy",
    label: "How I approach a kind of situation",
    subline: "Your way of handling a type of problem that comes up more than once.",
    promptFile: "capture-strategy",
    opening:
      "Tell me about how you approach a kind of situation that comes up more than once. Not one specific time yet — your general way of handling it when it comes up.",
    closing:
      "That’s a complete approach now — the way you handle it, the traps, and where it’s headed when it works. Your team can apply it and know what they’re driving toward.",
  },
  {
    id: "top_topic",
    label: "Topics I get asked about the most",
    subline: "The things people keep coming to you for.",
    promptFile: "capture-top-topic",
    opening:
      "What’s the thing people keep coming to you for? If you named the question you get asked most, what would it be?",
    closing:
      "Good — that question just got a permanent answer. If your topic holds more questions like it, come back for the next one.",
  },
  {
    id: "common_mistake",
    label: "A mistake I see people make",
    subline: "Something people keep getting wrong that you know how to catch.",
    promptFile: "capture-common-mistake",
    opening:
      "What’s a mistake you keep seeing people make — something you can spot a mile away? Tell me what it looks like when it’s happening.",
    closing:
      "Captured. Now the catch travels — people can learn to see this one coming without having to make it first.",
  },
  {
    id: "tell_early",
    label: "How I tell early",
    subline: "The signs you see before a problem becomes obvious to everyone else.",
    promptFile: "capture-tell-early",
    opening:
      "Tell me about something you can see coming before anyone else does. What’s the problem, and how early do you catch it?",
    closing:
      "That’s the kind of thing that usually retires with the person who can see it. Not anymore — it’s got your name on it now.",
  },
  {
    // Branch 7 (2026-08-04) — the Win Column's feed. The ONE branch that runs
    // trigger_type='win' (see triggerType below and the file-top comment).
    // ⚠️ DRAFT CUSTOMER-FACING COPY — PENDING BRIAN'S WALK (all four strings).
    id: "win",
    label: "🏆 A win worth telling",
    subline: "Something went right. Capture how — and who made it happen.",
    promptFile: "capture-win",
    opening:
      "Tell me about a win — something that went right recently. Start with what happened.",
    closing:
      "Captured. Wins like this usually evaporate by Friday — this one’s in the library for good, with your name on it.",
    triggerType: "win",
  },
];

// ─── Grouped picker layout (2026-08-04, approved) ──────────────────────────
// Seven cards render in TWO labeled row-groups — no extra click, no new
// screen, behavior identical (layout-only; branches 1–6 byte-identical).
// Group headers are ⚠️ DRAFT COPY — PENDING BRIAN (he may rename).
export type CaptureGroup = { label: string; ids: CaptureType[] };

export const CAPTURE_GROUPS: CaptureGroup[] = [
  { label: "A moment", ids: ["win", "current_issue", "past_resolution"] },
  {
    label: "Your way of working",
    ids: ["strategy", "top_topic", "common_mistake", "tell_early"],
  },
];

export function isCaptureType(v: unknown): v is CaptureType {
  return typeof v === "string" && CAPTURE_TYPES.some((c) => c.id === v);
}

export function captureOption(t: CaptureType): CaptureOption {
  return CAPTURE_TYPES.find((c) => c.id === t)!;
}

export function captureBranchPromptFile(t: CaptureType): string {
  return captureOption(t).promptFile;
}

// Every capture branch runs the CDM engine internally (see block comment).
// CAPTURE_BRANCH_TRIGGER is the DEFAULT trigger — the win branch overrides it
// via its table entry's triggerType column (the one deliberate exception;
// file-top comment has the why). Resolve through captureTriggerType(), never
// by special-casing a branch id.
export const CAPTURE_BRANCH_TRIGGER = "judgment" as const;
export const CAPTURE_BRANCH_METHOD = "cdm" as const;

export function captureTriggerType(t: CaptureType): TriggerType {
  return captureOption(t).triggerType ?? CAPTURE_BRANCH_TRIGGER;
}

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

// Capture-branch deterministic backstop (2026-08-03). Same job as the
// method-flavored sets above, but worded from the approved branch scripts so
// even a model-failure turn stays inside the branch's arc. Branch takes
// precedence over method flavoring when both are known.
type BranchQuestionSet = MethodQuestionSet & {
  classify: string;
  call: string;
};

const CAPTURE_FALLBACK_QUESTIONS: Record<CaptureType, BranchQuestionSet> = {
  current_issue: {
    classify: "What makes this one hard? What would trip up someone who hasn’t seen it before?",
    call: "So what’s the move? Walk me through what you’d do.",
    signal:
      "What are you actually looking at to know what’s going on? The signals most people would miss.",
    reasoning: "Why that and not the obvious thing? Walk me through your reasoning.",
    entity:
      "Who’s involved in this one — who makes the call, who else is affected, and which equipment or process does it touch? Names are fine — they stay internal to your org.",
    boundaries:
      "What happens if someone gets this wrong — what’s the cost, and where would this same move be the WRONG one?",
  },
  past_resolution: {
    classify:
      "What kind of problem did this turn out to be — and what first told you something was wrong?",
    call: "What did you do about it? Walk me through the steps.",
    signal: "When did you know what was really going on? What did you see that told you?",
    reasoning:
      "Was there a point where you could’ve gone a different way? What made you choose the path you did?",
    entity:
      "Who was part of this one — who made the call, who else was involved, and which equipment or process did it touch? Names are fine — they stay internal to your org.",
    boundaries:
      "If someone on your team hit this tomorrow, what’s the one thing you’d want them to know — and when would your fix have been the wrong move?",
  },
  strategy: {
    classify: "When does this come up? How do you know you’re in this kind of situation?",
    call: "What’s your approach? The rule of thumb you go by.",
    signal: "What do you actually look at when you’re deciding — the tells that matter most?",
    reasoning: "What are you weighing when you decide? What matters most?",
    entity:
      "Who or what does this involve when it fires — which roles, processes, or equipment? A named role is fine here.",
    boundaries:
      "What do less-experienced people get wrong about this? What’s the trap — and where does this approach NOT apply?",
  },
  // Branches 4-6 (2026-08-03). The approved per-branch fallback triplets land
  // in their natural rung slots; the remaining slots are worded from the same
  // approved arc so a flaked turn still sounds like the branch. The anchor
  // fallbacks ("think of the last time…") have no slot in this ladder — the
  // deterministic net ends at boundaries; anchor drive lives in the prompt
  // files, same as branches 1-3.
  top_topic: {
    classify: "What’s the one call inside that topic people most need you for?",
    call: "What’s the full answer — the one you give when you have time to explain it right?",
    signal: "What do you check before you answer — and what changes the answer?",
    reasoning: "What does someone get wrong if they only hear the quick version?",
    entity:
      "Who keeps coming to you with this one, and which equipment or process does it touch? Names and roles are fine — they stay internal to your org.",
    boundaries:
      "When would your usual answer be the WRONG one — what condition flips it?",
  },
  common_mistake: {
    classify: "Why do reasonable people make this one? What makes it look like the right move?",
    call: "What should they do instead — and why that?",
    signal: "What tips you off that it’s happening, or about to?",
    reasoning: "Why is that the right move, and not what they were doing?",
    entity:
      "Which process or equipment does this show up in, and which roles tend to hit it? No names needed for who made it — a role is plenty.",
    boundaries:
      "What does this cost when nobody catches it — and is there a situation where what looks like this mistake is actually the right call?",
  },
  // Branch 7 (2026-08-04). AAR-flavored, past-tense, narrative-forward like
  // past_resolution. The entity slot doubles as the ⭐ People Drive fallback —
  // even a model-failure turn still asks who made the win happen and what
  // they specifically did (the Win Column context chip comes from that
  // moment, in the expert's words).
  win: {
    classify: "What kind of win was this — and what first told you it was going right?",
    call: "What was the move that made it work? Walk me through what got done.",
    signal:
      "What specifically happened that made this a win — the concrete moment or decision, not just the outcome?",
    reasoning: "Why did that work — what made it the right move rather than the default one?",
    entity:
      "Who was part of making this go right? Name them — even people outside your team — and what each of them specifically did. Names are fine — they stay internal to your org.",
    boundaries:
      "Where would this same play NOT work as well — a different team, a different starting point, a different scale?",
  },
  tell_early: {
    classify: "What kind of situation puts you on alert for this?",
    call: "Once you see it coming, what do you do that early?",
    signal: "What are the small signs — the ones that don’t look like a problem yet?",
    reasoning: "How do you know it’s the real thing and not a false alarm?",
    entity:
      "Where do the early signs show up — which equipment or process — and who acts on the warning? Names are fine — they stay internal to your org.",
    boundaries:
      "When would the same early signs point somewhere else — or acting early be the wrong move?",
  },
};

export function fallbackQuestion(
  fields: PatternFields,
  method: MethodId | null,
  captureType?: CaptureType | null
): { rung: number; question: string } | null {
  const b = captureType ? CAPTURE_FALLBACK_QUESTIONS[captureType] : null;
  const m = method ? METHOD_FALLBACK_QUESTIONS[method] : null;
  if (!fields.context_summary) {
    return {
      rung: 1,
      question: captureType ? captureOption(captureType).opening : OPENING_QUESTION,
    };
  }
  if (!fields.trigger_signal) {
    return { rung: 2, question: b?.classify ?? GENERIC_CLASSIFY_QUESTION };
  }
  if (!fields.judgment) {
    return { rung: 3, question: b?.call ?? GENERIC_CALL_QUESTION };
  }
  if (!fields.signal_detail) {
    return { rung: 4, question: b?.signal ?? m?.signal ?? GENERIC_SIGNAL_QUESTION };
  }
  if (!fields.rationale) {
    return { rung: 5, question: b?.reasoning ?? m?.reasoning ?? GENERIC_REASONING_QUESTION };
  }
  if (!fields.entity_map || fields.entity_map.length === 0) {
    return { rung: 6, question: b?.entity ?? m?.entity ?? GENERIC_ENTITY_QUESTION };
  }
  if (!fields.boundaries) {
    return { rung: 7, question: b?.boundaries ?? m?.boundaries ?? GENERIC_BOUNDARIES_QUESTION };
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
