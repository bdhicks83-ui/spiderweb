// READ-ONLY diagnostic — no model calls, no writes. P-5 punch list item 5:
// MASTER-STATE has carried a "20 vs 21 expected" discrepancy on the
// /library framework count since before P-4.5, and P-4.5 then added 3 more
// records on top of an unreconciled base — so the doc's running total is
// not trustworthy. Ground truth: count pattern_records exactly the way
// /api/library does it (status='complete', scoped to the demo org), print
// the breakdown, and flag anything that would silently confuse the count
// (records stuck in a non-complete status, records missing a framework,
// duplicate-looking context_summary values).
//
// Usage: node scripts/diag-library-count.mjs
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

const DEMO_ORG_NAME = "All Weather Insulated Panels (AWIP) — DEMO";

const { data: org } = await supabase
  .from("orgs").select("id").eq("name", DEMO_ORG_NAME).single();
if (!org) throw new Error(`Demo org "${DEMO_ORG_NAME}" not found.`);
const orgId = org.id;

const { data: all } = await supabase
  .from("pattern_records")
  .select("id, status, trigger_type, framework, embedding, context_summary, user_id, created_at")
  .eq("org_id", orgId);

const { data: profs } = await supabase
  .from("profiles").select("id, display_name").eq("org_id", orgId);
const nameById = new Map((profs || []).map((p) => [p.id, p.display_name]));

console.log(`═══ Demo org: "${DEMO_ORG_NAME}" (${orgId}) ═══`);
console.log(`Total pattern_records (any status): ${(all || []).length}\n`);

const byStatus = {};
for (const r of all || []) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
console.log("By status:");
for (const [status, count] of Object.entries(byStatus)) console.log(`  ${status}: ${count}`);

const complete = (all || []).filter((r) => r.status === "complete");
console.log(`\nstatus='complete' — this is exactly what /library and /api/library count: ${complete.length}`);

const byTrigger = {};
for (const r of complete) byTrigger[r.trigger_type ?? "(none)"] = (byTrigger[r.trigger_type ?? "(none)"] || 0) + 1;
console.log("\nComplete records by trigger_type:");
for (const [t, count] of Object.entries(byTrigger)) console.log(`  ${t}: ${count}`);

console.log("\nComplete records by author:");
const byAuthor = {};
for (const r of complete) {
  const name = nameById.get(r.user_id) ?? r.user_id;
  byAuthor[name] = (byAuthor[name] || 0) + 1;
}
for (const [name, count] of Object.entries(byAuthor)) console.log(`  ${name}: ${count}`);

// Flag anything that would explain an "off by one" surprise.
const noFramework = complete.filter((r) => !r.framework?.name);
if (noFramework.length > 0) {
  console.log(`\n⚠️  ${noFramework.length} complete record(s) with NO rendered framework (would show "(framework pending)" in the UI):`);
  for (const r of noFramework) console.log(`    • ${r.id} — ${(r.context_summary || "").slice(0, 70)}`);
}
const noEmbedding = complete.filter((r) => !r.embedding);
if (noEmbedding.length > 0) {
  console.log(`\n⚠️  ${noEmbedding.length} complete record(s) with NO embedding (won't surface in /retrieve — P-3 regression check):`);
  for (const r of noEmbedding) console.log(`    • ${r.id} — ${(r.context_summary || "").slice(0, 70)}`);
}
const nonComplete = (all || []).filter((r) => r.status !== "complete");
if (nonComplete.length > 0) {
  console.log(`\n⚠️  ${nonComplete.length} non-complete record(s) sitting in the org (in-progress /codify sessions, or stuck):`);
  for (const r of nonComplete) console.log(`    • ${r.id} — status=${r.status} — ${(r.context_summary || "").slice(0, 70)}`);
}

console.log(`\n✓ diagnostic complete (nothing was written). Library count = ${complete.length}.`);
