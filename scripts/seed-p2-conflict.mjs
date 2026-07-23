// P-2 Build 4 — Planted conflict in the demo org + near-miss verification.
//
// Adds ONE deliberate, realistic conflict to "Meridian Precision
// Manufacturing (DEMO)" between two DIFFERENT seeded experts — same
// territory, opposing plays:
//
//   Angela Brooks (Sr. Manager, 2nd Shift Production) — changeover SPEED:
//     release production in PARALLEL with first-piece inspection on
//     same-die-family swaps (conditional release) to stop idling the crew.
//   Priya Nair (Technical Director, Quality Systems) — QC gate RIGOR:
//     after a live escape, HARD HOLD — no production release until
//     first-piece passes the full check after EVERY die change,
//     same-family swaps explicitly included.
//
// Shared territory: post-changeover first-piece release on the press lines
// (both records carry the same `process` entity, so the deterministic
// candidate filter pairs them). Opposing judgment: parallel release vs.
// hard hold under the same conditions. This is a true both-conditions
// conflict, generated through the REAL pipeline (actual claude-sonnet-5
// frame-pattern calls, same copy-don't-import harness as
// scripts/seed-p1-demo.mjs), backdated consistent with the existing seed
// (existing records span ~2-88 days ago; these land at 31 and 9).
//
// Then this script RUNS the P-2 detector (same logic as
// src/lib/conflict.ts + /api/conflicts/detect, org-scoped to the demo org
// only) and verifies the P-2 DONE test's detection half:
//   ✓ the planted pair IS flagged
//   ✓ the NEAR-MISS pair is NOT flagged — Elena's and Angela's win records
//     about Marcus Webb's changeover pre-staging method share territory
//     vocabulary AND entities (both carry Marcus Webb + die changeover
//     staging) but prescribe the SAME play, so a correct detector must
//     leave them alone. False positives are the failure mode.
// Exits non-zero if either check fails.
//
// Idempotent: re-running skips records that already exist (matched on
// context_summary) and detection skips pairs that already have a conflict
// row. Pass --force to delete the two planted records + their conflict
// rows first (never touches the P-1 seed or any other org).
//
// Usage: node scripts/seed-p2-conflict.mjs [--force]
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

// ─── conflict detection, verbatim logic from src/lib/conflict.ts ───
const conflictTemplate = await readFile(path.join(process.cwd(), "prompts", "conflict-xray.md"), "utf-8");
async function checkFrameworkConflict(a, b) {
  const prompt = conflictTemplate
    .replaceAll("{{framework_a}}", () => a)
    .replaceAll("{{framework_b}}", () => b);
  for (let attempt = 0; attempt < 3; attempt++) {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 768,
      messages: [{ role: "user", content: prompt }],
    });
    const text = firstText(msg.content);
    const parsed = text ? parseJsonLoose(text) : null;
    if (
      parsed &&
      typeof parsed.overlapping_boundaries === "boolean" &&
      typeof parsed.opposing_judgment === "boolean"
    ) {
      const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
      return {
        overlappingBoundaries: parsed.overlapping_boundaries,
        opposingJudgment: parsed.opposing_judgment,
        territory: str(parsed.territory),
        rationale: str(parsed.rationale),
      };
    }
  }
  return null;
}

function sharesEntity(a, b) {
  const bKeys = new Set((b.entity_map || []).map((e) => `${e.type}|${e.name.trim().toLowerCase()}`));
  return (a.entity_map || []).some((e) => bKeys.has(`${e.type}|${e.name.trim().toLowerCase()}`));
}
function sameOntologyCell(a, b) {
  return (
    !!a.situation_type && !!a.context_function && !!a.intervention_type &&
    a.situation_type === b.situation_type &&
    a.context_function === b.context_function &&
    a.intervention_type === b.intervention_type
  );
}
function isCandidatePair(a, b) {
  if (a.user_id === b.user_id) return false;
  return sharesEntity(a, b) || sameOntologyCell(a, b);
}
function formatRecordForConflict(r) {
  const f = r.framework;
  const entities = (r.entity_map || [])
    .map((e) => `${e.type}: ${e.name}${e.detail ? ` (${e.detail})` : ""}`)
    .join("; ");
  return [
    f ? `Framework name: ${f.name}` : "Framework name: (not yet rendered)",
    f ? `Tagline: ${f.tagline}` : null,
    `Context: ${r.context_summary ?? "(none)"}`,
    `Classification: situation=${r.situation_type ?? "?"} · function=${r.context_function ?? "?"} · intervention=${r.intervention_type ?? "?"}`,
    `Trigger/Signal: ${r.trigger_signal ?? "(none)"}`,
    `Judgment (the play): ${r.judgment ?? "(none)"}`,
    `Rationale: ${r.rationale ?? "(none)"}`,
    `Boundaries (when NOT to apply): ${r.boundaries ?? "(none)"}`,
    `Entities: ${entities || "(none)"}`,
  ].filter((l) => l !== null).join("\n");
}

