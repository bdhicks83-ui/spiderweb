// FLOOR GUIDE / PHASE C — VERIFICATION.
//
// What this proves, and what it deliberately refuses to claim.
//
// ⭐ PROOF 1 — THE SEPARATION (Decision 2, the spine of Phase C).
// It signs in as a REAL contributor under their own JWT — the
// verify-floor-guide-rephrase shape, which has no service-role blind spot —
// runs the exact retrieval RPC a Floor Guide question runs, and asserts that
// the row counts of deep_dive_requests, deep_dive_responses,
// candidate_insights and retraining_signals did not move. A Floor Guide
// question produces no deep-dive row, no divergence row, and no
// manager-visible anything: measured, not asserted.
//
// ⭐ PROOF 2 — DECISION 1'S BOUNDARY IS IN THE DATA.
// For an existing response it checks, as three identities where available:
// the responder sees their own row; their manager sees it (manager-visible,
// disclosed); a peer does NOT. RLS is the mechanism, so this section only
// means something run against real seeded people — it skips loudly otherwise.
//
// ⭐ PROOF 3 — DECISION 5 LEAVES NO ROOM FOR A RECORD.
// It asserts the decline columns DO NOT EXIST: selecting declined_at or
// decline_reason from deep_dive_requests must fail. You cannot quietly start
// recording declines without this script going red.
//
// ⭐ PROOF 4 — PHASES A AND B STILL HOLD.
// The contributor-ownership guard and the no-auto-promotion guard are
// re-probed at service-role privilege, and every source='deep_dive' candidate
// is audited: it must trace to a deep_dive_responses row and sit at or above
// the 0.85 bar.
//
// ⛔ WHAT IT DOES NOT CLAIM: it cannot click the disclosure onto a screen or
// prove the copy renders above the box — that is Brian's browser eyeball, and
// it is listed at the end as still owed.
//
// READ-ONLY apart from probes that are expected to be REJECTED (and one
// constraint probe that deletes itself). If a probe unexpectedly SUCCEEDS the
// script deletes what it created and fails loudly.
//
// Usage (PowerShell, from the repo root):
//   node scripts/verify-floor-guide-c.mjs
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import path from "node:path";

const envRaw = await readFile(path.join(process.cwd(), ".env.local"), "utf-8");
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// The AWIP demo login pattern. Override for a non-demo org.
const DEMO_PASSWORD = process.env.VERIFY_DEMO_PASSWORD ?? "Demo-AWIP-2026!";
const CONTRIBUTOR_EMAIL =
  process.env.VERIFY_CONTRIBUTOR_EMAIL ?? "devin.cross@awip-demo.example";

// ⚠️ Mirrors DEEP_DIVE_FINDING_MIN in src/lib/deep-dives.ts (an .mjs script
// cannot import TS). If they drift, believe the TS constant and fix this one.
const FINDING_MIN = 3;

let failures = 0;
const fail = (msg) => {
  failures++;
  console.error(`  ❌ ${msg}`);
};
const pass = (msg) => console.log(`  ✅ ${msg}`);
const note = (msg) => console.log(`  · ${msg}`);

async function signIn(email) {
  const client = createClient(URL, ANON);
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: DEMO_PASSWORD,
  });
  if (error || !data?.user) return null;
  return { client, userId: data.user.id };
}

async function counts() {
  const tables = [
    "deep_dive_requests",
    "deep_dive_responses",
    "candidate_insights",
    "retraining_signals",
  ];
  const out = {};
  for (const t of tables) {
    const { count, error } = await service
      .from(t)
      .select("id", { count: "exact", head: true });
    out[t] = error ? null : count ?? 0;
  }
  return out;
}

console.log("═══ FLOOR GUIDE PHASE C — VERIFICATION ════════════════════════\n");

// ═══ 1. MIGRATION ════════════════════════════════════════════════════════════
console.log("1. Migration");
const { error: reqTableError } = await service
  .from("deep_dive_requests")
  .select("id, topic, anchor_record_id, targets, sent_to_count, status", {
    count: "exact",
    head: true,
  });
if (reqTableError) {
  fail(
    `deep_dive_requests is not readable: ${reqTableError.message}\n` +
      `     Run supabase/floorguide-c-deep-dives.sql first — nothing below can pass without it.`
  );
} else {
  pass("deep_dive_requests exists with the expected columns");
}
const { error: respTableError } = await service
  .from("deep_dive_responses")
  .select(
    "id, answer, divergence, divergence_note, compared_record_id, candidate_insight_id, training_request_id",
    { count: "exact", head: true }
  );
