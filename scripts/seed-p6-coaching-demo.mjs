// P-6 — Coaching Watch demo seed.
//
// Two things the demo library doesn't have yet, both required for the
// manager-only Coaching Watch page to show anything:
//   1. manager_id relationships between the 5 seeded demo experts (profiles
//      has no reporting structure until this runs).
//   2. Enough concern/friction pattern_records naming a REGISTERED person
//      (not "Marcus Webb"/"Denise Ortiz" — they're unregistered subjects,
//      not accounts, so they can never appear on this page — see
//      retraining-watch.ts header) to cross the 2-record threshold.
//
// Org chart assigned (fictional, demo-only):
//   Elena Ruiz (VP Ops)            — no manager, top of chart
//     └─ David Chen (Tech Dir, Mfg Eng)     — manager: Elena
//     └─ Priya Nair (Tech Dir, Quality)     — manager: Elena
//          └─ Tom Whitfield (Sr Mgr, Maint) — manager: David
//          └─ Angela Brooks (Sr Mgr, 2nd Shift) — manager: David
//
// Watch signal target: Tom Whitfield. Three concern/friction records
// (authored by Elena, Priya, Angela — never by Tom, never by his manager
// David, though David is who SEES the resulting signal) name him as a
// role_person entity, all describing the same real pattern — overnight
// maintenance escalations not reaching the floor lead in time — never
// framed as "Tom is the problem," consistent with the blameless-doctrine
// summary copy retraining-watch.ts generates. This is exactly the pattern
// the feature exists to catch: three independent people separately
// noticing the same friction before it becomes a documented failure.
//
// Same "real pipeline, not raw inserts" doctrine as seed-p1-demo.mjs — each
// record's framework is actually rendered by claude-sonnet-5 via
// prompts/frame-pattern.md, only the Q&A ladder is pre-scripted.
//
// Idempotent on the manager_id assignment (plain updates, safe to re-run).
// Idempotent on records via a marker: skips inserting if the demo org
// already has >= 3 records naming Tom Whitfield as a role_person. Pass
// --force to insert anyway (does NOT delete existing P-1 demo records).
//
// Usage: node scripts/seed-p6-coaching-demo.mjs [--force]
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

const anthropic = new Anthropic();
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DEMO_ORG_NAME = "Meridian Precision Manufacturing (DEMO)";

// ─── verbatim helpers, same as seed-p1-demo.mjs ───
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

// ─── same 5 demo experts as seed-p1-demo.mjs, keyed the same way ───
const EXPERTS = [
  { key: "elena", email: "elena.ruiz@meridian-demo.example" },
  { key: "david", email: "david.chen@meridian-demo.example" },
  { key: "priya", email: "priya.nair@meridian-demo.example" },
  { key: "tom", email: "tom.whitfield@meridian-demo.example" },
  { key: "angela", email: "angela.brooks@meridian-demo.example" },
];

// manager assignments — key reports to value
const MANAGER_OF = {
  david: "elena",
  priya: "elena",
  tom: "david",
  angela: "david",
};

