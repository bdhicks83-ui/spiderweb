// DEMO RESET — restore the AWIP (DEMO) org to its clean post-seed state
// before a live demo. Two jobs, scoped STRICTLY to the demo org:
//
//   1. ONBOARDING FRESH — delete onboarding_progress rows for every
//      @awip-demo.example seat, so each demo role (operator / expert /
//      executive / admin) auto-routes into its fresh track on next login
//      (/api/welcome routes on "no row for your track").
//
//   2. TRAINING STUDIO RESIDUE — delete trainings/attempts created by live
//      testing, and repair the four seeded storyline requests back to their
//      seeded state:
//        · training_requests NOT created_via 'seed-awip-training-demo'
//          (live requests default to 'training-studio-v1') + their whole
//          engine chain (outcomes → request → trainings → fidelity →
//          prescription → detection), mirroring the seeds' own --force order.
//        · prescription_trainings generated_by 'training-studio-format-v1' —
//          the live /training-studio/[id]/generate marker (floor-version
//          residue), including versions generated onto SEEDED prescriptions.
//        · seeded requests repaired: status back to 'generated',
//          attempt_count 1, approve/deploy/route stamps cleared,
//          current_training_id repointed at the seeded training, the
//          attempt-1 outcome row back to 'pending' with no enhancements,
//          attempt>1 outcome rows deleted.
//
// PRESERVES everything the seed pipeline created: the org, seats, profiles,
// reporting lines, pattern_records/frameworks, conflicts, prescriptions,
// win column, knowledge gap, coaching watch, and the four seeded storylines
// (generated_by markers 'seed-awip-demo' / 'seed-awip-training-demo' /
// 'seed-p9-effective-training' are never deleted; unknown markers are
// REPORTED, never deleted).
//
// GUARDRAILS:
//   · Org resolved by is_demo=true + name containing 'AWIP' — exactly one
//     match required, no hardcoded org assumptions.
//   · Onboarding deletion is limited to seats whose auth email ends in
//     @awip-demo.example. bdhicks83@gmail.com and bdhicks83+test1@gmail.com
//     (the load-bearing cascade parent) are asserted untouchable — the run
//     ABORTS if either ever lands in a deletion set.
//   · Dry-run by default: prints what would be deleted, per table, with row
//     counts. Nothing is deleted without --confirm.
//   · Idempotent — a second --confirm run finds nothing to do.
//
// Usage (PowerShell, from the repo root):
//   npm run reset-demo                    (dry run — summary only)
//   npm run reset-demo -- --confirm       (actually delete + verify)
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import path from "node:path";

const envRaw = await readFile(path.join(process.cwd(), ".env.local"), "utf-8");
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const CONFIRM = process.argv.includes("--confirm");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SEED_REQUEST_VIA = "seed-awip-training-demo";
const SEED_TRAINING_MARKERS = ["seed-awip-demo", "seed-awip-training-demo", "seed-p9-effective-training"];
const TEST_TRAINING_MARKER = "training-studio-format-v1";
const DEMO_SEAT_DOMAIN = "@awip-demo.example";
const PROTECTED_EMAILS = ["bdhicks83@gmail.com", "bdhicks83+test1@gmail.com"];

function die(msg) {
  console.error(`\n🛑 ABORT: ${msg}`);
  process.exit(1);
}

async function must(promise, label) {
  const { data, error } = await promise;
  if (error) die(`${label}: ${error.message}`);
  return data;
}

// ═══ 1. Resolve the demo org — by flag + name, never by assumption ══════════
async function resolveOrg() {
  const demoOrgs = await must(
    supabase.from("orgs").select("id, name, is_demo").eq("is_demo", true),
    "orgs lookup"
  );
  const awip = (demoOrgs || []).filter((o) => /awip/i.test(o.name || ""));
  if (awip.length === 0) die(`no org with is_demo=true and 'AWIP' in the name (found ${demoOrgs?.length ?? 0} demo org(s)).`);
  if (awip.length > 1) die(`ambiguous: ${awip.length} demo orgs match 'AWIP': ${awip.map((o) => o.name).join(" | ")}`);
  return awip[0];
}

