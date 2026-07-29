// FLOOR GUIDE / PHASE A — VERIFICATION.
//
// Two things this proves, and one it deliberately refuses to claim.
//
// ⭐ PROOF 1 — THE INTEGRITY GUARD IS REAL AT THE DATA LAYER.
// It attempts a pattern_records INSERT for a contributor USING THE SERVICE-ROLE
// CLIENT, which bypasses RLS entirely. That privilege level is the whole point:
// a guard that only holds for session clients would pass every test written
// against the UI and do nothing on the seeds, the Training Studio's graph
// codification, or the gap-fill path. The insert MUST fail. A success here is a
// build-breaking result, not a warning.
//
// This is the verify-script blind spot from P-7, applied in reverse. Back then a
// verify script used the service-role key and therefore proved nothing about a
// bug that lived in the RLS gap. Here the service-role key is exactly the
// privilege the guard has to survive, so using it is the point rather than the
// flaw.
//
// ⭐ PROOF 2 — THE PERSON-LEVEL FOOTPRINT, COUNTED.
// For everybody with Floor Guide on, it counts every person-level row the
// retrieval path could have written about them:
//   • learning_signals  where actor_id = them   (org-wide readable)
//   • knowledge_gap_askers where user_id = them (their /gaps/mine payoff rows)
//   • retraining_signals  where person_id = them (Coaching Watch, manager-only)
// Run it, ask a Floor Guide question, run it again. The numbers must be
// IDENTICAL. Then ask the same question through /retrieve and click "this
// helped": learning_signals must go UP. That second half is what proves the flag
// is doing the suppressing rather than the writer being broken — a dead writer
// and a working suppression look exactly alike if you only ever test one path.
//
// ⛔ WHAT IT DOES NOT CLAIM: it cannot confirm the SQL migration's constraint or
// trigger definitions directly — PostgREST does not expose pg_catalog. It infers
// them from behaviour, which is the stronger evidence anyway: proof 1 failing
// with CONTRIBUTOR_CANNOT_CODIFY means the trigger is installed AND firing AND
// the role value exists. Read the constraint text with the sanity-check queries
// at the bottom of supabase/floorguide-a-contributor-tier.sql if you want the
// definitions.
//
// READ-ONLY by default. The one write it attempts is expected to be REJECTED, so
// nothing lands. `--control` adds an opt-in second probe that inserts a row for a
// MEMBER (which must succeed, proving the guard is selective rather than a
// blanket block) and then deletes it. That probe is OFF by default because a
// leftover 'active' pattern_record would show up in the demo as an abandoned
// codify session with a "resume where you left off" prompt.
//
// Usage (PowerShell, from the repo root):
//   node scripts/verify-floor-guide.mjs
//   node scripts/verify-floor-guide.mjs --control
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import path from "node:path";

const envRaw = await readFile(path.join(process.cwd(), ".env.local"), "utf-8");
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const CONTROL = process.argv.includes("--control");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

let failures = 0;
const fail = (msg) => {
  failures++;
  console.error(`  ❌ ${msg}`);
};
const pass = (msg) => console.log(`  ✅ ${msg}`);

async function countRows(table, column, value) {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq(column, value);
  if (error) return { count: null, error: error.message };
  return { count: count ?? 0, error: null };
}

console.log("═══ FLOOR GUIDE PHASE A — VERIFICATION ════════════════════════\n");

// ═══ 1. THE ROLE LADDER EXISTS AND SOMEBODY IS ON IT ════════════════════════
console.log("1. Contributors and Floor Guide assignments");
const { data: people, error: peopleError } = await supabase
  .from("profiles")
  .select(
    "id, display_name, claimed_title, role, org_id, manager_id, is_org_admin, " +
      "floor_guide_active, floor_guide_started_at, deactivated_at"
  )
  .or("role.eq.contributor,floor_guide_active.eq.true");

