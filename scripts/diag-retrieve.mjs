// P-7 diagnostic — /api/retrieve, the empty-with-noMatch-false bug.
//
// READ-ONLY. No writes, no model calls, no schema changes. Run it as often as
// you like. (Same doctrine as scripts/diag-efficacy.mjs: dump exactly what the
// route would see, from both privilege levels, before touching code.)
//
// WHY THIS EXISTS
// scripts/verify-p3.mjs passes while POST /api/retrieve returns nothing —
// because verify-p3 runs with the SERVICE-ROLE key, which BYPASSES RLS
// entirely, while the route runs as an AUTHENTICATED USER, where the
// "org library read" policy applies. Any bug that lives in that gap is
// invisible to verify-p3 by construction. This script runs the route's exact
// two-step read at BOTH privilege levels and diffs them.
//
// WHAT IT CHECKS, in order
//   1. Voyage query-embed (input_type: "query") actually succeeds.
//   2. SERVICE ROLE: rpc search_pattern_records_by_query → ids + similarity.
//   3. SERVICE ROLE: do those ids exist in pattern_records at all? Print
//      status / org_id / author / framework name for each.
//   4. AUTHENTICATED (a real demo login, real RLS): the same rpc.
//   5. AUTHENTICATED: select pattern_records .in("id", ids) — the second read
//      the route does, and the one that was silently coming back empty.
//   6. VERDICT — names the root cause from the divergence pattern.
//
// USAGE (from PowerShell, in the repo root — needs internet + .env.local):
//   node scripts/diag-retrieve.mjs
//   node scripts/diag-retrieve.mjs --as=tom.whitfield@meridian-demo.example
//   node scripts/diag-retrieve.mjs --query="your situation text here"
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import path from "node:path";

// ── env ──────────────────────────────────────────────────────────────────────
const envRaw = await readFile(path.join(process.cwd(), ".env.local"), "utf-8");
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VOYAGE_KEY = process.env.VOYAGE_API_KEY;

for (const [name, val] of [
  ["NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL],
  ["NEXT_PUBLIC_SUPABASE_ANON_KEY", ANON_KEY],
  ["SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY],
  ["VOYAGE_API_KEY", VOYAGE_KEY],
]) {
  if (!val) {
    console.error(`\n❌ ${name} is missing from .env.local — cannot run.\n`);
    process.exit(2);
  }
}

// ── args ─────────────────────────────────────────────────────────────────────
const argOf = (flag, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${flag}=`));
  return hit ? hit.slice(flag.length + 3) : fallback;
};

const DEMO_PASSWORD = "Demo-Meridian-2026!";
const AS_EMAIL = argOf("as", "david.chen@meridian-demo.example");
const QUERY = argOf(
  "query",
  "We had a quality escape right after a die changeover on the press line — should we release the next production run before first-piece inspection clears?"
);

// These MUST mirror src/app/api/retrieve/route.ts exactly.
const SIMILARITY_THRESHOLD = 0.75;
const MATCH_COUNT = 5;

const line = (c = "─") => console.log(c.repeat(74));
const fmt = (n) => (typeof n === "number" ? n.toFixed(3) : String(n));

console.log("\n╔══ P-7 DIAGNOSTIC — /api/retrieve two-step read ══╗");
console.log(`   login under test : ${AS_EMAIL}`);
console.log(`   query            : "${QUERY.slice(0, 62)}…"`);
console.log(`   threshold        : ${SIMILARITY_THRESHOLD} · match_count ${MATCH_COUNT}`);

// ── 1. Voyage query embed ────────────────────────────────────────────────────
console.log("\n=== 1. VOYAGE QUERY EMBED (input_type: query) ===");
let queryVector;
{
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${VOYAGE_KEY}` },
    body: JSON.stringify({ input: [QUERY], model: "voyage-large-2", input_type: "query" }),
  });
  if (!res.ok) {
    console.error(`❌ Voyage ${res.status}: ${(await res.text()).slice(0, 300)}`);
    console.error("   → If this is a 429, THAT is your root cause: the route surfaces");
    console.error("     it as a 502, not an empty result. Check the browser network tab.");
    process.exit(1);
  }
  const data = await res.json();
  const emb = data?.data?.[0]?.embedding;
  if (!Array.isArray(emb) || emb.length !== 1536) {
    console.error(`❌ Voyage returned a bad embedding (len ${emb?.length ?? "n/a"}, expected 1536)`);
    process.exit(1);
  }
  queryVector = `[${emb.join(",")}]`;
  console.log(`✅ 1536-dim query vector obtained`);
}

