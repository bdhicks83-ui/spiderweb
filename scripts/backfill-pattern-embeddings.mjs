// P-3 (Build 2) — Backfill pattern_record embeddings.
//
// Embeds every COMPLETE pattern_record that is missing an embedding (the 16 in
// the Meridian demo org, plus anything else), using the SAME voyage-large-2 /
// input_type=document config and the SAME text composition as the in-app
// auto-embed path (src/lib/pattern-embedding.ts). Service-role so it can reach
// every author's records across the demo org.
//
// Follows the repo's copy-don't-import convention for one-off data ops (same as
// scripts/seed-p1-demo.mjs / seed-p2-conflict.mjs): buildEmbeddingText below is
// a verbatim JS mirror of buildPatternEmbeddingText in
// src/lib/pattern-embedding.ts — keep the two in sync if you change either.
//
// Idempotent: only touches rows where embedding IS NULL, unless you pass --all
// to re-embed every complete record. Prints a verification summary and exits
// non-zero if any record it attempted still lacks an embedding.
//
// Usage:
//   node scripts/backfill-pattern-embeddings.mjs           # missing only
//   node scripts/backfill-pattern-embeddings.mjs --all     # re-embed all
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import path from "node:path";

// ─── env (same .env.local loader as the seed scripts) ───
const envRaw = await readFile(path.join(process.cwd(), ".env.local"), "utf-8");
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const ALL = process.argv.includes("--all");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const MODEL = "voyage-large-2";
const DIMS = 1536;

// ─── verbatim mirror of buildPatternEmbeddingText (src/lib/pattern-embedding.ts) ───
function buildEmbeddingText(row) {
  const parts = [];
  const push = (label, value) => {
    if (value && String(value).trim()) parts.push(`${label}: ${String(value).trim()}`);
  };
  const pushList = (label, values) => {
    if (Array.isArray(values) && values.length) parts.push(`${label}: ${values.join(" · ")}`);
  };

  const f = row.framework;
  if (f) {
    push("Framework", f.name);
    push("Summary", f.tagline);
    pushList("When to apply", f.when_to_apply);
  }

  push("Situation", row.context_summary);
  const ontology = [
    row.context_industry,
    row.context_function,
    row.situation_type,
    row.intervention_type,
    row.context_org_size ? `org size ${row.context_org_size}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  if (ontology) parts.push(`Context: ${ontology}`);

  push("Trigger", row.trigger_signal);
  push("Signal", row.signal_detail);
  if (f) pushList("Signals", f.signals);

  push("Play", row.judgment);
  if (f) push("Play detail", f.the_play);
  push("Reasoning", row.rationale);
  if (f) push("Why it works", f.why_it_works);

  push("Boundaries", row.boundaries);
  if (f) pushList("Boundaries detail", f.boundaries);

  if (Array.isArray(row.entity_map) && row.entity_map.length) {
    const entities = row.entity_map
      .map((e) => (e.detail ? `${e.name} (${e.type}, ${e.detail})` : `${e.name} (${e.type})`))
      .join(", ");
    parts.push(`Entities: ${entities}`);
  }

  return parts.join("\n");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Voyage embed with 429-aware retry (mirrors src/lib/voyage.ts policy) ───
async function embedDocument(text) {
  const MAX_ATTEMPTS = 5;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res;
    try {
      res = await fetch(VOYAGE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
        },
        body: JSON.stringify({ input: [text], model: MODEL, input_type: "document" }),
      });
    } catch (err) {
      if (attempt < MAX_ATTEMPTS) {
        await sleep(Math.min(500 * 2 ** (attempt - 1) + 137, 8000));
        continue;
      }
      return { ok: false, error: String(err) };
    }

    if (res.ok) {
      const data = await res.json();
      const embedding = data?.data?.[0]?.embedding;
      if (!Array.isArray(embedding) || embedding.length !== DIMS) {
        return { ok: false, error: `bad dimensionality (${embedding?.length})` };
      }
      return { ok: true, vector: `[${embedding.join(",")}]` };
    }

    const status = res.status;
    const body = await res.text().catch(() => "");
    const retryable = status === 429 || status >= 500;
    if (retryable && attempt < MAX_ATTEMPTS) {
      const retryAfter = parseInt(res.headers.get("retry-after") || "", 10);
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 8000)
        : Math.min(500 * 2 ** (attempt - 1) + 137, 8000);
      await sleep(delay);
      continue;
    }
    return { ok: false, error: `Voyage ${status}: ${body.slice(0, 200)}` };
  }
  return { ok: false, error: "retries exhausted" };
}

// ─── main ───
const COLUMNS =
  "id, context_summary, context_org_size, context_industry, context_function, " +
  "situation_type, intervention_type, trigger_signal, signal_detail, judgment, " +
  "rationale, boundaries, entity_map, framework, embedding";

let query = supabase.from("pattern_records").select(COLUMNS).eq("status", "complete");
if (!ALL) query = query.is("embedding", null);

const { data: records, error } = await query;
if (error) {
  console.error("Could not load pattern_records:", error.message);
  process.exit(1);
}

console.log(
  `\nBackfill target: ${records.length} complete record(s) ${ALL ? "(--all: re-embedding every one)" : "missing an embedding"}.\n`
);

let ok = 0;
let failed = 0;
for (const row of records) {
  const text = buildEmbeddingText(row);
  if (!text.trim()) {
    console.warn(`  ⚠️  ${row.id} — no embeddable content, skipping`);
    failed++;
    continue;
  }
  const embed = await embedDocument(text);
  if (!embed.ok) {
    console.error(`  ❌ ${row.id} — embed failed: ${embed.error}`);
    failed++;
    continue;
  }
  const { error: upErr } = await supabase
    .from("pattern_records")
    .update({ embedding: embed.vector, embedded_at: new Date().toISOString() })
    .eq("id", row.id);
  if (upErr) {
    console.error(`  ❌ ${row.id} — DB update failed: ${upErr.message}`);
    failed++;
    continue;
  }
  const name = row.framework?.name ? ` (${row.framework.name})` : "";
  console.log(`  ✅ ${row.id}${name}`);
  ok++;
}

// ─── verify: no complete record should be left unembedded ───
const { data: stillMissing, error: verifyErr } = await supabase
  .from("pattern_records")
  .select("id")
  .eq("status", "complete")
  .is("embedding", null);

console.log(`\nEmbedded: ${ok} · Failed/skipped: ${failed}`);
if (verifyErr) {
  console.error("Verify query failed:", verifyErr.message);
  process.exit(1);
}
if (stillMissing.length > 0) {
  console.error(`\n❌ ${stillMissing.length} complete record(s) STILL have no embedding:`);
  for (const r of stillMissing) console.error(`   - ${r.id}`);
  process.exit(1);
}
console.log("\n✅ Backfill verification PASSED — every complete pattern_record has an embedding.\n");
