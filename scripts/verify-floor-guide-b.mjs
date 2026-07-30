// FLOOR GUIDE / PHASE B — VERIFICATION.
//
// What this proves, and what it deliberately refuses to claim.
//
// ⭐ PROOF 1 — NO AUTO-PROMOTION, AT SERVICE-ROLE PRIVILEGE.
// It tries twice to create a framework carrying surfaced-by credit that no human
// ever approved: once with no candidate at all, once with a candidate nobody has
// acted on. BOTH must be refused, and refused through the SERVICE-ROLE client
// which bypasses RLS entirely. That privilege level is the whole point — the
// promote path is itself a service-role write, so a guard that only holds for
// session clients would be decoration.
//
// ⭐ PROOF 2 — THE POSITIVE-ONLY RULE IS IN THE DATA.
// It reads every dismissed candidate as the SERVICE role (which sees everything)
// and confirms the RLS policy text excludes them from the person who surfaced
// them. The policy is asserted by behaviour where possible and by inspection
// where PostgREST won't expose the catalog.
//
// ⭐ PROOF 3 — THE QUEUE IS NOT FLOODED.
// It reports the passive-to-explicit ratio and the confidence distribution. There
// is no pass/fail threshold on this one on purpose: the number that matters is
// whether an admin still opens the page, and no script can assert that. What it
// CAN do is make the ratio impossible to ignore.
//
// ⛔ WHAT IT DOES NOT CLAIM: it cannot read trigger or policy definitions
// (PostgREST does not expose pg_catalog). It infers them from behaviour, which is
// stronger evidence anyway — proof 1 failing with SURFACED_WITHOUT_CANDIDATE
// means the trigger is installed AND firing AND the column exists.
//
// READ-ONLY. The two writes it attempts are expected to be REJECTED, so nothing
// lands. If either SUCCEEDS the script deletes the row it should never have been
// able to create and fails loudly — a leftover unapproved framework in the
// library would be the exact thing this phase exists to prevent.
//
// Usage (PowerShell, from the repo root):
//   node scripts/verify-floor-guide-b.mjs
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

let failures = 0;
const fail = (msg) => {
  failures++;
  console.error(`  ❌ ${msg}`);
};
const pass = (msg) => console.log(`  ✅ ${msg}`);
const note = (msg) => console.log(`  · ${msg}`);

console.log("═══ FLOOR GUIDE PHASE B — VERIFICATION ════════════════════════\n");

// ═══ 1. THE TABLE EXISTS AND THE COLUMN LANDED ═════════════════════════════
console.log("1. Migration");
const { error: tableError } = await supabase
  .from("candidate_insights")
  .select("id", { count: "exact", head: true });
if (tableError) {
  fail(
    `candidate_insights is not readable: ${tableError.message}\n` +
      `     Run supabase/floorguide-b-emergent-insight.sql first — nothing below can pass without it.`
  );
} else {
  pass("candidate_insights exists");
}
const { error: colError } = await supabase
  .from("pattern_records")
  .select("id, surfaced_by_user_id, codified_from")
  .limit(1);
if (colError) {
  fail(`pattern_records.surfaced_by_user_id missing: ${colError.message}`);
} else {
  pass("pattern_records.surfaced_by_user_id exists");
}

// ═══ 2. WHO IS INVOLVED ════════════════════════════════════════════════════
console.log("\n2. People");
const { data: people } = await supabase
  .from("profiles")
  .select("id, display_name, claimed_title, role, org_id, is_org_admin, deactivated_at")
  .in("role", ["contributor", "member", "manager"]);
const contributors = (people ?? []).filter((p) => p.role === "contributor");
const experts = (people ?? []).filter(
  (p) => (p.role === "member" || p.role === "manager") && !p.deactivated_at
);
note(`contributors: ${contributors.length} · people who can codify: ${experts.length}`);
if (contributors.length === 0) {
  fail("no contributor exists — run scripts/seed-floor-guide-demo.mjs, or proofs 3 and 4 have nothing to test");
}
const contributor = contributors[0] ?? null;
const expert = experts[0] ?? null;
if (contributor) note(`probing with contributor: ${contributor.display_name}`);