const service = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── 2. SERVICE ROLE rpc (this is what verify-p3.mjs sees) ────────────────────
console.log("\n=== 2. SERVICE-ROLE RPC (RLS BYPASSED — what verify-p3 sees) ===");
const { data: svcMatches, error: svcErr } = await service.rpc("search_pattern_records_by_query", {
  query_embedding: queryVector,
  match_count: MATCH_COUNT,
});
if (svcErr) {
  console.error(`❌ RPC error: ${svcErr.message}`);
  process.exit(1);
}
const svcRows = svcMatches || [];
console.log(`returned ${svcRows.length} row(s); columns present: ${Object.keys(svcRows[0] || {}).join(", ") || "(none)"}`);
if (svcRows.length && !("id" in svcRows[0])) {
  console.log("❌ THE FUNCTION DOES NOT RETURN AN `id` COLUMN.");
  console.log("   That alone explains the bug: the route reads m.id → undefined →");
  console.log("   the follow-up record load matches nothing → empty array.");
}
const svcStrong = svcRows.filter((m) => m.similarity >= SIMILARITY_THRESHOLD);
for (const m of svcRows) {
  console.log(`  ${m.similarity >= SIMILARITY_THRESHOLD ? "▲ clears" : "· below "} ${fmt(m.similarity)}  ${m.id}`);
}
console.log(`→ ${svcStrong.length} above ${SIMILARITY_THRESHOLD}`);

// ── 3. Do those ids exist in pattern_records at all? ─────────────────────────
console.log("\n=== 3. SERVICE-ROLE: DO THOSE IDS RESOLVE IN pattern_records? ===");
const svcIds = svcStrong.map((m) => m.id).filter(Boolean);
const { data: svcRecs } = await service
  .from("pattern_records")
  .select("id, status, org_id, user_id, framework")
  .in("id", svcIds.length ? svcIds : ["00000000-0000-0000-0000-000000000000"]);
const svcRecById = Object.fromEntries((svcRecs || []).map((r) => [r.id, r]));
const { data: orgRows } = await service.from("orgs").select("id, name");
const orgName = Object.fromEntries((orgRows || []).map((o) => [o.id, o.name]));
const { data: profRows } = await service.from("profiles").select("id, display_name, org_id");
const profById = Object.fromEntries((profRows || []).map((p) => [p.id, p]));

let phantomIds = [];
for (const id of svcIds) {
  const r = svcRecById[id];
  if (!r) {
    phantomIds.push(id);
    console.log(`  ❌ ${id} — NOT A pattern_records ROW (foreign-table id)`);
    continue;
  }
  console.log(
    `  ✔ ${id}\n      status=${r.status} · org=${orgName[r.org_id] ?? r.org_id} · ` +
      `author=${profById[r.user_id]?.display_name ?? r.user_id}\n      "${r.framework?.name ?? "(pending)"}"`
  );
}

// ── 4. AUTHENTICATED rpc (real RLS — what the ROUTE sees) ────────────────────
console.log("\n=== 4. AUTHENTICATED RPC (REAL RLS — what the ROUTE sees) ===");
const authed = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: signIn, error: signInErr } = await authed.auth.signInWithPassword({
  email: AS_EMAIL,
  password: DEMO_PASSWORD,
});
if (signInErr) {
  console.error(`❌ Could not sign in as ${AS_EMAIL}: ${signInErr.message}`);
  console.error(`   (Demo logins use ${DEMO_PASSWORD}. Pass --as=<email> for another persona.)`);
  process.exit(1);
}
const authUserId = signIn.user.id;
const myProfile = profById[authUserId];
console.log(
  `signed in as ${myProfile?.display_name ?? AS_EMAIL} (${authUserId})\n` +
    `  profile org_id: ${myProfile?.org_id ?? "(NULL — user is in NO org)"} ` +
    `${myProfile?.org_id ? `→ ${orgName[myProfile.org_id] ?? "(unknown org)"}` : ""}`
);

const { data: authMatches, error: authErr } = await authed.rpc("search_pattern_records_by_query", {
  query_embedding: queryVector,
  match_count: MATCH_COUNT,
});
if (authErr) {
  console.error(`❌ RPC error as authenticated user: ${authErr.message}`);
  console.error("   → The route would return a 500 'Search failed', not an empty array.");
  process.exit(1);
}
const authRows = authMatches || [];
const authStrong = authRows.filter((m) => m.similarity >= SIMILARITY_THRESHOLD);
for (const m of authRows) {
  console.log(`  ${m.similarity >= SIMILARITY_THRESHOLD ? "▲ clears" : "· below "} ${fmt(m.similarity)}  ${m.id}`);
}
console.log(`→ ${authStrong.length} above ${SIMILARITY_THRESHOLD} (this drives noMatch in the OLD route)`);