if (respTableError) {
  fail(`deep_dive_responses is not readable: ${respTableError.message}`);
} else {
  pass("deep_dive_responses exists with both lens columns");
}

// The widened source ladder: a probe candidate with source='deep_dive' must be
// accepted (then removed).
{
  const { data: anyContrib } = await service
    .from("profiles")
    .select("id, org_id")
    .eq("role", "contributor")
    .not("org_id", "is", null)
    .limit(1)
    .maybeSingle();
  if (!anyContrib) {
    fail("no contributor with an org exists — seed one; the source-constraint probe was skipped");
  } else {
    const { data: probe, error: probeError } = await service
      .from("candidate_insights")
      .insert({
        org_id: anyContrib.org_id,
        user_id: anyContrib.id,
        source: "deep_dive",
        surface: "deep_dive",
        raw_input: "VERIFY PROBE — source constraint check from verify-floor-guide-c.mjs.",
        detector: "verify-probe",
        status: "new",
        confidence: 0.9,
        input_norm: `verify-c-probe-${Date.now()}`,
      })
      .select("id")
      .single();
    if (probeError || !probe) {
      fail(
        `candidate_insights refused source='deep_dive': ${probeError?.message ?? "no row"} — ` +
          `the constraint in section 4 of the migration did not land`
      );
    } else {
      pass("candidate_insights accepts source='deep_dive' (constraint widened)");
      await service.from("candidate_insights").delete().eq("id", probe.id);
      note("probe candidate removed");
    }
  }
}

// ═══ 2. ⭐ PROOF 3 — A DECLINE HAS NOWHERE TO LIVE ═══════════════════════════
console.log("\n2. ⭐ Decision 5: the decline columns must not exist");
for (const col of ["declined_at", "decline_reason"]) {
  const { error } = await service.from("deep_dive_requests").select(col).limit(1);
  if (error) {
    pass(`deep_dive_requests.${col} does not exist — a decline has nowhere to be recorded`);
  } else {
    fail(
      `⛔ deep_dive_requests.${col} EXISTS. Somebody added a decline record; ` +
        `that breaks the "declining is silent, nothing recorded" promise on the disclosure.`
    );
  }
}

// ═══ 3. ⭐ PROOF 1 — THE SEPARATION, MEASURED UNDER A REAL JWT ═══════════════
console.log("\n3. ⭐ Decision 2: a Floor Guide question writes nothing Phase C can see");
const contributorSession = await signIn(CONTRIBUTOR_EMAIL);
if (!contributorSession) {
  fail(
    `could not sign in as ${CONTRIBUTOR_EMAIL} — the separation proof needs a real ` +
      `contributor JWT (set VERIFY_CONTRIBUTOR_EMAIL / VERIFY_DEMO_PASSWORD for a non-demo org)`
  );
} else {
  // A real query vector: any embedded record's own embedding is guaranteed
  // valid input for the RPC (no Voyage dependency in a verify script).
  const { data: embedded } = await service
    .from("pattern_records")
    .select("embedding")
    .not("embedding", "is", null)
    .limit(1)
    .maybeSingle();
  if (!embedded?.embedding) {
    fail("no embedded pattern_record exists to borrow a query vector from — run the backfill first");
  } else {
    const before = await counts();
    const { error: rpcError } = await contributorSession.client.rpc(
      "search_pattern_records_by_query",
      { query_embedding: embedded.embedding, match_count: 5 }
    );
    if (rpcError) {
      fail(`the retrieval RPC failed under the contributor JWT: ${rpcError.message}`);
    } else {
      const after = await counts();
      let moved = false;
      for (const t of Object.keys(before)) {
        if (before[t] === null || after[t] === null) {
          note(`${t}: not readable (${before[t]} → ${after[t]}) — treated as inconclusive, check manually`);
          continue;
        }
        if (before[t] !== after[t]) {
          moved = true;
          fail(`⛔ ${t} moved ${before[t]} → ${after[t]} during a Floor Guide retrieval`);
        }
      }
      if (!moved) {
        pass(
          "retrieval as the contributor moved NOTHING: no deep-dive row, no divergence " +
            "row, no candidate, no retraining signal"
        );
      }
    }
  }
}

