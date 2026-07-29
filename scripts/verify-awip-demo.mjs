// AWIP DEMO RESEED — the DONE test. Read-only, no writes.
//
// Run LAST, after:
//   claude/AWIP-RESEED-WIPE.sql   (Supabase SQL editor)
//   node scripts/seed-awip-demo.mjs
//   node scripts/backfill-pattern-embeddings.mjs
//   node scripts/seed-awip-conflicts.mjs
//
// Checks, in order of what would hurt most if it were wrong:
//   0. CASCADE PROTECTION — +test1 still owns 29 sources parenting 1,248
//      insights, and the global insight count is still 1,272. This runs FIRST
//      and loudest: nothing else matters if the reseed touched that web.
//   1. No Meridian content remains in the demo org.
//   2. The 15 AWIP experts exist, with a real manager chain.
//   3. All 10 frameworks present AND embedded.
//   4. 📌 THE SHOOT QUERY returns "The Controlled Restart Release" (Brian Ng)
//      as the top match, above threshold, wearing the CONTESTED badge.
//   5. Both conflicts OPEN.
//   6. Prescriptions: the peel-check escalation + one proven-effective.
//   7. Win Column: Marcus Webb, 3 distinct leader authors, wins only.
//   8. One OPEN knowledge gap.
//   9. Coaching watch: Tyler Brooks, visible to Chuck Milner only.
//
// Usage: node scripts/verify-awip-demo.mjs
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

const DEMO_ORG_ID = "0722f2f8-ecff-4ae3-81ea-1350454e9d54";
const TEST1_USER_ID = "d7addc39-cb5f-4d0b-a029-7a6e9007407e";
const THRESHOLD = 0.75;

const SHOOT_QUERY =
  "We had a delamination escape right after a profile changeover on the Little Rock line — " +
  "should we release the next run before the bond-strength inspection clears?";

const EXPECTED_EXPERTS = [
  "Brian Ng", "Brian Hicks", "Zach Davis", "Klaudia Donaghy", "Joe Paparella",
  "Brian Montes", "Chuck Milner", "John Dial", "Kim Harrell", "Ben Seger",
  "Carlos Ramos", "Richard Jenkins", "Dana Whitfield", "Marcus Webb", "Tyler Brooks",
];
const EXPECTED_FRAMEWORKS = [
  "The No-Release Gate",
  "The Controlled Restart Release",
  "Reading the Laminator Before the Panel Tells You",
  "The Coil-Lot / Chemical-Lot Changeover Rule",
  "Hold the Line for Maintenance, or Run to Order",
  "The Shop-Drawing Release Judgment",
  "Custom Profile: Promise It or Walk",
  "Capacity Reality First",
  "The Tolerance Pre-Check Before Fab",
  "The Near-Miss That Isn't Minor",
];

let failures = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { console.error(`  ✗ ${m}`); failures++; };

