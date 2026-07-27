// READ-ONLY pass 3: die-changeover conflict prose quality + remaining test artifacts.
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import path from "node:path";

const envRaw = await readFile(path.join(process.cwd(), ".env.local"), "utf-8");
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const hr = (t) => console.log(`\n${"=".repeat(72)}\n${t}\n${"=".repeat(72)}`);

const { data: profs } = await supabase.from("profiles").select("id, display_name");
const nameOf = new Map((profs || []).map((p) => [p.id, p.display_name]));

hr("1. THE CONFLICT ROW (full)");
const { data: conf } = await supabase.from("framework_conflicts").select("*");
for (const c of conf || []) {
  for (const [k, v] of Object.entries(c)) console.log(`  ${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`);
}

hr("2. BOTH SIDES — FULL PROSE (does it read like a real operator?)");
const ids = (conf || []).flatMap((c) => [c.record_a_id, c.record_b_id]);
const { data: sides } = await supabase.from("pattern_records").select("*").in("id", ids);
for (const r of sides || []) {
  console.log(`\n${"-".repeat(72)}`);
  console.log(`"${r.framework?.name}" — ${nameOf.get(r.user_id)} · ${r.trigger_type} · created ${r.created_at?.slice(0, 10)} · updated ${r.updated_at?.slice(0, 10)}`);
  console.log(`${"-".repeat(72)}`);
  for (const f of ["context_summary", "trigger_signal", "judgment", "rationale", "boundaries"]) {
    console.log(`\n[${f}]\n${r[f] ?? "(empty)"}`);
  }
  console.log(`\n[framework]\n${JSON.stringify(r.framework, null, 2)}`);
  console.log(`\n[entity_map]\n${JSON.stringify(r.entity_map)}`);
  console.log(`\n[qa_pairs] ${(r.qa_pairs || []).length} turns`);
}

hr("3. BRIAN'S 'test' HIT — The Flexibility Trade");
const { data: ft } = await supabase
  .from("pattern_records").select("boundaries, framework")
  .eq("id", "f0e2c23e-c151-4feb-bc94-0e816d4ec0c7").maybeSingle();
if (ft) {
  const t = ft.boundaries ?? "";
  let i = t.toLowerCase().indexOf("test");
  while (i !== -1) { console.log(`  boundaries: ...${t.slice(Math.max(0, i - 90), i + 90)}...`); i = t.toLowerCase().indexOf("test", i + 1); }
  const fj = JSON.stringify(ft.framework);
  let j = fj.toLowerCase().indexOf("test");
  while (j !== -1) { console.log(`  framework: ...${fj.slice(Math.max(0, j - 90), j + 90)}...`); j = fj.toLowerCase().indexOf("test", j + 1); }
}

hr("4. BRIAN'S ABANDONED ACTIVE RECORD 6203c5dd");
const { data: ab } = await supabase.from("pattern_records").select("*").eq("id", "6203c5dd-b250-43ac-8e42-bf22bbbfc313").maybeSingle();
if (!ab) console.log("  (gone)");
else {
  console.log(`  status=${ab.status} · trigger=${ab.trigger_type} · created=${ab.created_at} · updated=${ab.updated_at}`);
  console.log(`  context_summary: ${JSON.stringify(ab.context_summary)}`);
  console.log(`  trigger_signal: ${JSON.stringify(ab.trigger_signal)}`);
  console.log(`  framework: ${JSON.stringify(ab.framework)}`);
  console.log(`  qa_pairs: ${(ab.qa_pairs || []).length} turns`);
  console.log(`  entity_map: ${JSON.stringify(ab.entity_map)}`);
}

hr("5. WIN COLUMN (role_person mentions on win records, demo org)");
const DEMO = "0722f2f8-ecff-4ae3-81ea-1350454e9d54";
const { data: wins } = await supabase
  .from("pattern_records").select("id, user_id, entity_map, framework, created_at")
  .eq("org_id", DEMO).eq("status", "complete").eq("trigger_type", "win");
const men = new Map();
for (const r of wins || [])
  for (const e of r.entity_map || []) {
    if (e.type !== "role_person") continue;
    if (!men.has(e.name)) men.set(e.name, []);
    men.get(e.name).push({ author: nameOf.get(r.user_id), fw: r.framework?.name, detail: e.detail });
  }
for (const [n, rows] of [...men.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const authors = new Set(rows.map((r) => r.author));
  console.log(`  ${n} — ${authors.size} expert(s), ${rows.length} mention(s)`);
  for (const r of rows) console.log(`      by ${r.author} in "${r.fw}" · detail=${JSON.stringify(r.detail)}`);
}

hr("6. TRAINING STUDIO / REQUESTS content");
for (const t of ["training_requests", "training_format_outcomes"]) {
  const { data: rows, error } = await supabase.from(t).select("*").limit(10);
  if (error) { console.log(`  ${t}: ${error.message}`); continue; }
  console.log(`  ${t}: ${(rows || []).length} rows`);
  for (const row of rows || []) {
    console.log(`    -- ${row.id}`);
    for (const [k, v] of Object.entries(row)) {
      if (typeof v === "string" && v.length > 30) console.log(`       ${k}: ${v.slice(0, 200).replace(/\s+/g, " ")}${v.length > 200 ? " ..." : ""}`);
      else if (v !== null && typeof v !== "object") console.log(`       ${k}: ${v}`);
    }
  }
}

hr("7. RETRAINING SIGNAL content");
const { data: rs } = await supabase.from("retraining_signals").select("*");
for (const r of rs || []) for (const [k, v] of Object.entries(r)) console.log(`  ${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`);

console.log("\n(read-only)");
