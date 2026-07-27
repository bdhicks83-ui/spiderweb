// READ-ONLY pass 2 for the 90-sec ad audit.
// Entity-map shape, Win Column inputs, test1 account footprint, library counts,
// prescriptions/training content quality. No writes, no model calls.
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

const DEMO_ORG = "0722f2f8-ecff-4ae3-81ea-1350454e9d54";
const hr = (t) => console.log(`\n${"=".repeat(70)}\n${t}\n${"=".repeat(70)}`);

const { data: profiles } = await supabase.from("profiles").select("id, display_name");
const nameOf = new Map((profiles || []).map((p) => [p.id, p.display_name]));

const { data: recs } = await supabase
  .from("pattern_records")
  .select("id, user_id, status, trigger_type, framework, entity_map, created_at, context_summary, judgment, rationale, boundaries")
  .eq("org_id", DEMO_ORG);

hr("A. ENTITY_MAP TYPE VOCABULARY (demo org, complete records)");
const complete = (recs || []).filter((r) => r.status === "complete");
const typeCounts = new Map();
const peopleByType = new Map();
for (const r of complete) {
  for (const e of r.entity_map || []) {
    typeCounts.set(e.type, (typeCounts.get(e.type) ?? 0) + 1);
    if (!peopleByType.has(e.type)) peopleByType.set(e.type, new Set());
    peopleByType.get(e.type).add(e.name);
  }
}
for (const [t, c] of [...typeCounts.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${t} x${c}`);
  console.log(`     ${[...peopleByType.get(t)].slice(0, 12).join(" | ")}`);
}

hr("B. WIN COLUMN INPUT (trigger_type=win records + their person entities)");
const wins = complete.filter((r) => r.trigger_type === "win");
console.log(`  ${wins.length} win records of ${complete.length} complete`);
const mentions = new Map();
for (const r of wins) {
  for (const e of r.entity_map || []) {
    if (e.type !== "person") continue;
    if (!mentions.has(e.name)) mentions.set(e.name, new Set());
    mentions.get(e.name).add(nameOf.get(r.user_id));
  }
}
for (const [n, authors] of [...mentions.entries()].sort((a, b) => b[1].size - a[1].size))
  console.log(`  ${n} — cited by ${authors.size} expert(s): ${[...authors].join(", ")}`);
if (!mentions.size) console.log("  (!!) NO person entities on any win record");

hr("C. TRIGGER TYPE SPREAD (demo org)");
const tt = new Map();
for (const r of complete) tt.set(r.trigger_type, (tt.get(r.trigger_type) ?? 0) + 1);
console.log("  " + [...tt.entries()].map(([k, v]) => `${k}=${v}`).join(" | "));

hr("D. NON-COMPLETE RECORDS ANYWHERE (would show as empty/half rows)");
const { data: allRecs } = await supabase
  .from("pattern_records")
  .select("id, org_id, user_id, status, framework, created_at")
  .neq("status", "complete");
for (const r of allRecs || [])
  console.log(`  ${r.status} · org=${r.org_id === DEMO_ORG ? "DEMO" : r.org_id} · ${nameOf.get(r.user_id) ?? r.user_id} · fw=${r.framework?.name ?? "(none)"} · ${r.id}`);
if (!(allRecs || []).length) console.log("  (none)");

hr("E. TEST1 ACCOUNT FOOTPRINT (d7addc39-cb5f-4d0b-a029-7a6e9007407e)");
const T1 = "d7addc39-cb5f-4d0b-a029-7a6e9007407e";
for (const t of ["sources", "insights", "pattern_records", "profiles", "retraining_signals"]) {
  const col = t === "profiles" ? "id" : "user_id";
  const { count, error } = await supabase.from(t).select("id", { count: "exact", head: true }).eq(col, T1);
  console.log(`  ${t}: ${error ? error.message : count}`);
}
const { data: t1src } = await supabase.from("sources").select("id, title, type, created_at").eq("user_id", T1).limit(10);
for (const s of t1src || []) console.log(`     source: "${s.title}" (${s.type})`);

hr("F. PRESCRIPTIONS — on-camera text quality");
const { data: rx } = await supabase.from("prescriptions").select("*");
for (const p of rx || []) {
  const keys = Object.keys(p);
  console.log(`\n  -- ${p.id} · status=${p.status ?? "?"} · rung=${p.rung ?? "?"}`);
  for (const k of keys) {
    const v = p[k];
    if (typeof v === "string" && v.length > 40) console.log(`     ${k}: ${v.slice(0, 160).replace(/\s+/g, " ")}${v.length > 160 ? " ..." : ""}`);
  }
}

hr("G. TRAINING MODULES");
const { data: tm, error: tmErr } = await supabase.from("training_modules").select("*").limit(20);
if (tmErr) console.log(`  (${tmErr.message})`);
else
  for (const m of tm || [])
    console.log(`  ${m.id} · altitude=${m.altitude ?? "?"} · version=${m.version ?? "?"} · title="${m.title ?? "(none)"}" · bodyLen=${JSON.stringify(m).length}`);

hr("H. TABLE INVENTORY (what exists)");
for (const t of [
  "orgs", "profiles", "pattern_records", "framework_conflicts", "prescriptions",
  "prescription_detections", "detections", "training_modules", "teach_backs",
  "retraining_signals", "learning_signals", "insights", "sources", "frameworks", "connections",
]) {
  const { count, error } = await supabase.from(t).select("*", { count: "exact", head: true });
  console.log(`  ${t}: ${error ? "MISSING" : count + " rows"}`);
}

console.log("\n(read-only, nothing written)");