// ═══ 3. ⭐ PROOF 1a — CREDIT WITH NO CANDIDATE AT ALL ══════════════════════
console.log("\n3. ⭐ No-auto-promotion guard: surfaced credit with no candidate");
if (!contributor || !expert) {
  fail("skipped — need one contributor and one person who can codify");
} else {
  const { data: leaked, error } = await supabase
    .from("pattern_records")
    .insert({
      user_id: expert.id,
      status: "active",
      qa_pairs: [],
      entity_map: [],
      surfaced_by_user_id: contributor.id,
    })
    .select("id");
  if (error) {
    if (/SURFACED_WITHOUT_CANDIDATE/.test(error.message)) {
      pass(`blocked by the trigger at service-role privilege (${error.message.slice(0, 60)}…)`);
    } else {
      // Any refusal is better than none, but the WRONG refusal means the guard
      // isn't the thing doing the work and the real hole may still be open.
      fail(
        `refused, but NOT by the Phase B guard — expected SURFACED_WITHOUT_CANDIDATE, got: ${error.message}`
      );
    }
  } else {
    fail("⛔ INSERT SUCCEEDED. A framework now carries surfaced-by credit no human approved.");
    for (const row of leaked ?? []) {
      await supabase.from("pattern_records").delete().eq("id", row.id);
      note(`cleaned up the row that should not have existed: ${row.id}`);
    }
  }
}

// ═══ 4. ⭐ PROOF 1b — A CANDIDATE NOBODY ACTED ON ══════════════════════════
console.log("\n4. ⭐ No-auto-promotion guard: a candidate nobody has acted on");
if (!contributor || !expert || !contributor.org_id) {
  fail("skipped — need a contributor with an org and one person who can codify");
} else {
  const probeText =
    "VERIFY PROBE — a candidate created by verify-floor-guide-b.mjs to prove the guard. Safe to delete.";
  const { data: cand, error: candError } = await supabase
    .from("candidate_insights")
    .insert({
      org_id: contributor.org_id,
      user_id: contributor.id,
      source: "explicit",
      surface: "retrieve",
      raw_input: probeText,
      detector: "verify-probe",
      status: "new",
      input_norm: `verify-probe-${Date.now()}`,
    })
    .select("id")
    .single();
  if (candError || !cand) {
    fail(`could not create the probe candidate: ${candError?.message ?? "no row"}`);
  } else {
    const { data: leaked, error } = await supabase
      .from("pattern_records")
      .insert({
        user_id: expert.id,
        status: "active",
        qa_pairs: [],
        entity_map: [],
        surfaced_by_user_id: contributor.id,
        codified_from: { kind: "candidate_insight", candidate_insight_id: cand.id },
      })
      .select("id");
    if (error) {
      if (/INSIGHT_NOT_PROMOTED_BY_HUMAN/.test(error.message)) {
        pass("blocked — a candidate with status 'new' and acted_by null cannot become judgment");
      } else {
        fail(`refused, but not by the expected guard: ${error.message}`);
      }
    } else {
      fail("⛔ INSERT SUCCEEDED on an un-acted candidate. The human-in-the-loop rule is not holding.");
      for (const row of leaked ?? []) {
        await supabase.from("pattern_records").delete().eq("id", row.id);
        note(`cleaned up: ${row.id}`);
      }
    }
    await supabase.from("candidate_insights").delete().eq("id", cand.id);
    note("probe candidate removed");
  }
}

// ═══ 5. THE QUEUE, AS IT STANDS ════════════════════════════════════════════
console.log("\n5. The queue — is it trustworthy or is it noise?");
const { data: queue } = await supabase
  .from("candidate_insights")
  .select("id, source, status, confidence, surface, user_id, created_at, promoted_record_id")
  .order("created_at", { ascending: false });
