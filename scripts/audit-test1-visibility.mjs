// READ-ONLY: exact insight count under +test1 sources, and whether anything
// user-visible carries the +test1 identity.
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

const TEST1_ID = "d7addc39-cb5f-4d0b-a029-7a6e9007407e";

const { data: sources } = await supabase.from("sources").select("id").eq("user_id", TEST1_ID);
const srcIds = sources.map((s) => s.id);

const { count: insCount } = await supabase
  .from("insights").select("id", { count: "exact", head: true }).in("source_id", srcIds);
console.log(`EXACT insights under +test1 sources: ${insCount}`);

const { count: totalIns } = await supabase
  .from("insights").select("id", { count: "exact", head: true });
console.log(`TOTAL insights in DB: ${totalIns}`);

// profile row — what identity could surface in UI
const { data: prof } = await supabase.from("profiles").select("*").eq("id", TEST1_ID).maybeSingle();
console.log(`\n+test1 profile: ${JSON.stringify(prof)}`);

// does the main account's profile exist and look right?
const { data: main } = await supabase
  .from("profiles").select("*").eq("id", "a7d205f0-778c-44b9-9e13-4ebd5f47e964").maybeSingle();
console.log(`main profile:   ${JSON.stringify(main)}`);