// ═══ 2. Auth email map — for seat filtering + the protected-account gate ════
async function buildEmailMap() {
  const byId = new Map();
  let page = 1;
  for (;;) {
    // Transient ECONNRESETs happen on this endpoint — retry before aborting.
    let data = null;
    for (let attempt = 1; attempt <= 4; attempt++) {
      const res = await supabase.auth.admin.listUsers({ page, perPage: 200 }).catch((e) => ({ error: e }));
      if (!res.error) { data = res.data; break; }
      if (attempt === 4) die(`listUsers page ${page}: ${res.error.message}`);
      console.log(`  · listUsers page ${page} failed (${res.error.message}) — retry ${attempt}/3…`);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
    for (const u of data.users) byId.set(u.id, (u.email || "").toLowerCase());
    if (data.users.length < 200) return byId;
    page++;
  }
}

function assertProtected(idSet, emailById, context) {
  for (const id of idSet) {
    const email = emailById.get(id);
    if (email && PROTECTED_EMAILS.includes(email)) {
      die(`${context} would touch protected account ${email} — refusing.`);
    }
  }
}

// ═══ main ═══════════════════════════════════════════════════════════════════
async function main() {
  console.log(`═══ AWIP DEMO RESET — ${CONFIRM ? "LIVE RUN (--confirm)" : "DRY RUN"} ═══`);

  const org = await resolveOrg();
  console.log(`✓ Org: "${org.name}" (${org.id})`);

  const emailById = await buildEmailMap();

  // ── Seats ─────────────────────────────────────────────────────────────────
  const profiles = await must(
    supabase.from("profiles").select("id, display_name").eq("org_id", org.id),
    "profiles read"
  );
  const seats = [];
  const nonDemoSeats = [];
  for (const p of profiles || []) {
    const email = emailById.get(p.id) || "(no auth email)";
    if (email.endsWith(DEMO_SEAT_DOMAIN)) seats.push({ ...p, email });
    else nonDemoSeats.push({ ...p, email });
  }
  if (nonDemoSeats.length) {
    console.log(`  ⚠️ ${nonDemoSeats.length} org profile(s) OUTSIDE ${DEMO_SEAT_DOMAIN} — left completely untouched:`);
    for (const p of nonDemoSeats) console.log(`     · ${p.display_name ?? p.id} <${p.email}>`);
  }
  const seatIds = seats.map((s) => s.id);
  assertProtected(seatIds, emailById, "onboarding reset");

  // ── A. Onboarding progress rows for the demo seats ───────────────────────
  const onboardingRows = seatIds.length
    ? await must(
        supabase.from("onboarding_progress").select("user_id, track, steps_done, completed_at").in("user_id", seatIds),
        "onboarding_progress read"
      )
    : [];

  // ── B. Test-created training requests (live default 'training-studio-v1') ─
  const allReqs = await must(
    supabase
      .from("training_requests")
      .select("id, created_via, issue_text, status, attempt_count, prescription_id, detection_id, recommended_format, chosen_format, format_overridden, approved_by, approved_at, deployed_at, routed_at, routed_by, current_training_id, recommendations")
      .eq("org_id", org.id),
    "training_requests read"
  );
  const testReqs = (allReqs || []).filter((r) => r.created_via !== SEED_REQUEST_VIA);
  const seededReqs = (allReqs || []).filter((r) => r.created_via === SEED_REQUEST_VIA);
  const testReqIds = testReqs.map((r) => r.id);
  const testRxIds = [...new Set(testReqs.map((r) => r.prescription_id).filter(Boolean))];
  const testDetIds = [...new Set(testReqs.map((r) => r.detection_id).filter(Boolean))];

  const testReqOutcomes = testReqIds.length
    ? await must(
        supabase.from("training_format_outcomes").select("id, attempt, chosen_format, outcome").in("training_request_id", testReqIds),
        "test-request outcomes read"
      )
    : [];

  // ── C. Live-generated trainings (the /generate route's marker) ────────────
  const allTrainings = await must(
    supabase
      .from("prescription_trainings")
      .select("id, prescription_id, generated_by, format_key, title, version, generated_at")
      .eq("org_id", org.id),
    "prescription_trainings read"
  );
  const testTrainings = (allTrainings || []).filter(
    (t) => t.generated_by === TEST_TRAINING_MARKER || (t.prescription_id && testRxIds.includes(t.prescription_id))
  );
  const unknownTrainings = (allTrainings || []).filter(
    (t) =>
      !SEED_TRAINING_MARKERS.includes(t.generated_by) &&
      t.generated_by !== TEST_TRAINING_MARKER &&
      !testTrainings.includes(t)
  );
  const testTrainingIds = testTrainings.map((t) => t.id);

  const testFidelity = testRxIds.length
    ? await must(supabase.from("prescription_fidelity").select("id").in("prescription_id", testRxIds), "fidelity read")
    : [];

  // ── D. Seeded-request repair plan ─────────────────────────────────────────
  const seededRxIds = seededReqs.map((r) => r.prescription_id).filter(Boolean);
  const seededTrainingByRx = new Map();
  for (const t of allTrainings || []) {
    if (t.generated_by === SEED_REQUEST_VIA && seededRxIds.includes(t.prescription_id)) {
      const prev = seededTrainingByRx.get(t.prescription_id);
      if (!prev || t.version > prev.version) seededTrainingByRx.set(t.prescription_id, t);
    }
  }
  const seededOutcomes = seededReqs.length
    ? await must(
        supabase
          .from("training_format_outcomes")
          .select("id, training_request_id, attempt, chosen_format, was_override, outcome, enhancements, resolved_at, training_id")
          .in("training_request_id", seededReqs.map((r) => r.id)),
        "seeded outcomes read"
      )
    : [];
  const extraAttemptRows = (seededOutcomes || []).filter((o) => o.attempt > 1);
  const repairs = [];
  for (const r of seededReqs) {
    const seedTraining = seededTrainingByRx.get(r.prescription_id) ?? null;
    const a1 = (seededOutcomes || []).find((o) => o.training_request_id === r.id && o.attempt === 1) ?? null;
    const reqDrifted =
      r.status !== "generated" ||
      r.attempt_count !== 1 ||
      r.approved_by !== null ||
      r.deployed_at !== null ||
      r.routed_at !== null ||
      r.format_overridden !== false ||
      r.chosen_format !== r.recommended_format ||
      (seedTraining && r.current_training_id !== seedTraining.id);
    const a1Drifted =
      !!a1 &&
      (a1.outcome !== "pending" ||
        a1.resolved_at !== null ||
        a1.was_override !== false ||
        a1.chosen_format !== r.recommended_format ||
        (Array.isArray(a1.enhancements) && a1.enhancements.length > 0) ||
        (seedTraining && a1.training_id !== seedTraining.id));
    repairs.push({ req: r, seedTraining, a1, reqDrifted, a1Drifted });
    if (!seedTraining) {
      console.log(`  ⚠️ seeded request ${r.id} has NO surviving seeded training — repair will leave current_training_id as-is.`);
    }
  }
  const driftedRepairs = repairs.filter((x) => x.reqDrifted || x.a1Drifted);

  // Protected-account gate over every deletion set that maps to a user.
  assertProtected(testReqs.map((r) => r.requested_by).filter(Boolean), emailById, "training-request cleanup");

  // ═══ DRY-RUN SUMMARY ═══════════════════════════════════════════════════════
  console.log(`\n─── What ${CONFIRM ? "WILL" : "would"} be deleted ───`);
  console.log(`  onboarding_progress        ${String(onboardingRows.length).padStart(3)} row(s)  (${seats.length} demo seats route fresh on next login)`);
  console.log(`  training_format_outcomes   ${String(testReqOutcomes.length + extraAttemptRows.length).padStart(3)} row(s)  (${testReqOutcomes.length} on test requests, ${extraAttemptRows.length} extra-attempt on seeded)`);
  console.log(`  training_requests          ${String(testReqs.length).padStart(3)} row(s)  (created_via ≠ '${SEED_REQUEST_VIA}')`);
  console.log(`  prescription_trainings     ${String(testTrainings.length).padStart(3)} row(s)  (generated_by '${TEST_TRAINING_MARKER}' or on test prescriptions)`);
  console.log(`  prescription_fidelity      ${String(testFidelity.length).padStart(3)} row(s)`);
  console.log(`  prescriptions              ${String(testRxIds.length).padStart(3)} row(s)`);
  console.log(`  prescription_detections    ${String(testDetIds.length).padStart(3)} row(s)`);

  if (testReqs.length) {
    console.log(`\n  Test requests going away:`);
    for (const r of testReqs)
      console.log(`     · [${r.status}] via=${r.created_via} — "${(r.issue_text || "").slice(0, 70)}…"`);
  }
  if (testTrainings.length) {
    console.log(`\n  Test-generated trainings going away:`);
    for (const t of testTrainings)
      console.log(`     · v${t.version} ${t.format_key ?? t.generated_by} — "${(t.title || "(untitled)").slice(0, 60)}" (${t.generated_at?.slice(0, 10)})`);
  }
  if (unknownTrainings.length) {
    console.log(`\n  ⚠️ UNKNOWN generated_by markers — reported, NOT deleted:`);
    for (const t of unknownTrainings) console.log(`     · v${t.version} generated_by='${t.generated_by}' — "${(t.title || "").slice(0, 60)}"`);
  }

  console.log(`\n─── Seeded storylines (${seededReqs.length}) ${CONFIRM ? "will be" : "would be"} repaired to post-seed state ───`);
  for (const x of repairs) {
    const flag = x.reqDrifted || x.a1Drifted ? "↻ needs repair" : "· already clean";
    console.log(`  ${flag}  [${x.req.status}, attempt_count ${x.req.attempt_count}] "${(x.req.issue_text || "").slice(0, 60)}…"`);
  }

  console.log(`\n─── Preserved (never touched) ───`);
  console.log(`  org · ${seats.length} seats/profiles · reporting lines · pattern_records · conflicts`);
  console.log(`  seeded prescriptions/trainings (markers: ${SEED_TRAINING_MARKERS.join(", ")})`);
  console.log(`  win column · knowledge gap · coaching watch · ${PROTECTED_EMAILS[1]} (load-bearing, asserted untouched: PASS)`);

  if (!CONFIRM) {
    console.log(`\nDry run only — nothing deleted. Re-run with --confirm to execute:`);
    console.log(`  npm run reset-demo -- --confirm`);
    return;
  }

  // ═══ EXECUTE — children before parents ═════════════════════════════════════
  console.log(`\n─── Executing ───`);
  // col: any column that exists on the table — onboarding_progress has a
  // composite PK (user_id, track) and no id column.
  const del = async (table, build, label, col = "id") => {
    const rows = await must(build().select(col), `delete ${table}`);
    console.log(`  ✓ ${table}: ${rows?.length ?? 0} deleted ${label ? `(${label})` : ""}`);
  };

  if (testReqIds.length)
    await del("training_format_outcomes", () => supabase.from("training_format_outcomes").delete().in("training_request_id", testReqIds), "test requests");
  if (extraAttemptRows.length)
    await del("training_format_outcomes", () => supabase.from("training_format_outcomes").delete().in("id", extraAttemptRows.map((o) => o.id)), "extra attempts on seeded");
  if (testReqIds.length)
    await del("training_requests", () => supabase.from("training_requests").delete().in("id", testReqIds));
  if (testTrainingIds.length)
    await del("prescription_trainings", () => supabase.from("prescription_trainings").delete().in("id", testTrainingIds));
  if (testRxIds.length) {
    await del("prescription_fidelity", () => supabase.from("prescription_fidelity").delete().in("prescription_id", testRxIds));
    await del("prescriptions", () => supabase.from("prescriptions").delete().in("id", testRxIds));
  }
  if (testDetIds.length)
    await del("prescription_detections", () => supabase.from("prescription_detections").delete().in("id", testDetIds));

  for (const x of repairs) {
    const upd = {
      status: "generated",
      attempt_count: 1,
      approved_by: null,
      approved_at: null,
      deployed_at: null,
      routed_at: null,
      routed_by: null,
      chosen_format: x.req.recommended_format,
      format_overridden: false,
      override_reason: null,
    };
    if (x.seedTraining) upd.current_training_id = x.seedTraining.id;
    await must(supabase.from("training_requests").update(upd).eq("id", x.req.id), `repair request ${x.req.id}`);
    if (x.a1) {
      await must(
        supabase
          .from("training_format_outcomes")
          .update({
            outcome: "pending",
            outcome_note: null,
            outcome_evidence_record_ids: [],
            resolved_at: null,
            next_format_recommended: null,
            next_format_rationale: null,
            enhancements: [],
            chosen_format: x.req.recommended_format,
            was_override: false,
            override_reason: null,
            training_id: x.seedTraining?.id ?? x.a1.training_id,
            agent_rationale: x.req.recommendations?.ranked ?? [],
          })
          .eq("id", x.a1.id),
        `repair outcome ${x.a1.id}`
      );
    }
  }
  console.log(`  ✓ ${repairs.length} seeded storyline(s) repaired to post-seed state`);

  if (seatIds.length)
    await del("onboarding_progress", () => supabase.from("onboarding_progress").delete().in("user_id", seatIds), "demo seats route fresh", "user_id");

  // ═══ VERIFY ════════════════════════════════════════════════════════════════
  console.log(`\n─── Verify ───`);
  const vOnboarding = seatIds.length
    ? await must(supabase.from("onboarding_progress").select("user_id").in("user_id", seatIds), "verify onboarding")
    : [];
  const vReqs = await must(
    supabase.from("training_requests").select("id, created_via, status, attempt_count, current_training_id").eq("org_id", org.id),
    "verify requests"
  );
  const vTestReqs = (vReqs || []).filter((r) => r.created_via !== SEED_REQUEST_VIA);
  const vSeeded = (vReqs || []).filter((r) => r.created_via === SEED_REQUEST_VIA);
  const vTrainings = await must(
    supabase.from("prescription_trainings").select("id").eq("org_id", org.id).eq("generated_by", TEST_TRAINING_MARKER),
    "verify trainings"
  );
  const checks = [
    [`onboarding_progress rows for demo seats = 0`, vOnboarding.length === 0, vOnboarding.length],
    [`test training_requests = 0`, vTestReqs.length === 0, vTestReqs.length],
    [`'${TEST_TRAINING_MARKER}' trainings = 0`, vTrainings.length === 0, vTrainings.length],
    [
      `seeded storylines all status='generated', attempt 1, training linked`,
      vSeeded.every((r) => r.status === "generated" && r.attempt_count === 1 && r.current_training_id),
      `${vSeeded.length} seeded`,
    ],
  ];
  let pass = true;
  for (const [label, ok, detail] of checks) {
    console.log(`  ${ok ? "✓" : "✗"} ${label} ${ok ? "" : `(got: ${detail})`}`);
    if (!ok) pass = false;
  }
  console.log(pass ? `\n═══ RESET COMPLETE — demo is at post-seed state ═══` : `\n✗ VERIFY FAILED — inspect above.`);
  if (!pass) process.exit(1);
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}`);
  process.exit(1);
});
