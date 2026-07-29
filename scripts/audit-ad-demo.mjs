// READ-ONLY audit for the ad shoot (Job 1, steps 1-2).
// No writes, no model calls. Dumps everything that could read as "test data"
// on camera, then verifies the changeover-release conflict storyline end to end.
//
// Usage: node scripts/audit-ad-demo.mjs
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

const DEMO_ORG_NAME = "All Weather Insulated Panels (AWIP) — DEMO";
const hr = (t) => console.log(`\n${"═".repeat(70)}\n${t}\n${"═".repeat(70)}`);

// ── 1. AUTH USERS — anything that reads as a test account ────────────────────
hr("1. AUTH USERS");
const users = [];
let page = 1;
for (;;) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw new Error(`listUsers: ${error.message}`);
  users.push(...data.users);
  if (data.users.length < 200) break;
  page++;
}
const { data: orgs } = await supabase.from("orgs").select("id, name");
const orgName = new Map((orgs || []).map((o) => [o.id, o.name]));
const { data: profiles } = await supabase
  .from("profiles")
  .select("id, display_name, role, org_id, manager_id, plan");
const profById = new Map((profiles || []).map((p) => [p.id, p]));

for (const u of users) {
  const p = profById.get(u.id);
  const flags = [];
  if (/\+test/i.test(u.email || "")) flags.push("⚠️ +test address");
  if (!p) flags.push("⚠️ NO profile row");
  else if (!p.display_name || /test|demo user|placeholder|lorem/i.test(p.display_name))
    flags.push(`⚠️ suspicious display_name: "${p.display_name}"`);
  console.log(
    `  ${u.email}\n    id=${u.id} · name=${p?.display_name ?? "(none)"} · role=${p?.role ?? "-"} · org=${
      p?.org_id ? orgName.get(p.org_id) ?? p.org_id : "(none)"
    }${flags.length ? "\n    " + flags.join(" · ") : ""}`
  );
}

// ── 2. What does each non-demo-org account own? ──────────────────────────────
hr("2. OWNERSHIP OF SUSPECT ACCOUNTS (what would deleting break?)");
const demoOrgId = (orgs || []).find((o) => o.name === DEMO_ORG_NAME)?.id;
console.log(`Demo org id: ${demoOrgId}`);
console.log(`All orgs: ${(orgs || []).map((o) => `"${o.name}"`).join(" · ")}`);
for (const u of users) {
  const p = profById.get(u.id);
  if (p?.org_id === demoOrgId) continue; // demo experts are fine
  const counts = {};
  for (const table of ["sources", "insights", "pattern_records", "frameworks"]) {
    const { count } = await supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("user_id", u.id);
    counts[table] = count ?? 0;
  }
  console.log(`  ${u.email}: ${Object.entries(counts).map(([t, c]) => `${t}=${c}`).join(" · ")}`);
}

// ── 3. PATTERN_RECORDS — dummy strings, empties, truncation ──────────────────
hr("3. PATTERN_RECORDS CONTENT SCAN (all orgs)");
const { data: recs } = await supabase
  .from("pattern_records")
  .select(
    "id, org_id, user_id, status, trigger_type, context_summary, trigger_signal, judgment, rationale, boundaries, framework, entity_map, created_at, updated_at"
  );
const DUMMY = /lorem|ipsum|asdf|qwerty|placeholder|dummy|\btest (?:data|record|user|entry)\b|\btesting 123\b|xxx|foo bar|TODO|FIXME|sample text/i;
let contentIssues = 0;
for (const r of recs || []) {
  const author = profById.get(r.user_id)?.display_name ?? r.user_id;
  const org = orgName.get(r.org_id) ?? "(no org)";
  const issues = [];
  if (r.status !== "complete") issues.push(`status=${r.status}`);
  if (!r.framework?.name) issues.push("no framework");
  const fields = {
    context_summary: r.context_summary,
    trigger_signal: r.trigger_signal,
    judgment: r.judgment,
    rationale: r.rationale,
    boundaries: r.boundaries,
    framework_json: JSON.stringify(r.framework ?? {}),
  };
  for (const [k, v] of Object.entries(fields)) {
    if (k !== "framework_json" && (!v || v.trim().length < 20)) issues.push(`${k} empty/short (${(v ?? "").length} ch)`);
    else if (DUMMY.test(v)) {
      const hit = v.match(DUMMY)?.[0];
      issues.push(`${k} contains "${hit}"`);
    }
  }
  if (issues.length) {
    contentIssues++;
    console.log(`  ⚠️ [${org}] ${author} — "${r.framework?.name ?? "(no name)"}" (${r.id})\n     ${issues.join(" · ")}`);
  }
}
if (!contentIssues) console.log("  ✓ no dummy strings, empties, or truncated fields found");

