// P-7 — On-Demand Training Studio, Build 2: THE FORMAT LIBRARY.
//
// The L&D Format Agent's whole job is choosing WHICH SHAPE a piece of
// training should take. That choice is only credible if the reasoning is
// inspectable, so this file is the single source of truth for:
//
//   1. the format set (enum-driven — add a key here and it flows through the
//      agent prompt, the generator, the UI, and the format-outcome log with
//      no other edits),
//   2. what each format is good for and NOT good for,
//   3. the generation TEMPLATE for that format (a drill is steps + materials;
//      a scenario is setup + decision points + debrief; a job aid is a
//      one-page reference — the shapes genuinely differ),
//   4. the EVIDENCE BASIS: the named learning-science principles that justify
//      the format, each with a source. The agent may cite ONLY from this
//      catalog — a closed citation set is what keeps "the agent cites its
//      rationale" from degrading into invented references. Same credibility
//      bar as the elicitation-method router.
//
// Client-safe on purpose: constants only, no fs / no @/lib/claude — the
// Studio pages import this directly (see the "client pages must not pull
// server-only libs" gotcha).
//
// ⚠️ CUSTOMER-FACING COPY — DRAFT, PENDING BRIAN'S APPROVAL. The six format
// `name` strings and their `oneLiner` blurbs are user-visible. They are
// functional and used throughout, but are NOT final brand copy.

export type TrainingFormatKey =
  | "written_framework"
  | "hands_on_drill"
  | "scenario_walkthrough"
  | "discussion_guide"
  | "job_aid"
  | "teach_back";

export type EvidenceBasis = {
  /** The named principle — what the agent is allowed to cite. */
  principle: string;
  /** Where it comes from. Keeps the citation checkable, not decorative. */
  source: string;
  /** The one-line claim the principle supports, in plain language. */
  claim: string;
};

export type TrainingFormat = {
  key: TrainingFormatKey;
  /** CUSTOMER-FACING (draft) — the name a leader sees. */
  name: string;
  /** CUSTOMER-FACING (draft) — one line under the name. */
  oneLiner: string;
  /** Rough effort, shown next to the name so a leader can size it instantly. */
  effort: string;
  /** The problem shapes this format fits. Feeds the agent prompt verbatim. */
  bestFor: string[];
  /** The problem shapes it does NOT fit — as important as bestFor. */
  notFor: string[];
  /** The generation template — the structure the artifact must take. */
  structure: string;
  /** The closed citation catalog for this format. */
  basis: EvidenceBasis[];
};

// ─── The shared science catalog (each format cites a subset) ───────────────

const ANDRAGOGY: EvidenceBasis = {
  principle: "Adult learning (andragogy)",
  source: "Knowles, The Adult Learner",
  claim:
    "Adults engage when the material solves a problem they already own, and when their existing experience is treated as material rather than overwritten.",
};
const COGNITIVE_LOAD: EvidenceBasis = {
  principle: "Cognitive load theory",
  source: "Sweller, 1988",
  claim:
    "Working memory is the bottleneck — a format that front-loads more than a few new elements at once stops transfer regardless of content quality.",
};
const BLOOM: EvidenceBasis = {
  principle: "Bloom's taxonomy (revised)",
  source: "Anderson & Krathwohl, 2001",
  claim:
    "The format has to reach the cognitive level the problem lives at — a remember-level format can never produce apply-level or analyze-level performance.",
};
const RETRIEVAL: EvidenceBasis = {
  principle: "Retrieval practice (the testing effect)",
  source: "Roediger & Karpicke, 2006",
  claim:
    "Recalling material produces markedly more durable retention than re-reading or re-watching it.",
};
const SPACING: EvidenceBasis = {
  principle: "Spacing / distributed practice",
  source: "Cepeda et al., 2006",
  claim:
    "The same total time spread across sessions outperforms one massed block, especially for anything that must survive months.",
};
const DELIBERATE_PRACTICE: EvidenceBasis = {
  principle: "Deliberate practice",
  source: "Ericsson, Krampe & Tesch-Römer, 1993",
  claim:
    "Skill improves through repetition at the edge of current ability with immediate, specific feedback — not through exposure.",
};
const SITUATED: EvidenceBasis = {
  principle: "Situated learning / authentic context",
  source: "Lave & Wenger, 1991",
  claim:
    "Judgment transfers to the job when it is practiced in a context that resembles the job; stripped-down classroom versions transfer poorly.",
};
const APPRENTICESHIP: EvidenceBasis = {
  principle: "Cognitive apprenticeship",
  source: "Collins, Brown & Newman, 1989",
  claim:
    "Expert reasoning has to be made visible — model it, coach it, scaffold it, then fade the support.",
};
const PROTEGE: EvidenceBasis = {
  principle: "Learning by teaching (the protégé effect)",
  source: "Chase et al., 2009",
  claim:
    "Preparing to teach forces the teacher to organize the material, which exposes exactly the gaps a quiz would miss.",
};
const PERFORMANCE_SUPPORT: EvidenceBasis = {
  principle: "Performance support at the point of need",
  source: "Rossett & Schafer, Job Aids and Performance Support",
  claim:
    "For low-frequency, high-consequence tasks, a reference available at the moment of work beats memorization — you do not train what you can look up.",
};
const CONCEPTUAL_CHANGE: EvidenceBasis = {
  principle: "Conceptual change",
  source: "Posner et al., 1982",
  claim:
    "An entrenched wrong model is not displaced by being told the right one — the holder has to encounter its failure and find the alternative more useful.",
};
const GAGNE: EvidenceBasis = {
  principle: "Gagné's events of instruction",
  source: "Gagné, The Conditions of Learning",
  claim:
    "Instruction that gains attention, states the objective, presents, guides, elicits performance and gives feedback outperforms presentation alone.",
};
const KIRKPATRICK: EvidenceBasis = {
  principle: "Kirkpatrick evaluation levels",
  source: "Kirkpatrick, 1959",
  claim:
    "Training is judged at Level 4 (did the result change on the job), not Level 1 (did people like it).",
};

