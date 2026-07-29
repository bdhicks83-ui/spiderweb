// READ-ONLY introspection for the AWIP reseed prep.
// Confirms: demo org_id, per-table demo-org content counts, +test1 account
// sources/insights cascade scope, global insight count. NO WRITES.
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

async function count(table, col, val) {
  let q = supabase.from(table).select("*", { count: "exact", head: true });
  if (col) q = q.eq(col, val);
  const { count: c, error } = await q;
  if (error) return `ERR: ${error.message}`;
  return c;
}

// 1. Demo org
const { data: orgs, error: orgErr } = await supabase.from("orgs").select("id, name, is_demo");
if (orgErr) throw orgErr;
console.log("ORGS:");
for (const o of orgs) console.log(`  ${o.id}  demo=${o.is_demo}  "${o.name}"`);
const demo = orgs.find((o) => o.name?.includes("Meridian") || o.is_demo);
if (!demo) { console.log("NO DEMO ORG FOUND"); process.exit(1); }
const orgId = demo.id;
console.log(`\nDEMO ORG: ${orgId} "${demo.name}"`);

// 2. Demo org profiles
const { data: profs } = await supabase
  .from("profiles")
  .select("id, display_name, persona, role, manager_id, org_id")
  .eq("org_id", orgId);
console.log(`\nDEMO PROFILES (${profs?.length ?? 0}):`);
for (const p of profs ?? []) console.log(`  ${p.id}  ${p.display_name}  persona=${p.persona} role=${p.role ?? "-"} mgr=${p.manager_id ?? "-"}`);
const demoUserIds = (profs ?? []).map((p) => p.id);

// 3. Org-scoped content counts
const orgTables = [
  "pattern_records", "framework_conflicts", "prescription_detections",
  "prescriptions", "prescription_fidelity", "prescription_trainings",
  "prescription_teachbacks", "retraining_signals", "learning_signals",
  "knowledge_gaps", "knowledge_gap_askers", "training_requests",
  "training_format_outcomes",
];
console.log("\nDEMO-ORG CONTENT COUNTS (org_id scoped):");
for (const t of orgTables) console.log(`  ${t}: ${await count(t, "org_id", orgId)}`);

// 4. Any demo-user rows in the legacy insight pipeline?
console.log("\nLEGACY PIPELINE ROWS OWNED BY DEMO USERS:");
for (const t of ["sources", "insights", "frameworks", "ask_sessions", "query_gaps", "credibility_scores", "contradiction_events"]) {
  let total = 0, err = null;
  for (const uid of demoUserIds) {
    const { count: c, error } = await supabase.from(t).select("*", { count: "exact", head: true }).eq("user_id", uid);
    if (error) { err = error.message; break; }
    total += c ?? 0;
  }
  console.log(`  ${t}: ${err ? "ERR: " + err : total}`);
}

// 5. connections involving demo users' insights (via insight ownership)
// connections has no user_id; only relevant if demo users have insights (checked above).

// 6. +test1 cascade scope + global counts
console.log("\nGLOBAL / +test1 VERIFICATION:");
console.log(`  insights (global): ${await count("insights")}`);
console.log(`  sources (global): ${await count("sources")}`);
let page = 1, test1 = null, main = null;
for (;;) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw error;
  for (const u of data.users) {
    if (u.email === "bdhicks83+test1@gmail.com") test1 = u;
    if (u.email === "bdhicks83@gmail.com") main = u;
  }
  if (data.users.length < 200) break;
  page++;
}
console.log(`  +test1 user: ${test1 ? test1.id : "NOT FOUND"}`);
console.log(`  main user: ${main ? main.id : "NOT FOUND"}`);
if (test1) {
  console.log(`  +test1 sources: ${await count("sources", "user_id", test1.id)}`);
  const { data: srcIds } = await supabase.from("sources").select("id").eq("user_id", test1.id);
  let dependent = 0;
  for (const s of srcIds ?? []) {
    const { count: c } = await supabase.from("insights").select("*", { count: "exact", head: true }).eq("source_id", s.id);
    dependent += c ?? 0;
  }
  console.log(`  insights parented by +test1 sources: ${dependent}`);
}
console.log("\nDONE (read-only).");
