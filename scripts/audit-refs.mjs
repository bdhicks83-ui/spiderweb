// READ-ONLY: who references the two suspect records?
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

const SUSPECTS = [
  "e7dfcbb6-4a16-4ac4-9ecd-a06cfd263663",
  "86f54b48-2d64-403f-b074-b095d5ff5826",
];

// prescriptions: evidence lives inside detection; get all prescriptions + their detections
const { data: rx } = await supabase.from("prescriptions").select("*");
console.log(`prescriptions: ${(rx || []).length}`);
for (const p of rx || []) {
  const s = JSON.stringify(p);
  for (const id of SUSPECTS) if (s.includes(id)) console.log(`  ⚠️ prescription ${p.id} (status=${p.status}) references ${id}`);
}
// any table that might hold evidence ids
for (const table of ["pattern_detections", "framework_conflicts", "retraining_signals", "training_modules", "learning_signals"]) {
  const { data: rows, error } = await supabase.from(table).select("*").limit(200);
  if (error) { console.log(`${table}: (${error.message})`); continue; }
  console.log(`${table}: ${(rows || []).length} rows`);
  for (const row of rows || []) {
    const s = JSON.stringify(row);
    for (const id of SUSPECTS) if (s.includes(id)) console.log(`  ⚠️ ${table} row ${row.id} references ${id}`);
  }
}
// embeddings for the frameworkless record?
const { data: emb, error: embErr } = await supabase
  .from("pattern_record_embeddings")
  .select("record_id")
  .in("record_id", SUSPECTS);
if (embErr) console.log(`pattern_record_embeddings: (${embErr.message})`);
else console.log(`embeddings on suspects: ${JSON.stringify(emb)}`);
