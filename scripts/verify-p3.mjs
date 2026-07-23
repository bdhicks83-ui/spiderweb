// P-3 verification — runs the automatable half of the DONE test against the
// LIVE Supabase + Voyage, using .env.local. Read-only (no writes).
//
//   1. Embedding coverage — every complete pattern_record has a vector.
//   2. Positive retrieval — the changeover/QC situation returns the matching
//      framework(s) above the 0.55 threshold, with attribution.
//   3. Negative retrieval — an unrelated situation stays BELOW threshold
//      (the honest "nothing codified" path).
//   4. Conflict status — is there an OPEN conflict for a contested badge to
//      render right now?
//
// NOTE: this uses the service-role key, which bypasses RLS — so the RPC here
// searches across orgs. That's fine for checking ranking + threshold; the
// LIVE /api/retrieve route runs as the authenticated user, where the same RPC
// is org-scoped by the "org library read" policy (SECURITY INVOKER).
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

const THRESHOLD = 0.75;

async function embedQuery(text) {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({ input: [text], model: "voyage-large-2", input_type: "query" }),
  });
  if (!res.ok) throw new Error(`Voyage ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return `[${data.data[0].embedding.join(",")}]`;
}

async function nameFor(ids) {
  if (ids.length === 0) return {};
  const { data: recs } = await supabase
    .from("pattern_records")
    .select("id, user_id, framework")
    .in("id", ids);
  const authorIds = [...new Set((recs || []).map((r) => r.user_id))];
  const { data: profs } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", authorIds);
  const nameById = Object.fromEntries((profs || []).map((p) => [p.id, p.display_name]));
  return Object.fromEntries(
    (recs || []).map((r) => [
      r.id,
      { name: r.framework?.name ?? "(pending)", author: nameById[r.user_id] ?? "?" },
    ])
  );
}

let failures = 0;

// ── 1. Embedding coverage ──
console.log("\n=== 1. EMBEDDING COVERAGE ===");
const { data: complete, error: completeErr } = await supabase
  .from("pattern_records")
  .select("id")
  .eq("status", "complete");
if (completeErr) {
  console.error("❌ Could not reach Supabase:", completeErr.message);
  console.error("   (Run this from a shell WITH internet access — e.g. your PowerShell.)");
  process.exit(2);
}
const { data: embedded } = await supabase
  .from("pattern_records")
  .select("id")
  .eq("status", "complete")
  .not("embedding", "is", null);
const total = (complete || []).length;
const withVec = (embedded || []).length;
console.log(`Complete records: ${total} · with embedding: ${withVec} · missing: ${total - withVec}`);
if (total > 0 && withVec === total) console.log("✅ every complete record is embedded");
else { console.log("❌ some complete records are missing an embedding"); failures++; }

// ── 2. Positive retrieval ──
console.log("\n=== 2. POSITIVE RETRIEVAL (changeover / QC) ===");
const posQ =
  "We had a quality escape right after a die changeover on the press line — should we release the next production run before first-piece inspection clears?";
const posEmb = await embedQuery(posQ);
const { data: posMatches, error: posErr } = await supabase.rpc("search_pattern_records_by_query", {
  query_embedding: posEmb,
  match_count: 5,
});
if (posErr) { console.log("❌ RPC error:", posErr.message); failures++; }
else {
  const meta = await nameFor((posMatches || []).map((m) => m.id));
  for (const m of posMatches || []) {
    const clears = m.similarity >= THRESHOLD ? "▲ clears" : "· below";
    const x = meta[m.id] || {};
    console.log(`  ${clears} ${m.similarity.toFixed(3)}  ${x.name}  — ${x.author}`);
  }
  const strong = (posMatches || []).filter((m) => m.similarity >= THRESHOLD);
  if (strong.length > 0) console.log(`✅ ${strong.length} framework(s) surface above ${THRESHOLD}`);
  else { console.log(`❌ nothing cleared ${THRESHOLD} — threshold may be too high`); failures++; }
}

// ── 3. Negative retrieval ──
console.log("\n=== 3. NEGATIVE RETRIEVAL (unrelated) ===");
const negQ = "How should we price a new SaaS subscription tier for enterprise customers?";
const negEmb = await embedQuery(negQ);
const { data: negMatches } = await supabase.rpc("search_pattern_records_by_query", {
  query_embedding: negEmb,
  match_count: 5,
});
const negTop = (negMatches || [])[0]?.similarity ?? 0;
console.log(`  top similarity: ${negTop.toFixed(3)} (threshold ${THRESHOLD})`);
if (negTop < THRESHOLD) console.log('✅ correctly returns "nothing codified" (top below threshold)');
else { console.log("❌ an unrelated query cleared the threshold — false positive"); failures++; }

// ── 4. Conflict status (contested badge) ──
console.log("\n=== 4. CONTESTED BADGE STATUS ===");
const { data: openConflicts } = await supabase
  .from("framework_conflicts")
  .select("id, status, record_a_id, record_b_id")
  .eq("status", "open");
const openCount = (openConflicts || []).length;
if (openCount > 0) {
  console.log(`✅ ${openCount} OPEN conflict(s) — a contested badge WILL render in results`);
} else {
  console.log("⚠️  0 open conflicts — the planted one is still RESOLVED from the P-2 live test.");
  console.log("    Contested badge won't show until you replant: node scripts/seed-p2-conflict.mjs --force");
}

console.log(`\n=== SUMMARY: ${failures === 0 ? "ALL CHECKS PASSED ✅" : failures + " CHECK(S) FAILED ❌"} ===\n`);
process.exit(failures === 0 ? 0 : 1);