if (peopleError) {
  // A 42703 here means the migration has not been run.
  fail(
    `could not read profiles: ${peopleError.message}\n` +
      `     If this mentions floor_guide_active, run supabase/floorguide-a-contributor-tier.sql first.`
  );
} else {
  const contributors = people.filter((p) => p.role === "contributor");
  const onboarding = people.filter((p) => p.floor_guide_active);
  console.log(`  contributors: ${contributors.length} · in Floor Guide: ${onboarding.length}`);
  for (const p of people) {
    const bits = [
      p.role,
      p.floor_guide_active ? "floor-guide ON" : null,
      p.is_org_admin ? "admin" : null,
      p.deactivated_at ? "seat closed" : null,
    ].filter(Boolean);
    console.log(`   · ${p.display_name} — ${p.claimed_title ?? "no title"} [${bits.join(", ")}]`);
  }
  if (contributors.length === 0) {
    fail(
      "no contributor exists — run scripts/seed-floor-guide-demo.mjs, or proof 1 below has nothing to test."
    );
  }
  // Guard 5 from the admin API, checked against live data: a contributor must
  // never sit in somebody's reporting line, or manager-only person-level signals
  // would route to somebody the system refuses the manager capability.
  for (const c of contributors) {
    const { count } = await countRows("profiles", "manager_id", c.id);
    if (count && count > 0) {
      fail(`${c.display_name} is a contributor but ${count} person/people report to them`);
    }
  }
  // Guard 6, same treatment.
  for (const c of contributors) {
    if (c.is_org_admin) fail(`${c.display_name} is both a contributor and an org admin`);
  }
  if (contributors.length > 0) pass("contributor role is live and internally consistent");
}

const contributors = (people ?? []).filter((p) => p.role === "contributor");
const onboarding = (people ?? []).filter((p) => p.floor_guide_active);

// ═══ 2. ⭐ PROOF 1 — THE INTEGRITY GUARD, AT SERVICE-ROLE PRIVILEGE ═════════
console.log("\n2. ⭐ Integrity guard: a contributor cannot create canonical judgment");
if (contributors.length === 0) {
  fail("skipped — no contributor to probe with");
} else {
  const target = contributors[0];
  const { data: probe, error: probeError } = await supabase
    .from("pattern_records")
    .insert({
      user_id: target.id,
      org_id: target.org_id,
      status: "active",
      qa_pairs: [],
      entity_map: [],
      context_summary: "VERIFY-FLOOR-GUIDE PROBE — this row must never exist.",
    })
    .select("id");

  if (probeError) {
    const msg = probeError.message || "";
    if (msg.includes("CONTRIBUTOR_CANNOT_CODIFY")) {
      pass(`blocked by the trigger at service-role privilege (${target.display_name})`);
    } else {
      // Rejected, but not by the guard we built. Could be the role constraint, a
      // missing column, something else — report it rather than banking a pass on
      // the wrong error.
      fail(
        `the insert was rejected, but NOT by the contributor guard. Message: ${msg}\n` +
          `     The guard may not be installed. Check pg_trigger per the sanity checks in the migration.`
      );
    }
  } else {
    // 🚨 The build-breaking case.
    const id = probe?.[0]?.id;
    fail(
      "THE GUARD DID NOT HOLD — a contributor's pattern_record was created at service-role privilege.\n" +
        "     The integrity rule is currently cosmetic. Do not ship this."
    );
    if (id) {
      const { error: delError } = await supabase.from("pattern_records").delete().eq("id", id);
      console.error(
        delError
          ? `     ⚠️  AND the probe row ${id} could not be cleaned up: ${delError.message}`
          : `     (probe row ${id} deleted)`
      );
    }
  }
}

// ═══ 3. CONTROL PROBE (opt-in) — the guard is selective, not a blanket ══════
if (CONTROL) {
  console.log("\n3. Control probe: a member CAN still create a pattern_record");
  const { data: member } = await supabase
    .from("profiles")
    .select("id, display_name, org_id")
    .eq("role", "member")
    .not("org_id", "is", null)
    .is("deactivated_at", null)
    .limit(1)
    .maybeSingle();
  if (!member) {
    fail("skipped — no active member with an org to probe with");
  } else {
    const { data: ok, error: okError } = await supabase
      .from("pattern_records")
      .insert({
        user_id: member.id,
        org_id: member.org_id,
        status: "active",
        qa_pairs: [],
        entity_map: [],
        context_summary: "VERIFY-FLOOR-GUIDE CONTROL PROBE — deleted immediately.",
      })
      .select("id");
    if (okError) {
      fail(
        `a MEMBER was also blocked — the guard is too broad and is now blocking real capture: ${okError.message}`
      );
    } else {
      const id = ok?.[0]?.id;
      pass(`member write still works (${member.display_name})`);
      const { error: delError } = await supabase.from("pattern_records").delete().eq("id", id);
      if (delError) {
        fail(
          `control probe row ${id} could NOT be deleted: ${delError.message}\n` +
            `     Delete it by hand — an orphan 'active' record shows up in the demo as an abandoned codify session.`
        );
      } else {
        pass("control probe row cleaned up");
      }
    }
  }
} else {
  console.log("\n3. Control probe: skipped (pass --control to run it)");
}