// ─── The library ───────────────────────────────────────────────────────────

export const TRAINING_FORMATS: Record<TrainingFormatKey, TrainingFormat> = {
  written_framework: {
    key: "written_framework",
    name: "Written framework",
    oneLiner:
      "A short written piece that names the rule, the signal behind it, and where it stops applying.",
    effort: "5-minute read",
    bestFor: [
      "a definition or understanding mismatch — two groups mean different things by the same words",
      "settled guidance that exists but has never been written down where the team can find it",
      "a concept that must be understood before any hands-on practice would even make sense",
    ],
    notFor: [
      "a physical or procedural skill — reading about a torque sequence does not produce a correct torque sequence",
      "a problem where people already know the rule and break it anyway",
    ],
    structure:
      "A written framework. Sections, in this order: THE SITUATION (when this comes up) · THE SIGNAL (what tells you you are in it) · THE RULE (the aligned answer, stated once, plainly) · WHERE IT STOPS (the boundaries — situations this rule does NOT cover) · WHERE THIS CAME FROM (attribution to the authoring expert). No exercises, no agenda, no facilitator. Target 300-500 words per altitude.",
    basis: [ANDRAGOGY, COGNITIVE_LOAD, BLOOM],
  },

  hands_on_drill: {
    key: "hands_on_drill",
    name: "Hands-on drill",
    oneLiner:
      "A short repeatable exercise run at the real workstation, with coaching cues and what good looks like.",
    effort: "15-30 minutes at the work area",
    bestFor: [
      "a procedural or physical skill where the gap is in the doing, not the knowing",
      "an error class that keeps recurring even though the correct method is already documented",
      "anything where the person needs feedback on their own attempt to improve",
    ],
    notFor: [
      "a judgment call with no single correct motion to rehearse",
      "a cross-functional disagreement — drilling one side harder does not resolve it",
    ],
    structure:
      "A hands-on drill. Sections, in this order: WHAT YOU NEED (materials, equipment, setup — concrete) · SETUP (how to stage it, 2-4 steps) · THE DRILL (numbered repetitions; state what the learner does each rep and how it gets harder) · WHAT GOOD LOOKS LIKE (the observable standard) · COACHING CUES (what the coach says in the moment) · COMMON ERRORS AND THE CORRECTION (2-4 pairs) · TIME. It must be runnable at the actual work area, not in a classroom.",
    basis: [DELIBERATE_PRACTICE, SITUATED, GAGNE],
  },

  scenario_walkthrough: {
    key: "scenario_walkthrough",
    name: "Scenario walkthrough",
    oneLiner:
      "A realistic situation the team works through together, stopping at each decision point.",
    effort: "30-45 minute session",
    bestFor: [
      "judgment under ambiguity — the answer depends on reading the situation, not on following a step",
      "a failure that came from a bad call rather than a bad execution",
      "transferring how an expert THINKS, not just what they concluded",
    ],
    notFor: [
      "a simple rule that only needs to be stated and remembered",
      "a task done under time pressure at a workstation, where a drill fits better",
    ],
    structure:
      "A scenario walkthrough. Sections, in this order: THE SETUP (a realistic situation drawn ONLY from the framework material — the shift, the state of the equipment, what is known and what is not) · WHO IS IN THE ROOM (roles) · DECISION POINT 1, 2, 3 (each: the information available at that moment, the call the group must make, then what the expert's framework says and why) · THE DEBRIEF (3-4 questions that surface the reasoning, not the answer) · WHAT TO WATCH FOR (how a facilitator knows the judgment landed). The scenario must be new — never a restatement of the example already in the framework.",
    basis: [SITUATED, APPRENTICESHIP, BLOOM],
  },

  discussion_guide: {
    key: "discussion_guide",
    name: "Discussion guide",
    oneLiner:
      "A structured conversation for getting two groups who see it differently to a shared answer.",
    effort: "45-60 minute facilitated session",
    bestFor: [
      "two teams operating on opposing understandings of the same territory",
      "a cross-functional seam where each side is locally right and the handoff is wrong",
      "an entrenched belief that being told the correct answer will not shift",
    ],
    notFor: [
      "a straightforward knowledge gap with a single settled answer — that is a written framework",
      "a skill deficit, where talking is the least efficient route to competence",
    ],
    structure:
      "A discussion guide. Sections, in this order: PURPOSE (what the room must leave agreeing on) · WHO SHOULD BE THERE (both sides of the seam, named by role) · OPENING PROMPT (a question, not a statement) · THE TWO READINGS ON THE TABLE (state each side fairly, with the situation in which each is right — never assign blame to either) · THE SEQUENCE (4-6 questions with rough timings, moving from surfacing to testing to landing) · WHERE TO LAND (the shared rule, and explicitly when each side's approach applies) · IF THE ROOM SPLITS (what the facilitator does — flag it, do not force it). Flag-never-block: the guide surfaces the disagreement, the room decides.",
    basis: [CONCEPTUAL_CHANGE, ANDRAGOGY, SITUATED],
  },

  job_aid: {
    key: "job_aid",
    name: "Job aid",
    oneLiner:
      "A one-page reference that lives where the work happens, for the moment it is needed.",
    effort: "one page, no session",
    bestFor: [
      "a low-frequency, high-consequence task — rare enough that nobody will retain it, costly enough that getting it wrong matters",
      "a sequence with a hard order or hard stop conditions",
      "reinforcing something already trained, so it survives without a refresher session",
    ],
    notFor: [
      "anything requiring judgment about which rule applies — a card cannot decide that",
      "a first exposure to a genuinely new concept",
    ],
    structure:
      "A job aid — ONE page, terse, imperative. Sections, in this order: WHEN TO USE THIS (the trigger, one line) · DO THIS (numbered steps, at most seven, each an instruction not an explanation) · CHECK (how you know it worked) · STOP IF (the boundary conditions — when to stop and escalate instead) · WHO TO CALL. No prose paragraphs. It must fit on a single sheet at the work area.",
    basis: [PERFORMANCE_SUPPORT, COGNITIVE_LOAD, SPACING],
  },

  teach_back: {
    key: "teach_back",
    name: "Teach-back session",
    oneLiner:
      "Someone who has it teaches it to someone who needs it — and the gaps show up immediately.",
    effort: "20-30 minutes, paired",
    bestFor: [
      "consolidating something already delivered, when you need to know whether it actually transferred",
      "spreading a fix from the one person who has it to the several who need it",
      "surfacing the gaps a completion checkbox would hide",
    ],
    notFor: [
      "a first exposure — there is nothing yet to teach back",
      "a contested topic where no settled answer exists to teach",
    ],
    structure:
      "A teach-back session. Sections, in this order: WHO TEACHES, WHO LISTENS · PREP FOR THE TEACHER (what to review, 10 minutes) · WHAT THEY MUST BE ABLE TO EXPLAIN (the signal, the play, the boundaries — as three explicit checkpoints) · THE TEACH-BACK PROMPT (what the teacher is asked to walk through) · WHAT THE LISTENER ASKS (3-4 probing questions the listener puts to the teacher) · WHAT A MISS MEANS (which checkpoint was missed and what to do next — never a judgment of the person). Blameless: a miss is a transfer gap, never a competence verdict.",
    basis: [PROTEGE, RETRIEVAL, KIRKPATRICK],
  },
};

