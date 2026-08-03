// VERIFY — FLOOR GUIDE / BEGINNER-REPHRASE RETRIEVAL PASS (2026-07-29)
//
// Answers the one question this build exists to answer, with numbers:
//
//   does beginner phrasing of a problem the library DOES cover now clear 0.75,
//   without the threshold having moved?
//
// ⚠️ WHAT THIS SCRIPT IS AND IS NOT. It reproduces the route's math at the
// route's own privilege level — it signs in as the Floor Guide contributor and
// calls the SECURITY INVOKER RPC under that person's JWT, so it does NOT have
// the service-role blind spot that made a passing verify-p3.mjs prove nothing
// about the live /retrieve bug (MASTER-STATE, "the verify-script blind spot").
//
// It still does not close the UI beat. Only Brian clicking on the deployed page
// does that. This tells him what to expect when he does.
//
// Deliberately self-contained: no repo imports, fetch only. A verification script
// that imports the code under test can pass because both sides share a bug.
//
// USAGE (PowerShell, from the repo root):
//   node scripts/verify-floor-guide-rephrase.mjs
//
// Reads .env.local for NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
// VOYAGE_API_KEY, ANTHROPIC_API_KEY. Override the login with FG_EMAIL/FG_PASSWORD.
import { readFile } from "node:fs/promises";

const THRESHOLD = 0.75; // NOT MOVED BY THIS BUILD. That is the whole point.
const MATCH_COUNT = 5;
const VOCAB_LIMIT = 24;

// ─── env ────────────────────────────────────────────────────────────────────
async function loadEnv() {
  let raw = "";
  try {
    raw = await readFile(".env.local", "utf-8");
  } catch {
    console.error("Could not read .env.local — run this from the repo root.");
    process.exit(1);
  }
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return { ...env, ...process.env };
}

const env = await loadEnv();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const VOYAGE = env.VOYAGE_API_KEY;
const ANTHROPIC = env.ANTHROPIC_API_KEY;
const EMAIL = env.FG_EMAIL || "devin.cross@awip-demo.example";
const PASSWORD = env.FG_PASSWORD || "Demo-AWIP-2026!";

for (const [k, v] of Object.entries({
  NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON,
  VOYAGE_API_KEY: VOYAGE,
  ANTHROPIC_API_KEY: ANTHROPIC,
})) {
  if (!v) {
    console.error(`Missing ${k} in .env.local`);
    process.exit(1);
  }
}

// ─── sign in as the Floor Guide person (NOT service role) ───────────────────
async function signIn() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const body = await res.json();
  if (!res.ok || !body.access_token) {
    console.error(`Sign-in failed for ${EMAIL} (HTTP ${res.status}): ${body.error_description || body.msg || JSON.stringify(body)}`);
    console.error("If the password rotated, pass it: $env:FG_PASSWORD='...'");
    process.exit(1);
  }
  return body.access_token;
}

const token = await signIn();
const asUser = { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

async function rest(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: asUser });
  if (!res.ok) throw new Error(`REST ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

// ─── who am I, and is Floor Guide actually on? ───────────────────────────────
const me = (
  await rest("profiles?select=display_name,claimed_title,role,floor_guide_active&limit=1")
)[0];
console.log("─".repeat(78));
console.log(`Signed in as ${me?.display_name} — ${me?.claimed_title}`);
console.log(`role=${me?.role}  floor_guide_active=${me?.floor_guide_active}`);
if (!me?.floor_guide_active) {
  console.log("⚠️  Floor Guide is NOT active for this seat — the rephrase pass would not run.");
}

// ─── the vocabulary, read exactly as the route reads it ─────────────────────
const vocabRows = await rest(
  `pattern_records?select=framework&status=eq.complete&order=created_at.desc&limit=${VOCAB_LIMIT}`
);
const vocabulary = vocabRows
  .map((r) => {
    const n = typeof r.framework?.name === "string" ? r.framework.name : "";
    const t = typeof r.framework?.tagline === "string" ? r.framework.tagline : "";
    return n ? (t ? `${n} — ${t}` : n) : "";
  })
  .filter(Boolean);
console.log(`Vocabulary visible to this seat: ${vocabulary.length} framework(s)`);
console.log("─".repeat(78));

// ─── the same prompt file the route uses ────────────────────────────────────
const promptTemplate = await readFile("prompts/floor-guide-translate.md", "utf-8");

async function translate(observation, vocab) {
  if (vocab.length === 0) return { reading: null, terms: [], confident: false, why: "no vocabulary" };
  const prompt = promptTemplate
    .replaceAll("{{vocabulary}}", vocab.map((v, i) => `${i + 1}. ${v}`).join("\n"))
    .replaceAll("{{title}}", me?.claimed_title || "not recorded")
    .replaceAll("{{observation}}", observation);
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) return { reading: null, terms: [], confident: false, why: `HTTP ${res.status}` };
  const body = await res.json();
  // Never assume content[0] is text.
  const text = (body.content || []).find((b) => b.type === "text")?.text || "";
  if (!text) return { reading: null, terms: [], confident: false, why: `no text block (stop=${body.stop_reason})` };
  let parsed = null;
  try {
    parsed = JSON.parse(text.replace(/^```json?\r?\n?|```$/g, "").trim());
  } catch {
    return { reading: null, terms: [], confident: false, why: "unparseable JSON" };
  }
  return {
    reading: typeof parsed.reading === "string" && parsed.reading.trim() ? parsed.reading.trim() : null,
    terms: Array.isArray(parsed.terms) ? parsed.terms.filter((t) => typeof t === "string") : [],
    confident: parsed.confident === true,
    why: parsed.reading ? null : "model declined to map it (rule 4)",
  };
}

// ─── embed + search, at the caller's privilege ──────────────────────────────
async function embed(text) {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${VOYAGE}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "voyage-large-2", input: [text], input_type: "query" }),
  });
  if (!res.ok) throw new Error(`voyage → ${res.status} ${await res.text()}`);
  const body = await res.json();
  return body.data[0].embedding;
}

async function search(text) {
  const vector = await embed(text);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/search_pattern_records_by_query`, {
    method: "POST",
    headers: asUser,
    body: JSON.stringify({ query_embedding: vector, match_count: MATCH_COUNT }),
  });
  if (!res.ok) throw new Error(`rpc → ${res.status} ${await res.text()}`);
  return res.json();
}

