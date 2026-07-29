// AWIP DEMO RESEED, part 2 — conflicts, prescriptions, coaching watch.
//
// Run AFTER scripts/seed-awip-demo.mjs and AFTER
// scripts/backfill-pattern-embeddings.mjs.
//
// What it does:
//   1. CONFLICTS — runs the REAL P-2 detector (deterministic candidate filter +
//      claude-sonnet-5 conflict-xray judgment, verbatim logic from
//      src/lib/conflict.ts) org-scoped to the demo org, then asserts the two
//      required pairs are OPEN:
//        · SPINE: F1 "The No-Release Gate" (Dana Whitfield)
//                 ⚔ F2 "The Controlled Restart Release" (Brian Ng)
//        · CROSS-FUNCTIONAL: F7 "Custom Profile: Promise It or Walk" (Kim Harrell)
//                 ⚔ F8 "Capacity Reality First" (Brian Montes)
//   2. PRESCRIPTIONS — the peel-check recurrence: rung 2 written job aid that
//      didn't land, escalated to a rung 3 hands-on drill under Richard Jenkins
//      (format switches job_aid → hands_on_drill). Plus one PROVEN EFFECTIVE
//      prescription for contrast: the coil-lot re-qualify checklist.
//   3. COACHING WATCH — runs the P-6 detector over the org (verbatim logic from
//      src/lib/retraining-watch.ts) so Tyler Brooks surfaces privately to
//      Chuck Milner, and nobody else.
//
// Idempotent throughout. Pass --force to clear this script's own rows first.
// Never touches bdhicks83+test1@gmail.com or anything outside the demo org.
//
// Usage: node scripts/seed-awip-conflicts.mjs [--force]
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

// timeout + maxRetries:0 — a stalled connection fails in 60s instead of hanging
// on the SDK's 10-minute default; retries with visible backoff are handled here.
const anthropic = new Anthropic({ timeout: 60_000, maxRetries: 0 });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DEMO_ORG_ID = "0722f2f8-ecff-4ae3-81ea-1350454e9d54";

const F1 = "The No-Release Gate";
const F2 = "The Controlled Restart Release";
const F7 = "Custom Profile: Promise It or Walk";
const F8 = "Capacity Reality First";

const E_PEEL_CHECK = "First-bundle peel-check";
const E_COIL_LOT = "Coil-lot / chemical-lot re-qualification";

const PEEL_DEDUPE = "entity:process:first bundle peel check";
const COIL_DEDUPE = "entity:process:coil lot chemical lot re qualification";

let pass = true;
const ok = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => { console.error(`  ✗ FAIL — ${m}`); pass = false; };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const backoff = (n) => sleep(600 * 2 ** n + 150);