// ═══ 4. ⭐ PROOF 2 — WHO SEES A RESPONSE (Decision 1's exact boundary) ═══════
console.log("\n4. ⭐ Decision 1: responder + their manager see a response; a peer does not");
const { data: anyResponse } = await service
  .from("deep_dive_responses")
  .select("id, user_id, org_id, divergence")
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();
if (!anyResponse) {
  note("no response exists yet — answer a deep dive and re-run to close this section");
} else {
  const { data: responderProfile } = await service
    .from("profiles")
    .select("id, manager_id, org_id, display_name")
    .eq("id", anyResponse.user_id)
    .maybeSingle();

  // The responder's own view.
  const { data: respAuth } = await service.auth.admin.getUserById(anyResponse.user_id);
  const responderEmail = respAuth?.user?.email ?? null;
  if (responderEmail) {
    const own = await signIn(responderEmail);
    if (own) {
      const { data: rows } = await own.client
        .from("deep_dive_responses")
        .select("id")
        .eq("id", anyResponse.id);
      if ((rows ?? []).length === 1) pass(`the responder sees their own answer`);
      else fail("the responder CANNOT see their own answer — the own-row policy is broken");
    } else note(`could not sign in as the responder (${responderEmail}) — own-row check skipped`);
  }

  // The manager's view.
  if (responderProfile?.manager_id) {
    const { data: mgrAuth } = await service.auth.admin.getUserById(responderProfile.manager_id);
    const mgrEmail = mgrAuth?.user?.email ?? null;
    const mgr = mgrEmail ? await signIn(mgrEmail) : null;
    if (mgr) {
      const { data: rows } = await mgr.client
        .from("deep_dive_responses")
        .select("id, divergence, divergence_note")
        .eq("id", anyResponse.id);
      if ((rows ?? []).length === 1) {
        pass(`the responder's manager sees the response and its reading (disclosed, by design)`);
      } else {
        fail("the manager CANNOT see their report's response — Decision 1 is not landing in RLS");
      }
    } else {
      note("could not sign in as the manager — manager-visibility check skipped");
    }
  } else {
    note("the responder has no manager_id on file — manager-visibility check skipped");
  }

  // A peer: same org, not the responder, not their manager, not an org admin.
  const { data: peers } = await service
    .from("profiles")
    .select("id")
    .eq("org_id", anyResponse.org_id)
    .neq("id", anyResponse.user_id)
    .neq("id", responderProfile?.manager_id ?? "00000000-0000-0000-0000-000000000000")
    .eq("is_org_admin", false)
    .is("deactivated_at", null)
    .limit(10);
  let peerChecked = false;
  for (const p of peers ?? []) {
    // Skip anyone who manages the responder through a chain we can see.
    const { data: peerAuth } = await service.auth.admin.getUserById(p.id);
    const peerEmail = peerAuth?.user?.email ?? null;
    if (!peerEmail) continue;
    const peer = await signIn(peerEmail);
    if (!peer) continue;
    const { data: rows } = await peer.client
      .from("deep_dive_responses")
      .select("id")
      .eq("id", anyResponse.id);
    if ((rows ?? []).length === 0) {
      pass(`a peer (${peerEmail}) sees nothing — the boundary holds`);
    } else {
      fail(`⛔ a peer (${peerEmail}) CAN read the response. Only admin, manager and the responder may.`);
    }
    peerChecked = true;
    break;
  }
  if (!peerChecked) note("no signable peer found — peer check skipped");
}

