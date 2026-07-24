// P-4B Build 7 — drive the full prescription lifecycle end-to-end on the
// LIVE Meridian demo org and verify the DONE test.
//
// What it drives (real pipeline — actual claude-sonnet-5 training/teach-back
// calls, same copy-don't-import harness as scripts/seed-p4a.mjs):
//
//   ENTITY-SIGNAL prescription (clamping drift — David has it, 3rd Shift
//   Machining needs it):
//     proposed → Elena approves (manager gate, approver recorded) → David
//     fidelity-confirms ("yes, that's how I think") → training generated in
//     3 altitudes (floor/supervisor/exec) → Tom runs the teach-back (fresh
//     scenario, scored answer) → regenerate produces a VISIBLY different
//     strategy (v2, prior kept) → delivered_at backdated 10 days → a NEW
//     post-delivery recurrence record is planted (real pipeline, dated 4
//     days ago) → the efficacy loop ESCALATES: rung 2 → 3, flagged, with
//     the recurrence record as evidence.
//
//   CONFLICT prescription (Priya × Angela first-piece release):
//     Elena approves → generation REFUSED until fidelity → BOTH experts
//     confirm → clarification card generated (rung 1, 3 altitudes) →
//     delivered_at backdated 20 days, nothing recurs → the efficacy loop
//     marks it EFFECTIVE and closes it (Kirkpatrick L4, logged as proof) —
//     which also proves a quiet prescription is NOT falsely escalated.
//
//   GUARDRAILS:
//     ✓ HR coverage gap (capture-first): approved, but fidelity is SKIPPED
//       (no rows — nothing authored to confirm) and training generation is
//       refused (nothing to build from).
//     ✓ Finance coverage gap: snoozed 7 days — the row survives with a wake
//       date (defers, never deletes).
//     ✓ Nothing ships in an expert's name without confirm (generation
//       refused pre-fidelity on the conflict prescription).
//     ✓ Wins-only: the escalation note names entities and counts, never a
//       person.
//
// Idempotent: each step checks current state before acting. Pass --force to
// reset the org's P-4B state first (fidelity/trainings/teachbacks deleted,
// prescriptions back to 'open', the planted recurrence record removed —
// never touches P-4A detections/prescription rows themselves or the
// P-1/P-2/P-4A seed records).
//
// ⚠️ Requires supabase/p4b-prescription-engine-2.sql to have been run first.
// ⚠️ Run from Brian's PowerShell (needs live Supabase + Anthropic + Voyage).
//
// Usage: node scripts/seed-p4b.mjs [--force]
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import path from "node:path";

// ─── env (same .env.local loader as scripts/seed-p4a.mjs) ───
const envRaw = await readFile(path.join(process.cwd(), ".env.local"), "utf-8");
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const FORCE = process.argv.includes("--force");

// timeout + maxRetries:0 — a stalled connection fails in 60s instead of
// hanging silently for up to the SDK's 10-minute default; we handle our own
// retries (with backoff + a visible ⚠ log line) in each generate/score fn.
const anthropic = new Anthropic({ timeout: 60_000, maxRetries: 0 });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DEMO_ORG_NAME = "Meridian Precision Manufacturing (DEMO)";
const ERROR_CLASS = "Tolerance failure — post-restart clamping drift";
const EMAILS = {
  elena: "elena.ruiz@meridian-demo.example",
  david: "david.chen@meridian-demo.example",
  tom: "tom.whitfield@meridian-demo.example",
  priya: "priya.nair@meridian-demo.example",
  angela: "angela.brooks@meridian-demo.example",
};
const EXPERT_NAMES = ["Elena", "David", "Tom", "Priya", "Angela", "Ruiz", "Chen", "Whitfield", "Nair", "Brooks"];

// ─── constants mirrored from src/lib/prescription.ts (copy-don't-import) ───
const TEACHBACK_PASS_SCORE = 70;
const EFFICACY_QUIET_WINDOW_DAYS = 14;
const RUNGS = {
  1: { label: "Clarification card" },
  2: { label: "Micro-training" },
  3: { label: "Designed session" },
  4: { label: "Full curriculum" },
};
const RUNG_FORMAT = {
  1: {
    name: "Clarification card",
    instructions:
      "A clarification card: a 2-minute read that fixes a definition/understanding mismatch. Each altitude is ONE card, at most ~300 words: name the two readings that are colliding (or the settled guidance), state the aligned rule, and say exactly when each side applies. No exercises, no sessions — this is a read, not a meeting.",
  },
  2: {
    name: "Micro-training",
    instructions:
      "A micro-training: a focused 15-minute session transferring a fix that already exists. Include: the objective in one line; the signal to recognize; the play, step by step; the boundaries (where this fix does NOT apply); and 2-3 quick practice checks a facilitator can run in the room. Keep it runnable in 15 minutes.",
  },
  3: {
    name: "Designed session",
    instructions:
      "A designed session: a facilitator guide for a working session on a real capability gap. Include: session objectives; an agenda with rough timings; 2-3 concrete scenarios drawn from the framework material for the room to work; discussion questions; and what the facilitator should watch for to know it landed. The floor altitude is the participant-facing version; supervisor is the facilitator guide proper; exec is the sponsor briefing.",
  },
  4: {
    name: "Full curriculum",
    instructions:
      "A curriculum outline: a sequenced multi-session program for a systemic blind spot. Include: the arc (what order and why); for each session an objective, a content outline grounded in the framework material, who facilitates, and how completion is assessed; and how the program verifies transfer at the end. Outline depth — this is the design, not every worksheet.",
  },
};

// ─── verbatim helpers from src/lib/claude.ts (copy-don't-import) ───
function firstText(content) {
  const block = content.find((b) => b.type === "text");
  return block?.text ?? "";
}
// Models occasionally emit a literal newline/tab inside a JSON string value
// (e.g. a "feedback" field formatted with a paragraph break) instead of the
// escaped \n — that's invalid JSON and JSON.parse throws even though the
// braces are perfectly balanced. Repair pass: walk the string, and only
// while inside a quoted string literal, escape raw control characters.
function repairJsonControlChars(s) {
  let out = "";
  let inStr = false, esc = false;
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
function parseJson(text) {
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
        const slice = stripped.slice(start, i + 1);
        try { return JSON.parse(slice); }
        catch {
          try { return JSON.parse(repairJsonControlChars(slice)); }
          catch { return null; }
        }
      }
    }
  }
  return null;
}
function normalizeEntityName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

// Backoff between model-call retries — the seed fires many calls back to
// back, so a transient API overload would otherwise fail all in-loop retries
// instantly. Mirrors the spirit of claude.ts's withRetries (no Math.random
// so runs stay reproducible).
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function backoff(attempt) {
  await sleep(600 * 2 ** attempt + 150);
}

