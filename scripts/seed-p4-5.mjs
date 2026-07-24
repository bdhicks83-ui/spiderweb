// P-4.5 Build 5 — Win Column seed extension + verification harness.
//
// Reuses the existing Meridian demo org and its 14 P-1 pattern_records
// UNCHANGED — "Marcus Webb" (win records: Elena/47d, Tom/19d, Angela/6d) and
// "Denise Ortiz" (win records: David/60d, Priya/12d) already demonstrate
// multi-expert corroboration, and (per src/lib/win-column.ts's cross-dept
// rule — 2+ distinct context_function values across a person's mentions)
// both already demonstrate cross-dept impact with zero changes needed.
// This script does NOT touch, delete, or replant any of those 14 records —
// P-4A/P-4B's detections/prescriptions reference their exact ids and a
// --force reseed of seed-p1-demo.mjs would break both closed builds.
//
// What's missing from the existing 14 that the P-4.5 DONE test needs, and
// what this script ADDS (3 new pattern_records, real pipeline, backdated):
//   1. A FAILURE-type record naming a person who already has a win cluster
//      (Marcus Webb) — the strongest possible proof that the wins-only
//      filter holds even for someone prominent, not just "no failure record
//      happens to name anyone."
//   2. A single-mention person (recent) — proves a low-corroboration card
//      renders honestly (not inflated, not hidden).
//   3. A stale, single-mention person (no mentions in 45+ days) — the
//      retention-watch example; framed as an actionable prompt, never a
//      performance judgment.
//
// Idempotent per-record (not per-org): each of the 3 records below carries
// a unique marker substring checked via ilike before inserting; --force
// deletes+replants only THESE 3 records by marker, never the original 14.
//
// Usage: node scripts/seed-p4-5.mjs [--force]
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import path from "node:path";

const envRaw = await readFile(path.join(process.cwd(), ".env.local"), "utf-8");
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const FORCE = process.argv.includes("--force");

const anthropic = new Anthropic({ timeout: 60_000, maxRetries: 0 });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DEMO_ORG_NAME = "Meridian Precision Manufacturing (DEMO)";

// ─── verbatim from scripts/seed-p1-demo.mjs (copy-don't-import) ───
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
  const prompt = frameTemplate.replaceAll("{{record}}", formatRecordState(fields));
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
const METHOD_Q = {
  "5whys_fishbone": {
    signal: "What broke, specifically — what did you see, hear, or measure that told you something had failed?",
    reasoning: "Why did that actually cause the failure — walk the chain of causes, not just the first domino.",
    entity: "Which machine or equipment, which process step, and what error type was this? Name the specific asset if there is one.",
    boundaries: "Where would this same fix NOT hold — a different machine, a different failure mode, a different scale?",
  },
  aar_success_case: {
    signal: "What specifically happened that made this a win — the concrete moment or decision, not just the outcome?",
    reasoning: "Why did that approach work — what made it the right move rather than the default one?",
    entity: "Who was involved in making this work, and who else benefits downstream? Names are fine — they stay internal to your org.",
    boundaries: "Under what conditions would this NOT work as well — a different team, a different starting point, a different scale?",
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

// ─── verbatim mirror of src/lib/win-column.ts — keep in sync ───
function normalizePersonKey(name) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}
function extractContextChip(text, personName, maxLen = 160) {
  if (!text || !text.trim()) return "";
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim());
  const nameLower = personName.toLowerCase();
  const hit = sentences.find((s) => s.toLowerCase().includes(nameLower)) ?? sentences[0] ?? text;
  let chip = hit.trim();
  if (chip.length > maxLen) {
    const cut = chip.slice(0, maxLen);
    const lastSpace = cut.lastIndexOf(" ");
    chip = (lastSpace > maxLen * 0.6 ? cut.slice(0, lastSpace) : cut).trim() + "…";
  }
  return chip;
}
const RETENTION_WATCH_STALE_DAYS = 45;
function daysBetween(aIso, bIso) {
  return Math.abs(new Date(bIso).getTime() - new Date(aIso).getTime()) / 86_400_000;
}
function aggregateWinColumn(allRecords, authorNamesById, nowIso) {
  const winRecords = allRecords.filter((r) => r.trigger_type === "win");
  const byKey = new Map();
  for (const record of winRecords) {
    const entities = record.entity_map ?? [];
    for (const entity of entities) {
      if (entity.type !== "role_person") continue;
      const key = normalizePersonKey(entity.name);
      if (!key) continue;
      const mention = {
        recordId: record.id,
        authorId: record.user_id,
        authorName: authorNamesById[record.user_id] ?? "Org member",
        date: record.created_at,
        contextFunction: record.context_function,
        chip: extractContextChip(record.signal_detail ?? record.judgment, entity.name),
        detail: entity.detail,
        frameworkName: record.framework?.name ?? null,
      };
      const existing = byKey.get(key);
      if (existing) existing.mentions.push(mention);
      else byKey.set(key, { displayName: entity.name.trim(), mentions: [mention] });
    }
  }
  const people = [];
  for (const [personKey, { displayName, mentions }] of byKey) {
    const sorted = [...mentions].sort((a, b) => new Date(a.date) - new Date(b.date));
    const authorIds = new Set(sorted.map((m) => m.authorId));
    const departments = Array.from(new Set(sorted.map((m) => m.contextFunction).filter(Boolean)));
    const gaps = [];
    for (let i = 1; i < sorted.length; i++) gaps.push(daysBetween(sorted[i - 1].date, sorted[i].date));
    const risingSignal = gaps.length >= 2 && gaps[gaps.length - 1] < gaps[gaps.length - 2];
    const mostRecentMentionDate = sorted[sorted.length - 1].date;
    const retentionWatch = daysBetween(mostRecentMentionDate, nowIso) > RETENTION_WATCH_STALE_DAYS;
    people.push({
      personKey, displayName,
      mentionCount: sorted.length,
      distinctAuthorCount: authorIds.size,
      departmentsTouched: departments,
      mostRecentMentionDate,
      mentions: sorted,
      crossDeptImpact: departments.length >= 2,
      risingSignal, retentionWatch,
    });
  }
  return people;
}
function assertWinsOnly(allRecords, people) {
  const nonWinIds = new Set(allRecords.filter((r) => r.trigger_type !== "win").map((r) => r.id));
  const leaks = [];
  for (const person of people) {
    for (const mention of person.mentions) {
      if (nonWinIds.has(mention.recordId)) leaks.push(`${person.displayName} ← record ${mention.recordId}`);
    }
  }
  return leaks.length ? { ok: false, leaks } : { ok: true };
}