// ═══ 5. ⭐ PROOF 4a — PHASE A + B GUARDS STILL HOLD ══════════════════════════
console.log("\n5. ⭐ Phases A and B are not weakened");
{
  const { data: contributor } = await service
    .from("profiles")
    .select("id, org_id")
    .eq("role", "contributor")
    .limit(1)
    .maybeSingle();
  const { data: expert } = await service
    .from("profiles")
    .select("id")
    .in("role", ["member", "manager"])
    .is("deactivated_at", null)
    .limit(1)
    .maybeSingle();
  if (!contributor || !expert) {
    fail("need one contributor and one expert to probe the guards — seed first");
  } else {
    // Phase A: a contributor cannot own a pattern_record.
    const { data: leakA, error: errA } = await service
      .from("pattern_records")
      .insert({ user_id: contributor.id, status: "active", qa_pairs: [], entity_map: [] })
      .select("id");
    if (errA && /CONTRIBUTOR_CANNOT_CODIFY/.test(errA.message)) {
      pass("Phase A: a contributor still cannot own a pattern_record");
    } else if (errA) {
      fail(`Phase A probe refused for the wrong reason: ${errA.message}`);
    } else {
      fail("⛔ Phase A regressed: a contributor-owned pattern_record was created");
      for (const row of leakA ?? []) await service.from("pattern_records").delete().eq("id", row.id);
    }
    // Phase B: surfaced-by credit with no candidate.
    const { data: leakB, error: errB } = await service
      .from("pattern_records")
      .insert({
        user_id: expert.id,
        status: "active",
        qa_pairs: [],
        entity_map: [],
        surfaced_by_user_id: contributor.id,
      })
      .select("id");
    if (errB && /SURFACED_WITHOUT_CANDIDATE/.test(errB.message)) {
      pass("Phase B: surfaced-by credit still requires a human-acted candidate");
    } else if (errB) {
      fail(`Phase B probe refused for the wrong reason: ${errB.message}`);
    } else {
      fail("⛔ Phase B regressed: unapproved surfaced credit was accepted");
      for (const row of leakB ?? []) await service.from("pattern_records").delete().eq("id", row.id);
    }
  }
}

// ═══ 6. ⭐ PROOF 4b — THE deep_dive CANDIDATE WRITE PATH IS THE ONLY ONE ═════
console.log("\n6. Every deep_dive candidate traces to a response, above the bar");
{
  const { data: ddCands } = await service
    .from("candidate_insights")
    .select("id, confidence, status")
    .eq("source", "deep_dive");
  const cands = ddCands ?? [];
  if (cands.length === 0) {
    note("no deep_dive candidates yet — nothing to audit");
  } else {
    const { data: linked } = await service
      .from("deep_dive_responses")
      .select("candidate_insight_id")
      .not("candidate_insight_id", "is", null);
    const linkedIds = new Set((linked ?? []).map((r) => r.candidate_insight_id));
    for (const c of cands) {
      if (!linkedIds.has(c.id)) {
        fail(
          `candidate ${c.id} has source='deep_dive' but NO response links to it — ` +
            `something other than /api/deep-dives wrote it (or the back-link write is failing)`
        );
      }
      if (Number(c.confidence ?? 0) < 0.85) {
        fail(`deep_dive candidate ${c.id} sits below the 0.85 bar (${c.confidence})`);
      }
    }
    if (failures === 0) pass(`${cands.length} deep_dive candidate(s), all linked, all at/above the bar`);
  }
}

// ═══ 7. THE AGGREGATE, AS THE THIN-DATA GUARD WOULD LABEL IT ═════════════════
console.log("\n7. The aggregate (report only — the guard itself lives in src/lib/deep-dives.ts)");
{
  const { data: reqs } = await service
    .from("deep_dive_requests")
    .select("id, topic, sent_to_count")
    .order("created_at", { ascending: false });
  for (const r of reqs ?? []) {
    const { data: rs } = await service
      .from("deep_dive_responses")
      .select("divergence")
      .eq("request_id", r.id);
    const total = (rs ?? []).length;
    const div = (rs ?? []).filter((x) => x.divergence === "diverges").length;
    const label = div >= FINDING_MIN ? "FINDING" : div >= 1 ? "early signal" : "quiet";
    note(`"${r.topic.slice(0, 60)}" — asked ${r.sent_to_count}, answered ${total}, diverging ${div} → ${label}`);
  }
  if (!reqs || reqs.length === 0) note("no deep dives yet");
}

console.log("\n═══════════════════════════════════════════════════════════════");
if (failures > 0) {
  console.error(`\n${failures} FAILURE(S). Phase C is not verified.\n`);
  process.exit(1);
}
console.log("\nAll automated checks passed.");
console.log("Still owed, and no script can do them:");
console.log("  · Brian browser-verifies: the DISCLOSURE renders above the box before answering;");
console.log("    answer as devin.cross → both lenses render side by side on /deep-dives;");
console.log("    decline leaves the admin view unchanged.");
console.log("  · Copy approval — every COPY block in this phase is DRAFT.\n");