async function loadTemplate(name) {
  return readFile(path.join(process.cwd(), "prompts", `${name}.md`), "utf-8");
}
function fill(template, vars) {
  return Object.entries(vars).reduce(
    (p, [k, v]) => p.replaceAll(`{{${k}}}`, () => String(v)),
    template
  );
}

function isTrainingArtifact(v) {
  if (!v || typeof v !== "object") return false;
  const okAlt = (a) =>
    a && typeof a === "object" &&
    typeof a.title === "string" && a.title.trim() &&
    typeof a.body === "string" && a.body.trim();
  return (
    typeof v.strategy === "string" && v.strategy.trim() &&
    typeof v.title === "string" && v.title.trim() &&
    v.altitudes &&
    okAlt(v.altitudes.floor) && okAlt(v.altitudes.supervisor) && okAlt(v.altitudes.exec)
  );
}

// ─── training-generation mirrors (verbatim logic from src/lib/claude.ts) ───
async function generateTraining(input) {
  const template = await loadTemplate("training-generate");
  const prompt = fill(template, {
    rung: input.rung,
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
  let lastRaw = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const msg = await anthropic.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 6000,
        messages: [{ role: "user", content: prompt }],
      });
      lastRaw = firstText(msg.content);
      const parsed = parseJsonLoose(lastRaw);
      if (isTrainingArtifact(parsed)) return parsed;
      console.warn(`  ⚠ generateTraining attempt ${attempt + 1}/3: unparseable/invalid response`);
    } catch (err) {
      console.warn(`  ⚠ generateTraining attempt ${attempt + 1}/3: API error — ${err?.message || err}`);
    }
    if (attempt < 2) await backoff(attempt);
  }
  console.error(`  ✗ generateTraining exhausted retries. Last raw response (first 1500 chars):\n${lastRaw.slice(0, 1500)}`);
  return null;
}

async function regenerateTraining(input) {
  const template = await loadTemplate("training-regenerate");
  const prompt = fill(template, {
    rung: input.rung,
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
      input.regenerateNote ||
      "(no specific note — the requester wants a structurally different design)",
  });
  const norm = (s) => s.trim().toLowerCase();
  let lastRaw = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const msg = await anthropic.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 6000,
        messages: [{ role: "user", content: prompt }],
      });
      lastRaw = firstText(msg.content);
      const parsed = parseJsonLoose(lastRaw);
      if (!isTrainingArtifact(parsed)) {
        console.warn(`  ⚠ regenerateTraining attempt ${attempt + 1}/3: unparseable/invalid response`);
        if (attempt < 2) await backoff(attempt);
        continue;
      }
      if (input.priorVersions.some((p) => norm(p.strategy) === norm(parsed.strategy))) {
        console.warn(`  ⚠ regenerateTraining attempt ${attempt + 1}/3: strategy re-rolled a prior version's label`);
        if (attempt < 2) await backoff(attempt);
        continue;
      }
      return parsed;
    } catch (err) {
      console.warn(`  ⚠ regenerateTraining attempt ${attempt + 1}/3: API error — ${err?.message || err}`);
      if (attempt < 2) await backoff(attempt);
    }
  }
  console.error(`  ✗ regenerateTraining exhausted retries. Last raw response (first 1500 chars):\n${lastRaw.slice(0, 1500)}`);
  return null;
}

async function generateTeachbackScenario(frameworks, audience, trainingTitle, trainingStrategy) {
  const template = await loadTemplate("teachback-scenario");
  const prompt = fill(template, {
    frameworks,
    audience,
    training_title: trainingTitle,
    training_strategy: trainingStrategy,
  });
  let lastRaw = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const msg = await anthropic.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      });
      lastRaw = firstText(msg.content);
      const parsed = parseJsonLoose(lastRaw);
      if (
        parsed &&
        typeof parsed.scenario === "string" && parsed.scenario.trim() &&
        typeof parsed.question === "string" && parsed.question.trim()
      ) {
        return { scenario: parsed.scenario.trim(), question: parsed.question.trim() };
      }
      console.warn(`  ⚠ generateTeachbackScenario attempt ${attempt + 1}/3: unparseable/invalid response`);
    } catch (err) {
      console.warn(`  ⚠ generateTeachbackScenario attempt ${attempt + 1}/3: API error — ${err?.message || err}`);
    }
    if (attempt < 2) await backoff(attempt);
  }
  console.error(`  ✗ generateTeachbackScenario exhausted retries. Last raw response (first 1500 chars):\n${lastRaw.slice(0, 1500)}`);
  return null;
}

async function scoreTeachback(frameworks, scenario, question, answer) {
  const template = await loadTemplate("teachback-score");
  const prompt = fill(template, { frameworks, scenario, question, answer });
  let lastRaw = "";
  let lastThinking = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const msg = await anthropic.messages.create({
        model: "claude-sonnet-5",
        // Scoring is the most reasoning-heavy call in the seed (grading an
        // answer against a 3-part rubric). claude-sonnet-5 reasons in a
        // thinking channel and can burn the whole budget before emitting the
        // JSON text block — 8000 leaves room for the reasoning AND the (tiny)
        // output. Training gen works at 6000 because writing is cheaper.
        max_tokens: 8000,
        messages: [{ role: "user", content: prompt }],
      });
      lastRaw = firstText(msg.content);
      // Diagnostic: capture any thinking block so a max_tokens failure isn't
      // a black box — a truncated response has no text block, only thinking.
      const think = (msg.content || []).find((b) => b.type === "thinking");
      lastThinking = think?.thinking ?? "";
      const parsed = parseJsonLoose(lastRaw);
      // Same tolerance as claude.ts: accept a numeric string or a summed
      // expression the model occasionally emits ("40 + 35 + 15").
      const rawScore =
        typeof parsed?.score === "number"
          ? parsed.score
          : typeof parsed?.score === "string"
            ? parsed.score.split("+").reduce((s, p) => s + (parseFloat(p) || 0), 0)
            : NaN;
      if (
        parsed &&
        Number.isFinite(rawScore) &&
        typeof parsed.feedback === "string" && parsed.feedback.trim()
      ) {
        return {
          score: Math.max(0, Math.min(100, Math.round(rawScore))),
          feedback: parsed.feedback.trim(),
          missed: Array.isArray(parsed.missed) ? parsed.missed.filter((s) => typeof s === "string") : [],
        };
      }
      console.warn(`  ⚠ scoreTeachback attempt ${attempt + 1}/5: unparseable/invalid response (stop_reason=${msg.stop_reason})`);
    } catch (err) {
      console.warn(`  ⚠ scoreTeachback attempt ${attempt + 1}/5: API error — ${err?.message || err}`);
    }
    if (attempt < 4) await backoff(attempt);
  }
  console.error(`  ✗ scoreTeachback exhausted retries. Last raw text (first 2000 chars):\n${lastRaw.slice(0, 2000) || "(no text block — response was cut off before the JSON, likely all reasoning)"}`);
  if (lastThinking) {
    console.error(`  ↳ last reasoning block (first 1500 chars):\n${lastThinking.slice(0, 1500)}`);
  }
  return null;
}