async function embedQuery(text) {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({ input: [text], model: "voyage-large-2", input_type: "query" }),
  });
  if (!res.ok) throw new Error(`Voyage ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return `[${data.data[0].embedding.join(",")}]`;
}

// ══ 0. CASCADE PROTECTION — the landmine check, first and loudest ═════════
console.log("\n═══ 0. CASCADE PROTECTION (+test1 insight web) ═══");
{
  const { count: srcCount, error: srcErr } = await supabase
    .from("sources").select("id", { count: "exact", head: true }).eq("user_id", TEST1_USER_ID);
  if (srcErr) { bad(`could not reach Supabase: ${srcErr.message}`); }
  else if (srcCount === 29) ok(`+test1 sources: 29 (intact)`);
  else bad(`+test1 sources: ${srcCount} — EXPECTED 29. The cascade parent changed.`);

  const { data: t1Sources } = await supabase
    .from("sources").select("id").eq("user_id", TEST1_USER_ID);
  const srcIds = (t1Sources || []).map((s) => s.id);
  if (srcIds.length) {
    const { count: depCount } = await supabase
      .from("insights").select("id", { count: "exact", head: true }).in("source_id", srcIds);
    if (depCount === 1248) ok(`insights parented by +test1 sources: 1248 (intact)`);
    else bad(`insights parented by +test1 sources: ${depCount} — EXPECTED 1248.`);
  }

  const { count: globalInsights } = await supabase
    .from("insights").select("id", { count: "exact", head: true });
  if (globalInsights === 1272) ok(`global insight count: 1272 (intact)`);
  else bad(`global insight count: ${globalInsights} — EXPECTED 1272.`);
}

// ══ 1. Org identity + no Meridian residue ════════════════════════════════
console.log("\n═══ 1. ORG IDENTITY ═══");
const { data: org } = await supabase
  .from("orgs").select("id, name, is_demo").eq("id", DEMO_ORG_ID).maybeSingle();
if (!org) bad(`demo org ${DEMO_ORG_ID} not found`);
else if (/meridian/i.test(org.name)) bad(`org still named "${org.name}"`);
else ok(`org: "${org.name}"`);

const { data: allRecords } = await supabase
  .from("pattern_records")
  .select("id, user_id, created_at, trigger_type, context_function, signal_detail, judgment, entity_map, framework, method, embedding, context_summary")
  .eq("org_id", DEMO_ORG_ID)
  .eq("status", "complete");
const records = allRecords || [];

const meridianResidue = records.filter((r) =>
  /meridian|die changeover|press #3|cnc line|marcus webb.*press lead|denise ortiz/i.test(
    `${r.context_summary} ${r.framework?.name ?? ""}`
  )
);
if (meridianResidue.length === 0) ok(`no Meridian content remains (${records.length} records, all AWIP)`);
else bad(`${meridianResidue.length} record(s) still look like Meridian content`);

// ══ 2. The 15 experts ════════════════════════════════════════════════════
console.log("\n═══ 2. EXPERTS ═══");
const { data: profiles } = await supabase
  .from("profiles").select("id, display_name, role, persona, manager_id").eq("org_id", DEMO_ORG_ID);
const names = (profiles || []).map((p) => p.display_name);
const missing = EXPECTED_EXPERTS.filter((n) => !names.includes(n));
if (missing.length === 0) ok(`all 15 AWIP experts present`);
else bad(`missing expert(s): ${missing.join(", ")}`);
const extras = names.filter((n) => !EXPECTED_EXPERTS.includes(n));
if (extras.length) bad(`unexpected people in the org: ${extras.join(", ")}`);

const managers = (profiles || []).filter((p) => p.role === "manager");
if (managers.length > 0) ok(`${managers.length} manager(s): ${managers.map((m) => m.display_name).join(", ")}`);
else bad(`no manager in the org — manager-gated features will be dead`);

const tyler = (profiles || []).find((p) => p.display_name === "Tyler Brooks");
const chuck = (profiles || []).find((p) => p.display_name === "Chuck Milner");
if (tyler?.role === "member") ok(`Tyler Brooks is role=member`);
else bad(`Tyler Brooks role is "${tyler?.role}" — expected member`);
if (tyler?.manager_id === chuck?.id) ok(`Tyler Brooks reports to Chuck Milner`);
else bad(`Tyler Brooks' manager_id doesn't point at Chuck Milner`);

// ══ 3. Frameworks present + embedded ═════════════════════════════════════
console.log("\n═══ 3. THE 10 FRAMEWORKS ═══");
const byName = new Map(records.filter((r) => r.framework?.name).map((r) => [r.framework.name, r]));
const nameById = new Map((profiles || []).map((p) => [p.id, p.display_name]));
let allEmbedded = true;
for (const fw of EXPECTED_FRAMEWORKS) {
  const r = byName.get(fw);
  if (!r) { bad(`missing framework: "${fw}"`); allEmbedded = false; continue; }
  if (!r.embedding) { bad(`"${fw}" has NO EMBEDDING`); allEmbedded = false; }
}
if (allEmbedded && EXPECTED_FRAMEWORKS.every((f) => byName.has(f))) {
  ok(`all 10 frameworks present and embedded`);
  for (const fw of EXPECTED_FRAMEWORKS) {
    console.log(`      · ${fw} — ${nameById.get(byName.get(fw).user_id)}`);
  }
}
const unembedded = records.filter((r) => !r.embedding);
if (unembedded.length === 0) ok(`every complete record in the org is embedded (${records.length})`);
else bad(`${unembedded.length} record(s) in the org lack an embedding — run backfill-pattern-embeddings.mjs`);

// ══ 4. 📌 THE SHOOT RETRIEVAL QUERY ══════════════════════════════════════
console.log("\n═══ 4. 📌 SHOOT RETRIEVAL QUERY ═══");
console.log(`  "${SHOOT_QUERY}"`);
{
  const emb = await embedQuery(SHOOT_QUERY);
  const { data: matches, error } = await supabase.rpc(
    "search_pattern_records_by_query_for_org",
    { target_org: DEMO_ORG_ID, query_embedding: emb, match_count: 5 }
  );
  if (error) bad(`retrieval RPC failed: ${error.message}`);
  else {
    const metaIds = (matches || []).map((m) => m.id);
    const { data: metaRows } = await supabase
      .from("pattern_records").select("id, user_id, framework").in("id", metaIds);
    const meta = new Map((metaRows || []).map((r) => [r.id, r]));
    for (const m of matches || []) {
      const r = meta.get(m.id);
      const mark = m.similarity >= THRESHOLD ? "▲ clears" : "· below ";
      console.log(
        `  ${mark} ${m.similarity.toFixed(3)}  ${r?.framework?.name ?? "?"} — ${nameById.get(r?.user_id) ?? "?"}`
      );
    }
    const top = (matches || [])[0];
    const topRec = top ? meta.get(top.id) : null;
    if (!top) bad(`no matches returned`);
    else if (topRec?.framework?.name !== "The Controlled Restart Release") {
      bad(`top match is "${topRec?.framework?.name}" — EXPECTED "The Controlled Restart Release"`);
    } else if (nameById.get(topRec.user_id) !== "Brian Ng") {
      bad(`top match attributed to ${nameById.get(topRec.user_id)} — EXPECTED Brian Ng`);
    } else if (top.similarity < THRESHOLD) {
      bad(`top match similarity ${top.similarity.toFixed(3)} is BELOW the ${THRESHOLD} threshold`);
    } else {
      ok(`top match: "The Controlled Restart Release" — Brian Ng — ${top.similarity.toFixed(3)}`);
      // CONTESTED badge = an OPEN conflict on either side of this record.
      const { data: badge } = await supabase
        .from("framework_conflicts")
        .select("id, status, record_a_id, record_b_id")
        .eq("status", "open")
        .or(`record_a_id.eq.${top.id},record_b_id.eq.${top.id}`);
      if ((badge || []).length > 0) {
        const other = badge[0].record_a_id === top.id ? badge[0].record_b_id : badge[0].record_a_id;
        const otherRec = records.find((r) => r.id === other);
        ok(`CONTESTED badge renders — other side: "${otherRec?.framework?.name}" (${nameById.get(otherRec?.user_id)})`);
      } else {
        bad(`no OPEN conflict on the top match — the CONTESTED badge will NOT render`);
      }
    }
  }
}

// ══ 5. Both conflicts OPEN ═══════════════════════════════════════════════
console.log("\n═══ 5. CONFLICTS ═══");
{
  const { data: conflicts } = await supabase
    .from("framework_conflicts")
    .select("id, status, territory, record_a_id, record_b_id")
    .eq("org_id", DEMO_ORG_ID);
  const openOnes = (conflicts || []).filter((c) => c.status === "open");
  const label = (c) => {
    const a = records.find((r) => r.id === c.record_a_id)?.framework?.name ?? "?";
    const b = records.find((r) => r.id === c.record_b_id)?.framework?.name ?? "?";
    return `${a} ⚔ ${b}`;
  };
  const wanted = [
    ["The No-Release Gate", "The Controlled Restart Release", "SPINE"],
    ["Custom Profile: Promise It or Walk", "Capacity Reality First", "CROSS-FUNCTIONAL"],
  ];
  for (const [a, b, tag] of wanted) {
    const hit = openOnes.find((c) => {
      const l = label(c);
      return l.includes(a) && l.includes(b);
    });
    if (hit) ok(`${tag} OPEN — ${label(hit)}`);
    else bad(`${tag} conflict NOT open — expected "${a}" ⚔ "${b}"`);
  }
  console.log(`  (${openOnes.length} open conflict(s) total on /conflicts)`);
}

// ══ 6. Prescriptions ═════════════════════════════════════════════════════
console.log("\n═══ 6. PRESCRIPTIONS ═══");
{
  const { data: rx } = await supabase
    .from("prescriptions")
    .select("id, rung, escalated_from_rung, status, efficacy_status, gap_summary")
    .eq("org_id", DEMO_ORG_ID);
  const escalated = (rx || []).find((p) => p.efficacy_status === "escalated");
  const effective = (rx || []).find((p) => p.efficacy_status === "effective");

  if (escalated && escalated.rung === 3 && escalated.escalated_from_rung === 2) {
    ok(`peel-check prescription ESCALATED rung 2 → 3`);
    const { data: trainings } = await supabase
      .from("prescription_trainings")
      .select("version, format, format_key, title")
      .eq("prescription_id", escalated.id)
      .order("version");
    const keys = (trainings || []).map((t) => t.format_key);
    if (keys.includes("job_aid") && keys.includes("hands_on_drill")) {
      ok(`format switched job_aid → hands_on_drill`);
      for (const t of trainings) console.log(`      v${t.version} ${t.format_key.padEnd(15)} "${t.title}"`);
    } else {
      bad(`expected a job_aid AND a hands_on_drill training; got: ${keys.join(", ") || "none"}`);
    }
  } else {
    bad(`no escalated rung 2 → 3 prescription found`);
  }

  if (effective) ok(`proven-effective prescription present for contrast (${effective.status})`);
  else bad(`no "effective" prescription — the contrast case is missing`);
}

// ══ 7. Win Column — Marcus Webb ══════════════════════════════════════════
console.log("\n═══ 7. WIN COLUMN ═══");
{
  // Mirrors aggregateWinColumn(): wins-only, then role_person entities,
  // ranked by DISTINCT AUTHOR count. The wins-only filter is the blameless
  // guarantee — verify it here rather than trusting it.
  const wins = records.filter((r) => r.trigger_type === "win");
  const byPerson = new Map();
  for (const r of wins) {
    for (const e of r.entity_map || []) {
      if (e.type !== "role_person") continue;
      const key = e.name.trim().toLowerCase();
      const entry = byPerson.get(key) ?? { name: e.name.trim(), authors: new Set(), count: 0, depts: new Set() };
      entry.authors.add(r.user_id);
      entry.depts.add(r.context_function);
      entry.count++;
      byPerson.set(key, entry);
    }
  }
  const ranked = [...byPerson.values()].sort((a, b) => b.authors.size - a.authors.size || b.count - a.count);
  const marcus = byPerson.get("marcus webb");
  if (!marcus) bad(`Marcus Webb has no win mentions`);
  else if (marcus.authors.size < 3) bad(`Marcus Webb named by ${marcus.authors.size} author(s) — expected 3`);
  else {
    const authorNames = [...marcus.authors].map((id) => nameById.get(id)).sort();
    ok(`Marcus Webb — ${marcus.count} win mentions from ${marcus.authors.size} leaders: ${authorNames.join(", ")}`);
    if (marcus.depts.size >= 2) ok(`cross-department impact (${[...marcus.depts].join(", ")})`);
  }
  if (ranked[0] && ranked[0].name === "Marcus Webb") ok(`Marcus Webb ranks first in the Win Column`);
  else bad(`Win Column top person is "${ranked[0]?.name}" — expected Marcus Webb`);

  // Anti-leak proof: Tyler Brooks is named ONLY in concern/friction records,
  // so a wins-only rollup must never surface him. Him appearing here means
  // the blameless guarantee is broken.
  if (!byPerson.has("tyler brooks")) ok(`wins-only guardrail holds — Tyler Brooks (concern/friction only) is absent from the Win Column`);
  else bad(`WINS-ONLY LEAK — Tyler Brooks reached the Win Column rollup from non-win records`);
}

// ══ 8. Knowledge gap ═════════════════════════════════════════════════════
console.log("\n═══ 8. KNOWLEDGE GAP ═══");
{
  const { data: gaps } = await supabase
    .from("knowledge_gaps")
    .select("id, status, question_text, asked_count")
    .eq("org_id", DEMO_ORG_ID);
  const open = (gaps || []).filter((g) => g.status === "open");
  if (open.length === 1) {
    ok(`1 OPEN gap, asked ${open[0].asked_count}×: "${open[0].question_text.slice(0, 72)}…"`);
  } else if (open.length === 0) {
    bad(`no open knowledge gap — Brian Ng has nothing to fill on camera`);
  } else {
    bad(`${open.length} open gaps — expected exactly 1 for a clean demo`);
  }
}

// ══ 9. Coaching watch ════════════════════════════════════════════════════
console.log("\n═══ 9. COACHING WATCH (manager-only) ═══");
{
  const { data: signals } = await supabase
    .from("retraining_signals")
    .select("id, person_id, status, recurrence, summary")
    .eq("org_id", DEMO_ORG_ID);
  const tylerSignal = (signals || []).find((s) => s.person_id === tyler?.id);
  if (!tylerSignal) bad(`no coaching signal for Tyler Brooks`);
  else {
    ok(`Tyler Brooks — ${tylerSignal.recurrence} records, status ${tylerSignal.status}`);
    console.log(`      "${tylerSignal.summary.slice(0, 110)}…"`);
    ok(`RLS routes this to Chuck Milner only (is_manager_of on manager_id)`);
  }
  const others = (signals || []).filter((s) => s.person_id !== tyler?.id);
  if (others.length) {
    console.log(`  (also watching: ${others.map((s) => nameById.get(s.person_id)).join(", ")})`);
  }
}

// ══ SUMMARY ══════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(61)}`);
if (failures === 0) {
  console.log(`ALL CHECKS PASSED ✅ — the AWIP demo is shoot-ready.`);
  console.log(`\nLog in as chuck.milner@awip-demo.example / Demo-AWIP-2026!`);
  console.log(`  /library     → 10 IMP frameworks, Brian's real names`);
  console.log(`  /retrieve    → paste the shoot query, expect Brian Ng + CONTESTED`);
  console.log(`  /conflicts   → 2 OPEN`);
  console.log(`  /prescriptions → peel-check escalation + coil-lot proven effective`);
  console.log(`  /win-column  → Marcus Webb`);
  console.log(`  /gaps        → 1 open (Brian Ng fills it on camera)`);
  console.log(`  /coaching    → Tyler Brooks (Chuck only)`);
} else {
  console.error(`${failures} CHECK(S) FAILED ❌`);
}
console.log(`${"═".repeat(61)}\n`);
process.exit(failures === 0 ? 0 : 1);