// ─── the two planted records ───
// Shared process entity name is IDENTICAL on both sides on purpose — that's
// what makes them a candidate pair for the deterministic filter.
const SHARED_PROCESS_ENTITY = "Post-changeover first-piece release";

const ANGELA_SUMMARY =
  "Sr. Manager of 2nd Shift Production pushed to stop idling press crews during the post-changeover first-piece QC hold by releasing production in parallel with inspection on same-die-family swaps.";
const PRIYA_SUMMARY =
  "Technical Director of Quality Systems locked down first-piece release after an out-of-spec run reached a customer when a press line resumed production before first-piece inspection had finished.";

const PLANTED = [
  {
    expertEmail: "angela.brooks@meridian-demo.example",
    daysAgo: 9,
    trigger_type: "friction",
    method: "a3",
    context_summary: ANGELA_SUMMARY,
    context_org_size: "200-1000",
    context_function: "Ops",
    situation_type: "Process failure",
    intervention_type: "Re-sequence",
    trigger_signal:
      "Every die changeover ends with the whole press crew standing idle for 20-25 minutes waiting on the first-piece QC check before the line is allowed to run again — on a high-mix day that's over an hour of lost crew time per press.",
    signal_detail:
      "The first-piece failures we actually see almost never come from same-family die swaps — they come from new dies and post-maintenance restarts. On same-family swaps with a clean prior run, the first-piece check has passed essentially every time for months, which means the hold is buying us almost nothing exactly where it costs us the most crew time.",
    judgment:
      "On same-die-family changeovers with a clean prior run, restart production in parallel with the first-piece inspection — run at reduced rate and quarantine the output until the first piece passes, instead of holding the whole line dark until QC signs off.",
    rationale:
      "The hold treats every changeover as equally risky when the risk is concentrated in a small, identifiable subset. Quarantining the parallel output keeps an escape contained if a first piece ever does fail, so we trade almost no risk for recovering the single biggest block of idle crew time on the shift.",
    boundaries:
      "This only applies to same-family die swaps with a clean prior run on that press. New dies, new SKUs, post-maintenance restarts, or any press with a recent first-piece failure still get the full hold — those are exactly where first-piece failures actually happen.",
    entity_map: [
      { type: "process", name: SHARED_PROCESS_ENTITY, detail: "same-family die swaps" },
      { type: "department", name: "2nd Shift Production", detail: null },
      { type: "equipment_asset", name: "Line 3 stamping press", detail: null },
    ],
  },
  {
    expertEmail: "priya.nair@meridian-demo.example",
    daysAgo: 31,
    trigger_type: "broke",
    method: "5whys_fishbone",
    context_summary: PRIYA_SUMMARY,
    context_org_size: "200-1000",
    context_function: "Quality",
    situation_type: "Process failure",
    intervention_type: "Add",
    trigger_signal:
      "A customer flagged out-of-spec stamped parts from a run where the press had been restarted after a die change while the first-piece check was still in progress — roughly 300 parts were produced before the first piece came back out of tolerance.",
    signal_detail:
      "The die swap was a same-family changeover the crew considered low-risk, which is exactly why the line went back up early — but the shim stack had been reassembled wrong, something no amount of prior clean runs on that die family could predict. The parts made during the 'safe' parallel window were the escape; if the line had been held for the twenty-minute check, the same failure would have cost twenty minutes instead of a customer claim.",
    judgment:
      "No production release until the first piece passes the full inspection after EVERY die change, explicitly including same-family swaps — the hold is the gate, and running 'in parallel with' the check on any category of changeover is treating the gate as optional.",
    rationale:
      "First-piece inspection exists precisely because setup errors are unpredictable one-off events — a clean history on a die family says nothing about whether THIS setup was assembled correctly. Categorizing changeovers as too-safe-to-hold reintroduces the exact escape path the gate was built to close, and the cost asymmetry is brutal: the hold costs minutes, an escape costs a customer.",
    boundaries:
      "This is about production release against first-piece inspection on the stamping presses — it doesn't govern in-run SPC sampling frequency, and it doesn't apply to processes with no setup step to get wrong. If a future press gets tooling with verified poka-yoke setup that makes wrong assembly physically impossible, the gate could be revisited for that press specifically.",
    entity_map: [
      { type: "process", name: SHARED_PROCESS_ENTITY, detail: "the QC gate on all die changes" },
      { type: "department", name: "Quality", detail: null },
      { type: "error_class", name: "First-piece escape", detail: "parallel release before inspection passed" },
    ],
  },
];