// ─── framework-grounding formatter (verbatim mirror of prescription.ts) ───
function formatFrameworksForTraining(records, authorName) {
  return records
    .map((r, i) => {
      const f = r.framework;
      const entities = (r.entity_map || [])
        .map((e) => `${e.type}: ${e.name}${e.detail ? ` (${e.detail})` : ""}`)
        .join("; ");
      const lines = [
        `═══ Framework ${i + 1} — authored by ${authorName(r.user_id)} (${new Date(r.created_at).toLocaleDateString("en-US")}) ═══`,
      ];
      if (f) {
        lines.push(
          `Name: ${f.name}`,
          `Tagline: ${f.tagline}`,
          `When to apply: ${f.when_to_apply.join(" · ")}`,
          `Signals: ${f.signals.join(" · ")}`,
          `The play: ${f.the_play}`,
          `Why it works: ${f.why_it_works}`,
          `Boundaries: ${f.boundaries.join(" · ")}`
        );
      } else {
        lines.push("(no rendered framework artifact — record fields only)");
      }
      lines.push(
        `Situation it came from: ${r.context_summary ?? "(none)"}`,
        `The signal read: ${r.trigger_signal ?? "(none)"}`,
        `Signal detail: ${r.signal_detail ?? "(none)"}`,
        `The judgment: ${r.judgment ?? "(none)"}`,
        `The reasoning: ${r.rationale ?? "(none)"}`,
        `Boundaries (in the expert's words): ${r.boundaries ?? "(none)"}`,
        `Entities: ${entities || "(none)"}`
      );
      return lines.join("\n");
    })
    .join("\n\n");
}

// ─── the training-route guard, mirrored (nothing ships without confirm) ───
function generationRefusal(rx, fidelityRows) {
  if (rx.capture_first) {
    return "capture-first: nothing authored yet — no expert framework to build from";
  }
  const decisionFor = new Map(fidelityRows.map((f) => [f.expert_user_id, f.decision]));
  if ((rx.experts || []).some((e) => decisionFor.get(e.user_id) === "rejected")) {
    return "an authoring expert said 'not quite' — nothing ships in their name";
  }
  if ((rx.experts || []).some((e) => decisionFor.get(e.user_id) !== "confirmed")) {
    return "waiting on fidelity confirm — nothing ships in an expert's name without it";
  }
  return null;
}

// ─── the efficacy loop, mirrored (verbatim logic from prescription.ts) ───
async function runEfficacyLoop(orgId) {
  const summary = { checked: 0, escalated: 0, effective: 0, watching: 0, outcomes: [] };
  const { data: rxRaw, error: rxError } = await supabase
    .from("prescriptions")
    .select("id, detection_id, rung, status, delivered_at, efficacy_status, gap_summary")
    .eq("org_id", orgId)
    .eq("status", "delivered");
  if (rxError) throw new Error(`Could not load delivered prescriptions: ${rxError.message}`);
  const delivered = (rxRaw || []).filter(
    (r) => r.delivered_at && (r.efficacy_status === "watching" || r.efficacy_status === null)
  );
  if (delivered.length === 0) return summary;

  const { data: detRaw } = await supabase
    .from("prescription_detections")
    .select("id, source_type, subject_entities, evidence_record_ids")
    .in("id", delivered.map((r) => r.detection_id));
  const detById = new Map((detRaw || []).map((d) => [d.id, d]));

  const earliest = delivered.map((r) => r.delivered_at).sort()[0];
  const { data: recRaw } = await supabase
    .from("pattern_records")
    .select("id, created_at, trigger_type, entity_map")
    .eq("org_id", orgId)
    .eq("status", "complete")
    .gt("created_at", earliest);
  const newRecords = recRaw || [];

  const now = Date.now();
  const windowMs = EFFICACY_QUIET_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  for (const rx of delivered) {
    const detection = detById.get(rx.detection_id);
    if (!detection) continue;
    summary.checked++;
    const subjectKeys = new Set(
      (detection.subject_entities || []).map((e) => `${e.type}|${normalizeEntityName(e.name)}`)
    );
    const deliveredMs = new Date(rx.delivered_at).getTime();
    // Founding records are never their own recurrence — see the note in
    // src/lib/prescription.ts. Guards the backdated-delivered_at demo case.
    const foundingIds = new Set(detection.evidence_record_ids || []);
    const recurrences = newRecords.filter((r) => {
      if (foundingIds.has(r.id)) return false;
      if (new Date(r.created_at).getTime() <= deliveredMs) return false;
      if (r.trigger_type !== "broke" && r.trigger_type !== "friction") return false;
      return (r.entity_map || []).some((e) =>
        subjectKeys.has(`${e.type}|${normalizeEntityName(e.name)}`)
      );
    });
    const subjectNames =
      (detection.subject_entities || []).map((e) => e.name).join(" · ") || "the detected subject";
    const checkedAt = new Date().toISOString();

    if (recurrences.length > 0) {
      console.log(`  · [${rx.id}] founding=${JSON.stringify([...foundingIds])} matched=${JSON.stringify(recurrences.map((r) => r.id))}`);
      const fromRung = rx.rung;
      const capped = fromRung >= 4;
      const toRung = capped ? 4 : Math.min(4, fromRung + 1);
      const note =
        `Recurred after delivery: ${recurrences.length} new failure/friction record` +
        `${recurrences.length === 1 ? "" : "s"} carrying "${subjectNames}" dated after ` +
        `${new Date(rx.delivered_at).toLocaleDateString("en-US")}. ` +
        (capped
          ? `Already at rung 4 — flagged for redesign at the same rung.`
          : `Auto-escalated rung ${fromRung} → ${toRung} (${RUNGS[toRung].label}) — the intervention didn't transfer; regenerate at the bigger rung and redeliver.`);
      const { error } = await supabase
        .from("prescriptions")
        .update({
          rung: toRung,
          severity: toRung,
          escalated_from_rung: fromRung,
          efficacy_status: "escalated",
          efficacy_note: note,
          efficacy_evidence_record_ids: recurrences.map((r) => r.id),
          efficacy_checked_at: checkedAt,
        })
        .eq("id", rx.id);
      if (error) throw new Error(`Could not escalate ${rx.id}: ${error.message}`);
      summary.escalated++;
      summary.outcomes.push({ prescriptionId: rx.id, outcome: "escalated", note });
    } else if (now - deliveredMs >= windowMs) {
      const quietDays = Math.floor((now - deliveredMs) / (24 * 60 * 60 * 1000));
      const note =
        `Quiet for ${quietDays} days post-delivery (window: ${EFFICACY_QUIET_WINDOW_DAYS}) — ` +
        `no new failure/friction records carrying "${subjectNames}". ` +
        `Marked effective: the intervention held on live evidence (Kirkpatrick Level 4, measured automatically).`;
      const { error } = await supabase
        .from("prescriptions")
        .update({
          status: "closed",
          efficacy_status: "effective",
          efficacy_note: note,
          efficacy_checked_at: checkedAt,
        })
        .eq("id", rx.id);
      if (error) throw new Error(`Could not close ${rx.id}: ${error.message}`);
      summary.effective++;
      summary.outcomes.push({ prescriptionId: rx.id, outcome: "effective", note });
    } else {
      const daysIn = Math.floor((now - deliveredMs) / (24 * 60 * 60 * 1000));
      const note = `Watching — quiet ${daysIn}/${EFFICACY_QUIET_WINDOW_DAYS} days since delivery, no recurrence of "${subjectNames}".`;
      await supabase
        .from("prescriptions")
        .update({ efficacy_status: "watching", efficacy_note: note, efficacy_checked_at: checkedAt })
        .eq("id", rx.id);
      summary.watching++;
      summary.outcomes.push({ prescriptionId: rx.id, outcome: "watching", note });
    }
  }
  return summary;
}

