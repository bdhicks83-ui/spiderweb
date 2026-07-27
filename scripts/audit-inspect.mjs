// READ-ONLY inspection of the specific records the audit flagged.
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

const IDS = [
  "28eb9f10-fa0d-4ce3-9b65-b72fa82ff585", // David Chen "dummy"
  "e7dfcbb6-4a16-4ac4-9ecd-a06cfd263663", // Tom active/empty
  "86f54b48-2d64-403f-b074-b095d5ff5826", // Tom complete/no framework
];
for (const id of IDS) {
  const { data: r } = await supabase.from("pattern_records").select("*").eq("id", id).single();
  console.log(`\n════ ${id} ════`);
  console.log(`status=${r.status} · trigger=${r.trigger_type} · created=${r.created_at} · updated=${r.updated_at}`);
  console.log(`framework name: ${r.framework?.name ?? "(none)"}`);
  console.log(`context_summary: ${(r.context_summary ?? "").slice(0, 200)}`);
  console.log(`judgment: ${(r.judgment ?? "").slice(0, 400)}`);
  console.log(`entity_map (raw): ${JSON.stringify(r.entity_map)?.slice(0, 300)}`);
  console.log(`qa_pairs count: ${(r.qa_pairs ?? []).length}`);
}

// entity_map structure on a known-good record (a Win Column one naming Marcus Webb)
const { data: sample } = await supabase
  .from("pattern_records")
  .select("id, entity_map, framework")
  .eq("status", "complete")
  .not("entity_map", "eq", "[]")
  .limit(3);
console.log("\n════ ENTITY_MAP STRUCTURE SAMPLES ════");
for (const s of sample || []) {
  console.log(`  ${s.framework?.name}: ${JSON.stringify(s.entity_map).slice(0, 400)}`);
}

// Brian's "test" hit — context only
const { data: b } = await supabase
  .from("pattern_records")
  .select("boundaries, framework")
  .eq("id", "f0e2c23e-c151-4feb-bc94-0e816d4ec0c7")
  .single();
const idx = (b.boundaries ?? "").toLowerCase().indexOf("test");
console.log(`\n════ Brian "The Flexibility Trade" boundaries 'test' context ════`);
console.log(`...${(b.boundaries ?? "").slice(Math.max(0, idx - 80), idx + 80)}...`);
