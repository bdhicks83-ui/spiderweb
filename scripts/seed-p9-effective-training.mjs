// P-7 Build 6 / P-8 Phase 2 — LIVE-VERIFY SEED for the closed loop.
//
// PROBLEM THIS SOLVES: the efficacy watch needs a 14-day quiet window, so a
// live browser verification of "resolved training codifies into the graph"
// can't wait for real time to pass. This seeds ONE deployed Training Studio
// request whose prescription was delivered 16 days ago with no recurrence —
// so the FIRST click of "Check whether it landed" on the deployed app flips it
// to effective LIVE, and the codification + embedding + retrieval path runs in
// front of you (nothing pre-codified: the seed leaves the interesting part to
// the real code).
//
// Run from PowerShell (needs .env.local + internet):
//   node scripts/seed-p9-effective-training.mjs
//
// Idempotent: keys the detection on a fixed dedupe_key and aborts if it
// already exists. Writes ONLY into the demo org ("Meridian Precision
// Manufacturing (DEMO)"). Touches nothing else — and never goes anywhere near
// bdhicks83+test1@gmail.com.
//
// The story (chosen to NOT collide with any existing demo storyline entity —
// die changeover, first-piece inspection, etc. — so the watch stays quiet):
// second-shift CNC operators skip the coolant concentration check after a
// batch change; David Chen asked for training; a point-of-use job aid was
// deployed 16 days ago; scrap from coolant burn stopped.
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import path from "node:path";

const envRaw = await readFile(path.join(process.cwd(), ".env.local"), "utf-8");
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DEDUPE_KEY = "leader:seed-p9-effective-training";
const DELIVERED_AT = new Date(Date.now() - 16 * 24 * 60 * 60 * 1000).toISOString();
const AUDIENCE = "CNC operators — second shift (mixed experience)";
const ISSUE_TEXT =
  "Second shift keeps skipping the coolant concentration check after a batch change on CNC Line 2 — we're seeing coolant-burn scrap the next morning.";
const ISSUE_RESTATED =
  "After batch changes, second-shift CNC operators are skipping the coolant concentration check, and coolant-burn scrap shows up on the following runs.";
const SUBJECT_ENTITIES = [
  { type: "process", name: "coolant concentration check", detail: "after batch change, CNC Line 2" },
];

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

// ── 1. The demo org + the approving leader ──────────────────────────────────
const { data: org } = await supabase
  .from("orgs")
  .select("id, name")
  .ilike("name", "%Meridian%")
  .maybeSingle();
if (!org) fail("Demo org (Meridian) not found.");
console.log(`✓ Org: ${org.name} (${org.id})`);

const { data: approver } = await supabase
  .from("profiles")
  .select("id, display_name")
  .eq("org_id", org.id)
  .eq("display_name", "David Chen")
  .maybeSingle();
if (!approver) fail("David Chen not found in the demo org.");
console.log(`✓ Approver: ${approver.display_name} (${approver.id})`);

// ── 2. Idempotency ──────────────────────────────────────────────────────────
const { data: existing } = await supabase
  .from("prescription_detections")
  .select("id")
  .eq("dedupe_key", DEDUPE_KEY)
  .maybeSingle();
if (existing) {
  console.log(`✓ Already seeded (detection ${existing.id}) — nothing to do.`);
  process.exit(0);
}

// ── 3. Recurrence-safety check: the watch must be QUIET on this entity ──────
// If any post-delivery broke/friction record in the org already names the
// seeded entity, the first efficacy check would escalate instead of proving
// effective — that would be a broken verification, so refuse loudly.
const { data: trouble } = await supabase
  .from("pattern_records")
  .select("id, trigger_type, entity_map, created_at")
  .eq("org_id", org.id)
  .in("trigger_type", ["broke", "friction"])
  .gte("created_at", DELIVERED_AT);
const clash = (trouble || []).filter((r) =>
  (r.entity_map || []).some(
    (e) =>
      SUBJECT_ENTITIES.some(
        (s) =>
          s.type === e.type &&
          String(e.name || "").trim().toLowerCase() === s.name.toLowerCase()
      )
  )
);
if (clash.length > 0) {
  fail(
    `Entity clash: ${clash.length} post-delivery trouble record(s) already name the seeded entity — pick a different territory. Ids: ${clash
      .map((r) => r.id)
      .join(", ")}`
  );
}
console.log(`✓ Watch territory is quiet (${(trouble || []).length} trouble records checked)`);