// ─── framePattern + embeds for the planted recurrence record (P-4A parity) ───
const frameTemplate = await loadTemplate("frame-pattern");
function isFrameworkArtifact(v) {
  if (!v || typeof v !== "object") return false;
  const isStrArr = (x) => Array.isArray(x) && x.length > 0 && x.every((s) => typeof s === "string");
  return (
    typeof v.name === "string" && typeof v.tagline === "string" &&
    isStrArr(v.when_to_apply) && isStrArr(v.signals) &&
    typeof v.the_play === "string" && typeof v.why_it_works === "string" &&
    isStrArr(v.boundaries)
  );
}
async function framePattern(fields) {
  const prompt = frameTemplate.replaceAll("{{record}}", () => JSON.stringify(fields, null, 2));
  for (let attempt = 0; attempt < 3; attempt++) {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 3072,
      messages: [{ role: "user", content: prompt }],
    });
    const parsed = parseJsonLoose(firstText(msg.content));
    if (isFrameworkArtifact(parsed)) return parsed;
    if (attempt < 2) await backoff(attempt);
  }
  return null;
}
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
    row.context_industry, row.context_function, row.situation_type,
    row.intervention_type, row.context_org_size ? `org size ${row.context_org_size}` : null,
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

// ─── the planted post-delivery recurrence record (Tom, 4 days ago, 💥) ───
const RECURRENCE = {
  email: EMAILS.tom,
  daysAgo: 4,
  trigger_type: "broke",
  method: "5whys_fishbone",
  context_summary:
    "Sr. Manager of Maintenance was called back to 3rd-shift machining after CNC Line 5 scrapped another bracket run that failed tolerance in the first hour following an overnight unplanned restart.",
  context_org_size: "200-1000",
  context_industry: "Manufacturing",
  context_function: "Ops",
  situation_type: "Process failure",
  intervention_type: "Measure",
  trigger_signal:
    "CNC Line 5 on 3rd shift scrapped a bracket run that failed final tolerance, every part machined within 40 minutes of an overnight unplanned restart, drifting in one consistent direction — the same post-restart signature as before.",
  signal_detail:
    "The drift direction and the restart-window clustering matched the documented cold-fixture signature exactly. The crew had the warm-up steps posted at the machine but the restart happened mid-shift-change and the cycle wasn't run before production resumed — the practice hasn't become automatic under handoff pressure yet.",
  judgment:
    "Treat the warm-up cycle as a hard gate in the restart procedure itself — no production parts until the cycle completes — rather than a posted practice that competes with schedule pressure at shift change.",
  rationale:
    "A posted practice loses to handoff pressure precisely in the window where restarts cluster; making the warm-up a gating step in the procedure removes the decision from the pressured moment. The scrap cost of skipping it is now measured and repeatable, so the gate pays for itself on the first avoided run.",
  boundaries:
    "This gate belongs on restart-after-stop events only — adding it to routine program changes would slow the line for no benefit, and if scrap ever appears WITHOUT the restart clustering, that's a different failure mode that deserves a fresh investigation, not a longer warm-up.",
  entity_map: [
    { type: "error_class", name: "Tolerance failure — post-restart clamping drift", detail: null },
    { type: "equipment_asset", name: "CNC Line 5", detail: "3rd-shift machining" },
    { type: "department", name: "3rd Shift Machining", detail: null },
  ],
};

// Tom's scripted teach-back answer — written to demonstrate the framework's
// signal, play, and boundaries (a plausibly good learner answer).
const TEACHBACK_ANSWER =
  "First I'd check WHEN the scrapped parts were machined relative to the last restart — if they all cluster in the window right after the machine came back up and the drift runs in one consistent direction, that's the cold-fixture signature, not an operator technique problem. The play is to run the post-restart warm-up cycle that engineering proved out before releasing production parts, instead of launching a new investigation. I'd also check the boundary: if the scrap were scattered randomly through the shift or drifting in different directions, this fix wouldn't apply — that pattern points at technique or tooling wear and would deserve the full investigation.";

// ═══ helpers ════════════════════════════════════════════════════════════════

let pass = true;
const fail = (msg) => { console.error(`  ✗ FAIL — ${msg}`); pass = false; };
const ok = (msg) => console.log(`  ✓ ${msg}`);

async function getRx(id) {
  const { data } = await supabase
    .from("prescriptions")
    .select("*")
    .eq("id", id)
    .single();
  return data;
}

async function loadGrounding(orgId, rx, nameById) {
  const recordIds = [...new Set((rx.experts || []).map((e) => e.record_id))];
  const { data: recs } = await supabase
    .from("pattern_records")
    .select("id, user_id, created_at, context_summary, trigger_signal, signal_detail, judgment, rationale, boundaries, entity_map, framework")
    .eq("org_id", orgId)
    .in("id", recordIds);
  return formatFrameworksForTraining(recs || [], (uid) => nameById.get(uid) ?? "an org expert");
}

