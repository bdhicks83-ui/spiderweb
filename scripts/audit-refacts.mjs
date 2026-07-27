// READ-ONLY: re-establish facts on flagged items before the fix pass.
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

// 1. The empty abandoned session
const { data: empty } = await supabase
  .from("pattern_records")
  .select("id, status, expert_name, framework, context_summary, judgment, created_at")
  .eq("id", "e7dfcbb6-4a16-4ac4-9ecd-a06cfd263663")
  .maybeSingle();
console.log("EMPTY SESSION:", empty ? `${empty.status} · expert=${empty.expert_name ?? "?"} · fw=${empty.framework?.name ?? "none"} · ctx=${(empty.context_summary ?? "").slice(0, 60)}` : "GONE");

// 2. The frameworkless complete record — full fields needed for framePattern
const { data: nofw } = await supabase
  .from("pattern_records")
  .select("*")
  .eq("id", "86f54b48-2d64-403f-b074-b095d5ff5826")
  .maybeSingle();
if (nofw) {
  console.log("\nNO-FRAMEWORK RECORD:");
  console.log(JSON.stringify({
    status: nofw.status,
    framework: nofw.framework,
    context_summary: nofw.context_summary,
    trigger_signal: nofw.trigger_signal,
    signal_detail: nofw.signal_detail,
    judgment: (nofw.judgment ?? "").slice(0, 300),
    rationale: (nofw.rationale ?? "").slice(0, 200),
    boundaries: (nofw.boundaries ?? "").slice(0, 200),
    context_industry: nofw.context_industry,
    context_function: nofw.context_function,
    situation_type: nofw.situation_type,
    intervention_type: nofw.intervention_type,
    embedded_at: nofw.embedded_at,
    has_embedding: nofw.embedding != null,
    expert_columns: Object.keys(nofw).filter(k => k.includes("expert") || k.includes("name")),
  }, null, 2));
} else console.log("\nNO-FRAMEWORK RECORD: GONE");

// 3. The +test1 account
const { data: users } = await supabase.auth.admin.listUsers();
const test1 = users.users.find(u => u.email === "bdhicks83+test1@gmail.com");
if (test1) {
  console.log(`\nTEST1 USER: ${test1.id} (${test1.email})`);
  for (const table of ["sources", "insights", "pattern_records", "profiles"]) {
    const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true }).eq(table === "profiles" ? "id" : "user_id", test1.id);
    console.log(`  ${table}: ${error ? "ERR " + error.message : count}`);
  }
} else console.log("\nTEST1 USER: GONE");

// 4. The David Chen "dummy" record — current state
const { data: dummy } = await supabase
  .from("pattern_records")
  .select("id, status, framework, context_summary")
  .eq("id", "28eb9f10-fa0d-4ce3-9b65-b72fa82ff585")
  .maybeSingle();
console.log("\nDAVID CHEN RECORD:", dummy ? `${dummy.status} · fw=${dummy.framework?.name ?? "none"} · ctx=${(dummy.context_summary ?? "").slice(0, 100)}` : "GONE");