// ─── the 3 records to add ───
// marker = a unique substring used for idempotency checks AND deletion scope
// on --force. Never matches anything in the original 14 seed-p1 records.
const NEW_RECORDS = [
  {
    marker: "[p4-5-guardrail]",
    expert: "priya",
    daysAgo: 5,
    trigger_type: "broke",
    method: "5whys_fishbone",
    context_summary:
      "[p4-5-guardrail] Technical Director of Quality Systems traced a batch of undersized rivet holes on Line 3 back to a fixture drift issue during Marcus Webb's shift.",
    context_org_size: "200-1000", context_function: "Quality", situation_type: "Process failure", intervention_type: "Re-sequence",
    trigger_signal: "Line 3 produced a run of rivet holes 0.008\" undersized during a 2nd-shift run, caught at final QC.",
    signal_detail:
      "The drift traced to a locating pin that had worn past spec on the fixture itself — nothing in the shift's operation caused it. Marcus Webb's crew ran the shift exactly to standard work; the pin's wear was outside anyone's visibility on the floor, and the maintenance interval for that specific pin had never been set because it was a newer fixture variant.",
    judgment: "Add the locating pin to the fixture's preventive-maintenance schedule with a wear-gauge check every 5,000 cycles, rather than relying on QC catching drift after the fact.",
    rationale: "This was a tooling maintenance gap, not an operator or shift issue — the fix belongs in the PM schedule, not in retraining anyone on that shift.",
    boundaries: "This fix doesn't apply to fixtures already on a wear-gauge PM schedule — only ones, like this fixture variant, that were missed when the schedule was originally set up.",
    entity_map: [
      { type: "role_person", name: "Marcus Webb", detail: "2nd-shift press lead, Line 3" },
      { type: "equipment_asset", name: "Line 3 locating pin", detail: null },
      { type: "error_class", name: "Fixture wear drift — undersized hole", detail: null },
    ],
  },
  {
    marker: "[p4-5-single-mention]",
    expert: "angela",
    daysAgo: 4,
    trigger_type: "win",
    method: "aar_success_case",
    context_summary:
      "[p4-5-single-mention] Sr. Manager of 2nd Shift Production credited a changeover tech for catching a mislabeled coil before it reached the press.",
    context_org_size: "200-1000", context_function: "Ops", situation_type: "Process failure", intervention_type: "Remove",
    trigger_signal: "A coil of stock arrived with a supplier label that didn't match the material actually on the reel, headed for a run that specified the labeled grade.",
    signal_detail:
      "Jamal Foster, one of our changeover techs, noticed the coil's edge color didn't match what that supplier normally ships for this grade and pulled it before staging, instead of trusting the label and moving on. A quick material check confirmed the coil was mislabeled — running it would have produced an entire shift's parts out of spec.",
    judgment: "Add a visual edge-color spot-check to the incoming-coil staging step, crediting Jamal's catch as the reason to formalize it.",
    rationale: "The label alone isn't a reliable single point of truth for material identity — a fast visual cross-check catches exactly this failure mode before it reaches the press.",
    boundaries: "This spot-check only helps for materials with a visually distinguishable tell like edge color — it wouldn't catch a mislabel between two visually identical grades.",
    entity_map: [
      { type: "role_person", name: "Jamal Foster", detail: "changeover technician, 2nd shift" },
      { type: "process", name: "Incoming coil staging", detail: null },
    ],
  },
  {
    marker: "[p4-5-retention-watch]",
    expert: "david",
    daysAgo: 85,
    trigger_type: "win",
    method: "aar_success_case",
    context_summary:
      "[p4-5-retention-watch] Technical Director of Manufacturing Engineering credited a quality inspector for catching a drawing revision mismatch before a production run started.",
    context_org_size: "200-1000", context_function: "Ops", situation_type: "Process failure", intervention_type: "Remove",
    trigger_signal: "A new job packet listed an older drawing revision than the one engineering had actually released two weeks earlier.",
    signal_detail:
      "Renata Silva, a quality inspector on the incoming side, cross-checked the job packet against the revision log before sign-off — something not technically required at her checkpoint — and caught that the packet was one revision behind. Running the job as-packaged would have produced parts to a superseded spec.",
    judgment: "Add a revision-log cross-check to the standard incoming job-packet review, using Renata's catch as the reference case for why it matters.",
    rationale: "Nothing else in the process checked the packet's revision against the released log — this closes a real gap another job could have hit at any time.",
    boundaries: "This check only matters on jobs following a recent drawing revision — stable, unrevised parts don't need the extra cross-check step.",
    entity_map: [
      { type: "role_person", name: "Renata Silva", detail: "quality inspector, incoming" },
      { type: "process", name: "Job packet revision review", detail: null },
    ],
  },
];