async function generateAndStore(orgId, rx, sourceType, nameById, regen) {
  const frameworks = await loadGrounding(orgId, rx, nameById);
  const format = RUNG_FORMAT[rx.rung] ?? RUNG_FORMAT[2];
  const input = {
    rung: rx.rung,
    formatName: format.name,
    formatInstructions: format.instructions,
    sourceType,
    gapSummary: rx.gap_summary,
    pairingSummary: rx.pairing_summary,
    audience: rx.audience,
    frameworks,
  };
  const { data: priorRaw } = await supabase
    .from("prescription_trainings")
    .select("version, strategy, title")
    .eq("prescription_id", rx.id)
    .order("version", { ascending: false });
  const prior = priorRaw || [];
  const artifact = regen
    ? await regenerateTraining({
        ...input,
        priorVersions: prior,
        regenerateNote: regen.note,
      })
    : await generateTraining(input);
  if (!artifact) throw new Error(`training generation failed for ${rx.id} (after retries)`);
  const version = (prior[0]?.version ?? 0) + 1;
  const { data: inserted, error } = await supabase
    .from("prescription_trainings")
    .insert({
      org_id: orgId,
      prescription_id: rx.id,
      version,
      strategy: artifact.strategy,
      rung: rx.rung,
      format: format.name,
      title: artifact.title,
      altitudes: artifact.altitudes,
      regenerate_note: regen ? regen.note : null,
    })
    .select("id, version, strategy, title")
    .single();
  if (error) throw new Error(`training insert failed: ${error.message}`);
  await supabase
    .from("prescriptions")
    .update({
      status: "delivered",
      delivered_at: new Date().toISOString(),
      efficacy_status: "watching",
      efficacy_evidence_record_ids: [],
      efficacy_checked_at: null,
    })
    .eq("id", rx.id);
  console.log(`  ✓ training v${version} ("${artifact.strategy}") — "${artifact.title}"`);
  return { ...inserted, altitudes: artifact.altitudes };
}

// ═══ main ═══════════════════════════════════════════════════════════════════