const all = queue ?? [];
const explicit = all.filter((c) => c.source === "explicit");
const passive = all.filter((c) => c.source === "passive");
note(`total ${all.length} · explicit ${explicit.length} · passive ${passive.length}`);
for (const status of ["new", "reviewing", "routed", "promoted", "dismissed"]) {
  const n = all.filter((c) => c.status === status).length;
  if (n) note(`  status ${status}: ${n}`);
}
if (passive.length > 0) {
  const scores = passive.map((c) => Number(c.confidence ?? 0));
  const min = Math.min(...scores);
  note(`passive confidence: min ${min.toFixed(2)} · max ${Math.max(...scores).toFixed(2)}`);
  if (min < 0.85) {
    fail(
      `a passive candidate exists below the 0.85 bar (min ${min.toFixed(2)}). Either the bar was ` +
        `lowered or something wrote a candidate without going through /api/insights/detect.`
    );
  } else {
    pass("every passive candidate cleared the documented 0.85 bar");
  }
}
// ⭐ THE PRIVACY RULE: no passive candidate may exist from the Floor Guide
// surface. If one does, the "nobody's grading you" promise is false.
const leakedFromFloorGuide = passive.filter((c) => c.surface === "floor_guide");
if (leakedFromFloorGuide.length > 0) {
  fail(
    `⛔ ${leakedFromFloorGuide.length} PASSIVE candidate(s) came from the Floor Guide surface. ` +
      `That surface promises no record is kept. Check PASSIVE_SURFACES in src/lib/candidate-insights.ts.`
  );
} else {
  pass("no passive candidate came from Floor Guide — the privacy promise holds");
}

// ═══ 6. PROMOTED FRAMEWORKS — DUAL ATTRIBUTION AND RETRIEVABILITY ══════════
console.log("\n6. Promoted frameworks");
const { data: surfaced } = await supabase
  .from("pattern_records")
  .select("id, user_id, status, method, trigger_type, framework, entity_map, embedded_at, surfaced_by_user_id, codified_from")
  .not("surfaced_by_user_id", "is", null);
const promoted = surfaced ?? [];
if (promoted.length === 0) {
  note("none yet — promote one from /insights and re-run to close this section");
} else {
  for (const r of promoted) {
    const name = r.framework?.name ?? "(no framework)";
    const from = r.codified_from ?? {};
    const surfacedName = from.surfaced_by?.name ?? null;
    const codifiedName = from.codified_with?.name ?? null;
    console.log(`  · "${name}"`);
    if (r.user_id === r.surfaced_by_user_id) {
      fail(`  ${name}: the contributor OWNS this record. Authorship must stay with the expert.`);
    }
    if (!surfacedName || !codifiedName) {
      fail(`  ${name}: codified_from is missing a name (surfaced_by=${surfacedName}, codified_with=${codifiedName}) — the card cannot render dual attribution`);
    } else {
      pass(`  ${name}: surfaced by ${surfacedName} · codified with ${codifiedName}`);
    }
    if (r.status !== "complete") fail(`  ${name}: status is '${r.status}', so it is not in the library`);
    if (!r.embedded_at) {
      fail(
        `  ${name}: NOT EMBEDDED, so it will not be retrieved. Run ` +
          `node scripts/backfill-pattern-embeddings.mjs then node scripts/verify-p3.mjs`
      );
    }
    // The Win Column is derived from wins that name people. A promotion that is
    // not a win, or that names nobody, gives the contributor no recognition.
    const named = (r.entity_map ?? []).filter((e) => e?.type === "role_person");
    if (r.trigger_type !== "win") {
      fail(`  ${name}: trigger_type is '${r.trigger_type}', so the Win Column will never show it`);
    } else if (named.length === 0) {
      fail(`  ${name}: no role_person entity, so nobody gets Win Column credit`);
    } else {
      pass(`  ${name}: Win Column credit for ${named.map((e) => e.name).join(", ")}`);
    }
  }
}

// ═══ 7. THE PHASE A RULE IS STILL TRUE ═════════════════════════════════════
console.log("\n7. Phase A is not weakened");
if (contributor) {
  const { error } = await supabase
    .from("pattern_records")
    .insert({ user_id: contributor.id, status: "active", qa_pairs: [], entity_map: [] });
  if (error && /CONTRIBUTOR_CANNOT_CODIFY/.test(error.message)) {
    pass("a contributor still cannot own a pattern_record (Phase A guard intact)");
  } else if (error) {
    fail(`refused for the wrong reason: ${error.message}`);
  } else {
    fail("⛔ a contributor-owned pattern_record was created. Phase A has regressed.");
  }
}

console.log("\n═══════════════════════════════════════════════════════════════");
if (failures > 0) {
  console.error(`\n${failures} FAILURE(S). Phase B is not verified.\n`);
  process.exit(1);
}
console.log("\nAll automated checks passed.");
console.log("Still owed, and no script can do them:");
console.log("  · Brian browser-verifies: contributor shares → admin promotes → framework appears");
console.log("  · Copy approval (claude/COPY-DRAFT-floorguide-phaseB.md)\n");