// ─── verbatim helpers from src/lib/claude.ts (copy-don't-import) ───────────
function firstText(content) {
  // Never assume content[0] is text — a reasoning model can put a thinking
  // block first and the text block second.
  const block = (content || []).find((b) => b.type === "text");
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
function normalizeEntityName(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

// ─── conflict detection, verbatim logic from src/lib/conflict.ts ───────────
const conflictTemplate = await readFile(
  path.join(process.cwd(), "prompts", "conflict-xray.md"),
  "utf-8"
);
async function checkFrameworkConflict(a, b) {
  const prompt = conflictTemplate
    .replaceAll("{{framework_a}}", () => a)
    .replaceAll("{{framework_b}}", () => b);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const msg = await anthropic.messages.create({
        model: "claude-sonnet-5",
        // Conflict judgment is reasoning-heavy — leave room for a thinking
        // channel AND the (small) JSON output.
        max_tokens: 8000,
        messages: [{ role: "user", content: prompt }],
      });
      const parsed = parseJsonLoose(firstText(msg.content));
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
      console.warn(`    ⚠ conflict judgment attempt ${attempt + 1}/3: unparseable response`);
    } catch (err) {
      console.warn(`    ⚠ conflict judgment attempt ${attempt + 1}/3: ${err?.message || err}`);
    }
    if (attempt < 2) await backoff(attempt);
  }
  return null; // fail open — no flag
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

// ─── P-6 detection, verbatim logic from src/lib/retraining-watch.ts ────────
const RETRAINING_SIGNAL_THRESHOLD = 2;
function normalizePersonKey(name) {
  return String(name).trim().toLowerCase().replace(/\s+/g, " ");
}
function excerptFor(row) {
  const text = row.signal_detail ?? row.judgment ?? row.context_summary;
  if (!text) return null;
  const t = text.trim();
  return t.length > 140 ? t.slice(0, 140).trim() + "…" : t;
}
function buildSummary(personName, count, sampleExcerpt) {
  const base = `${count} record${count === 1 ? "" : "s"} this period involve ${personName} in a concern or friction context`;
  return sampleExcerpt ? `${base} — most recent: "${sampleExcerpt}"` : `${base}.`;
}
function detectRetrainingCandidates(allRecords, profiles) {
  const signalRecords = allRecords.filter(
    (r) => r.trigger_type === "concern" || r.trigger_type === "friction"
  );
  const profileByKey = new Map();
  for (const p of profiles) {
    if (!p.display_name) continue;
    profileByKey.set(normalizePersonKey(p.display_name), p);
  }
  const byPerson = new Map();
  for (const record of signalRecords) {
    const seen = new Set();
    for (const entity of record.entity_map || []) {
      if (entity.type !== "role_person") continue;
      const key = normalizePersonKey(entity.name);
      if (!key || seen.has(key)) continue;
      const profile = profileByKey.get(key);
      if (!profile || !profile.manager_id) continue;
      seen.add(key);
      const list = byPerson.get(profile.id) ?? [];
      list.push({ row: record, excerpt: excerptFor(record) });
      byPerson.set(profile.id, list);
    }
  }
  const candidates = [];
  for (const [personId, entries] of byPerson) {
    if (entries.length < RETRAINING_SIGNAL_THRESHOLD) continue;
    const profile = profiles.find((p) => p.id === personId);
    if (!profile?.display_name || !profile.manager_id) continue;
    const sorted = [...entries].sort(
      (a, b) => new Date(a.row.created_at) - new Date(b.row.created_at)
    );
    candidates.push({
      personId,
      personName: profile.display_name,
      managerId: profile.manager_id,
      evidenceRecordIds: sorted.map((e) => e.row.id),
      recurrence: sorted.length,
      summary: buildSummary(profile.display_name, sorted.length, sorted[sorted.length - 1].excerpt),
    });
  }
  return candidates;
}

// ═══ THE TWO TRAINING ARTIFACTS ════════════════════════════════════════════
// Written here rather than model-generated, for the same verbatim reason as
// the frameworks: the demo shows a specific job-aid-didn't-land → drill-did
// story, and the exact contrast between the two formats IS the beat.

const JOB_AID_FLOOR = [
  "FIRST-BUNDLE PEEL-CHECK — BEFORE YOU RELEASE, AFTER EVERY CHANGEOVER",
  "",
  "Post this at the release station.",
  "",
  "1. Profile-only changeover? (same foam chemistry, same chemical lot, same coil lot, same thickness)",
  "   → NO on any one of those: full gate. Cut-section clears before anything ships. Stop here.",
  "   → YES to all four: continue.",
  "2. Laminator temps and line speed back at the qualified setpoint? If not, full gate.",
  "3. Pull a sample from the first bundle. Hand peel the facer.",
  "4. READ THE FAILURE SURFACE:",
  "   · Foam tears and stays on the metal = COHESIVE. That's a good bond. Release, cut-section runs in parallel.",
  "   · Facer lifts clean off the foam = ADHESIVE. That's a bad bond. HOLD the bundle. Call quality.",
  "5. Record the read on the changeover sheet before the bundle is banded.",
  "",
  "Why it matters: a delaminated panel on a building is a warranty claim and our name on a failed wall. The peel is thirty seconds. There is no version of the fast path that skips it.",
].join("\n");

const DRILL_FLOOR = [
  "PEEL-CHECK DRILL — HANDS ON REAL SAMPLES, WITH RICHARD JENKINS",
  "",
  "Runs at the line, 40 minutes, small groups. Bring the samples, not the card.",
  "",
  "SET UP (Richard, before the crew arrives)",
  "Pull 6 retained first-bundle samples: 3 with known-good cohesive bond, 3 with known adhesive failure (use held nonconforming stock — do not manufacture a bad panel for this). Label them on the back only.",
  "",
  "ROUND 1 — CALIBRATE (10 min)",
  "Richard peels one good and one bad in front of the group and narrates what his hands are telling him: where it starts to give, how the foam tears versus how the facer releases, what the sound is. Everyone puts hands on both samples before moving on.",
  "",
  "ROUND 2 — BLIND CALLS (20 min)",
  "Samples face down, order shuffled. Each operator peels and calls it — COHESIVE or ADHESIVE — out loud before turning the label. Wrong calls are the point of the exercise; work them right there. Every operator calls all six.",
  "",
  "ROUND 3 — UNDER THE CLOCK (10 min)",
  "Same blind calls, thirty seconds each, with the line noise going. This is the condition the check actually happens in — a call you can only make in a quiet room isn't a call you have after a changeover.",
  "",
  "DONE WHEN: every operator calls 6/6 blind, under the clock, twice running.",
  "",
  "Why a drill and not the card: the card is correct and the crews have read it. A fresh adhesive failure does not announce itself visually — you have to have felt the difference to know what you're feeling for. That transfers hands-on or not at all.",
].join("\n");

const CHECKLIST_FLOOR = [
  "COIL-LOT / CHEMICAL-LOT RE-QUALIFY — WHAT GETS RE-TESTED",
  "",
  "Run this before the first production run on any new lot.",
  "",
  "NEW FOAM CHEMICAL LOT → FULL RE-QUALIFY, always",
  "  □ Bond strength, first article",
  "  □ Foam density, first article",
  "  □ Cut-section reviewed before release",
  "",
  "NEW COIL LOT, same mill AND same coating → FIRST-ARTICLE CHECK",
  "  □ Dimensional check",
  "  □ Adhesion check",
  "",
  "NEW COIL SUPPLIER **OR** NEW COATING SYSTEM → treat as a CHEMICAL-LOT re-qualify",
  "  □ Everything in the full re-qualify block above",
  "  → The foam bonds to the coating, not to the steel. A new coating is a new adhesion surface.",
  "",
  "ALREADY CHASING AN INTERMITTENT ADHESION PROBLEM?",
  "  → This checklist does not apply. Re-qualify everything. Lot boundaries stop being a safe assumption once you are inside a failure investigation.",
  "",
  "Not for within-lot running.",
].join("\n");

// ═══ main ══════════════════════════════════════════════════════════════════
async function main() {
  const { data: org } = await supabase
    .from("orgs").select("id, name").eq("id", DEMO_ORG_ID).maybeSingle();
  if (!org) throw new Error(`Demo org ${DEMO_ORG_ID} not found.`);
  console.log(`Demo org: "${org.name}"`);

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, manager_id, role")
    .eq("org_id", DEMO_ORG_ID);
  const idByName = new Map((profiles || []).map((p) => [p.display_name, p.id]));
  const nameById = new Map((profiles || []).map((p) => [p.id, p.display_name]));
  const need = (n) => {
    const id = idByName.get(n);
    if (!id) throw new Error(`${n} not found in the demo org — run seed-awip-demo.mjs first.`);
    return id;
  };

  const { data: recordsRaw } = await supabase
    .from("pattern_records")
    .select(
      "id, user_id, org_id, created_at, context_summary, context_function, situation_type, " +
      "intervention_type, trigger_signal, signal_detail, judgment, rationale, boundaries, " +
      "entity_map, framework, trigger_type"
    )
    .eq("org_id", DEMO_ORG_ID)
    .eq("status", "complete");
  const records = recordsRaw || [];
  const byFramework = (name) => records.find((r) => r.framework?.name === name);
  console.log(`${records.length} complete records in the org.`);

  if (FORCE) {
    console.log(`\n--force: clearing conflicts, prescriptions, and coaching signals...`);
    await supabase.from("framework_conflicts").delete().eq("org_id", DEMO_ORG_ID);
    await supabase.from("prescription_teachbacks").delete().eq("org_id", DEMO_ORG_ID);
    await supabase.from("training_format_outcomes").delete().eq("org_id", DEMO_ORG_ID);
    await supabase.from("prescription_trainings").delete().eq("org_id", DEMO_ORG_ID);
    await supabase.from("prescription_fidelity").delete().eq("org_id", DEMO_ORG_ID);
    await supabase.from("training_requests").delete().eq("org_id", DEMO_ORG_ID);
    await supabase.from("prescriptions").delete().eq("org_id", DEMO_ORG_ID);
    await supabase.from("prescription_detections").delete().eq("org_id", DEMO_ORG_ID);
    await supabase.from("retraining_signals").delete().eq("org_id", DEMO_ORG_ID);
  }

  // ══ 1. CONFLICTS — the real detector ════════════════════════════════════
  console.log(`\n═══ 1. Conflict X-ray ═══`);
  const { data: existingConflicts } = await supabase
    .from("framework_conflicts")
    .select("record_a_id, record_b_id")
    .eq("org_id", DEMO_ORG_ID);
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
  console.log(`  ${pairs.length} cross-author candidate pairs to judge.`);

  let flagged = 0;
  for (const { a, b } of pairs) {
    const key = `${a.id}|${b.id}`;
    if (existingPairs.has(key)) continue;
    const j = await checkFrameworkConflict(
      formatRecordForConflict(a),
      formatRecordForConflict(b)
    );
    const fire = j && j.overlappingBoundaries && j.opposingJudgment;
    const label = `${a.framework?.name ?? a.id.slice(0, 8)} × ${b.framework?.name ?? b.id.slice(0, 8)}`;
    console.log(
      `  · ${label} → ` +
      (j ? `overlap=${j.overlappingBoundaries} opposing=${j.opposingJudgment}${fire ? "  ⚠️ FLAG" : ""}`
         : "model failed (fail open, no flag)")
    );
    if (!fire) continue;
    const { error } = await supabase.from("framework_conflicts").insert({
      org_id: DEMO_ORG_ID,
      record_a_id: a.id,
      record_b_id: b.id,
      territory: j.territory,
      rationale:
        j.rationale ??
        `Both frameworks claim ${j.territory ?? "the same territory"} and prescribe opposing plays.`,
      detected_by: "conflict-xray-v1",
    });
    if (error) console.warn(`    insert failed: ${error.message}`);
    else flagged++;
  }
  console.log(`  ${flagged} new conflict(s) written.`);

  // Assert the two required pairs are OPEN.
  async function assertConflict(nameA, nameB, label) {
    const ra = byFramework(nameA), rb = byFramework(nameB);
    if (!ra || !rb) return fail(`${label}: one of the two records is missing`);
    const [x, y] = [ra.id, rb.id].sort();
    const { data: c } = await supabase
      .from("framework_conflicts")
      .select("id, status, territory")
      .eq("record_a_id", x)
      .eq("record_b_id", y)
      .maybeSingle();
    if (!c) return fail(`${label}: NOT flagged — "${nameA}" ⚔ "${nameB}"`);
    if (c.status !== "open") return fail(`${label}: flagged but status='${c.status}', need 'open'`);
    ok(`${label} OPEN — territory: ${c.territory}`);
  }
  await assertConflict(F1, F2, "SPINE conflict");
  await assertConflict(F7, F8, "CROSS-FUNCTIONAL conflict");

  // ══ 2. PRESCRIPTIONS ════════════════════════════════════════════════════
  console.log(`\n═══ 2. Prescriptions ═══`);
  const ngId = need("Brian Ng");
  const richardId = need("Richard Jenkins");
  const chuckId = need("Chuck Milner");
  const danaId = need("Dana Whitfield");

  const f2Rec = byFramework(F2);
  const f3Rec = byFramework("Reading the Laminator Before the Panel Tells You");
  const f4Rec = byFramework("The Coil-Lot / Chemical-Lot Changeover Rule");
  const eve1 = records.find((r) => r.framework?.name === "A Gate That Gets Skipped When It Feels Routine Isn't a Gate");
  const eve2 = records.find((r) => r.framework?.name === "Two From the Same Missing Step Is a Capability Gap");
  const eve3 = records.find((r) => r.framework?.name === "A Card Transfers the Rule, Not the Hands");
  for (const [label, r] of [["F2", f2Rec], ["F3", f3Rec], ["F4", f4Rec], ["evidence 1", eve1], ["evidence 2", eve2], ["evidence 3", eve3]]) {
    if (!r) throw new Error(`Missing ${label} record — run seed-awip-demo.mjs first.`);
  }

  const now = Date.now();
  const AID_DELIVERED = new Date(now - 24 * 86_400_000).toISOString();   // job aid, 24d ago
  const DRILL_DELIVERED = new Date(now - 3 * 86_400_000).toISOString();  // drill, 3d ago
  const COIL_DELIVERED = new Date(now - 38 * 86_400_000).toISOString();  // checklist, 38d ago

  // ── 2a. The peel-check prescription: rung 2 → escalated to rung 3 ────────
  let peelDet = (await supabase
    .from("prescription_detections").select("id")
    .eq("org_id", DEMO_ORG_ID).eq("dedupe_key", PEEL_DEDUPE).maybeSingle()).data;
  if (!peelDet) {
    const { data, error } = await supabase.from("prescription_detections").insert({
      org_id: DEMO_ORG_ID,
      source_type: "entity_signal",
      dedupe_key: PEEL_DEDUPE,
      subject_entities: [
        { type: "process", name: E_PEEL_CHECK, detail: "skipped on post-changeover release" },
      ],
      evidence_record_ids: [eve1.id, eve2.id],
      summary:
        "Newer operators on the Little Rock line are releasing post-changeover runs without the first-bundle peel-check — two delamination escapes in six weeks trace to the same missing step.",
      detail:
        "Both escapes came from profile-only changeovers the crews read as routine. The operators can state the rule and the reasoning; the peel-check is the only release step with no machine forcing it.",
      recurrence: 2,
      status: "prescribed",
      detected_by: "seed-awip-demo",
      detected_at: new Date(now - 27 * 86_400_000).toISOString(),
    }).select("id").single();
    if (error) throw new Error(`peel detection insert: ${error.message}`);
    peelDet = data;
    console.log(`  ✓ detection: peel-check recurrence (2 evidence records)`);
  } else {
    console.log(`  · peel-check detection already present`);
  }

  let peelRx = (await supabase
    .from("prescriptions").select("id, rung, efficacy_status")
    .eq("detection_id", peelDet.id).maybeSingle()).data;
  if (!peelRx) {
    const { data, error } = await supabase.from("prescriptions").insert({
      org_id: DEMO_ORG_ID,
      detection_id: peelDet.id,
      // Seeded at the ESCALATED state: rung 3, escalated_from_rung 2. The
      // efficacy loop already ran on the job aid and read the post-delivery
      // recurrence (evidence 3) as "didn't transfer."
      rung: 3,
      escalated_from_rung: 2,
      rung_rationale:
        "Escalated from rung 2 — the written job aid deployed and the escapes continued. A tactile discrimination doesn't transfer off a page, so this needs a facilitated hands-on session.",
      gap_summary:
        "Newer operators release post-changeover runs without the first-bundle peel-check, and can't reliably tell a cohesive foam failure from an adhesive facer failure by hand.",
      experts: [
        { user_id: ngId, record_id: f2Rec.id },
        { user_id: richardId, record_id: f3Rec.id },
      ],
      capture_first: false,
      audience: "Little Rock line operators — newer to post-changeover release (mixed experience)",
      audience_entities: [
        { type: "department", name: "Little Rock Production", detail: null },
        { type: "process", name: E_PEEL_CHECK, detail: null },
      ],
      pairing_summary:
        "Pair Richard Jenkins with Little Rock line operators — Designed session built from Brian Ng's release rule and Richard Jenkins' laminator read.",
      recurrence: 2,
      severity: 3,
      roi_score: 6,
      rank_rationale: "2 evidence records × severity 3 (Designed session) = ROI 6",
      status: "delivered",
      approved_by: chuckId,
      approved_at: new Date(now - 26 * 86_400_000).toISOString(),
      delivered_at: DRILL_DELIVERED,
      efficacy_status: "escalated",
      efficacy_note:
        'Recurred after delivery: 1 new failure/friction record carrying "First-bundle peel-check" dated after the job aid went up. ' +
        "Auto-escalated rung 2 → 3 (Designed session) — the intervention didn't transfer; regenerated at the bigger rung and redelivered as a hands-on drill.",
      efficacy_evidence_record_ids: [eve3.id],
      efficacy_checked_at: new Date(now - 4 * 86_400_000).toISOString(),
      triaged_by: "seed-awip-demo",
      created_at: new Date(now - 27 * 86_400_000).toISOString(),
    }).select("id, rung, efficacy_status").single();
    if (error) throw new Error(`peel prescription insert: ${error.message}`);
    peelRx = data;
    console.log(`  ✓ prescription: rung 2 → 3 ESCALATED (job aid didn't land)`);
  } else {
    console.log(`  · peel-check prescription already present (rung ${peelRx.rung}, ${peelRx.efficacy_status})`);
  }

  // Fidelity: both experts confirmed — nothing ships in an expert's name
  // without it, so the drill's existence requires these rows.
  for (const [expertId, recordId, note] of [
    [ngId, f2Rec.id, "Yes — the peel read is the whole basis of the fast path. If they can't call cohesive versus adhesive, they don't have the rule."],
    [richardId, f3Rec.id, "That's how I'd teach it. You have to feel a bad one. Reading about it doesn't get you there."],
  ]) {
    await supabase.from("prescription_fidelity").upsert(
      {
        org_id: DEMO_ORG_ID,
        prescription_id: peelRx.id,
        expert_user_id: expertId,
        record_id: recordId,
        decision: "confirmed",
        note,
        decided_at: new Date(now - 25 * 86_400_000).toISOString(),
      },
      { onConflict: "prescription_id,expert_user_id" }
    );
  }

  // v1 job aid (didn't land) and v2 hands-on drill (the escalation).
  const { data: peelTrainings } = await supabase
    .from("prescription_trainings").select("id, version, format_key")
    .eq("prescription_id", peelRx.id).order("version");
  if ((peelTrainings || []).length === 0) {
    const { error: e1 } = await supabase.from("prescription_trainings").insert({
      org_id: DEMO_ORG_ID,
      prescription_id: peelRx.id,
      version: 1,
      strategy: "point-of-use decision aid",
      rung: 2,
      format: "Job aid",
      format_key: "job_aid",
      title: "The Thirty-Second Peel Gate",
      altitudes: {
        floor: { title: "The Thirty-Second Peel Gate", body: JOB_AID_FLOOR },
        supervisor: {
          title: "Supervisor brief — The Thirty-Second Peel Gate",
          body: "A decision card now sits at the release station: qualify the changeover as profile-only, confirm setpoint, peel a first-bundle sample, read cohesive versus adhesive, record it before banding. Your part is treating the recorded read as a hard release condition — the card only works if the release sheet is actually checked for it, and if nobody is asked to make the band-and-stage call while the peel is still unrecorded.",
        },
        exec: {
          title: "Executive summary — The Thirty-Second Peel Gate",
          body: "Two delamination escapes in six weeks traced to a skipped first-bundle peel-check after profile-only changeovers. Deployed as a point-of-use decision card at the release station rather than a session, since the rule itself was already known. Cost of control is about thirty seconds per changeover. Watching recurrence on live floor records.",
        },
      },
      generated_by: "seed-awip-demo",
      created_at: AID_DELIVERED,
    });
    if (e1) throw new Error(`job aid insert: ${e1.message}`);

    const { error: e2 } = await supabase.from("prescription_trainings").insert({
      org_id: DEMO_ORG_ID,
      prescription_id: peelRx.id,
      version: 2,
      strategy: "deliberate practice with blind discrimination trials",
      rung: 3,
      format: "Designed session",
      format_key: "hands_on_drill",
      title: "Peel-Check Drill — Calling It By Hand",
      regenerate_note:
        "The job aid is posted, correct, and read — and the escapes continued. The missing capability is tactile discrimination, which does not transfer off a page. Switch format to hands-on practice on real samples.",
      altitudes: {
        floor: { title: "Peel-Check Drill — Calling It By Hand", body: DRILL_FLOOR },
        supervisor: {
          title: "Facilitator guide — Peel-Check Drill",
          body: "Richard Jenkins runs this at the line in small groups, 40 minutes. Three rounds: calibrate on known-good and known-bad samples with narration, then blind calls with the labels hidden, then blind calls under thirty seconds with line noise going. Watch for the operator who is calling correctly but slowly — under changeover pressure that becomes a skip, so the timed round is not optional. Done when every operator calls 6/6 blind under the clock twice running. Use held nonconforming stock for the bad samples; never manufacture a defective panel for training.",
        },
        exec: {
          title: "Executive summary — Peel-Check Drill",
          body: "The written peel-check gate did not stop the recurrence, so the intervention escalated from a job aid to a facilitated hands-on drill. The gap was tactile rather than procedural: a fresh adhesive bond failure does not announce itself visually, so operators need calibrated hands, not a clearer card. Delivered by a 20-year line operator using retained samples. Escalation was triggered automatically by a post-delivery recurrence record, not by a manager noticing.",
        },
      },
      generated_by: "seed-awip-demo",
      created_at: DRILL_DELIVERED,
    });
    if (e2) throw new Error(`drill insert: ${e2.message}`);
    console.log(`  ✓ trainings: v1 Job aid → v2 hands-on drill (format switched)`);
  } else {
    console.log(`  · peel-check trainings already present (${peelTrainings.length} version(s))`);
  }

  // ── 2b. The proven-effective contrast: coil-lot re-qualify checklist ─────
  let coilDet = (await supabase
    .from("prescription_detections").select("id")
    .eq("org_id", DEMO_ORG_ID).eq("dedupe_key", COIL_DEDUPE).maybeSingle()).data;
  if (!coilDet) {
    const { data, error } = await supabase.from("prescription_detections").insert({
      org_id: DEMO_ORG_ID,
      source_type: "entity_signal",
      dedupe_key: COIL_DEDUPE,
      subject_entities: [
        { type: "process", name: E_COIL_LOT, detail: "what carries over between lots" },
      ],
      evidence_record_ids: [f4Rec.id],
      summary:
        "Foam density drift kept escaping on the first run of a new chemical lot — crews were carrying prior-lot qualification forward instead of re-testing bond strength and density.",
      detail:
        "The rule existed in R&D's head and nowhere on the floor. Prescribed as a checklist rather than a session: the judgment is a lookup, not a skill.",
      recurrence: 3,
      status: "prescribed",
      detected_by: "seed-awip-demo",
      detected_at: new Date(now - 41 * 86_400_000).toISOString(),
    }).select("id").single();
    if (error) throw new Error(`coil detection insert: ${error.message}`);
    coilDet = data;
  }

  let coilRx = (await supabase
    .from("prescriptions").select("id, efficacy_status")
    .eq("detection_id", coilDet.id).maybeSingle()).data;
  if (!coilRx) {
    const quietDays = Math.floor((now - new Date(COIL_DELIVERED).getTime()) / 86_400_000);
    const { data, error } = await supabase.from("prescriptions").insert({
      org_id: DEMO_ORG_ID,
      detection_id: coilDet.id,
      rung: 1,
      rung_rationale:
        "A lookup, not a skill — the crews need the rule at hand at the moment of the lot change, not a session about it.",
      gap_summary:
        "Crews carry prior-lot qualification forward onto a new chemical lot instead of re-testing bond strength and foam density.",
      experts: [{ user_id: ngId, record_id: f4Rec.id }],
      capture_first: false,
      audience: "Little Rock line leads and quality technicians",
      audience_entities: [
        { type: "process", name: E_COIL_LOT, detail: null },
        { type: "department", name: "Quality", detail: "Little Rock" },
      ],
      pairing_summary:
        "Pair Brian Ng with Little Rock line leads and quality technicians — Clarification card built from his coil-lot rule.",
      recurrence: 3,
      severity: 1,
      roi_score: 3,
      rank_rationale: "3 evidence records × severity 1 (Clarification card) = ROI 3",
      status: "closed",
      approved_by: chuckId,
      approved_at: new Date(now - 40 * 86_400_000).toISOString(),
      delivered_at: COIL_DELIVERED,
      efficacy_status: "effective",
      efficacy_note:
        `Quiet for ${quietDays} days post-delivery (window: 14) — no new failure/friction records carrying ` +
        `"${E_COIL_LOT}". Marked effective: the intervention held on live evidence (Kirkpatrick Level 4, measured automatically).`,
      efficacy_evidence_record_ids: [],
      efficacy_checked_at: new Date(now - 22 * 86_400_000).toISOString(),
      triaged_by: "seed-awip-demo",
      created_at: new Date(now - 41 * 86_400_000).toISOString(),
    }).select("id, efficacy_status").single();
    if (error) throw new Error(`coil prescription insert: ${error.message}`);
    coilRx = data;

    await supabase.from("prescription_fidelity").upsert(
      {
        org_id: DEMO_ORG_ID,
        prescription_id: coilRx.id,
        expert_user_id: ngId,
        record_id: f4Rec.id,
        decision: "confirmed",
        note: "That's the rule. The only thing I'd stress is the coating line — people read 'new coil lot' and stop reading.",
        decided_at: new Date(now - 39 * 86_400_000).toISOString(),
      },
      { onConflict: "prescription_id,expert_user_id" }
    );

    await supabase.from("prescription_trainings").insert({
      org_id: DEMO_ORG_ID,
      prescription_id: coilRx.id,
      version: 1,
      strategy: "branching decision checklist",
      rung: 1,
      format: "Clarification card",
      format_key: "job_aid",
      title: "Coil-Lot Re-Qualify — What Carries Over",
      altitudes: {
        floor: { title: "Coil-Lot Re-Qualify — What Carries Over", body: CHECKLIST_FLOOR },
        supervisor: {
          title: "Supervisor brief — Coil-Lot Re-Qualify",
          body: "A one-page branching checklist now sits with the lot-change paperwork. The branch that gets missed is the coating one: a new coil lot from the same mill is a light check, but a new coating system is a new adhesion surface and gets the full chemical-lot treatment. Watch for crews reading 'new coil lot' and stopping there.",
        },
        exec: {
          title: "Executive summary — Coil-Lot Re-Qualify",
          body: "Recurring foam-density escapes on first runs of new chemical lots traced to prior-lot qualification being carried forward. Deployed as a one-page branching checklist at the lot-change step. Quiet since delivery with no recurrence — marked effective on live evidence.",
        },
      },
      generated_by: "seed-awip-demo",
      created_at: COIL_DELIVERED,
    });
    console.log(`  ✓ prescription: coil-lot checklist — PROVEN EFFECTIVE (quiet ${quietDays}d)`);
  } else {
    console.log(`  · coil-lot prescription already present (${coilRx.efficacy_status})`);
  }

  // ══ 3. COACHING WATCH (P-6) ═════════════════════════════════════════════
  console.log(`\n═══ 3. Coaching watch ═══`);
  const candidates = detectRetrainingCandidates(records, profiles || []);
  if (candidates.length === 0) fail("no coaching candidates detected — expected Tyler Brooks");
  for (const c of candidates) {
    const dedupeKey = `person:${c.personId}`;
    const { data: existing } = await supabase
      .from("retraining_signals").select("id, recurrence")
      .eq("org_id", DEMO_ORG_ID).eq("dedupe_key", dedupeKey).maybeSingle();
    if (!existing) {
      const { error } = await supabase.from("retraining_signals").insert({
        org_id: DEMO_ORG_ID,
        person_id: c.personId,
        dedupe_key: dedupeKey,
        evidence_record_ids: c.evidenceRecordIds,
        recurrence: c.recurrence,
        summary: c.summary,
        status: "open",
      });
      if (error) throw new Error(`retraining_signals insert: ${error.message}`);
    } else if (c.recurrence > existing.recurrence) {
      await supabase.from("retraining_signals").update({
        evidence_record_ids: c.evidenceRecordIds,
        recurrence: c.recurrence,
        summary: c.summary,
        status: "open",
      }).eq("id", existing.id);
    }
    console.log(
      `  ✓ ${c.personName} (${c.recurrence} records) → visible ONLY to ${nameById.get(c.managerId)}`
    );
  }
  const tylerId = idByName.get("Tyler Brooks");
  const tyler = candidates.find((c) => c.personId === tylerId);
  if (!tyler) fail("Tyler Brooks did not cross the coaching threshold");
  else if (tyler.managerId !== chuckId) fail(`Tyler's signal routes to ${nameById.get(tyler.managerId)}, expected Chuck Milner`);
  else ok(`Tyler Brooks → Chuck Milner, ${tyler.recurrence} records, blameless summary`);

  console.log(`\n─────────────────────────────────────────────────────────────`);
  if (!pass) {
    console.error(`SEED PART 2 FAILED — see the ✗ lines above.`);
    process.exit(1);
  }
  console.log(`Part 2 complete. Next: node scripts/verify-awip-demo.mjs`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