// Timestamp spread (does the data look organic?)
hr("3b. TIMESTAMP SPREAD — demo org (all-created-in-one-minute check)");
const demoRecs = (recs || []).filter((r) => r.org_id === demoOrgId && r.status === "complete");
const days = demoRecs
  .map((r) => ({ d: new Date(r.created_at), name: r.framework?.name ?? "(pending)" }))
  .sort((a, b) => a.d - b.d);
console.log(`  ${demoRecs.length} complete demo-org records`);
console.log(`  oldest: ${days[0]?.d.toISOString().slice(0, 10)} · newest: ${days.at(-1)?.d.toISOString().slice(0, 10)}`);
const byDay = new Map();
for (const { d } of days) {
  const k = d.toISOString().slice(0, 10);
  byDay.set(k, (byDay.get(k) ?? 0) + 1);
}
const clustered = [...byDay.entries()].filter(([, c]) => c >= 5);
if (clustered.length)
  console.log(`  ⚠️ heavy same-day clusters: ${clustered.map(([k, c]) => `${k} (${c} records)`).join(" · ")}`);
else console.log("  ✓ no day holds 5+ records — spread looks organic");

// ── 4. ENTITY_MAP people names ───────────────────────────────────────────────
hr("4. ENTITY_MAP PERSON NAMES (demo org)");
const people = new Map();
for (const r of demoRecs)
  for (const e of r.entity_map || [])
    if (e.type === "person") people.set(e.name, (people.get(e.name) ?? 0) + 1);
if (people.size === 0) console.log("  ✓ no person-type entities in demo org — nothing to leak on camera");
for (const [name, count] of [...people.entries()].sort((a, b) => b[1] - a[1]))
  console.log(`  ${name} × ${count}${/test|demo|placeholder|lorem/i.test(name) ? "  ⚠️ suspicious" : ""}`);

// ── 5. THE CHANGEOVER-RELEASE CONFLICT STORYLINE ─────────────────────────────
hr("5. CHANGEOVER-RELEASE CONFLICT — end-to-end check");
const ng = demoRecs.find((r) => r.framework?.name === "The Controlled Restart Release");
const dana = demoRecs.find((r) => r.framework?.name === "The No-Release Gate");
for (const [label, rec, wantAuthor] of [
  ["Ng side (conditional release)", ng, "Brian Ng"],
  ["Whitfield side (hard hold)", dana, "Dana Whitfield"],
]) {
  if (!rec) {
    console.log(`  ✗ ${label}: RECORD MISSING`);
    continue;
  }
  const author = profById.get(rec.user_id)?.display_name;
  console.log(
    `  ${author === wantAuthor ? "✓" : "✗"} ${label}\n     "${rec.framework?.name ?? "(NO FRAMEWORK)"}" · author=${author} · status=${rec.status} · created=${rec.created_at?.slice(0, 10)}`
  );
}
if (ng && dana) {
  const [a, b] = [ng.id, dana.id].sort();
  const { data: conflict } = await supabase
    .from("framework_conflicts")
    .select("id, status, territory, rationale, detected_by, detected_at")
    .or(`and(record_a_id.eq.${a},record_b_id.eq.${b}),and(record_a_id.eq.${b},record_b_id.eq.${a})`)
    .maybeSingle();
  if (!conflict) console.log("  ✗ NO conflict row for the pair");
  else {
    console.log(`  ${/open/i.test(conflict.status) ? "✓" : "⚠️"} conflict ${conflict.id} · status=${conflict.status}`);
    console.log(`     territory: ${conflict.territory}`);
  }
  // Any OTHER conflicts in the org that could distract on camera?
  const { data: allConf } = await supabase
    .from("framework_conflicts")
    .select("id, status, record_a_id, record_b_id, territory")
    .eq("org_id", demoOrgId);
  console.log(`  Total conflict rows in demo org: ${(allConf || []).length}`);
  for (const c of allConf || []) {
    const ra = (recs || []).find((r) => r.id === c.record_a_id);
    const rb = (recs || []).find((r) => r.id === c.record_b_id);
    console.log(
      `    · ${c.status} — "${ra?.framework?.name ?? c.record_a_id.slice(0, 8)}" × "${rb?.framework?.name ?? c.record_b_id.slice(0, 8)}"`
    );
  }
}

// ── 6. OTHER ON-CAMERA TABLES — quick dummy-string scan ──────────────────────
hr("6. PRESCRIPTIONS / SIGNALS / TRAINING quick scan");
for (const table of ["prescriptions", "prescription_detections", "retraining_signals"]) {
  const { data: rows, error } = await supabase.from(table).select("*").limit(50);
  if (error) {
    console.log(`  ${table}: (${error.message})`);
    continue;
  }
  let flagged = 0;
  for (const row of rows || []) {
    const s = JSON.stringify(row);
    if (/lorem|ipsum|asdf|placeholder|dummy text/i.test(s)) {
      flagged++;
      console.log(`  ⚠️ ${table} row ${row.id}: dummy string found`);
    }
  }
  console.log(`  ${table}: ${(rows || []).length} rows scanned, ${flagged} flagged`);
}

console.log("\n✓ audit complete (nothing was written).");