// ── 4. A real grounding framework (attribution must point at real experts) ──
const { data: groundingRecords } = await supabase
  .from("pattern_records")
  .select("id, user_id, framework, created_at")
  .eq("org_id", org.id)
  .eq("status", "complete")
  .not("framework", "is", null)
  .neq("method", "training_derived")
  .order("created_at", { ascending: true })
  .limit(30);
const grounding = (groundingRecords || []).find((r) => r.framework?.name) ?? null;
if (!grounding) fail("No complete framework found to ground the seeded training.");
const { data: groundingAuthor } = await supabase
  .from("profiles")
  .select("id, display_name")
  .eq("id", grounding.user_id)
  .maybeSingle();
console.log(
  `✓ Grounding: "${grounding.framework.name}" by ${groundingAuthor?.display_name ?? "an org expert"}`
);

// ── 5. Detection → prescription → training → request → outcome ─────────────
const { data: det, error: detError } = await supabase
  .from("prescription_detections")
  .insert({
    org_id: org.id,
    source_type: "leader_request",
    dedupe_key: DEDUPE_KEY,
    subject_entities: SUBJECT_ENTITIES,
    evidence_record_ids: [grounding.id],
    conflict_id: null,
    summary: ISSUE_RESTATED,
    detail: "Seeded for the P-7 Build 6 live verification (deployed 16 days ago, quiet since).",
    recurrence: 1,
    status: "prescribed",
    detected_by: "seed-p9-effective-training",
  })
  .select("id")
  .single();
if (detError) fail(`detection insert: ${detError.message}`);

const { data: rx, error: rxError } = await supabase
  .from("prescriptions")
  .insert({
    org_id: org.id,
    detection_id: det.id,
    rung: 1,
    rung_rationale: "A skipped procedural step under time pressure — point-of-use support, not a session.",
    gap_summary: ISSUE_RESTATED,
    experts: [{ user_id: grounding.user_id, record_id: grounding.id }],
    capture_first: false,
    audience: AUDIENCE,
    audience_entities: SUBJECT_ENTITIES,
    pairing_summary: `Pair ${groundingAuthor?.display_name ?? "an org expert"} with ${AUDIENCE} — job aid built from their codified framework.`,
    recurrence: 1,
    severity: 1,
    roi_score: 1,
    rank_rationale: "Leader-initiated · severity 1 (Job aid) = ROI 1",
    status: "delivered",
    approved_by: approver.id,
    approved_at: DELIVERED_AT,
    delivered_at: DELIVERED_AT,
    efficacy_status: "watching",
    efficacy_note: "Watching — deployed as a Job aid (attempt 1). Seeded 16 days into a quiet watch.",
    efficacy_evidence_record_ids: [],
    efficacy_checked_at: null,
    triaged_by: "seed-p9-effective-training",
  })
  .select("id")
  .single();
if (rxError) fail(`prescription insert: ${rxError.message}`);

const FLOOR_BODY = [
  "COOLANT CONCENTRATION CHECK — AT THE MACHINE, EVERY BATCH CHANGE",
  "",
  "Tape this at the refractometer station on CNC Line 2.",
  "",
  "1. BEFORE the first cycle of the new batch: draw a coolant sample from the return line — not the tank top (the top reads rich after a top-off).",
  "2. Read concentration on the refractometer. Target band: per the coolant card for the alloy you are about to run.",
  "3. In band → initial the batch sheet, run.",
  "4. Out of band → adjust, re-draw, re-read. Do not start the run on a promise to fix it after first parts.",
  "5. If the line is being pushed to skip the check: the check is 90 seconds; a coolant-burn scrap run is a shift. Call the lead — that trade is theirs to own, not yours.",
  "",
  "Why the return line: the mix stratifies after a batch change; the return line is what your tools actually see.",
].join("\n");

