// READ-ONLY: what actually hangs off the +test1 sources before we delete.
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

const { data: users } = await supabase.auth.admin.listUsers();
const test1 = users.users.find((u) => u.email === "bdhicks83+test1@gmail.com");
if (!test1) { console.log("test1 gone"); process.exit(0); }
console.log(`test1 id: ${test1.id}`);

const { data: sources, error: srcErr } = await supabase
  .from("sources").select("*").eq("user_id", test1.id);
if (srcErr) { console.log("sources error:", srcErr.message); process.exit(1); }
console.log(`\nSOURCES (${sources.length}) · columns: ${Object.keys(sources[0] ?? {}).join(", ")}`);
for (const s of sources.slice(0, 8)) {
  const label = s.title ?? s.name ?? s.filename ?? s.url ?? "(no label col)";
  console.log(`  ${s.id} · ${s.type ?? s.source_type ?? "?"} · ${String(label).slice(0, 60)}`);
}
if (sources.length > 8) console.log(`  ... +${sources.length - 8} more`);

const srcIds = sources.map((s) => s.id);
const { data: insights } = await supabase
  .from("insights").select("id, user_id, content, created_at").in("source_id", srcIds);
console.log(`\nINSIGHTS off those sources (${insights.length}):`);
const byUser = {};
for (const i of insights) byUser[i.user_id] = (byUser[i.user_id] ?? 0) + 1;
console.log("  by user_id:", JSON.stringify(byUser));
for (const i of insights.slice(0, 5)) console.log(`  ${i.id} · ${(i.content ?? "").slice(0, 80)}`);

const insIds = insights.map((i) => i.id);
if (insIds.length) {
  const { data: connsA } = await supabase.from("connections").select("id").in("insight_a_id", insIds);
  const { data: connsB } = await supabase.from("connections").select("id").in("insight_b_id", insIds);
  const connIds = new Set([...(connsA ?? []), ...(connsB ?? [])].map((c) => c.id));
  console.log(`\nCONNECTIONS touching those insights: ${connIds.size}`);
  // do any of these connections link to insights OUTSIDE the test1 set (i.e. Brian's real web)?
  const { data: connFull } = await supabase
    .from("connections").select("id, insight_a_id, insight_b_id").in("id", [...connIds]);
  const outside = (connFull ?? []).filter(
    (c) => !insIds.includes(c.insight_a_id) || !insIds.includes(c.insight_b_id)
  );
  console.log(`  of which cross into NON-test1 insights: ${outside.length}`);
}