// ── 5. AUTHENTICATED record load — the route's SECOND read ───────────────────
console.log("\n=== 5. AUTHENTICATED RECORD LOAD (.in('id', ids)) — the second read ===");
const authIds = authStrong.map((m) => m.id).filter(Boolean);
const { data: authRecs, error: authRecErr } = await authed
  .from("pattern_records")
  .select("id, user_id, org_id, status, framework")
  .in("id", authIds.length ? authIds : ["00000000-0000-0000-0000-000000000000"]);
if (authRecErr) console.log(`❌ select error: ${authRecErr.message}`);
const authLoaded = new Set((authRecs || []).map((r) => r.id));
const unresolved = authIds.filter((id) => !authLoaded.has(id));
console.log(`matched ids: ${authIds.length} · rows loaded: ${authLoaded.size} · UNRESOLVED: ${unresolved.length}`);
for (const id of authIds) {
  console.log(`  ${authLoaded.has(id) ? "✔ loaded  " : "❌ INVISIBLE"} ${id}`);
}

// How many complete records can this user see at all?
const { data: visible } = await authed.from("pattern_records").select("id").eq("status", "complete");
console.log(`this login can see ${(visible || []).length} complete pattern_records total under RLS`);

// ── 6. VERDICT ───────────────────────────────────────────────────────────────
console.log("");
line("═");
console.log("VERDICT");
line("═");

const wouldBeOldResponse =
  authStrong.length === 0
    ? "{ noMatch: true }"
    : `{ noMatch: false, results: [${authLoaded.size}] }`;
console.log(`OLD route would return: ${wouldBeOldResponse}`);
console.log(`NEW route would return: ${
  authStrong.length === 0
    ? "{ noMatch: true }"
    : authLoaded.size === 0
    ? "HTTP 500 RETRIEVAL_VISIBILITY_GAP (loud, not blank)"
    : `{ noMatch: false, results: [${authLoaded.size}] }`
}`);
console.log("");

if (phantomIds.length > 0) {
  console.log("🔴 ROOT CAUSE: the search function returns ids that are NOT pattern_records");
  console.log("   rows. The record load can never resolve them. Re-apply section 4 of");
  console.log("   supabase/p3-pattern-record-embeddings.sql (create or replace).");
} else if (authStrong.length > 0 && authLoaded.size === 0) {
  console.log("🔴 ROOT CAUSE: RLS ASYMMETRY. The search function returned rows this login");
  console.log("   CANNOT select — so the function is NOT running under the caller's RLS.");
  console.log("   It has drifted to SECURITY DEFINER in the live DB (P-3 requires INVOKER).");
  console.log("   Fix: re-run section 4 of supabase/p3-pattern-record-embeddings.sql, then");
  console.log("   confirm with:  select proname, prosecdef from pg_proc");
  console.log("                  where proname like 'search_pattern_records%';");
  console.log("   prosecdef must be FALSE for ...by_query and TRUE for ..._for_org.");
} else if (authStrong.length > 0 && unresolved.length > 0) {
  console.log("🟠 PARTIAL visibility gap — some matched ids load, some do not:");
  unresolved.forEach((id) => {
    const r = svcRecById[id];
    console.log(
      `   ${id} → org=${orgName[r?.org_id] ?? r?.org_id ?? "?"} status=${r?.status ?? "?"} ` +
        `(caller org=${orgName[myProfile?.org_id] ?? myProfile?.org_id ?? "none"})`
    );
  });
} else if (svcStrong.length > 0 && authStrong.length === 0) {
  console.log("🟠 The service role finds matches but this LOGIN sees none — the route would");
  console.log("   honestly return noMatch:true. That is not the reported bug. Most likely");
  console.log(`   ${AS_EMAIL} is not in the org that owns those records, or the records`);
  console.log("   are not status='complete'. Compare org ids in section 3 vs section 4.");
} else if (authStrong.length > 0 && authLoaded.size === authIds.length) {
  console.log("🟢 The DB path is HEALTHY for this login — the route's two reads agree.");
  console.log("   If the browser still shows nothing, the failure is above the DB:");
  console.log("   check the Voyage embed (section 1 / a 429), and the browser network tab");
  console.log("   for the actual /api/retrieve status code and body.");
} else {
  console.log("🟡 Nothing cleared the threshold at either privilege level — check embedding");
  console.log("   coverage first: node scripts/verify-p3.mjs");
}
line("═");
console.log("");
await authed.auth.signOut();