const { data: training, error: trError } = await supabase
  .from("prescription_trainings")
  .insert({
    org_id: org.id,
    prescription_id: rx.id,
    version: 1,
    strategy: "point-of-use checklist",
    rung: 1,
    format: "Job aid",
    format_key: "job_aid",
    title: "The 90-Second Coolant Gate",
    altitudes: {
      floor: { title: "The 90-Second Coolant Gate", body: FLOOR_BODY },
      supervisor: {
        title: "Supervisor brief — The 90-Second Coolant Gate",
        body: "A one-page gate now sits at the refractometer station: sample from the return line after every batch change, read against the alloy's band, initial the batch sheet before the first cycle. Your part: treat the initial as a hard start condition on second shift, and take the skip-pressure escalation seriously — the aid tells operators the trade belongs to the lead, which only works if the lead visibly owns it.",
      },
      exec: {
        title: "Executive summary — The 90-Second Coolant Gate",
        body: "Coolant-burn scrap after batch changes traced to a skipped 90-second concentration check on second shift. Fix deployed as a point-of-use job aid (not a training session): the check is now a gated start condition with a named escalation path. Watching recurrence via live floor records; cost of control is ~90 seconds per batch change.",
      },
    },
    generated_by: "seed-p9-effective-training",
  })
  .select("id")
  .single();
if (trError) fail(`training insert: ${trError.message}`);

const RATIONALE =
  "A one-page point-of-use aid beats a session when the failure is a skipped step under time pressure — the fix belongs at the machine, not in a classroom (performance support; checklists cut omission errors under load).";

const { data: reqRow, error: reqError } = await supabase
  .from("training_requests")
  .insert({
    org_id: org.id,
    requested_by: approver.id,
    issue_text: ISSUE_TEXT,
    audience_role: "CNC operators",
    audience_team: "Second shift",
    audience_experience: "mixed",
    audience_summary: AUDIENCE,
    issue_type: "procedural_skill",
    issue_restated: ISSUE_RESTATED,
    subject_entities: SUBJECT_ENTITIES,
    understanding_note:
      "The step is known and quick; it disappears under batch-change time pressure on second shift — a point-of-use prompt problem, not a knowledge problem.",
    detection_id: det.id,
    prescription_id: rx.id,
    recommendations: {
      ranked: [
        {
          format_key: "job_aid",
          format_name: "Job aid",
          effort: "one page, no session",
          rank: 1,
          is_primary: true,
          rationale: RATIONALE,
          citations: [
            "Performance support: job aids at the point of work outperform sessions for procedural slips",
            "Checklists reduce omission errors under time pressure",
          ],
        },
      ],
    },
    recommended_format: "job_aid",
    recommended_at: DELIVERED_AT,
    chosen_format: "job_aid",
    format_overridden: false,
    format_chosen_by: approver.id,
    format_chosen_at: DELIVERED_AT,
    status: "deployed",
    current_training_id: training.id,
    approved_by: approver.id,
    approved_at: DELIVERED_AT,
    deployed_at: DELIVERED_AT,
    attempt_count: 1,
    created_via: "seed-p9-effective-training",
  })
  .select("id")
  .single();
if (reqError) fail(`training_request insert: ${reqError.message}`);

const { error: outError } = await supabase.from("training_format_outcomes").insert({
  org_id: org.id,
  training_request_id: reqRow.id,
  prescription_id: rx.id,
  training_id: training.id,
  attempt: 1,
  issue_type: "procedural_skill",
  audience_role: "CNC operators",
  audience_team: "Second shift",
  audience_experience: "mixed",
  recommended_format: "job_aid",
  chosen_format: "job_aid",
  was_override: false,
  agent_rationale: [{ format_key: "job_aid", rationale: RATIONALE }],
  outcome: "pending",
});
if (outError) fail(`format outcome insert: ${outError.message}`);

console.log("");
console.log(`✓ Seeded. Training request: ${reqRow.id}`);
console.log("");
console.log("LIVE VERIFY (as David Chen or Elena Ruiz, on the deployed app):");
console.log(`  1. /training-studio/${reqRow.id} → "Check whether it landed"`);
console.log("     → expect: It held + 'codified into your team's library'.");
console.log("  2. /retrieve → \"Operators are skipping the coolant concentration check after batch changes — scrap is showing up next morning\"");
console.log("     → expect: 'The 90-Second Coolant Gate', method 'Codified from training',");
console.log("       an EARLY SIGNAL badge (not 'proven' — one outcome is thin data), N shown.");
console.log("  3. node scripts/verify-p3.mjs   (embedding invariant — backfill if it flags)");