async function main() {
  console.log(`═══ seed-p4b.mjs build: founding-exclusion-v2 ═══`);
  const { data: org } = await supabase
    .from("orgs").select("id").eq("name", DEMO_ORG_NAME).maybeSingle();
  if (!org) throw new Error(`Demo org "${DEMO_ORG_NAME}" not found — run scripts/seed-p1-demo.mjs first.`);
  const orgId = org.id;
  console.log(`Demo org: "${DEMO_ORG_NAME}" → ${orgId}`);

  // ─── resolve the demo experts ───
  const userIdByEmail = {};
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    for (const u of data.users) {
      if (Object.values(EMAILS).includes(u.email)) userIdByEmail[u.email] = u.id;
    }
    if (data.users.length < 200) break;
    page++;
  }
  for (const email of Object.values(EMAILS)) {
    if (!userIdByEmail[email]) throw new Error(`Seeded expert ${email} not found — run seed-p1-demo.mjs first.`);
  }
  const uid = (key) => userIdByEmail[EMAILS[key]];

  const { data: profs } = await supabase
    .from("profiles").select("id, display_name").in("id", Object.values(userIdByEmail));
  const nameById = new Map((profs || []).map((p) => [p.id, p.display_name]));

  // ─── Elena = the demo's manager (minimal role model — a label + a record) ───
  await supabase.from("profiles").update({ role: "manager" }).eq("id", uid("elena"));
  console.log(`Elena Ruiz → profiles.role = 'manager' (demo manager seeded)`);

  // ─── --force: reset the org's P-4B state (never touches P-4A rows/records) ───
  if (FORCE) {
    console.log(`--force: resetting P-4B state for the demo org...`);
    await supabase.from("prescription_teachbacks").delete().eq("org_id", orgId);
    await supabase.from("prescription_trainings").delete().eq("org_id", orgId);
    await supabase.from("prescription_fidelity").delete().eq("org_id", orgId);
    await supabase
      .from("prescriptions")
      .update({
        status: "open",
        approved_by: null, approved_at: null,
        snoozed_by: null, snoozed_at: null, snoozed_until: null,
        delivered_at: null,
        efficacy_status: null, efficacy_checked_at: null, efficacy_note: null,
        efficacy_evidence_record_ids: [], escalated_from_rung: null,
      })
      .eq("org_id", orgId);
    // Restore triage rungs (escalation may have bumped them on a prior run).
    const { data: dets } = await supabase
      .from("prescription_detections").select("id, dedupe_key, source_type").eq("org_id", orgId);
    const entDetId = (dets || []).find(
      (d) =>
        d.dedupe_key === `entity:error_class:${normalizeEntityName(ERROR_CLASS)}` ||
        (d.source_type === "entity_signal" && d.dedupe_key.includes("clamping"))
    )?.id;
    if (entDetId) {
      await supabase.from("prescriptions")
        .update({ rung: 2, severity: 2 }).eq("detection_id", entDetId).gt("rung", 2);
    }
    const { data: planted } = await supabase
      .from("pattern_records")
      .select("id")
      .eq("org_id", orgId)
      .eq("context_summary", RECURRENCE.context_summary);
    if ((planted || []).length > 0) {
      await supabase.from("pattern_records").delete().in("id", planted.map((r) => r.id));
      console.log(`  deleted the planted recurrence record.`);
    }
  }

  // ─── locate the four P-4A prescriptions ───
  const { data: detections } = await supabase
    .from("prescription_detections")
    .select("id, dedupe_key, source_type, conflict_id, subject_entities")
    .eq("org_id", orgId);
  const { data: rxAll } = await supabase
    .from("prescriptions").select("*").eq("org_id", orgId);
  const rxByDet = new Map((rxAll || []).map((p) => [p.detection_id, p]));
  const detFor = (pred) => (detections || []).find(pred);

  // Match by intent, not by an exact normalized-name guess: the coverage
  // dedupe key is `coverage:department:<normalized display name>`, and the
  // live display name may be "Finance / Controller" etc. — so match on the
  // department keyword in the key OR in the subject entities, not a literal.
  const coverageKeyword = (det, re) => {
    if (det.source_type !== "coverage_gap") return false;
    if (re.test(det.dedupe_key)) return true;
    return (det.subject_entities || []).some((e) => re.test(e.name || ""));
  };
  const entDet =
    detFor((d) => d.dedupe_key === `entity:error_class:${normalizeEntityName(ERROR_CLASS)}`) ||
    detFor((d) => d.source_type === "entity_signal" && /clamping/i.test(d.dedupe_key));
  const hrDet = detFor((d) => coverageKeyword(d, /\bhr\b|human|people|talent|onboard/i));
  // Finance = the snooze target. Prefer a Finance-keyed coverage gap; fall
  // back to ANY coverage gap that isn't HR, so the snooze-defers guardrail is
  // demonstrable even if the department is named differently on live data.
  const finDet =
    detFor((d) => coverageKeyword(d, /financ|controller|account|budget/i)) ||
    detFor((d) => d.source_type === "coverage_gap" && (!hrDet || d.id !== hrDet.id));
  const conflictDet = detFor((d) => d.source_type === "conflict");
  for (const [label, det] of [["entity-signal", entDet], ["HR coverage", hrDet], ["conflict", conflictDet]]) {
    if (!det || !rxByDet.get(det.id)) throw new Error(`Missing ${label} prescription — run scripts/seed-p4a.mjs first.`);
  }
  if (!finDet || !rxByDet.get(finDet.id)) {
    console.warn(`  ⚠️ no second coverage gap to use as the snooze target — the snooze-defers guardrail will be skipped this run.`);
  }
  let entRx = rxByDet.get(entDet.id);
  let conflictRx = rxByDet.get(conflictDet.id);
  let hrRx = rxByDet.get(hrDet.id);
  let finRx = finDet ? rxByDet.get(finDet.id) : null;

  // ═══ GUARDRAIL: nothing ships before approval or confirm ═══
  console.log(`\n─── Guardrail: nothing ships without confirm ───`);
  {
    const refusal = generationRefusal(entRx, []);
    if (entRx.status === "open" && !refusal) fail(`generation guard let an unconfirmed prescription through`);
    else ok(`pre-fidelity generation refused: "${refusal ?? "(already past this state)"}"`);
  }

  // ═══ LIFECYCLE 1 — the entity-signal prescription (clamping drift) ═══
  console.log(`\n─── Lifecycle 1: entity-signal (David → 3rd Shift Machining) ───`);

  // 1a. Manager gate: Elena approves (approver + timestamp recorded).
  if (entRx.status === "open" || entRx.status === "snoozed") {
    await supabase.from("prescriptions").update({
      status: "approved", approved_by: uid("elena"), approved_at: new Date().toISOString(),
    }).eq("id", entRx.id);
    console.log(`  ✓ approved by Elena (manager) — recorded who + when`);
  } else {
    console.log(`  (already past the gate: ${entRx.status})`);
  }

  // 1b. Fidelity: David confirms.
  await supabase.from("prescription_fidelity").upsert({
    org_id: orgId,
    prescription_id: entRx.id,
    expert_user_id: uid("david"),
    record_id: (entRx.experts || []).find((e) => e.user_id === uid("david"))?.record_id ?? entRx.experts[0].record_id,
    decision: "confirmed",
    note: "Yes — that's exactly the warm-up discipline we proved out on Line 2.",
    decided_at: new Date().toISOString(),
  }, { onConflict: "prescription_id,expert_user_id" });
  console.log(`  ✓ David fidelity-confirmed ("yes, that's how I think")`);

  // 1c. Training v1 (3 altitudes), grounded only in David's framework.
  entRx = await getRx(entRx.id);
  const { data: entTrainings0 } = await supabase
    .from("prescription_trainings").select("id, version, strategy, title, altitudes")
    .eq("prescription_id", entRx.id).order("version", { ascending: false });
  let entV1 = (entTrainings0 || []).find((t) => t.version === 1);
  if (!entV1) {
    const guard = generationRefusal(entRx, [{ expert_user_id: uid("david"), decision: "confirmed" }]);
    if (guard) throw new Error(`unexpected generation refusal: ${guard}`);
    entV1 = await generateAndStore(orgId, entRx, "entity_signal", nameById, null);
  } else {
    console.log(`  (training v1 already exists: "${entV1.title}")`);
  }

  // 1d. Teach-back: Tom answers a fresh scenario; the model scores it.
  entRx = await getRx(entRx.id);
  const { data: tbExisting } = await supabase
    .from("prescription_teachbacks").select("id, completed_at, score")
    .eq("prescription_id", entRx.id).not("completed_at", "is", null);
  if ((tbExisting || []).length === 0) {
    const frameworks = await loadGrounding(orgId, entRx, nameById);
    const { data: latestT } = await supabase
      .from("prescription_trainings").select("id, strategy, title")
      .eq("prescription_id", entRx.id).order("version", { ascending: false }).limit(1);
    const scenario = await generateTeachbackScenario(
      frameworks, entRx.audience, latestT[0].title, latestT[0].strategy
    );
    if (!scenario) throw new Error("teach-back scenario generation failed");
    const scored = await scoreTeachback(frameworks, scenario.scenario, scenario.question, TEACHBACK_ANSWER);
    if (!scored) throw new Error("teach-back scoring failed");
    const { error: tbErr } = await supabase.from("prescription_teachbacks").insert({
      org_id: orgId,
      prescription_id: entRx.id,
      training_id: latestT[0].id,
      learner_user_id: uid("tom"),
      scenario: scenario.scenario,
      question: scenario.question,
      answer: TEACHBACK_ANSWER,
      score: scored.score,
      passed: scored.score >= TEACHBACK_PASS_SCORE,
      feedback: scored.feedback,
      missed: scored.missed,
      completed_at: new Date().toISOString(),
    });
    if (tbErr) throw new Error(`teach-back insert failed: ${tbErr.message}`);
    console.log(`  ✓ teach-back scored ${scored.score}/100 (${scored.score >= TEACHBACK_PASS_SCORE ? "passed" : "below the pass line"}) — Tom, fresh scenario`);
  } else {
    console.log(`  (teach-back already completed: ${tbExisting[0].score}/100)`);
  }

  // 1e. Regenerate: a VISIBLY different strategy; v1 is kept.
  const { data: entTrainings1 } = await supabase
    .from("prescription_trainings").select("id, version, strategy, title")
    .eq("prescription_id", entRx.id).order("version", { ascending: false });
  if ((entTrainings1 || []).length < 2) {
    entRx = await getRx(entRx.id);
    await generateAndStore(orgId, entRx, "entity_signal", nameById, {
      note: "Night crew won't sit through a walkthrough — give the facilitator something more hands-on.",
    });
  } else {
    console.log(`  (regenerated version already exists)`);
  }

  // 1f. Backdate delivery to 10 days ago (efficacy watch reads from here).
  const entDelivered = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
  await supabase.from("prescriptions").update({
    status: "delivered", delivered_at: entDelivered,
    efficacy_status: "watching", efficacy_evidence_record_ids: [], escalated_from_rung: null,
  }).eq("id", entRx.id);
  console.log(`  ✓ delivered_at backdated 10 days (watch window open)`);

  // ═══ LIFECYCLE 2 — the conflict prescription (Priya × Angela) ═══
  console.log(`\n─── Lifecycle 2: conflict-sourced (Priya × Angela) ───`);
  if (conflictRx.status === "open" || conflictRx.status === "snoozed") {
    await supabase.from("prescriptions").update({
      status: "approved", approved_by: uid("elena"), approved_at: new Date().toISOString(),
    }).eq("id", conflictRx.id);
    console.log(`  ✓ approved by Elena`);
  }
  // Guardrail: generation refused until BOTH experts confirm.
  {
    const { data: fRows } = await supabase
      .from("prescription_fidelity").select("expert_user_id, decision")
      .eq("prescription_id", conflictRx.id);
    const refusal = generationRefusal(await getRx(conflictRx.id), fRows || []);
    if ((fRows || []).length < 2 && !refusal) fail(`conflict generation guard let an unconfirmed prescription through`);
    else if (refusal) ok(`generation refused pre-confirm: "${refusal}"`);
  }
  for (const who of ["priya", "angela"]) {
    const expert = (conflictRx.experts || []).find((e) => e.user_id === uid(who));
    if (!expert) { fail(`conflict prescription doesn't name ${who} as an expert`); continue; }
    await supabase.from("prescription_fidelity").upsert({
      org_id: orgId,
      prescription_id: conflictRx.id,
      expert_user_id: uid(who),
      record_id: expert.record_id,
      decision: "confirmed",
      note: who === "priya"
        ? "Yes — that's my side of it, and the card should say exactly when full first-piece verification is non-negotiable."
        : "Yes — as long as it keeps the changeover-pressure context, that's how I think about it.",
      decided_at: new Date().toISOString(),
    }, { onConflict: "prescription_id,expert_user_id" });
  }
  console.log(`  ✓ BOTH experts fidelity-confirmed`);

  conflictRx = await getRx(conflictRx.id);
  const { data: cTrainings } = await supabase
    .from("prescription_trainings").select("id, version")
    .eq("prescription_id", conflictRx.id);
  if ((cTrainings || []).length === 0) {
    await generateAndStore(orgId, conflictRx, "conflict", nameById, null);
  } else {
    console.log(`  (training already exists)`);
  }
  // Backdate past the quiet window: 20 days ago, nothing recurs.
  const conflictDelivered = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
  await supabase.from("prescriptions").update({
    status: "delivered", delivered_at: conflictDelivered,
    efficacy_status: "watching", efficacy_evidence_record_ids: [], escalated_from_rung: null,
  }).eq("id", conflictRx.id);
  console.log(`  ✓ delivered_at backdated 20 days (past the ${EFFICACY_QUIET_WINDOW_DAYS}-day quiet window)`);

  // ═══ GUARDRAILS on the two coverage gaps ═══
  console.log(`\n─── Guardrails: capture-first skips fidelity · snooze defers ───`);
  // HR: approve; fidelity SKIPPED; generation refused.
  if (hrRx.status === "open" || hrRx.status === "snoozed") {
    await supabase.from("prescriptions").update({
      status: "approved", approved_by: uid("elena"), approved_at: new Date().toISOString(),
    }).eq("id", hrRx.id);
  }
  {
    const refusal = generationRefusal(await getRx(hrRx.id), []);
    if (!refusal || !refusal.includes("capture-first")) fail(`HR capture-first generation was not refused (${refusal})`);
    else ok(`HR (capture-first): approved, generation refused — "${refusal}"`);
  }
  // Finance (or any second coverage gap): snooze 7 days (defers, never deletes).
  const finWake = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  if (finRx) {
    await supabase.from("prescriptions").update({
      status: "snoozed", snoozed_by: uid("elena"),
      snoozed_at: new Date().toISOString(), snoozed_until: finWake,
    }).eq("id", finRx.id);
    console.log(`  ✓ snooze target snoozed until ${finWake.slice(0, 10)}`);
  } else {
    console.log(`  (no snooze target available — skipping the snooze demonstration)`);
  }

  // ═══ Plant the post-delivery recurrence record (real pipeline) ═══
  console.log(`\n─── Planting the post-delivery recurrence (Tom, 4 days ago, 💥) ───`);
  const { data: existingRec } = await supabase
    .from("pattern_records").select("id")
    .eq("org_id", orgId).eq("context_summary", RECURRENCE.context_summary).maybeSingle();
  if (!existingRec) {
    const fields = {
      context_summary: RECURRENCE.context_summary,
      context_org_size: RECURRENCE.context_org_size,
      context_industry: RECURRENCE.context_industry,
      context_function: RECURRENCE.context_function,
      situation_type: RECURRENCE.situation_type,
      intervention_type: RECURRENCE.intervention_type,
      trigger_signal: RECURRENCE.trigger_signal,
      signal_detail: RECURRENCE.signal_detail,
      judgment: RECURRENCE.judgment,
      rationale: RECURRENCE.rationale,
      boundaries: RECURRENCE.boundaries,
      entity_map: RECURRENCE.entity_map,
    };
    const framework = await framePattern(fields);
    if (!framework) throw new Error("framePattern failed for the recurrence record");
    const sessionStart = new Date(Date.now() - RECURRENCE.daysAgo * 24 * 60 * 60 * 1000);
    const ttfvSeconds = 360 + (RECURRENCE.daysAgo % 7) * 90;
    const framedAt = new Date(sessionStart.getTime() + ttfvSeconds * 1000);
    let embedding = null;
    try {
      embedding = await embedDocument(buildPatternEmbeddingText({ ...fields, framework }));
    } catch (err) {
      console.warn(`  ⚠️ embed failed (${err.message}) — record lands without a vector`);
    }
    const { data: inserted, error } = await supabase.from("pattern_records").insert({
      user_id: uid("tom"),
      qa_pairs: [],
      pending_question: null,
      pending_rung: null,
      status: "complete",
      trigger_type: RECURRENCE.trigger_type,
      method: RECURRENCE.method,
      scrub_status: "not_scrubbed_by_design",
      ...fields,
      framework,
      session_start: sessionStart.toISOString(),
      framework_rendered_at: framedAt.toISOString(),
      time_to_first_value_seconds: ttfvSeconds,
      created_at: sessionStart.toISOString(),
      updated_at: framedAt.toISOString(),
      ...(embedding ? { embedding, embedded_at: framedAt.toISOString() } : {}),
    }).select("id").single();
    if (error) throw new Error(`recurrence insert failed: ${error.message}`);
    console.log(`  ✓ "${framework.name}" → ${inserted.id}${embedding ? " (embedded)" : ""}`);
  } else {
    console.log(`  (already planted: ${existingRec.id})`);
  }

  // ═══ Run the efficacy loop ═══
  console.log(`\n─── Running the efficacy loop ───`);
  const summary = await runEfficacyLoop(orgId);
  console.log(`  summary: ${JSON.stringify({ checked: summary.checked, escalated: summary.escalated, effective: summary.effective, watching: summary.watching })}`);
  for (const o of summary.outcomes) console.log(`  · ${o.outcome}: ${o.note}`);

  // ═══ Verification — the P-4B DONE test ═══
  console.log(`\n─── Verification ───`);

  entRx = await getRx(entRx.id);
  conflictRx = await getRx(conflictRx.id);
  hrRx = await getRx(hrRx.id);
  finRx = finRx ? await getRx(finRx.id) : null;

  // 1. Manager gate recorded.
  if (entRx.approved_by !== uid("elena") || !entRx.approved_at)
    fail(`entity prescription approval not recorded (approved_by=${entRx.approved_by})`);
  else ok(`manager gate: approver (Elena) + timestamp recorded`);

  // 2. Fidelity stored for the experts.
  const { data: allFidelity } = await supabase
    .from("prescription_fidelity").select("prescription_id, expert_user_id, decision").eq("org_id", orgId);
  const fidelityCount = (rxId) => (allFidelity || []).filter((f) => f.prescription_id === rxId);
  if (fidelityCount(entRx.id).length !== 1) fail(`entity prescription should have exactly 1 fidelity row`);
  else ok(`fidelity: David's confirm stored`);
  if (fidelityCount(conflictRx.id).length !== 2) fail(`conflict prescription should have 2 fidelity rows (both authors)`);
  else ok(`fidelity: BOTH conflict authors confirmed`);
  if (fidelityCount(hrRx.id).length !== 0) fail(`HR capture-first has fidelity rows — it must SKIP fidelity`);
  else ok(`capture-first skips fidelity: HR has zero fidelity rows`);

  // 3. Trainings: 3 altitudes each, v2 visibly different from v1.
  const { data: entT } = await supabase
    .from("prescription_trainings").select("version, strategy, title, altitudes, format")
    .eq("prescription_id", entRx.id).order("version");
  if ((entT || []).length < 2) fail(`entity prescription has ${entT?.length ?? 0} training versions — expected 2 (generate + regenerate)`);
  else {
    for (const t of entT) {
      const alts = t.altitudes || {};
      const okAlts = ["floor", "supervisor", "exec"].every(
        (k) => alts[k]?.title?.trim() && alts[k]?.body?.trim()
      );
      if (!okAlts) fail(`training v${t.version} is missing an altitude`);
      else ok(`training v${t.version} ("${t.strategy}") carries all 3 altitudes`);
    }
    if (entT[0].strategy.trim().toLowerCase() === entT[1].strategy.trim().toLowerCase())
      fail(`regenerate produced the SAME strategy ("${entT[0].strategy}") — not visibly different`);
    else ok(`regenerate is visibly different: "${entT[0].strategy}" → "${entT[1].strategy}" (v1 kept)`);
  }
  const { data: cT } = await supabase
    .from("prescription_trainings").select("version, format, altitudes")
    .eq("prescription_id", conflictRx.id);
  if ((cT || []).length < 1) fail(`conflict prescription has no training`);
  else ok(`conflict training generated (${cT[0].format}, 3 altitudes)`);

  // 4. Teach-back completed + scored.
  const { data: tbDone } = await supabase
    .from("prescription_teachbacks").select("score, passed, feedback")
    .eq("prescription_id", entRx.id).not("completed_at", "is", null);
  if ((tbDone || []).length === 0) fail(`no completed teach-back on the entity prescription`);
  else if (typeof tbDone[0].score !== "number" || !tbDone[0].feedback?.trim())
    fail(`teach-back stored without a score/feedback`);
  else ok(`teach-back ran and scored: ${tbDone[0].score}/100 (${tbDone[0].passed ? "passed" : "below pass line"})`);

  // 5. Efficacy: escalation on the seeded recurrence.
  if (entRx.efficacy_status !== "escalated") fail(`entity prescription efficacy is '${entRx.efficacy_status}' — expected 'escalated'`);
  else ok(`efficacy ESCALATED on the post-delivery recurrence`);
  if (entRx.rung !== 3 || entRx.escalated_from_rung !== 2)
    fail(`escalation rung math wrong: rung=${entRx.rung}, from=${entRx.escalated_from_rung} (expected 2 → 3)`);
  else ok(`escalated one rung: 2 (Micro-training) → 3 (Designed session)`);
  if ((entRx.efficacy_evidence_record_ids || []).length === 0)
    fail(`escalation stored no evidence records`);
  else ok(`escalation evidence stored (${entRx.efficacy_evidence_record_ids.length} post-delivery record)`);

  // 6. Wins-only: the efficacy note names entities, never a person.
  const noteNames = EXPERT_NAMES.filter((n) => (entRx.efficacy_note || "").includes(n));
  if (noteNames.length > 0) fail(`escalation note attributes failure to a person: ${noteNames.join(", ")}`);
  else ok(`wins-only holds: escalation note names entities, no person`);

  // 7. Efficacy: the quiet one is EFFECTIVE (and therefore NOT falsely escalated).
  if (conflictRx.efficacy_status !== "effective") fail(`conflict prescription efficacy is '${conflictRx.efficacy_status}' — expected 'effective'`);
  else ok(`quiet prescription marked EFFECTIVE (Kirkpatrick L4, logged as proof)`);
  if (conflictRx.status !== "closed") fail(`effective prescription should close (status=${conflictRx.status})`);
  else ok(`effective → closed`);
  if ((conflictRx.efficacy_evidence_record_ids || []).length !== 0)
    fail(`quiet prescription has recurrence evidence — false escalation risk`);
  else ok(`no false escalation: quiet prescription carries zero recurrence evidence`);

  // 8. Snooze defers, never deletes.
  if (!finRx) console.log(`  ⚠️ snooze-defers guardrail skipped (no second coverage gap on this org)`);
  else if (finRx.status !== "snoozed" || !finRx.snoozed_until) fail(`snooze target should be snoozed with a wake date (status=${finRx.status})`);
  else if (new Date(finRx.snoozed_until).getTime() < Date.now()) fail(`snooze wake date is in the past`);
  else ok(`snooze defers: snooze target snoozed until ${finRx.snoozed_until.slice(0, 10)}, row intact`);

  // 9. HR stays an honest codify target.
  if (hrRx.status !== "approved") fail(`HR should sit at 'approved' as a codify target (status=${hrRx.status})`);
  else ok(`HR (capture-first): approved codify target, no training, no fidelity`);

  // ─── the queue, as an exec would see it ───
  const { data: finalRx } = await supabase
    .from("prescriptions")
    .select("gap_summary, status, rung, efficacy_status, capture_first, roi_score")
    .eq("org_id", orgId)
    .order("roi_score", { ascending: false });
  console.log(`\n─── Final queue state ───`);
  for (const p of finalRx || []) {
    console.log(`  [${p.status}${p.efficacy_status ? ` · ${p.efficacy_status}` : ""}] rung ${p.rung}${p.capture_first ? " · capture-first" : ""} — ${p.gap_summary.slice(0, 90)}...`);
  }

  if (!pass) {
    console.error(`\nP-4B seed verification FAILED.`);
    process.exit(1);
  }
  console.log(`\nP-4B seed verification PASSED. Open /prescriptions as any Meridian expert:`);
  console.log(`  · the escalated one shows 🔺 with its post-delivery evidence`);
  console.log(`  · the effective one shows ✅ closed with the quiet-window proof`);
  console.log(`  · HR sits approved as an honest capture-first target · Finance is snoozed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
