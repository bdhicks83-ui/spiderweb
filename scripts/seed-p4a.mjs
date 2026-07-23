// P-4A Build 5 — seed the gaps + run the Prescription Engine + verify the
// DONE test against the LIVE demo org.
//
// What it plants (real pipeline — actual claude-sonnet-5 frame-pattern
// calls, same copy-don't-import harness as scripts/seed-p1-demo.mjs;
// backdated consistent with the existing seed, which spans ~2-88 days ago):
//
//   ENTITY-SIGNAL GAP (repeat error class):
//     P1 — Tom Whitfield (8 days ago, 💥 broke): 3rd-shift machining keeps
//          failing tolerance on CNC Line 5 right after restarts — the SAME
//          error class David Chen already solved on CNC Line 2
//          ("Tolerance failure — post-restart clamping drift").
//     P2 — Elena Ruiz (3 days ago, 🔁 friction): scrap reports show the
//          recurrence is weekly and localized to 3rd shift.
//     → David has it, 3rd Shift Machining needs it → micro-training.
//
//   COVERAGE GAP (dept in others' records, nothing authored):
//     P3 — Tom Whitfield (14 days ago, 🔁 friction): new-operator
//          onboarding on the press lines is ad hoc shadowing — names HR.
//     P4 — Elena Ruiz (21 days ago, ⚠️ concern): retirement wave coming,
//          no structured onboarding pipeline — names HR.
//     → HR appears in 2 experts' records, has authored nothing, and no org
//       framework covers HR's own territory → capture first (codify target).
//
//   CONFLICT-SOURCED prescription needs no new seed — it fires from the
//   planted P-2 Priya/Angela first-piece-release conflict (must be OPEN;
//   replant with `node scripts/seed-p2-conflict.mjs --force` if a live test
//   resolved it).
//
// Then it RUNS the P-4A engine (verbatim logic from src/lib/prescription.ts
// — copy-don't-import, same convention as seed-p2-conflict.mjs) and
// verifies:
//   ✓ one conflict-sourced prescription (Priya × Angela, rung ≤ 2, one-line
//     rationale, concrete pairing naming both experts)
//   ✓ one coverage-gap prescription (HR, capture_first — no invented expert)
//   ✓ one entity-signal prescription (clamping drift: David paired with
//     3rd Shift Machining, rung ≤ 2)
//   ✓ NON-gaps produce NO prescription: Quality + 2nd Shift Production
//     (single-author depts), Procurement (single record), "Die changeover
//     staging" (wins only), and the two suppressed duplicates — the
//     CNC Line 5 cluster (owned by the error class) and the first-piece
//     release process (owned by the conflict).
// Exits non-zero if any check fails.
//
// Idempotent: re-running skips records that already exist (matched on
// context_summary) and the engine upserts on dedupe keys. Pass --force to
// delete the four planted records AND all of the demo org's
// prescriptions/detections first (never touches other orgs, never touches
// the P-1/P-2 seed records).
//
// ⚠️ Requires supabase/p4a-prescription-engine.sql to have been run first.
// ⚠️ Run from Brian's PowerShell (needs live Supabase + Anthropic + Voyage).
//
// Usage: node scripts/seed-p4a.mjs [--force]
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import path from "node:path";

// ─── env (same .env.local loader as scripts/seed-p1-demo.mjs) ───
const envRaw = await readFile(path.join(process.cwd(), ".env.local"), "utf-8");
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const FORCE = process.argv.includes("--force");

const anthropic = new Anthropic();
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DEMO_ORG_NAME = "Meridian Precision Manufacturing (DEMO)";
const ERROR_CLASS = "Tolerance failure — post-restart clamping drift"; // EXACT match to David's P-1 record

// ─── verbatim helpers from src/lib/claude.ts (copy-don't-import) ───
function firstText(content) {
  const block = content.find((b) => b.type === "text");
  return block?.text ?? "";
}
function parseJson(text) {
  try {
    return JSON.parse(text.replace(/^```json?\n?|```$/g, "").trim());
  } catch {
    return null;
  }
}
function parseJsonLoose(text) {
  const direct = parseJson(text);
  if (direct !== null) return direct;
  const stripped = text.replace(/^```json?\n?|```$/g, "").trim();
  const start = stripped.search(/[{[]/);
  if (start === -1) return null;
  const open = stripped[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < stripped.length; i++) {
    const ch = stripped[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(stripped.slice(start, i + 1)); }
        catch { return null; }
      }
    }
  }
  return null;
}
function isFrameworkArtifact(v) {
  if (!v || typeof v !== "object") return false;
  const f = v;
  const isStrArr = (x) => Array.isArray(x) && x.length > 0 && x.every((s) => typeof s === "string");
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
function formatRecordState(fields) {
  return JSON.stringify(fields, null, 2);
}

const frameTemplate = await readFile(path.join(process.cwd(), "prompts", "frame-pattern.md"), "utf-8");
async function framePattern(fields) {
  const prompt = frameTemplate.replaceAll("{{record}}", () => formatRecordState(fields));
  for (let attempt = 0; attempt < 3; attempt++) {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 3072,
      messages: [{ role: "user", content: prompt }],
    });
    const text = firstText(msg.content);
    const parsed = text ? parseJsonLoose(text) : null;
    if (isFrameworkArtifact(parsed)) return parsed;
  }
  return null;
}

// ─── triage + coverage-check (verbatim logic from src/lib/claude.ts P-4A) ───
const triageTemplate = await readFile(path.join(process.cwd(), "prompts", "prescription-triage.md"), "utf-8");
async function triagePrescriptionGap(sourceType, detectionSummary, evidence) {
  const prompt = triageTemplate
    .replaceAll("{{source_type}}", () => sourceType)
    .replaceAll("{{detection_summary}}", () => detectionSummary)
    .replaceAll("{{evidence}}", () => evidence);
  for (let attempt = 0; attempt < 3; attempt++) {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });
    const text = firstText(msg.content);
    const parsed = text ? parseJsonLoose(text) : null;
    if (
      parsed &&
      typeof parsed.rung === "number" &&
      [1, 2, 3, 4].includes(parsed.rung) &&
      typeof parsed.rationale === "string" &&
      parsed.rationale.trim()
    ) {
      return {
        rung: parsed.rung,
        rationale: parsed.rationale.trim().replace(/\s*\n+\s*/g, " ").slice(0, 300),
      };
    }
  }
  return null;
}