// The NEAR-MISS pair (same topic, compatible judgment — must NOT flag):
// Elena's and Angela's existing P-1 win records about Marcus Webb's
// changeover pre-staging method. Identified by their seeded summaries.
const NEAR_MISS_A_SUMMARY_START =
  "VP Operations at a ~350-person precision manufacturer";
const NEAR_MISS_B_SUMMARY_START =
  "Sr. Manager of 2nd Shift Production credited a record-output day";

// ─── qa transcript builder (verbatim wording from seed-p1-demo.mjs) ───
const METHOD_Q = {
  a3: {
    signal: "What specifically keeps recurring — the concrete gap between what should happen and what actually does?",
    reasoning: "Why does that gap keep recurring instead of getting fixed for good?",
    entity: "Which process, department, or role does this friction keep showing up in?",
    boundaries: "Where does this correction NOT apply — a different process, or a different root cause?",
  },
  "5whys_fishbone": {
    signal: "What broke, specifically — what did you see, hear, or measure that told you something had failed?",
    reasoning: "Why did that actually cause the failure — walk the chain of causes, not just the first domino.",
    entity: "Which machine or equipment, which process step, and what error type was this? Name the specific asset if there is one.",
    boundaries: "Where would this same fix NOT hold — a different machine, a different failure mode, a different scale?",
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

// ─── main ───
async function main() {
  const { data: org } = await supabase
    .from("orgs")
    .select("id")
    .eq("name", DEMO_ORG_NAME)
    .maybeSingle();
  if (!org) throw new Error(`Demo org "${DEMO_ORG_NAME}" not found — run scripts/seed-p1-demo.mjs first.`);
  const orgId = org.id;
  console.log(`Demo org: "${DEMO_ORG_NAME}" → ${orgId}`);

  // ─── --force: remove the two planted records + their conflict rows ───
  if (FORCE) {
    const { data: planted } = await supabase
      .from("pattern_records")
      .select("id")
      .eq("org_id", orgId)
      .in("context_summary", [ANGELA_SUMMARY, PRIYA_SUMMARY]);
    const ids = (planted || []).map((r) => r.id);
    if (ids.length > 0) {
      console.log(`--force: deleting ${ids.length} planted record(s) + their conflicts...`);
      // framework_conflicts rows cascade on record delete, but clear both
      // sides explicitly in case only one planted record is being removed.
      await supabase.from("framework_conflicts").delete().or(
        `record_a_id.in.(${ids.join(",")}),record_b_id.in.(${ids.join(",")})`
      );
      await supabase.from("pattern_records").delete().in("id", ids);
    }
  }

  // ─── insert the two planted records via the real pipeline ───
  const now = Date.now();
  const plantedIds = [];
  for (const rec of PLANTED) {
    const { data: existing } = await supabase
      .from("pattern_records")
      .select("id")
      .eq("org_id", orgId)
      .eq("context_summary", rec.context_summary)
      .maybeSingle();
    if (existing) {
      console.log(`Already planted (${rec.expertEmail}): ${existing.id} — skipping insert.`);
      plantedIds.push(existing.id);
      continue;
    }

    // Resolve the author via auth admin (profiles carry no email).
    let userId = null;
    let page = 1;
    for (;;) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(`listUsers failed: ${error.message}`);
      const found = data.users.find((u) => u.email === rec.expertEmail);
      if (found) { userId = found.id; break; }
      if (data.users.length < 200) break;
      page++;
    }
    if (!userId) throw new Error(`Seeded expert ${rec.expertEmail} not found — run seed-p1-demo.mjs first.`);

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
    if (!framework) throw new Error("framePattern failed after retries — aborting (planted conflict must go through the real pipeline).");

    const sessionStart = new Date(now - rec.daysAgo * 24 * 60 * 60 * 1000);
    const ttfvSeconds = 360 + (rec.daysAgo % 7) * 90; // same variation rule as seed-p1
    const framedAt = new Date(sessionStart.getTime() + ttfvSeconds * 1000);

    const { data: insertedRow, error } = await supabase
      .from("pattern_records")
      .insert({
        user_id: userId,
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
      })
      .select("id")
      .single();
    if (error) throw new Error(`insert failed: ${error.message}`);
    plantedIds.push(insertedRow.id);
    console.log(`  ✓ "${framework.name}" → ${insertedRow.id}`);
  }

  // ─── run detection, org-scoped to the demo org only ───
  console.log(`\nRunning Conflict X-ray for org ${orgId}...`);
  const { data: recordsRaw, error: recError } = await supabase
    .from("pattern_records")
    .select(
      "id, user_id, org_id, created_at, context_summary, context_function, situation_type, intervention_type, trigger_signal, judgment, rationale, boundaries, entity_map, framework"
    )
    .eq("org_id", orgId)
    .eq("status", "complete");
  if (recError) throw new Error(recError.message);
  const records = recordsRaw || [];

  const { data: existingConflicts } = await supabase
    .from("framework_conflicts")
    .select("record_a_id, record_b_id")
    .eq("org_id", orgId);
  const existingPairs = new Set(
    (existingConflicts || []).map((c) => `${c.record_a_id}|${c.record_b_id}`)
  );

  const pairs = [];
  for (let i = 0; i < records.length; i++) {
    for (let j = i + 1; j < records.length; j++) {
      const x = records[i], y = records[j];
      if (!isCandidatePair(x, y)) continue;
      const [a, b] = x.id < y.id ? [x, y] : [y, x];
      pairs.push({ a, b });
    }
  }
  console.log(`  ${records.length} complete records · ${pairs.length} cross-user candidate pairs`);

  const verdicts = new Map(); // "aId|bId" -> judgement
  let flagged = 0;
  for (const { a, b } of pairs) {
    const key = `${a.id}|${b.id}`;
    if (existingPairs.has(key)) {
      console.log(`  · pair already has a conflict row — skipping (${key})`);
      continue;
    }
    const judgement = await checkFrameworkConflict(
      formatRecordForConflict(a),
      formatRecordForConflict(b)
    );
    verdicts.set(key, judgement);
    const fire = judgement && judgement.overlappingBoundaries && judgement.opposingJudgment;
    console.log(
      `  · ${a.framework?.name ?? a.id.slice(0, 8)} × ${b.framework?.name ?? b.id.slice(0, 8)} → ` +
      (judgement
        ? `overlap=${judgement.overlappingBoundaries} opposing=${judgement.opposingJudgment}${fire ? " ⚠️ FLAG" : ""}`
        : "model failed (fail open, no flag)")
    );
    if (!fire) continue;
    const { error: insertError } = await supabase.from("framework_conflicts").insert({
      org_id: orgId,
      record_a_id: a.id,
      record_b_id: b.id,
      territory: judgement.territory,
      rationale:
        judgement.rationale ??
        `Both frameworks claim ${judgement.territory ?? "the same territory"} and prescribe opposing plays.`,
      detected_by: "conflict-xray-v1",
    });
    if (insertError) console.warn(`    insert failed: ${insertError.message}`);
    else flagged++;
  }
  console.log(`  ${flagged} new conflict(s) written.`);

  // ─── DONE-test verification ───
  console.log(`\n─── Verification ───`);
  let pass = true;

  // 1. Planted pair IS flagged (this run or a previous one).
  const [p1, p2] = [...plantedIds].sort();
  const { data: plantedConflict } = await supabase
    .from("framework_conflicts")
    .select("id, status, territory, rationale")
    .eq("record_a_id", p1)
    .eq("record_b_id", p2)
    .maybeSingle();
  if (plantedConflict) {
    console.log(`  ✓ PLANTED CONFLICT FLAGGED — conflict ${plantedConflict.id} (${plantedConflict.status})`);
    console.log(`     territory: ${plantedConflict.territory}`);
  } else {
    console.error(`  ✗ FAIL — the planted pair (${p1}, ${p2}) was NOT flagged.`);
    pass = false;
  }

  // 2. Near-miss pair is NOT flagged (same topic — Marcus Webb's pre-staging
  //    method — compatible judgment).
  const nearA = records.find((r) => r.context_summary?.startsWith(NEAR_MISS_A_SUMMARY_START));
  const nearB = records.find((r) => r.context_summary?.startsWith(NEAR_MISS_B_SUMMARY_START));
  if (!nearA || !nearB) {
    console.error(`  ✗ FAIL — could not locate the near-miss pair records (P-1 seed missing?).`);
    pass = false;
  } else {
    const [n1, n2] = [nearA.id, nearB.id].sort();
    const wasCandidate = isCandidatePair(nearA, nearB);
    const { data: nearConflict } = await supabase
      .from("framework_conflicts")
      .select("id")
      .eq("record_a_id", n1)
      .eq("record_b_id", n2)
      .maybeSingle();
    if (nearConflict) {
      console.error(`  ✗ FAIL — near-miss pair WAS flagged (conflict ${nearConflict.id}). False positive.`);
      pass = false;
    } else {
      const verdict = verdicts.get(`${n1}|${n2}`);
      console.log(
        `  ✓ NEAR-MISS NOT FLAGGED — Elena × Angela pre-staging wins ` +
        `(candidate=${wasCandidate}${verdict ? `, detector said overlap=${verdict.overlappingBoundaries} opposing=${verdict.opposingJudgment}` : ", already settled in an earlier run"})`
      );
    }
  }

  if (!pass) {
    console.error(`\nP-2 seed verification FAILED.`);
    process.exit(1);
  }
  console.log(`\nP-2 seed verification PASSED. Open /conflicts as any Meridian expert to review, and /library to see both contested badges.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
