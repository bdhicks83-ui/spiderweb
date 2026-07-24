// READ-ONLY diagnostic — no model calls, no writes. Dumps exactly what the
// efficacy loop matches against for the DELIVERED prescriptions, so we can
// see why the conflict (quiet) prescription is being falsely escalated.
//
// Usage: node scripts/diag-efficacy.mjs
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

const DEMO_ORG_NAME = "Meridian Precision Manufacturing (DEMO)";
const normalizeEntityName = (name) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");

const { data: org } = await supabase
  .from("orgs").select("id").eq("name", DEMO_ORG_NAME).single();
const orgId = org.id;

const { data: delivered } = await supabase
  .from("prescriptions")
  .select("id, detection_id, rung, status, delivered_at, efficacy_status, gap_summary")
  .eq("org_id", orgId)
  .eq("status", "delivered");

const { data: dets } = await supabase
  .from("prescription_detections")
  .select("id, source_type, subject_entities, evidence_record_ids, conflict_id")
  .in("id", (delivered || []).map((r) => r.detection_id));
const detById = new Map((dets || []).map((d) => [d.id, d]));

for (const rx of delivered || []) {
  const det = detById.get(rx.detection_id);
  console.log("\n══════════════════════════════════════════════════════");
  console.log(`PRESCRIPTION ${rx.id}`);
  console.log(`  source_type   : ${det?.source_type}`);
  console.log(`  gap_summary   : ${(rx.gap_summary || "").slice(0, 90)}`);
  console.log(`  delivered_at  : ${rx.delivered_at}`);
  console.log(`  efficacy      : ${rx.efficacy_status}`);
  console.log(`  conflict_id   : ${det?.conflict_id ?? "(none)"}`);
  console.log(`  founding recs : ${JSON.stringify(det?.evidence_record_ids || [])}`);
  const subjectKeys = new Set(
    (det?.subject_entities || []).map((e) => `${e.type}|${normalizeEntityName(e.name)}`)
  );
  console.log(`  subject keys  : ${[...subjectKeys].join("  ||  ")}`);

  const deliveredMs = new Date(rx.delivered_at).getTime();
  const founding = new Set(det?.evidence_record_ids || []);

  const { data: recs } = await supabase
    .from("pattern_records")
    .select("id, created_at, trigger_type, entity_map, context_summary, user_id")
    .eq("org_id", orgId)
    .eq("status", "complete")
    .gt("created_at", rx.delivered_at);

  const matches = (recs || []).filter((r) =>
    (r.trigger_type === "broke" || r.trigger_type === "friction") &&
    (r.entity_map || []).some((e) => subjectKeys.has(`${e.type}|${normalizeEntityName(e.name)}`))
  );

  console.log(`  → ${matches.length} record(s) match (broke/friction + entity + after delivered_at):`);
  for (const r of matches) {
    const hitEnts = (r.entity_map || [])
      .filter((e) => subjectKeys.has(`${e.type}|${normalizeEntityName(e.name)}`))
      .map((e) => `${e.type}:${e.name}`);
    console.log(`    • ${r.id}`);
    console.log(`        created_at : ${r.created_at}  (${founding.has(r.id) ? "FOUNDING" : "not founding"})`);
    console.log(`        trigger    : ${r.trigger_type}`);
    console.log(`        matched on : ${hitEnts.join(" ; ")}`);
    console.log(`        context    : ${(r.context_summary || "").slice(0, 80)}`);
  }
}

console.log("\n✓ diagnostic complete (nothing was written).");