const coverageTemplate = await readFile(path.join(process.cwd(), "prompts", "coverage-check.md"), "utf-8");
async function checkCoverageGap(department, evidence, frameworkText) {
  const prompt = coverageTemplate
    .replaceAll("{{department}}", () => department)
    .replaceAll("{{evidence}}", () => evidence)
    .replaceAll("{{framework}}", () => frameworkText);
  for (let attempt = 0; attempt < 3; attempt++) {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 384,
      messages: [{ role: "user", content: prompt }],
    });
    const text = firstText(msg.content);
    const parsed = text ? parseJsonLoose(text) : null;
    if (parsed && typeof parsed.covers === "boolean") {
      return {
        covers: parsed.covers,
        reason: typeof parsed.reason === "string" && parsed.reason.trim() ? parsed.reason.trim() : null,
      };
    }
  }
  return null;
}

// ─── Voyage query embed (same shape as scripts/verify-p3.mjs) ───
async function embedQuery(text) {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({ input: [text], model: "voyage-large-2", input_type: "query" }),
  });
  if (!res.ok) throw new Error(`Voyage ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return `[${data.data[0].embedding.join(",")}]`;
}

// ─── document embed for the planted records (P-3 auto-embed parity) ───
async function embedDocument(text) {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({ input: [text], model: "voyage-large-2", input_type: "document" }),
  });
  if (!res.ok) throw new Error(`Voyage ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return `[${data.data[0].embedding.join(",")}]`;
}

// buildPatternEmbeddingText — verbatim mirror of src/lib/pattern-embedding.ts
// (copy-don't-import; keep in sync), same as scripts/backfill-pattern-embeddings.mjs.
function buildPatternEmbeddingText(row) {
  const parts = [];
  const push = (label, value) => {
    if (value && value.trim()) parts.push(`${label}: ${value.trim()}`);
  };
  const pushList = (label, values) => {
    if (values && values.length) parts.push(`${label}: ${values.join(" · ")}`);
  };
  const f = row.framework;
  if (f) {
    push("Framework", f.name);
    push("Summary", f.tagline);
    pushList("When to apply", f.when_to_apply);
  }
  push("Situation", row.context_summary);
  const ontology = [
    row.context_industry,
    row.context_function,
    row.situation_type,
    row.intervention_type,
    row.context_org_size ? `org size ${row.context_org_size}` : null,
  ].filter(Boolean).join(" · ");
  if (ontology) parts.push(`Context: ${ontology}`);
  push("Trigger", row.trigger_signal);
  push("Signal", row.signal_detail);
  if (f) pushList("Signals", f.signals);
  push("Play", row.judgment);
  if (f) push("Play detail", f.the_play);
  push("Reasoning", row.rationale);
  if (f) push("Why it works", f.why_it_works);
  push("Boundaries", row.boundaries);
  if (f) pushList("Boundaries detail", f.boundaries);
  if (row.entity_map && row.entity_map.length) {
    const entities = row.entity_map
      .map((e) => (e.detail ? `${e.name} (${e.type}, ${e.detail})` : `${e.name} (${e.type})`))
      .join(", ");
    parts.push(`Entities: ${entities}`);
  }
  return parts.join("\n");
}

// ─── qa transcript builder (verbatim wording from seed-p1-demo.mjs) ───
const METHOD_Q = {
  "5whys_fishbone": {
    signal: "What broke, specifically — what did you see, hear, or measure that told you something had failed?",
    reasoning: "Why did that actually cause the failure — walk the chain of causes, not just the first domino.",
    entity: "Which machine or equipment, which process step, and what error type was this? Name the specific asset if there is one.",
    boundaries: "Where would this same fix NOT hold — a different machine, a different failure mode, a different scale?",
  },
  a3: {
    signal: "What specifically keeps recurring — the concrete gap between what should happen and what actually does?",
    reasoning: "Why does that gap keep recurring instead of getting fixed for good?",
    entity: "Which process, department, or role does this friction keep showing up in?",
    boundaries: "Where does this correction NOT apply — a different process, or a different root cause?",
  },
  premortem: {
    signal: "What specifically are you worried could go wrong — the concrete failure mode, not just a general worry?",
    reasoning: "Why is that risk real — what would have to be true for it to actually happen?",
    entity: "What equipment, process, team, or department would bear this risk if it played out?",
    boundaries: "Under what conditions would this risk NOT apply, or your mitigation fail?",
  },
};
const OPENING_QUESTION =
  "Think of a recent situation you'd want captured — the one you just flagged. " +
  "To start: roughly how big is the org, what part of the business, and what was going on?";
const GENERIC_CLASSIFY = "What did you observe that told you something needed to change — what prompted your involvement?";
const GENERIC_CALL = "What did you recommend, or what call did you make?";

function buildQaPairs(fields, method) {
  const m = METHOD_Q[method];
  const entityNames = fields.entity_map.map((e) => e.name).join(", ");
  return [
    { rung: 1, question: OPENING_QUESTION, answer: fields.context_summary },
    { rung: 2, question: GENERIC_CLASSIFY, answer: fields.trigger_signal },
    { rung: 3, question: GENERIC_CALL, answer: fields.judgment },
    { rung: 4, question: m.signal, answer: fields.signal_detail },
    { rung: 5, question: m.reasoning, answer: fields.rationale },
    { rung: 6, question: m.entity, answer: entityNames },
    { rung: 7, question: m.boundaries, answer: fields.boundaries },
  ];
}

