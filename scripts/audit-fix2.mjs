// Fix pass 2 (live): show the "dummy" context in David Chen's record, and
// delete Tom's empty abandoned active session in the demo org (guarded).
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

// 1. "dummy" in context — read-only
const { data: dc } = await supabase
  .from("pattern_records").select("judgment, framework")
  .eq("id", "28eb9f10-fa0d-4ce3-9b65-b72fa82ff585").single();
const show = (label, text) => {
  const t = text ?? "";
  let i = t.toLowerCase().indexOf("dummy");
  while (i !== -1) {
    console.log(`${label}: ...${t.slice(Math.max(0, i - 100), i + 110)}...`);
    i = t.toLowerCase().indexOf("dummy", i + 1);
  }
};
show("judgment", dc.judgment);
show("framework", JSON.stringify(dc.framework));

// 2. delete Tom's empty active session — guarded: must be active AND empty
const { data: row } = await supabase
  .from("pattern_records").select("id, status, context_summary, trigger_signal, judgment, framework")
  .eq("id", "e7dfcbb6-4a16-4ac4-9ecd-a06cfd263663").maybeSingle();
if (!row) {
  console.log("\nempty session: not found — nothing to delete.");
} else if (
  row.status === "active" && !row.framework &&
  !(row.context_summary ?? "").trim() && !(row.trigger_signal ?? "").trim() && !(row.judgment ?? "").trim()
) {
  const { error } = await supabase.from("pattern_records").delete().eq("id", row.id);
  if (error) throw error;
  console.log("\n✓ deleted Tom's empty abandoned session e7dfcbb6 (live).");
} else {
  console.log(`\nempty session: guard failed (status=${row.status}, fw=${!!row.framework}) — NOT deleted.`);
}