async function main() {
  const { data: org } = await supabase.from("orgs").select("id").eq("name", DEMO_ORG_NAME).maybeSingle();
  if (!org) throw new Error(`Demo org "${DEMO_ORG_NAME}" not found — run scripts/seed-p1-demo.mjs first.`);
  const orgId = org.id;
  console.log(`Demo org: ${orgId}`);

  const { data: profiles } = await supabase.from("profiles").select("id, display_name").eq("org_id", orgId);
  const expertIdByFirstName = {};
  for (const p of profiles || []) {
    const first = (p.display_name || "").split(" ")[0].toLowerCase();
    if (first) expertIdByFirstName[first] = p.id;
  }
  const EXPERT_KEY_TO_FIRST = { elena: "elena", david: "david", priya: "priya", tom: "tom", angela: "angela" };

  let inserted = 0, skipped = 0;
  for (const rec of NEW_RECORDS) {
    const { data: existing } = await supabase
      .from("pattern_records")
      .select("id")
      .eq("org_id", orgId)
      .ilike("context_summary", `%${rec.marker}%`);

    if (existing && existing.length > 0) {
      if (!FORCE) {
        console.log(`Skip (exists): ${rec.marker}`);
        skipped++;
        continue;
      }
      console.log(`--force: deleting ${existing.length} existing row(s) for ${rec.marker}`);
      await supabase.from("pattern_records").delete().in("id", existing.map((r) => r.id));
    }

    const userId = expertIdByFirstName[EXPERT_KEY_TO_FIRST[rec.expert]];
    if (!userId) throw new Error(`Could not resolve profile for expert "${rec.expert}"`);

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

    console.log(`Framing "${rec.marker}" (${rec.expert}, ${rec.trigger_type})...`);
    const framework = await framePattern(fields);
    if (!framework) {
      console.error(`  ⚠️ framePattern failed after retries — skipping`);
      continue;
    }

    const now = Date.now();
    const sessionStart = new Date(now - rec.daysAgo * 24 * 60 * 60 * 1000);
    const ttfvSeconds = 360 + (rec.daysAgo % 7) * 90;
    const framedAt = new Date(sessionStart.getTime() + ttfvSeconds * 1000);
    const qaPairs = buildQaPairs(fields, rec.method);

    const { error } = await supabase.from("pattern_records").insert({
      user_id: userId,
      qa_pairs: qaPairs,
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
    });
    if (error) {
      console.error(`  ⚠️ insert failed: ${error.message}`);
      continue;
    }
    inserted++;
    console.log(`  ✓ "${framework.name}"`);
  }

  console.log(`\nInserted ${inserted}, skipped ${skipped} (already present) of ${NEW_RECORDS.length} new records.`);

  // ═══ VERIFICATION — the DONE test ═══════════════════════════════════════
  console.log(`\n─── Verifying Win Column DONE test ───`);
  const { data: allRecords, error: fetchErr } = await supabase
    .from("pattern_records")
    .select("id, user_id, created_at, trigger_type, context_function, signal_detail, judgment, entity_map, framework")
    .eq("org_id", orgId)
    .eq("status", "complete");
  if (fetchErr) throw new Error(`verify fetch failed: ${fetchErr.message}`);

  const authorNamesById = Object.fromEntries((profiles || []).map((p) => [p.id, p.display_name || "Org member"]));
  const nowIso = new Date().toISOString();
  const people = aggregateWinColumn(allRecords, authorNamesById, nowIso);

  const fail = (msg) => { console.error(`  ✗ ${msg}`); process.exitCode = 1; };
  const pass = (msg) => console.log(`  ✓ ${msg}`);

  const marcus = people.find((p) => p.personKey === "marcus webb");
  const denise = people.find((p) => p.personKey === "denise ortiz");
  const jamal = people.find((p) => p.personKey === "jamal foster");
  const renata = people.find((p) => p.personKey === "renata silva");

  if (marcus && marcus.distinctAuthorCount >= 3) pass(`Marcus Webb: ${marcus.distinctAuthorCount}-expert corroboration (multi-expert badge)`);
  else fail(`Marcus Webb corroboration missing or under 3 experts (got ${marcus?.distinctAuthorCount ?? "none"})`);

  if (marcus && marcus.risingSignal) pass(`Marcus Webb: rising signal true (accelerating cadence)`);
  else fail(`Marcus Webb rising signal did not fire`);

  if (marcus && marcus.crossDeptImpact) pass(`Marcus Webb: cross-dept impact true (${marcus.departmentsTouched.join(", ")})`);
  else fail(`Marcus Webb cross-dept impact did not fire`);

  if (denise && denise.distinctAuthorCount >= 2 && denise.crossDeptImpact) pass(`Denise Ortiz: ${denise.distinctAuthorCount}-expert corroboration + cross-dept (${denise.departmentsTouched.join(", ")})`);
  else fail(`Denise Ortiz corroboration/cross-dept check failed`);

  if (jamal && jamal.mentionCount === 1 && jamal.distinctAuthorCount === 1) pass(`Jamal Foster: single-mention person renders honestly (1 mention, 1 expert)`);
  else fail(`Jamal Foster single-mention case missing or malformed`);

  if (renata && renata.retentionWatch) pass(`Renata Silva: retention watch fires (no mention in ${RETENTION_WATCH_STALE_DAYS}+ days)`);
  else fail(`Renata Silva retention watch did not fire`);

  const winsOnly = assertWinsOnly(allRecords, people);
  if (winsOnly.ok) pass(`Wins-only rollup: zero failure-record leaks across ${people.length} people, ${allRecords.length} total records`);
  else fail(`WINS-ONLY LEAK DETECTED: ${winsOnly.leaks.join("; ")}`);

  // Explicit proof the guardrail record itself is excluded from Marcus's own rollup.
  const guardrailRecord = allRecords.find((r) => r.trigger_type === "broke" && (r.signal_detail || "").includes("Marcus Webb"));
  if (guardrailRecord && marcus && !marcus.mentions.some((m) => m.recordId === guardrailRecord.id)) {
    pass(`Guardrail record ${guardrailRecord.id} (failure, names Marcus Webb) confirmed ABSENT from Marcus's rollup`);
  } else if (!guardrailRecord) {
    fail(`Could not find the planted guardrail failure record to check against`);
  } else {
    fail(`Guardrail failure record LEAKED into Marcus Webb's rollup`);
  }

  // Evidence packet compiles for one corroborated person.
  if (marcus && marcus.mentions.length === marcus.mentionCount) {
    pass(`Evidence packet compiles for Marcus Webb (${marcus.mentions.length} entries, all wins)`);
  } else {
    fail(`Evidence packet did not compile cleanly for Marcus Webb`);
  }

  if (process.exitCode === 1) {
    console.log(`\n❌ P-4.5 DONE test FAILED — see ✗ lines above.`);
  } else {
    console.log(`\n✅ P-4.5 DONE test PASSED.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