export const TRAINING_FORMAT_KEYS = Object.keys(
  TRAINING_FORMATS
) as TrainingFormatKey[];

export function isTrainingFormatKey(v: unknown): v is TrainingFormatKey {
  return typeof v === "string" && (TRAINING_FORMAT_KEYS as string[]).includes(v);
}

export function formatName(key: string): string {
  return isTrainingFormatKey(key) ? TRAINING_FORMATS[key].name : key;
}

// ─── Audience (Build 1) ─────────────────────────────────────────────────────

export type AudienceExperience = "new" | "experienced" | "mixed";

export const AUDIENCE_EXPERIENCE_LABEL: Record<AudienceExperience, string> = {
  new: "New to this work",
  experienced: "Experienced",
  mixed: "Mixed experience",
};

export function isAudienceExperience(v: unknown): v is AudienceExperience {
  return v === "new" || v === "experienced" || v === "mixed";
}

/** Plain-language audience line, used in prompts and on the cards. */
export function describeAudience(a: {
  role: string | null;
  team: string | null;
  experience: string | null;
}): string {
  const bits = [a.role?.trim(), a.team?.trim()].filter(Boolean) as string[];
  const who = bits.length ? bits.join(" — ") : "the team";
  const exp = isAudienceExperience(a.experience)
    ? AUDIENCE_EXPERIENCE_LABEL[a.experience].toLowerCase()
    : null;
  return exp ? `${who} (${exp})` : who;
}