// ─── the four planted records ───
const PLANTED = [
  {
    expertEmail: "tom.whitfield@meridian-demo.example",
    daysAgo: 8,
    trigger_type: "broke",
    method: "5whys_fishbone",
    context_summary:
      "Sr. Manager of Maintenance was called to 3rd-shift machining after CNC Line 5 failed final tolerance on a run of brackets right after a mid-shift restart.",
    context_org_size: "200-1000",
    context_function: "Ops",
    situation_type: "Process failure",
    intervention_type: "Measure",
    trigger_signal:
      "CNC Line 5 on 3rd shift scrapped a run of parts that failed tolerance checks, all machined in the first half hour after the machine came back up from an unplanned stop.",
    signal_detail:
      "The failed parts all drifted in the same direction by nearly the same amount, and every one of them came out of the window right after the restart — the same cold-fixture signature engineering documented on CNC Line 2's bracket fixture. 3rd shift restarts machines more than anyone because they absorb the maintenance windows, but nobody on that crew had ever heard of the warm-up cycle 1st shift's Line 2 runs.",
    judgment:
      "Stop treating it as an operator technique problem and get 3rd-shift machining onto the same post-restart warm-up discipline engineering proved out on Line 2, instead of re-investigating from scratch.",
    rationale:
      "The failure signature matched a root cause the plant has already paid to find once — thermal drift in the fixture after a cold start. Re-running a full investigation would spend a week rediscovering an answer that already exists two lines over; the actual gap is that the fix never traveled to the shift that restarts machines the most.",
    boundaries:
      "This only holds when the scrap clusters right after restarts and drifts consistently in one direction — random scatter through the shift points at technique or tooling wear, not thermal drift, and would deserve the full investigation.",
    entity_map: [
      { type: "error_class", name: "Tolerance failure — post-restart clamping drift", detail: null },
      { type: "equipment_asset", name: "CNC Line 5", detail: "3rd-shift machining" },
      { type: "department", name: "3rd Shift Machining", detail: null },
    ],
  },
  {
    expertEmail: "elena.ruiz@meridian-demo.example",
    daysAgo: 3,
    trigger_type: "friction",
    method: "a3",
    context_summary:
      "VP Operations reviewed weekly scrap reports and found 3rd-shift machining's first-hour tolerance failures recurring for the fourth straight week despite the same failure being solved on another line months ago.",
    context_org_size: "200-1000",
    context_function: "Leadership",
    situation_type: "Process failure",
    intervention_type: "Re-skill",
    trigger_signal:
      "Four consecutive weekly scrap reports showed the same pattern: 3rd-shift machining scrap concentrated in the first hour after restarts, on CNC Line 5, while the equivalent number on 1st shift's lines stayed near zero.",
    signal_detail:
      "The gap between shifts was the tell — the machines are comparable, the parts are comparable, but 1st shift runs the post-restart warm-up David's team built after the Line 2 investigation and 3rd shift doesn't. The knowledge exists in the building and even in the library; it just never crossed the shift boundary, because 3rd shift wasn't there when it rolled out and nothing in their standard work points to it.",
    judgment:
      "Treat this as a knowledge-transfer failure, not an equipment problem: get the existing warm-up practice formally trained onto 3rd-shift machining rather than commissioning any new engineering work.",
    rationale:
      "When one shift has near-zero scrap on the identical failure mode another shift keeps eating weekly, the delta is transfer, not technology. Every week the training doesn't happen costs real scrap; a new investigation would cost more and conclude what we already know.",
    boundaries:
      "If the shifts' scrap rates converge after training, this read was right; if 3rd shift keeps scrapping after adopting the warm-up, the drift on Line 5 is mechanically different from Line 2's and DOES deserve fresh engineering — don't keep re-prescribing training past one honest attempt.",
    entity_map: [
      { type: "error_class", name: "Tolerance failure — post-restart clamping drift", detail: null },
      { type: "equipment_asset", name: "CNC Line 5", detail: null },
      { type: "department", name: "3rd Shift Machining", detail: null },
    ],
  },
  {
    expertEmail: "tom.whitfield@meridian-demo.example",
    daysAgo: 14,
    trigger_type: "friction",
    method: "a3",
    context_summary:
      "Sr. Manager of Maintenance flagged that new press-line operators keep arriving on the floor with no structured onboarding — each one learns by shadowing whoever happens to be free, and maintenance keeps absorbing the fallout.",
    context_org_size: "200-1000",
    context_function: "Ops",
    situation_type: "Talent",
    intervention_type: "Add",
    trigger_signal:
      "Three new press operators started in the last quarter and each was onboarded completely differently — one shadowed Marcus for two weeks, one got a day with a lead borrowed from 1st shift, one was effectively self-taught from the standard work binder.",
    signal_detail:
      "The maintenance queue is where the difference shows up: the operator who shadowed Marcus generates almost no avoidable work orders, while the self-taught one has already caused two die-setting callouts that were pure onboarding gaps, not aptitude. Nobody owns what a new press operator must actually be taught — HR runs the paperwork day and then hands them to whichever shift is shortest-staffed.",
    judgment:
      "Push for a defined onboarding path for press operators — a named owner, a checklist of what must be taught and by whom, and a sign-off — instead of letting each shift improvise per hire.",
    rationale:
      "Onboarding quality is currently a lottery decided by who happens to be free the week someone starts, and the plant pays for losing tickets through maintenance callouts and scrap. A defined path costs a few days to write and removes the variance at its source.",
    boundaries:
      "This is about roles with real equipment risk — press and CNC operators. Office and support roles don't generate this failure mode, and over-formalizing their onboarding would be process for its own sake.",
    entity_map: [
      { type: "department", name: "HR", detail: "owns onboarding hand-off" },
      { type: "process", name: "New operator onboarding", detail: "press lines" },
      { type: "role_person", name: "New press operators", detail: null },
    ],
  },
  {
    expertEmail: "elena.ruiz@meridian-demo.example",
    daysAgo: 21,
    trigger_type: "concern",
    method: "premortem",
    context_summary:
      "VP Operations raised a concern ahead of a known retirement wave: five of the plant's most senior operators and leads reach retirement eligibility within eighteen months, and there is no structured onboarding or knowledge-handoff pipeline to absorb their replacements.",
    context_org_size: "200-1000",
    context_function: "Leadership",
    situation_type: "Transition/succession",
    intervention_type: "Add",
    trigger_signal:
      "An HR eligibility report showed five senior floor people — including two shift leads — able to retire within eighteen months, while the plant's only onboarding mechanism for their replacements is informal shadowing that depends on the very people who are leaving.",
    signal_detail:
      "The failure mode isn't the retirements themselves — it's that our onboarding IS those people. Every new hire learns by shadowing a veteran; when the veterans go, the mechanism goes with them. HR's part of onboarding ends at paperwork and safety, and no one has ever written down what the floor half of onboarding must cover, so we'd be rebuilding it from nothing exactly when we have the least slack to do it.",
    judgment:
      "Stand up a structured onboarding and knowledge-handoff pipeline BEFORE the retirement window opens — defined curriculum per role, veterans teaching it while they're still here — rather than reacting hire by hire after they leave.",
    rationale:
      "The cost asymmetry is stark: building the pipeline now uses veterans we still have as teachers; building it after they retire means paying consultants to reverse-engineer what our own people knew. Succession risk compounds quietly and then lands all at once.",
    boundaries:
      "This urgency applies to the roles the retirement report actually names — senior operators and shift leads. It's not a case for formalizing every role's onboarding at once, and if the eligibility report shifts (people staying longer), the timeline relaxes with it.",
    entity_map: [
      { type: "department", name: "HR", detail: null },
      { type: "process", name: "New operator onboarding", detail: "knowledge handoff from retiring veterans" },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// Engine — verbatim logic from src/lib/prescription.ts (copy-don't-import).
// If you change the TS module, keep this in sync.
// ═══════════════════════════════════════════════════════════════════════════

const RUNGS = {
  1: { label: "Clarification card", effort: "2-min read" },
  2: { label: "Micro-training", effort: "15-min session" },
  3: { label: "Designed session", effort: "facilitated session" },
  4: { label: "Full curriculum", effort: "multi-session program" },
};
const RUNG_CEILING = { conflict: 2, entity_signal: 3, coverage_gap: 4 };
const COVERAGE_SIMILARITY_THRESHOLD = 0.75;

function normalizeEntityName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}
function entityKey(e) {
  return `${e.type}|${normalizeEntityName(e.name)}`;
}
function departmentGroupKeys(names) {
  const tokenSets = names.map((n) => ({
    name: n,
    tokens: new Set(normalizeEntityName(n).split(" ").filter(Boolean)),
  }));
  const keyFor = new Map();
  for (const a of tokenSets) {
    let canonical = a.name;
    for (const b of tokenSets) {
      if (a === b) continue;
      const aInB = [...a.tokens].every((t) => b.tokens.has(t));
      const bInA = [...b.tokens].every((t) => a.tokens.has(t));
      if (aInB || bInA) {
        const shorter =
          a.tokens.size === b.tokens.size
            ? [a.name, b.name].sort()[0]
            : a.tokens.size < b.tokens.size ? a.name : b.name;
        if (normalizeEntityName(shorter).length < normalizeEntityName(canonical).length) {
          canonical = shorter;
        }
      }
    }
    keyFor.set(a.name, normalizeEntityName(canonical));
  }
  return keyFor;
}
const DEPT_FUNCTION_RULES = [
  [/procure|purchas|sourcing|supply|vendor/, "Supply chain"],
  [/financ|controller|account|budget/, "Finance"],
  [/quality|\bqc\b|\bqa\b|inspection/, "Quality"],
  [/\bhr\b|people|talent|recruit/, "HR/People"],
  [/leadership|executive|c.suite/, "Leadership"],
  [/production|shift|machining|maintenance|press|assembly|receiving|shipping|warehouse|ops|operations|engineering|tooling|plant/, "Ops"],
];
function functionForDepartment(name) {
  const n = normalizeEntityName(name);
  for (const [re, fn] of DEPT_FUNCTION_RULES) {
    if (re.test(n)) return fn;
  }
  return null;
}
function formatEvidenceForTriage(records, authorName) {
  return records
    .map((r, i) => {
      const entities = (r.entity_map || [])
        .map((e) => `${e.type}: ${e.name}${e.detail ? ` (${e.detail})` : ""}`)
        .join("; ");
      return [
        `--- Record ${i + 1} · ${authorName(r.user_id)} · ${new Date(r.created_at).toLocaleDateString("en-US")} · trigger=${r.trigger_type ?? "?"} ---`,
        r.framework ? `Framework: ${r.framework.name} — ${r.framework.tagline}` : "Framework: (none rendered)",
        `Context: ${r.context_summary ?? "(none)"}`,
        `Signal: ${r.trigger_signal ?? "(none)"}`,
        `Judgment (the play): ${r.judgment ?? "(none)"}`,
        `Boundaries: ${r.boundaries ?? "(none)"}`,
        `Entities: ${entities || "(none)"}`,
      ].join("\n");
    })
    .join("\n\n");
}

function detectConflictSignals(conflicts, recordById, authorName) {
  const out = [];
  for (const c of conflicts) {
    const a = recordById.get(c.record_a_id);
    const b = recordById.get(c.record_b_id);
    if (!a || !b) continue;
    if (c.status === "resolved" && c.resolution_depth_ok !== true) continue;
    const bKeys = new Set((b.entity_map || []).map(entityKey));
    const shared = (a.entity_map || []).filter((e) => bKeys.has(entityKey(e)));
    const territory = c.territory ?? "the same territory";
    const summary =
      c.status === "open"
        ? `Two experts' live frameworks collide on ${territory}: "${a.framework?.name ?? "(framework)"}" (${authorName(a.user_id)}) vs "${b.framework?.name ?? "(framework)"}" (${authorName(b.user_id)}) — teams downstream may be operating on opposing understandings.`
        : `The conflict on ${territory} between ${authorName(a.user_id)} and ${authorName(b.user_id)} was resolved (${c.resolution}) — settled guidance exists but hasn't been pushed to the affected teams.`;
    out.push({
      dedupeKey: `conflict:${c.id}`,
      sourceType: "conflict",
      summary,
      detail: `Detector rationale (conflict-xray-v1): ${c.rationale}${c.status === "resolved" && c.resolution_note ? ` · Resolution note: ${c.resolution_note}` : ""}`,
      subjectEntities: shared,
      evidenceRecordIds: [a.id, b.id],
      conflictId: c.id,
      recurrence: 2,
    });
  }
  return out;
}

function detectEntitySignals(records, conflicts) {
  const byEntity = new Map();
  for (const r of records) {
    for (const e of r.entity_map || []) {
      if (e.type !== "error_class" && e.type !== "equipment_asset" && e.type !== "process") continue;
      const key = entityKey(e);
      const cur = byEntity.get(key);
      if (cur) {
        if (!cur.records.some((x) => x.id === r.id)) cur.records.push(r);
      } else {
        byEntity.set(key, { entity: e, records: [r] });
      }
    }
  }
  const isTrouble = (r) => r.trigger_type === "broke" || r.trigger_type === "friction";
  const conflictPairs = new Set(
    conflicts.map((c) => [c.record_a_id, c.record_b_id].sort().join("|"))
  );
  const errorClassEvidence = [];
  const errorCandidates = [];
  const clusterCandidates = [];
  let suppressed = 0;
  for (const [, { entity, records: recs }] of byEntity) {
    const sorted = [...recs].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    if (entity.type === "error_class") {
      if (recs.length < 2 || !recs.some(isTrouble)) continue;
      const evidence = new Set(sorted.map((r) => r.id));
      errorClassEvidence.push(evidence);
      const authors = new Set(sorted.map((r) => r.user_id));
      const solver = sorted.find(
        (r) => r.framework && (r.trigger_type === "broke" || r.trigger_type === "win")
      );
      errorCandidates.push({
        dedupeKey: `entity:error_class:${normalizeEntityName(entity.name)}`,
        sourceType: "entity_signal",
        summary: `Error class "${entity.name}" recurs across ${recs.length} records from ${authors.size} expert${authors.size === 1 ? "" : "s"}${solver ? ` — a codified fix already exists ("${solver.framework.name}")` : " — no codified fix exists yet"}.`,
        detail: solver
          ? `Earliest codified record on this error class: ${solver.id} (${new Date(solver.created_at).toLocaleDateString("en-US")}). Later records still hitting it are the recurrence evidence.`
          : "No record carrying this error class has a framework that solves it — capture territory.",
        subjectEntities: [entity],
        evidenceRecordIds: sorted.map((r) => r.id),
        conflictId: null,
        recurrence: recs.length,
      });
    } else {
      const trouble = sorted.filter(isTrouble);
      if (trouble.length < 2) continue;
      clusterCandidates.push({
        dedupeKey: `entity:${entity.type}:${normalizeEntityName(entity.name)}`,
        sourceType: "entity_signal",
        summary: `"${entity.name}" (${entity.type === "equipment_asset" ? "asset" : "process"}) appears in ${trouble.length} failure/friction records — a trouble cluster.`,
        detail: null,
        subjectEntities: [entity],
        evidenceRecordIds: trouble.map((r) => r.id),
        conflictId: null,
        recurrence: trouble.length,
      });
    }
  }
  const kept = [...errorCandidates];
  for (const c of clusterCandidates) {
    const evidence = c.evidenceRecordIds;
    const pairKey = [...evidence].sort().join("|");
    if (evidence.length === 2 && conflictPairs.has(pairKey)) { suppressed++; continue; }
    const subsumed = errorClassEvidence.some((set) => evidence.every((id) => set.has(id)));
    if (subsumed) { suppressed++; continue; }
    kept.push(c);
  }
  return { candidates: kept, suppressed };
}

async function detectCoverageGaps(orgId, records, authorName, summaryOut) {
  const rawNames = [];
  for (const r of records) {
    for (const e of r.entity_map || []) {
      if (e.type === "department") rawNames.push(e.name);
    }
  }
  const canonicalFor = departmentGroupKeys([...new Set(rawNames)]);
  const groups = new Map();
  for (const r of records) {
    for (const e of r.entity_map || []) {
      if (e.type !== "department") continue;
      const key = canonicalFor.get(e.name) ?? normalizeEntityName(e.name);
      const g = groups.get(key) ?? { names: new Map(), records: [] };
      g.names.set(e.name, (g.names.get(e.name) ?? 0) + 1);
      if (!g.records.some((x) => x.id === r.id)) g.records.push(r);
      groups.set(key, g);
    }
  }
  const functionsPresent = new Set(records.map((r) => r.context_function).filter(Boolean));
  const out = [];
  for (const [, g] of groups) {
    const authors = new Set(g.records.map((r) => r.user_id));
    if (g.records.length < 2 || authors.size < 2) continue;
    const displayName = [...g.names.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const fn = functionForDepartment(displayName);
    if (!fn) { summaryOut.coverageSkippedUnmapped++; continue; }
    if (functionsPresent.has(fn)) continue;
    const evidenceSnippets = g.records
      .slice(0, 4)
      .map((r) => `${r.trigger_signal ?? r.context_summary ?? ""}`.slice(0, 240))
      .filter(Boolean)
      .join(" · ");
    const query =
      `How the ${displayName} team itself decides and runs its own work. ` +
      `Situations where ${displayName} keeps coming up: ${evidenceSnippets}`;
    let vector;
    try {
      vector = await embedQuery(query);
    } catch (err) {
      console.warn(`  coverage embed failed for ${displayName}: ${err.message}`);
      summaryOut.coverageEmbedFailures++;
      continue;
    }
    const { data: matches, error } = await supabase.rpc(
      "search_pattern_records_by_query_for_org",
      { target_org: orgId, query_embedding: vector, match_count: 3 }
    );
    if (error) {
      console.warn(`  coverage RPC failed for ${displayName}: ${error.message}`);
      summaryOut.coverageEmbedFailures++;
      continue;
    }
    const top = (matches || [])[0] ?? null;
    let nearMissNote = null;
    if (top && top.similarity >= COVERAGE_SIMILARITY_THRESHOLD) {
      const near = records.find((r) => r.id === top.id);
      const nearText = near ? formatEvidenceForTriage([near], authorName) : "(record not in scope)";
      const evidenceText = formatEvidenceForTriage(g.records.slice(0, 4), authorName);
      const judgement = near ? await checkCoverageGap(displayName, evidenceText, nearText) : null;
      if (!judgement || judgement.covers) {
        console.log(`  coverage: ${displayName} suppressed — nearest framework covers (sim ${top.similarity.toFixed(3)})`);
        summaryOut.coverageSkippedCovered++;
        continue;
      }
      nearMissNote = `Closest framework "${near?.framework?.name ?? top.id}" (similarity ${Math.round(top.similarity * 1000) / 1000}) is adjacent but not covering: ${judgement.reason ?? "it belongs to a neighboring team's side of the territory"}`;
    } else if (top) {
      nearMissNote = `Nearest framework similarity ${Math.round(top.similarity * 1000) / 1000} — below the ${COVERAGE_SIMILARITY_THRESHOLD} threshold; nothing in the org is close to this territory.`;
    }
    const sorted = [...g.records].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    out.push({
      dedupeKey: `coverage:department:${normalizeEntityName(displayName)}`,
      sourceType: "coverage_gap",
      summary: `${displayName} appears in ${g.records.length} records from ${authors.size} different experts but has no codified frameworks of its own (no ${fn} records in the org).`,
      detail: nearMissNote,
      subjectEntities: [{ type: "department", name: displayName, detail: null }],
      evidenceRecordIds: sorted.map((r) => r.id),
      conflictId: null,
      recurrence: g.records.length,
    });
  }
  return out;
}

function departmentsIn(records) {
  const seen = new Map();
  for (const r of records) {
    for (const e of r.entity_map || []) {
      if (e.type !== "department") continue;
      const k = entityKey(e);
      if (!seen.has(k)) seen.set(k, e);
    }
  }
  return [...seen.values()];
}

function buildPairing(candidate, evidence, rung, authorName, conflict) {
  const rungLabel = RUNGS[rung]?.label ?? `Rung ${rung}`;
  if (candidate.sourceType === "conflict" && conflict) {
    const a = evidence.find((r) => r.id === conflict.record_a_id);
    const b = evidence.find((r) => r.id === conflict.record_b_id);
    const audienceEntities = departmentsIn(evidence);
    const audience = audienceEntities.map((e) => e.name).join(" + ") || "both experts' teams";
    const nameA = a ? authorName(a.user_id) : "Expert A";
    const nameB = b ? authorName(b.user_id) : "Expert B";
    const pairingSummary =
      conflict.status === "open"
        ? `Pair ${nameA} with ${nameB} — ${rungLabel} for ${audience}: both sides of the contested "${conflict.territory ?? "shared"}" guidance, and exactly when each applies, until the conflict is resolved.`
        : `Pair ${nameA} with ${nameB} — ${rungLabel} for ${audience}: push the resolved "${conflict.territory ?? "shared"}" guidance (${conflict.resolution}) to both teams.`;
    return {
      experts: [
        ...(a ? [{ user_id: a.user_id, record_id: a.id }] : []),
        ...(b ? [{ user_id: b.user_id, record_id: b.id }] : []),
      ],
      captureFirst: false,
      audience,
      audienceEntities,
      pairingSummary,
    };
  }
  if (candidate.sourceType === "entity_signal") {
    const sorted = [...evidence].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const solver = sorted.find(
      (r) => r.framework && (r.trigger_type === "broke" || r.trigger_type === "win")
    );
    const others = sorted.filter((r) => r.id !== solver?.id);
    const audienceEntities = departmentsIn(others);
    const audience =
      audienceEntities.map((e) => e.name).join(" + ") || "the team(s) in the recurrence records";
    const subject = candidate.subjectEntities[0]?.name ?? "this recurring issue";
    if (!solver) {
      return {
        experts: [],
        captureFirst: true,
        audience,
        audienceEntities,
        pairingSummary: `Capture first — "${subject}" keeps recurring but nobody has codified a fix. Codify target: run an elicitation session with whoever last beat it before designing any training.`,
      };
    }
    return {
      experts: [{ user_id: solver.user_id, record_id: solver.id }],
      captureFirst: false,
      audience,
      audienceEntities,
      pairingSummary: `Pair ${authorName(solver.user_id)} with ${audience} — ${rungLabel} built from "${solver.framework.name}": they already solved "${subject}"; the recurrence evidence says ${audience} is still hitting it.`,
    };
  }
  const dept = candidate.subjectEntities[0]?.name ?? "this department";
  return {
    experts: [],
    captureFirst: true,
    audience: dept,
    audienceEntities: candidate.subjectEntities,
    pairingSummary: `Capture first — no one has codified how ${dept} runs its own work, yet ${dept} keeps appearing in other experts' records. Codify target: run elicitation sessions with ${dept} before any ${rungLabel.toLowerCase()} can honestly be built.`,
  };
}

async function runPrescriptionEngine(orgId) {
  const summary = {
    records: 0, conflictsConsidered: 0, candidates: 0, suppressed: 0,
    coverageSkippedCovered: 0, coverageSkippedUnmapped: 0, coverageEmbedFailures: 0,
    detectionsNew: 0, detectionsExisting: 0, triaged: 0, triageFailed: 0,
    triageSkippedCap: 0, prescriptionsNew: 0,
  };
  const { data: recordsRaw, error: recError } = await supabase
    .from("pattern_records")
    .select("id, user_id, org_id, created_at, trigger_type, context_summary, context_function, situation_type, intervention_type, trigger_signal, signal_detail, judgment, rationale, boundaries, entity_map, framework")
    .eq("org_id", orgId)
    .eq("status", "complete");
  if (recError) throw new Error(`Could not load org records: ${recError.message}`);
  const records = recordsRaw || [];
  summary.records = records.length;
  const recordById = new Map(records.map((r) => [r.id, r]));

  const { data: conflictsRaw, error: cError } = await supabase
    .from("framework_conflicts")
    .select("id, record_a_id, record_b_id, status, territory, rationale, resolution, resolution_note, resolution_depth_ok")
    .eq("org_id", orgId);
  if (cError) throw new Error(`Could not load conflicts: ${cError.message}`);
  const conflicts = conflictsRaw || [];
  summary.conflictsConsidered = conflicts.length;

  const authorIds = [...new Set(records.map((r) => r.user_id))];
  const nameById = new Map();
  if (authorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles").select("id, display_name").in("id", authorIds);
    for (const p of profiles || []) {
      if (p.display_name) nameById.set(p.id, p.display_name);
    }
  }
  const authorName = (userId) => nameById.get(userId) ?? "an org expert";

  const conflictCandidates = detectConflictSignals(conflicts, recordById, authorName);
  const { candidates: entityCandidates, suppressed } = detectEntitySignals(records, conflicts);
  summary.suppressed = suppressed;
  const coverageCandidates = await detectCoverageGaps(orgId, records, authorName, summary);
  const candidates = [...conflictCandidates, ...entityCandidates, ...coverageCandidates];
  summary.candidates = candidates.length;
  console.log(`  ${candidates.length} detection candidate(s): ${candidates.map((c) => c.dedupeKey).join(" · ") || "(none)"}`);
  if (suppressed) console.log(`  ${suppressed} duplicate cluster(s) suppressed (owned by an error class or a conflict)`);
  if (candidates.length === 0) return summary;

  const { error: upsertError } = await supabase.from("prescription_detections").upsert(
    candidates.map((c) => ({
      org_id: orgId,
      source_type: c.sourceType,
      dedupe_key: c.dedupeKey,
      subject_entities: c.subjectEntities,
      evidence_record_ids: c.evidenceRecordIds,
      conflict_id: c.conflictId,
      summary: c.summary,
      detail: c.detail,
      recurrence: c.recurrence,
    })),
    { onConflict: "org_id,dedupe_key", ignoreDuplicates: true }
  );
  if (upsertError) throw new Error(`Could not write detections: ${upsertError.message}`);

  const { data: detectionRows, error: readBackError } = await supabase
    .from("prescription_detections")
    .select("id, dedupe_key, source_type, summary, detail, evidence_record_ids, conflict_id, recurrence, status")
    .eq("org_id", orgId)
    .in("dedupe_key", candidates.map((c) => c.dedupeKey));
  if (readBackError) throw new Error(`Could not read detections back: ${readBackError.message}`);

  const { data: existingRx } = await supabase
    .from("prescriptions").select("detection_id").eq("org_id", orgId);
  const alreadyPrescribed = new Set((existingRx || []).map((r) => r.detection_id));
  const candidateByKey = new Map(candidates.map((c) => [c.dedupeKey, c]));
  const conflictById = new Map(conflicts.map((c) => [c.id, c]));

  for (const d of detectionRows || []) {
    if (alreadyPrescribed.has(d.id)) { summary.detectionsExisting++; continue; }
    if (d.status === "dismissed") continue;
    summary.detectionsNew++;
    const evidence = d.evidence_record_ids
      .map((id) => recordById.get(id))
      .filter(Boolean);
    if (evidence.length === 0) continue;
    const evidenceText = formatEvidenceForTriage(evidence, authorName);
    const triage = await triagePrescriptionGap(d.source_type, d.summary, evidenceText);
    if (!triage) {
      console.warn(`  triage FAILED for ${d.dedupe_key} — detection stays open (fail open, no prescription)`);
      summary.triageFailed++;
      continue;
    }
    summary.triaged++;
    const ceiling = RUNG_CEILING[d.source_type];
    let rung = triage.rung;
    let rationale = triage.rationale;
    if (rung > ceiling) {
      rung = ceiling;
      rationale = `${rationale} [clamped from rung ${triage.rung} to ${ceiling} — ${d.source_type} detections cap at ${RUNGS[ceiling].label}]`;
    }
    const candidate = candidateByKey.get(d.dedupe_key);
    const pairing = buildPairing(
      candidate ?? {
        dedupeKey: d.dedupe_key, sourceType: d.source_type, summary: d.summary,
        detail: d.detail, subjectEntities: [], evidenceRecordIds: d.evidence_record_ids,
        conflictId: d.conflict_id, recurrence: d.recurrence,
      },
      evidence, rung, authorName,
      d.conflict_id ? (conflictById.get(d.conflict_id) ?? null) : null
    );
    const recurrence = d.recurrence;
    const severity = rung;
    const roi = recurrence * severity;
    const rankRationale = `${recurrence} evidence record${recurrence === 1 ? "" : "s"} × severity ${severity} (${RUNGS[rung].label}) = ROI ${roi}`;
    const { error: rxError } = await supabase.from("prescriptions").upsert(
      {
        org_id: orgId, detection_id: d.id, rung, rung_rationale: rationale,
        gap_summary: d.summary, experts: pairing.experts,
        capture_first: pairing.captureFirst, audience: pairing.audience,
        audience_entities: pairing.audienceEntities,
        pairing_summary: pairing.pairingSummary,
        recurrence, severity, roi_score: roi, rank_rationale: rankRationale,
      },
      { onConflict: "detection_id", ignoreDuplicates: true }
    );
    if (rxError) {
      console.warn(`  prescription insert skipped (${d.dedupe_key}): ${rxError.message}`);
      continue;
    }
    await supabase.from("prescription_detections").update({ status: "prescribed" }).eq("id", d.id);
    summary.prescriptionsNew++;
    console.log(`  ✓ rung ${rung} (${RUNGS[rung].label}) — ${d.dedupe_key}`);
    console.log(`    why: ${rationale}`);
    console.log(`    pairing: ${pairing.pairingSummary}`);
  }
  return summary;
}

// ═══ main ═══════════════════════════════════════════════════════════════════

async function main() {
  const { data: org } = await supabase
    .from("orgs").select("id").eq("name", DEMO_ORG_NAME).maybeSingle();
  if (!org) throw new Error(`Demo org "${DEMO_ORG_NAME}" not found — run scripts/seed-p1-demo.mjs first.`);
  const orgId = org.id;
  console.log(`Demo org: "${DEMO_ORG_NAME}" → ${orgId}`);

  // ─── --force: clear planted records + ALL demo-org prescriptions/detections ───
  if (FORCE) {
    console.log(`--force: clearing demo-org prescriptions + detections + the 4 planted P-4A records...`);
    await supabase.from("prescriptions").delete().eq("org_id", orgId);
    await supabase.from("prescription_detections").delete().eq("org_id", orgId);
    const { data: planted } = await supabase
      .from("pattern_records")
      .select("id")
      .eq("org_id", orgId)
      .in("context_summary", PLANTED.map((p) => p.context_summary));
    const ids = (planted || []).map((r) => r.id);
    if (ids.length > 0) {
      await supabase.from("pattern_records").delete().in("id", ids);
      console.log(`  deleted ${ids.length} planted record(s).`);
    }
  }

  // ─── resolve seeded experts ───
  const emails = [...new Set(PLANTED.map((p) => p.expertEmail))];
  const userIdByEmail = {};
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    for (const u of data.users) {
      if (emails.includes(u.email)) userIdByEmail[u.email] = u.id;
    }
    if (data.users.length < 200) break;
    page++;
  }
  for (const email of emails) {
    if (!userIdByEmail[email]) throw new Error(`Seeded expert ${email} not found — run seed-p1-demo.mjs first.`);
  }

  // ─── plant the 4 records via the real pipeline (idempotent) ───
  const now = Date.now();
  for (const rec of PLANTED) {
    const { data: existing } = await supabase
      .from("pattern_records")
      .select("id")
      .eq("org_id", orgId)
      .eq("context_summary", rec.context_summary)
      .maybeSingle();
    if (existing) {
      console.log(`Already planted (${rec.expertEmail}, ${rec.daysAgo}d ago): ${existing.id} — skipping.`);
      continue;
    }
    const fields = {
      context_summary: rec.context_summary,
      context_org_size: rec.context_org_size,
      context_industry: "Manufacturing",
      context_function: rec.context_function,
      situation_type: rec.situation_type,
      intervention_type: rec.intervention_type,
      trigger_signal: rec.trigger_signal,
      signal_detail: rec.signal_detail,
      judgment: rec.judgment,
      rationale: rec.rationale,
      boundaries: rec.boundaries,
      entity_map: rec.entity_map,
    };
    console.log(`Framing "${fields.context_summary.slice(0, 60)}..." (${rec.expertEmail}, ${rec.trigger_type}/${rec.method})`);
    const framework = await framePattern(fields);
    if (!framework) throw new Error("framePattern failed after retries — aborting (planted records must go through the real pipeline).");

    const sessionStart = new Date(now - rec.daysAgo * 24 * 60 * 60 * 1000);
    const ttfvSeconds = 360 + (rec.daysAgo % 7) * 90; // same variation rule as seed-p1
    const framedAt = new Date(sessionStart.getTime() + ttfvSeconds * 1000);

    // P-3 parity: embed the record like the live auto-embed path would.
    let embedding = null;
    try {
      embedding = await embedDocument(buildPatternEmbeddingText({ ...fields, framework }));
    } catch (err) {
      console.warn(`  ⚠️ embed failed (${err.message}) — record lands without a vector; run scripts/backfill-pattern-embeddings.mjs`);
    }

    const { data: inserted, error } = await supabase
      .from("pattern_records")
      .insert({
        user_id: userIdByEmail[rec.expertEmail],
        qa_pairs: buildQaPairs(fields, rec.method),
        pending_question: null,
        pending_rung: null,
        status: "complete",
        trigger_type: rec.trigger_type,
        method: rec.method,
        scrub_status: "not_scrubbed_by_design",
        ...fields,
        framework,
        session_start: sessionStart.toISOString(),
        framework_rendered_at: framedAt.toISOString(),
        time_to_first_value_seconds: ttfvSeconds,
        created_at: sessionStart.toISOString(),
        updated_at: framedAt.toISOString(),
        ...(embedding ? { embedding, embedded_at: framedAt.toISOString() } : {}),
      })
      .select("id")
      .single();
    if (error) throw new Error(`insert failed: ${error.message}`);
    console.log(`  ✓ "${framework.name}" → ${inserted.id}${embedding ? " (embedded)" : ""}`);
  }

  // ─── run the engine ───
  console.log(`\nRunning the Prescription Engine for org ${orgId}...`);
  const summary = await runPrescriptionEngine(orgId);
  console.log(`\nEngine summary: ${JSON.stringify(summary)}`);

  // ─── DONE-test verification ───
  console.log(`\n─── Verification ───`);
  let pass = true;
  const fail = (msg) => { console.error(`  ✗ FAIL — ${msg}`); pass = false; };
  const ok = (msg) => console.log(`  ✓ ${msg}`);

  const { data: detections } = await supabase
    .from("prescription_detections")
    .select("id, dedupe_key, source_type, status, conflict_id, evidence_record_ids")
    .eq("org_id", orgId);
  const { data: prescriptions } = await supabase
    .from("prescriptions")
    .select("id, detection_id, rung, rung_rationale, capture_first, experts, audience, pairing_summary, recurrence, severity, roi_score, rank_rationale, status")
    .eq("org_id", orgId)
    .order("roi_score", { ascending: false });
  const detByKeyPrefix = (prefix) => (detections || []).filter((d) => d.dedupe_key.startsWith(prefix));
  const rxForDet = (detId) => (prescriptions || []).find((p) => p.detection_id === detId);

  // 1. Conflict-sourced prescription from the planted Priya/Angela conflict.
  const { data: openConflicts } = await supabase
    .from("framework_conflicts")
    .select("id, status, territory")
    .eq("org_id", orgId)
    .eq("status", "open");
  if ((openConflicts || []).length === 0) {
    fail(`no OPEN conflict in the demo org — replant with: node scripts/seed-p2-conflict.mjs --force, then re-run this script.`);
  } else {
    const conflictDet = detByKeyPrefix("conflict:").find((d) =>
      (openConflicts || []).some((c) => c.id === d.conflict_id)
    );
    if (!conflictDet) fail(`the open conflict produced no detection.`);
    else {
      const rx = rxForDet(conflictDet.id);
      if (!rx) fail(`the conflict detection has no prescription (triage may have failed — re-run).`);
      else {
        if (rx.rung > 2) fail(`conflict prescription rung ${rx.rung} exceeds the conflict ceiling of 2.`);
        else ok(`CONFLICT-SOURCED prescription — rung ${rx.rung}, ROI ${rx.roi_score}`);
        if (!(rx.pairing_summary.includes("Priya") && rx.pairing_summary.includes("Angela")))
          fail(`conflict pairing doesn't name both experts: "${rx.pairing_summary}"`);
        else ok(`pairing names both experts: "${rx.pairing_summary.slice(0, 100)}..."`);
        if (!rx.rung_rationale?.trim()) fail(`conflict prescription has no rung rationale.`);
        else ok(`one-line rationale stored: "${rx.rung_rationale.slice(0, 100)}..."`);
      }
    }
  }

  // 2. Coverage-gap prescription: HR, capture-first, no invented expert.
  const hrDet = (detections || []).find((d) => d.dedupe_key === "coverage:department:hr");
  if (!hrDet) fail(`no coverage-gap detection for HR (dedupe key coverage:department:hr).`);
  else {
    const rx = rxForDet(hrDet.id);
    if (!rx) fail(`the HR coverage detection has no prescription (triage may have failed — re-run).`);
    else if (!rx.capture_first) fail(`HR coverage prescription is not capture_first — it invented a facilitator.`);
    else if ((rx.experts || []).length > 0) fail(`HR capture-first prescription lists experts — should be empty.`);
    else ok(`COVERAGE-GAP prescription — HR, capture-first, rung ${rx.rung}, ROI ${rx.roi_score}, no invented expert`);
  }

  // 3. Entity-signal prescription: clamping drift, David paired with 3rd Shift Machining.
  const entKey = `entity:error_class:${normalizeEntityName(ERROR_CLASS)}`;
  const entDet = (detections || []).find((d) => d.dedupe_key === entKey);
  if (!entDet) fail(`no entity-signal detection for "${ERROR_CLASS}".`);
  else {
    const rx = rxForDet(entDet.id);
    if (!rx) fail(`the entity-signal detection has no prescription (triage may have failed — re-run).`);
    else {
      if (rx.rung > 2) fail(`entity prescription rung ${rx.rung} — expected micro-training-or-lower (≤2) for a solved-elsewhere error class.`);
      else ok(`ENTITY-SIGNAL prescription — rung ${rx.rung} (${rx.rung === 2 ? "Micro-training" : "Clarification card"}), ROI ${rx.roi_score}`);
      if (!rx.pairing_summary.includes("David")) fail(`entity pairing doesn't name David (the solver): "${rx.pairing_summary}"`);
      else ok(`solver paired: David Chen has it`);
      if (!rx.audience.includes("3rd Shift Machining")) fail(`entity audience "${rx.audience}" doesn't name 3rd Shift Machining.`);
      else ok(`audience is concrete: ${rx.audience}`);
    }
  }

  // 4. NON-gaps produce NO prescription (false positives are the failure mode).
  const mustBeAbsent = [
    ["coverage:department:quality", "Quality authors its own frameworks — not a coverage gap"],
    ["coverage:department:2nd shift production", "2nd Shift Production mentions are single-author — not a coverage gap"],
    ["coverage:department:procurement", "Procurement appears in only one record — below the evidence bar"],
    ["entity:process:die changeover staging", "Die changeover staging records are wins — not a trouble cluster"],
    ["entity:equipment_asset:cnc line 5", "CNC Line 5 cluster is owned by the error-class detection (suppressed duplicate)"],
    ["entity:process:post changeover first piece release", "first-piece release is owned by the conflict detection (suppressed duplicate)"],
  ];
  for (const [key, why] of mustBeAbsent) {
    const found = (detections || []).find((d) => d.dedupe_key === key);
    if (found) fail(`NON-GAP fired: ${key} (${why}).`);
    else ok(`non-gap correctly silent: ${key}`);
  }

  // 5. Queue is ROI-ordered.
  const scores = (prescriptions || []).map((p) => Number(p.roi_score));
  const sortedDesc = [...scores].sort((a, b) => b - a);
  if (JSON.stringify(scores) !== JSON.stringify(sortedDesc)) fail(`queue is not ROI-ordered: ${scores.join(", ")}`);
  else ok(`queue ROI-ordered: ${scores.join(" ≥ ") || "(empty)"}`);

  // ─── the queue, as an exec would see it ───
  console.log(`\n─── Prescription queue (${(prescriptions || []).length}) ───`);
  for (const [i, p] of (prescriptions || []).entries()) {
    const det = (detections || []).find((d) => d.id === p.detection_id);
    console.log(`  #${i + 1} [ROI ${p.roi_score}] rung ${p.rung} · ${det?.source_type ?? "?"} · ${p.capture_first ? "CAPTURE FIRST" : "paired"}`);
    console.log(`     ${p.pairing_summary}`);
    console.log(`     rank: ${p.rank_rationale}`);
  }

  if (!pass) {
    console.error(`\nP-4A seed verification FAILED.`);
    process.exit(1);
  }
  console.log(`\nP-4A seed verification PASSED. Open /prescriptions as any Meridian expert to see the ROI-ranked queue; click any row for the full evidence chain.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