// ═══ 4. ⭐ PROOF 2 — THE PERSON-LEVEL FOOTPRINT ═════════════════════════════
console.log("\n4. ⭐ Person-level footprint for everyone in Floor Guide");
console.log("   (run this before and after a Floor Guide question — must not change)");
if (onboarding.length === 0) {
  console.log("   nobody is in Floor Guide — nothing to count");
} else {
  for (const p of onboarding) {
    const ls = await countRows("learning_signals", "actor_id", p.id);
    const ask = await countRows("knowledge_gap_askers", "user_id", p.id);
    const rw = await countRows("retraining_signals", "person_id", p.id);
    console.log(
      `   · ${p.display_name}: learning_signals(actor)=${ls.count ?? `ERR ${ls.error}`} · ` +
        `knowledge_gap_askers=${ask.count ?? `ERR ${ask.error}`} · ` +
        `retraining_signals(subject)=${rw.count ?? `ERR ${rw.error}`}`
    );
    if ((ls.count ?? 0) > 0) {
      console.log(
        `     ⚠️  NOT automatically a failure: this person may also use /retrieve, where the ` +
          `write is correct and wanted. Compare BEFORE and AFTER a Floor Guide question — the ` +
          `number must be unchanged by the Floor Guide path specifically.`
      );
    }
  }
}

// ═══ 5. FLOOR-GUIDE-SOURCED GAPS CARRY NO ACTOR ════════════════════════════
console.log("\n5. Gap signals flagged from Floor Guide carry no actor");
const { data: fgSignals, error: fgError } = await supabase
  .from("learning_signals")
  .select("id, signal_type, actor_id, actor_role, features, subject_id, occurred_at")
  .eq("signal_type", "knowledge_gap_opened")
  .order("occurred_at", { ascending: false })
  .limit(50);
if (fgError) {
  fail(`could not read learning_signals: ${fgError.message}`);
} else {
  const viaFg = (fgSignals ?? []).filter((s) => s?.features?.via_floor_guide === true);
  const leaked = viaFg.filter((s) => s.actor_id !== null || s.actor_role !== null);
  console.log(`   knowledge_gap_opened rows checked: ${(fgSignals ?? []).length} · via Floor Guide: ${viaFg.length}`);
  if (viaFg.length === 0) {
    console.log("   none yet — ask an uncovered question from /floor-guide, then re-run");
  } else if (leaked.length > 0) {
    fail(`${leaked.length} Floor-Guide gap signal(s) carry an actor. Ids: ${leaked.map((s) => s.id).join(", ")}`);
  } else {
    pass(`all ${viaFg.length} Floor-Guide gap signal(s) have actor_id null`);
  }
  // And the org-level half must still be there: coverage intelligence is KEPT.
  if (viaFg.length > 0) {
    const gapIds = [...new Set(viaFg.map((s) => s.subject_id))];
    const { data: gaps } = await supabase
      .from("knowledge_gaps")
      .select("id, question_text, asked_count, status")
      .in("id", gapIds);
    console.log(`   the org still has the coverage signal — ${(gaps ?? []).length} gap row(s):`);
    for (const g of gaps ?? []) {
      const askers = await countRows("knowledge_gap_askers", "gap_id", g.id);
      console.log(
        `    · "${String(g.question_text).slice(0, 68)}…" asked ${g.asked_count}× [${g.status}] · askers recorded: ${askers.count}`
      );
    }
  }
}

// ═══ 6. THE STANDING SAFETY CHECK ══════════════════════════════════════════
console.log("\n6. 🛑 Standing safety check");
const { count: profileCount } = await supabase
  .from("profiles")
  .select("*", { count: "exact", head: true });
const { count: recordCount } = await supabase
  .from("pattern_records")
  .select("*", { count: "exact", head: true });
console.log(`   profiles: ${profileCount} · pattern_records: ${recordCount}`);
console.log("   (nothing in this script deletes a profile, a source, or an insight)");

console.log("\n═══════════════════════════════════════════════════════════════");
if (failures > 0) {
  console.error(`❌ ${failures} check(s) FAILED — read them above before shipping.`);
  process.exit(1);
}
console.log("✅ All automated checks passed.");
console.log("⏭️  Still owed by a human: the before/after Floor Guide question (step 4),");
console.log("   and the /retrieve control run that proves the writer is alive.");