const nameCache = new Map();
async function nameOf(id) {
  if (nameCache.has(id)) return nameCache.get(id);
  const rows = await rest(`pattern_records?select=id,framework&id=eq.${id}`);
  const n = rows[0]?.framework?.name || "(no framework artifact)";
  nameCache.set(id, n);
  return n;
}

/** The merge under test: BOTH phrasings, higher similarity per record wins. */
function merge(rawHits, readingHits) {
  const m = new Map();
  const absorb = (rows, from) => {
    for (const r of rows) {
      const prev = m.get(r.id);
      if (!prev || r.similarity > prev.similarity) m.set(r.id, { ...r, from });
    }
  };
  absorb(rawHits, "raw");
  absorb(readingHits, "reading");
  return [...m.values()].sort((a, b) => b.similarity - a.similarity).slice(0, MATCH_COUNT);
}

const f3 = (n) => (typeof n === "number" ? n.toFixed(3) : "—");

// ─── the cases ──────────────────────────────────────────────────────────────
const CASES = [
  {
    label: "⭐ KEY — bubbled panel (beginner)",
    q: "the panel looks bubbled along one edge",
    expect: "clears — the library holds two delamination frameworks",
    rephrase: true,
  },
  {
    label: "bubbled panel + changeover (beginner)",
    q: "the panel looks bubbled along one edge and we just changed over the profile",
    expect: "clears",
    rephrase: true,
  },
  {
    label: "laminator sounds different (beginner)",
    q: "the laminator sounds different than it did this morning",
    expect: "clears — Richard Jenkins' laminator framework",
    rephrase: true,
  },
  {
    label: "CONTROL — expert phrasing, NO rephrase (this is /retrieve)",
    q: "We had a delamination escape right after a profile changeover on the Little Rock line — should we release the next run before the bond-strength inspection clears?",
    expect: "unchanged, ~0.823",
    rephrase: false,
  },
  {
    label: "FAIL-OPEN — rephrase unavailable, raw words only",
    q: "the panel looks bubbled along one edge",
    expect: "still runs, still returns the raw-words result (never blocks)",
    rephrase: true,
    forceNoVocab: true,
  },
  {
    label: "GAP — genuinely uncovered beginner question",
    q: "how do I change my direct deposit and who signs my timesheet",
    expect: "NOTHING clears — must still flag a gap",
    rephrase: true,
  },
];

const summary = [];

for (const c of CASES) {
  console.log("");
  console.log("═".repeat(78));
  console.log(c.label);
  console.log(`  typed:  "${c.q}"`);
  console.log(`  expect: ${c.expect}`);

  const rawHits = await search(c.q);
  const rawTop = rawHits[0]?.similarity ?? null;
  console.log(`  raw words        → top ${f3(rawTop)}${rawTop >= THRESHOLD ? "  ✅ clears" : "  ✗ under"}`);

  let readingHits = [];
  let t = null;
  if (c.rephrase) {
    t = await translate(c.q, c.forceNoVocab ? [] : vocabulary);
    if (t.reading) {
      console.log(`  reading          → "${t.reading}"`);
      console.log(`  terms            → ${t.terms.join(" · ") || "(none)"}   confident=${t.confident}`);
      readingHits = await search(t.reading);
      const rTop = readingHits[0]?.similarity ?? null;
      console.log(`  reading search   → top ${f3(rTop)}${rTop >= THRESHOLD ? "  ✅ clears" : "  ✗ under"}`);
    } else {
      console.log(`  reading          → none (${t.why}) — FAIL-OPEN to the raw words`);
    }
  }

  const merged = merge(rawHits, readingHits);
  const strong = merged.filter((m) => m.similarity >= THRESHOLD);
  console.log(`  MERGED           → ${strong.length} result(s) at or above ${THRESHOLD}`);
  for (const s of strong) {
    console.log(`      ${f3(s.similarity)}  [${s.from}]  ${await nameOf(s.id)}`);
  }
  if (strong.length === 0) {
    console.log(`      nothing clears — near miss ${f3(merged[0]?.similarity)} → honest gap state`);
  }

  summary.push({
    case: c.label,
    raw: f3(rawTop),
    reading: t?.reading ? f3(readingHits[0]?.similarity) : "—",
    merged: f3(merged[0]?.similarity),
    cleared: strong.length,
  });
}

console.log("");
console.log("═".repeat(78));
console.log("SUMMARY — threshold NEVER moved; only the query got better");
console.table(summary);
console.log("");
console.log("Reminder: this closes the NUMBERS, not the UI beat. Brian clicks the");
console.log("deployed /floor-guide as devin.cross to close that.");