// ─── 3 concern/friction records naming Tom Whitfield, none authored by
// Tom or by David (his manager) — three independent peers each separately
// noticing the same overnight-escalation friction. Blameless framing
// throughout: the pattern is the subject, not Tom's competence. ───
const RECORDS = [
  {
    expert: "elena", daysAgo: 22, trigger_type: "friction", method: "a3",
    context_summary: "VP Operations looked into why two overnight equipment issues on the maintenance side sat unresolved past shift handoff before anyone senior was looped in.",
    context_org_size: "200-1000", context_function: "Leadership", situation_type: "Process failure", intervention_type: "Measure",
    trigger_signal: "An overnight hydraulic alarm on Press #3 went unresolved for nearly two hours because the on-call escalation call was delayed past the point it should have been made.",
    signal_detail: "Tom Whitfield was the maintenance lead on call both times this happened this month, and in each case the delay traced back to the same judgment call — waiting to see if the issue would resolve on its own before escalating, rather than escalating on the first sign of trouble per the on-call standard.",
    judgment: "Flag the pattern for a direct coaching conversation on when to escalate immediately versus when to monitor, rather than treating either incident as a one-off.",
    rationale: "One late escalation could be a judgment call under ambiguous conditions; two in the same month from the same on-call lead is a pattern worth naming directly, before it becomes a third incident with worse timing or a bigger asset at stake.",
    boundaries: "This wouldn't be a pattern worth flagging if the two incidents had different on-call leads or different escalation triggers — it's specifically the repetition with the same person and the same call that makes it worth a direct conversation instead of a procedural fix.",
    entity_map: [
      { type: "role_person", name: "Tom Whitfield", detail: "Sr. Manager, Maintenance — on-call lead" },
      { type: "process", name: "Overnight escalation protocol", detail: null },
    ],
  },
  {
    expert: "priya", daysAgo: 15, trigger_type: "concern", method: "premortem",
    context_summary: "Technical Director of Quality Systems raised a concern about the maintenance escalation gap ahead of a planned high-volume production week with tighter uptime margins than usual.",
    context_org_size: "200-1000", context_function: "Quality", situation_type: "Process failure", intervention_type: "Measure",
    trigger_signal: "Quality flagged that this month's two delayed maintenance escalations both happened on Tom Whitfield's on-call shifts, right before a week where any unplanned downtime would be far more costly than normal.",
    signal_detail: "The risk isn't a one-off miss — it's that the same wait-and-see judgment call has now shown up twice from the same lead, and a high-volume week is exactly the wrong time to find out it happens a third time. This isn't about Tom's overall performance, which has been solid — it's specifically about this one recurring call under ambiguous alarm conditions.",
    judgment: "Ask Tom's manager to walk the escalation standard with him directly before the high-volume week starts, rather than waiting to see if the pattern continues on its own.",
    rationale: "Naming the specific, narrow pattern — not a general performance concern — gives his manager something concrete and coachable to address, and doing it before the high-stakes week is worth more than doing it after a third incident.",
    boundaries: "This concern is scoped tightly to the escalation-timing call specifically; it says nothing about and shouldn't be read as a signal on any other part of Tom's role.",
    entity_map: [
      { type: "role_person", name: "Tom Whitfield", detail: "Sr. Manager, Maintenance — on-call lead" },
      { type: "process", name: "Overnight escalation protocol", detail: null },
    ],
  },
  {
    expert: "angela", daysAgo: 9, trigger_type: "friction", method: "a3",
    context_summary: "Sr. Manager of 2nd Shift Production described a recurring handoff gap where her floor leads couldn't get a clear answer on an in-progress maintenance issue at shift change.",
    context_org_size: "200-1000", context_function: "Ops", situation_type: "Process failure", intervention_type: "Measure",
    trigger_signal: "Twice this month, 2nd shift's floor leads arrived to an active equipment issue with no clear status from the outgoing on-call maintenance lead about whether it had been escalated yet.",
    signal_detail: "Both times traced back to the same on-call lead, Tom Whitfield, still in a 'monitoring it' state at handoff rather than having made the escalation call earlier in his shift — which meant 2nd shift inherited an unresolved decision instead of a status update.",
    judgment: "Surface this to Tom's manager as a third independent data point on the same escalation-timing pattern, so it gets addressed directly rather than each shift lead separately working around it.",
    rationale: "From the floor, this looked like three unrelated hand-off headaches; only once it's named as one recurring judgment-call pattern does it become something worth a direct, specific conversation instead of three separate one-off complaints.",
    boundaries: "This is about handoff timing on escalation decisions specifically — it doesn't say anything about Tom's technical maintenance judgment, which hasn't been in question here.",
    entity_map: [
      { type: "role_person", name: "Tom Whitfield", detail: "Sr. Manager, Maintenance — on-call lead" },
      { type: "process", name: "Shift handoff communication", detail: null },
    ],
  },
];

// ─── helpers ───
async function findUserByEmail(email) {
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const found = data.users.find((u) => u.email === email);
    if (found) return found;
    if (data.users.length < 200) return null;
    page++;
  }
}

async function main() {
  const { data: org } = await supabase
    .from("orgs")
    .select("id")
    .eq("name", DEMO_ORG_NAME)
    .maybeSingle();
  if (!org) {
    throw new Error(`Demo org "${DEMO_ORG_NAME}" not found — run scripts/seed-p1-demo.mjs first.`);
  }
  const orgId = org.id;
  console.log(`Demo org: "${DEMO_ORG_NAME}" (${orgId})`);

  const expertIds = {};
  for (const expert of EXPERTS) {
    const user = await findUserByEmail(expert.email);
    if (!user) throw new Error(`${expert.email} not found — run scripts/seed-p1-demo.mjs first.`);
    expertIds[expert.key] = user.id;
  }

  console.log("\nAssigning manager_id relationships:");
  for (const [reportKey, managerKey] of Object.entries(MANAGER_OF)) {
    const { error } = await supabase
      .from("profiles")
      .update({ manager_id: expertIds[managerKey] })
      .eq("id", expertIds[reportKey]);
    if (error) throw new Error(`manager_id update failed for ${reportKey}: ${error.message}`);
    console.log(`  ${reportKey} → reports to ${managerKey}`);
  }

  // idempotency check: count existing pattern_records in this org whose
  // entity_map already names Tom Whitfield as a role_person
  const { data: existingRecords } = await supabase
    .from("pattern_records")
    .select("id, entity_map")
    .eq("org_id", orgId);
  const existingTomMentions = (existingRecords ?? []).filter((r) =>
    (r.entity_map ?? []).some(
      (e) => e.type === "role_person" && (e.name ?? "").trim().toLowerCase() === "tom whitfield"
    )
  ).length;

  if (existingTomMentions >= RECORDS.length && !FORCE) {
    console.log(
      `\nAlready ${existingTomMentions} record(s) naming Tom Whitfield — skipping insert. Pass --force to insert anyway.`
    );
    console.log(`\nNext: log in as david.chen@meridian-demo.example, open /coaching, click "Run detection".`);
    return;
  }

  const now = Date.now();
  let inserted = 0;
  for (const rec of RECORDS) {
    const userId = expertIds[rec.expert];
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

    console.log(`\nFraming "${fields.context_summary.slice(0, 60)}..." (${rec.expert}, ${rec.trigger_type}/${rec.method})`);
    const framework = await framePattern(fields);
    if (!framework) {
      console.error(`  ⚠️ framePattern failed after retries — skipping this record`);
      continue;
    }

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

  console.log(`\nInserted ${inserted}/${RECORDS.length} concern/friction records naming Tom Whitfield.`);
  console.log(`Next: log in as david.chen@meridian-demo.example (Demo-Meridian-2026! from seed-p1), open /coaching, click "Run detection".`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
