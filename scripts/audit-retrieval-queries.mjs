// READ-ONLY: find the best plain-language retrieval query for the ad shoot.
// Runs several candidate situation queries through the REAL authenticated path
// (anon key + demo login + RLS), exactly as /api/retrieve does, and reports
// which framework comes back #1 and who authored it.
//
// Usage: node scripts/audit-retrieval-queries.mjs
//        node scripts/audit-retrieval-queries.mjs --as=tom.whitfield@meridian-demo.example
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import path from "node:path";

const envRaw = await readFile(path.join(process.cwd(), ".env.local"), "utf-8");
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const { NEXT_PUBLIC_SUPABASE_URL: URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_ROLE_KEY: SVC, VOYAGE_API_KEY: VOYAGE } = process.env;

const THRESHOLD = 0.75;
const MATCH_COUNT = 5;
const DEMO_PASSWORD = "Demo-Meridian-2026!";
const argOf = (f, d) => (process.argv.find((a) => a.startsWith(`--${f}=`)) || `--${f}=${d}`).slice(f.length + 3);
const AS_EMAIL = argOf("as", "tom.whitfield@meridian-demo.example");

const CANDIDATES = [
  "We just ran a die changeover on the press line. Can we start the production run before the first-piece inspection comes back?",
  "Die changeover finished on second shift and the press crew is idle waiting on first-piece inspection. Do we release the run?",
  "Same-family die swap on Press #3 — do we have to hold the line until first-piece clears, or can we run parallel?",
  "The presses are sitting idle after a changeover waiting for quality to sign off on the first piece. What do we do?",
  "Should we release production after a die changeover before first-piece inspection is complete?",
  "We had a quality escape right after a die changeover on the press line — should we release the next production run before first-piece inspection clears?",
];

const service = createClient(URL, SVC, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: profs } = await service.from("profiles").select("id, display_name");
const nameOf = new Map((profs || []).map((p) => [p.id, p.display_name]));

const authed = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
const { error: sErr } = await authed.auth.signInWithPassword({ email: AS_EMAIL, password: DEMO_PASSWORD });
if (sErr) { console.error(`sign-in failed: ${sErr.message}`); process.exit(1); }
console.log(`signed in as ${AS_EMAIL}\nthreshold ${THRESHOLD} · match_count ${MATCH_COUNT}\n`);

async function embed(text) {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${VOYAGE}` },
    body: JSON.stringify({ input: [text], model: "voyage-large-2", input_type: "query" }),
  });
  if (!res.ok) throw new Error(`voyage ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return `[${j.data[0].embedding.join(",")}]`;
}

const results = [];
for (const q of CANDIDATES) {
  const vec = await embed(q);
  const { data: matches, error } = await authed.rpc("search_pattern_records_by_query", {
    query_embedding: vec,
    match_count: MATCH_COUNT,
  });
  if (error) { console.log(`ERROR "${q.slice(0, 50)}": ${error.message}`); continue; }
  const strong = (matches || []).filter((m) => m.similarity >= THRESHOLD);
  const ids = strong.map((m) => m.id);
  const { data: recs } = await authed
    .from("pattern_records")
    .select("id, user_id, framework, trigger_type, created_at")
    .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const byId = new Map((recs || []).map((r) => [r.id, r]));

  console.log("=".repeat(74));
  console.log(`QUERY: ${q}`);
  console.log(`  ${strong.length} of ${(matches || []).length} clear ${THRESHOLD}`);
  strong.forEach((m, i) => {
    const r = byId.get(m.id);
    console.log(
      `   ${i + 1}. ${m.similarity.toFixed(3)}  "${r?.framework?.name ?? "(UNRESOLVED)"}"  — ${nameOf.get(r?.user_id) ?? "?"} (${r?.trigger_type ?? "?"})`
    );
  });
  const top = byId.get(strong[0]?.id);
  results.push({
    q,
    n: strong.length,
    topSim: strong[0]?.similarity ?? 0,
    topName: top?.framework?.name ?? null,
    topAuthor: nameOf.get(top?.user_id) ?? null,
    unresolved: ids.length - (recs || []).length,
  });
}

console.log("\n" + "=".repeat(74));
console.log("SUMMARY — best query for the shoot");
console.log("=".repeat(74));
const DIE = ["The No-Exceptions Gate", "The Quarantined Restart Play"];
for (const r of results.sort((a, b) => b.topSim - a.topSim)) {
  const hit = DIE.includes(r.topName) ? "  <== die-changeover framework is #1" : "";
  console.log(`  ${r.topSim.toFixed(3)} · ${r.n} results · top="${r.topName}" (${r.topAuthor})${hit}`);
  console.log(`      "${r.q}"`);
  if (r.unresolved) console.log(`      !! ${r.unresolved} matched id(s) did not load under RLS`);
}
await authed.auth.signOut();
