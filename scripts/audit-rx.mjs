// READ-ONLY: dump prescription 8f5dfac7 and locate where the suspect id appears.
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

const { data: p } = await supabase
  .from("prescriptions")
  .select("*")
  .eq("id", "8f5dfac7-477d-4e9a-bd6d-eb7ad93b5fab")
  .single();

const SUSPECT = "86f54b48-2d64-403f-b074-b095d5ff5826";
for (const [k, v] of Object.entries(p)) {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  const hit = s?.includes(SUSPECT) ? "  ◀◀◀ CONTAINS SUSPECT ID" : "";
  console.log(`${k}: ${(s ?? "").slice(0, 500)}${hit}`);
  console.log("---");
}

// all 6 prescriptions, one-line summary
const { data: all } = await supabase.from("prescriptions").select("id, status, source_type, title, efficacy_state");
console.log("\nALL PRESCRIPTIONS:");
for (const r of all || []) console.log(`  ${r.id.slice(0, 8)} · ${r.status} · ${r.source_type ?? "-"} · ${r.title ?? "(no title)"} · efficacy=${JSON.stringify(r.efficacy_state)?.slice(0, 120)}`);