// ─── Prompt-facing catalogs ─────────────────────────────────────────────────

/**
 * The full format catalog, rendered for the Format Agent's prompt. Includes
 * the closed citation set — the agent is instructed to cite ONLY principles
 * that appear here, which is what keeps the rationale checkable.
 */
export function formatCatalogForPrompt(): string {
  return TRAINING_FORMAT_KEYS.map((key) => {
    const f = TRAINING_FORMATS[key];
    return [
      `── FORMAT KEY: ${f.key} — "${f.name}" (${f.effort})`,
      `What it is: ${f.oneLiner}`,
      `Best for:`,
      ...f.bestFor.map((b) => `  - ${b}`),
      `NOT for:`,
      ...f.notFor.map((b) => `  - ${b}`),
      `Citable evidence basis for this format. CITE USING THE QUOTED NAME ONLY — leave the source and the claim out of your citation:`,
      ...f.basis.map(
        (b) => `  - CITE AS "${b.principle}" | source: ${b.source} | what it supports: ${b.claim}`
      ),
    ].join("\n");
  }).join("\n\n");
}

/** Every principle name the agent is permitted to cite, deduped. */
export function citablePrinciples(): string[] {
  const seen = new Set<string>();
  for (const key of TRAINING_FORMAT_KEYS) {
    for (const b of TRAINING_FORMATS[key].basis) seen.add(b.principle);
  }
  return [...seen];
}

/**
 * Resolve an agent's citation back to the canonical principle name, or null
 * if it is not in the closed catalog.
 *
 * ⚠️ TOLERANT ON PURPOSE. The catalog renders each entry as
 * "Principle (Source): claim", so a model asked to cite "by principle name"
 * very reasonably returns "Spacing / distributed practice (Cepeda et al.,
 * 2006)" — the name WITH the parenthetical it just read. An exact-match
 * validator rejects that, drops every citation, and the whole
 * recommendation fails the credibility gate for no good reason. That is
 * exactly what happened on the first live run of the format re-recommendation.
 *
 * So: strip a trailing parenthetical, normalize whitespace and case, and match
 * on the principle itself. The CANONICAL name is what gets stored and shown,
 * so the closed catalog is still the only thing that can reach the UI — this
 * loosens the parser, never the catalog.
 */
export function canonicalPrinciple(raw: string): string | null {
  const strip = (v: string) =>
    v
      .replace(/\s*\([^)]*\)\s*$/, "")
      .replace(/[.,;:]+$/, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  const target = strip(raw);
  if (!target) return null;
  return citablePrinciples().find((p) => strip(p) === target) ?? null;
}

/** Lookup used when validating an agent citation against the closed set. */
export function isCitablePrinciple(name: string): boolean {
  return canonicalPrinciple(name) !== null;
}
