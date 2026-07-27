// Ad-audit fix pass (live DB). Two actions, both idempotent:
//   1. Record 86f54b48 (Tom's die-changeover recurrence) is status=complete
//      with framework=null and no embedding — it renders as a hole in
//      /library and is invisible to retrieval. Run the REAL frame-pattern
//      pipeline on it (copy-don't-import harness, same as seed-p4a.mjs),
//      then embed and update.
//   2. Delete the bdhicks83+test1@gmail.com account (29 orphan sources,
//      0 insights, 0 pattern_records, 1 profile) — pure test artifact.
//
// Usage: node scripts/audit-fix.mjs
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import path from "node:path";

const envRaw = await readFile(path.join(process.cwd(), ".env.local"), "utf-8");
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const anthropic = new Anthropic();
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const NOFW_ID = "86f54b48-2d64-403f-b074-b095d5ff5826";
const TEST1_EMAIL = "bdhicks83+test1@gmail.com";

// ─── verbatim helpers from src/lib/claude.ts (copy-don't-import) ───
function firstText(content) {
  const block = content.find((b) => b.type === "text");
  return block?.text ?? "";
}
function parseJson(text) {
  try {
    return JSON.parse(text.replace(/^```json?\n?|```$/g, "").trim());
  } catch {
    return null;
  }
}
function parseJsonLoose(text) {
  const direct = parseJson(text);
  if (direct !== null) return direct;
  const stripped = text.replace(/^```json?\n?|```$/g, "").trim();
  const start = stripped.search(/[{[]/);
  if (start === -1) return null;
  const open = stripped[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < stripped.length; i++) {
    const ch = stripped[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(stripped.slice(start, i + 1)); }
        catch { return null; }
      }
    }
  }
  return null;
}
function isFrameworkArtifact(v) {
  if (!v || typeof v !== "object") return false;
  const f = v;
  const isStrArr = (x) => Array.isArray(x) && x.length > 0 && x.every((s) => typeof s === "string");
  return (
    typeof f.name === "string" &&
    typeof f.tagline === "string" &&
    isStrArr(f.when_to_apply) &&
    isStrArr(f.signals) &&
    typeof f.the_play === "string" &&
    typeof f.why_it_works === "string" &&
    isStrArr(f.boundaries)
  );
}

const frameTemplate = await readFile(path.join(process.cwd(), "prompts", "frame-pattern.md"), "utf-8");
async function framePattern(fields) {
  const prompt = frameTemplate.replaceAll("{{record}}", () => JSON.stringify(fields, null, 2));
  for (let attempt = 0; attempt < 3; attempt++) {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 3072,
      messages: [{ role: "user", content: prompt }],
    });
    const text = firstText(msg.content);
    const parsed = text ? parseJsonLoose(text) : null;
    if (isFrameworkArtifact(parsed)) return parsed;
  }
  return null;
}

async function embedDocument(text) {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({ input: [text], model: "voyage-large-2", input_type: "document" }),
  });
  if (!res.ok) throw new Error(`Voyage ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return `[${data.data[0].embedding.join(",")}]`;
}

// buildPatternEmbeddingText — verbatim mirror of src/lib/pattern-embedding.ts
function buildPatternEmbeddingText(row) {
  const parts = [];
  const push = (label, value) => {
    if (value && value.trim()) parts.push(`${label}: ${value.trim()}`);
  };
  const pushList = (label, values) => {
    if (values && values.length) parts.push(`${label}: ${values.join(" · ")}`);
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
  ].filter(Boolean).join(" · ");
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
  if (row.entity_map && row.entity_map.length) {
    const entities = row.entity_map
      .map((e) => (e.detail ? `${e.name} (${e.type}, ${e.detail})` : `${e.name} (${e.type})`))
      .join(", ");
    parts.push(`Entities: ${entities}`);
  }
  return parts.join("\n");
}

// ─── ACTION 1: frame + embed the frameworkless recurrence record ───
{
  const { data: row, error } = await supabase
    .from("pattern_records").select("*").eq("id", NOFW_ID).maybeSingle();
  if (error) throw error;
  if (!row) {
    console.log("1. Record 86f54b48: not found — skipping.");
  } else if (row.framework?.name) {
    console.log(`1. Record 86f54b48: already framed ("${row.framework.name}") — skipping frame.`);
  } else {
    const fields = {
      context_summary: row.context_summary,
      context_org_size: row.context_org_size,
      context_industry: row.context_industry,
      context_function: row.context_function,
      situation_type: row.situation_type,
      intervention_type: row.intervention_type,
      trigger_signal: row.trigger_signal,
      signal_detail: row.signal_detail,
      judgment: row.judgment,
      rationale: row.rationale,
      boundaries: row.boundaries,
      entity_map: row.entity_map,
    };
    console.log("1. Framing Tom's die-changeover recurrence record via real pipeline...");
    const framework = await framePattern(fields);
    if (!framework) throw new Error("framePattern failed after 3 attempts — record left untouched.");
    console.log(`   framed → "${framework.name}" — ${framework.tagline}`);
    const embedding = await embedDocument(buildPatternEmbeddingText({ ...row, framework }));
    const { error: upErr } = await supabase
      .from("pattern_records")
      .update({ framework, embedding, embedded_at: new Date().toISOString() })
      .eq("id", NOFW_ID);
    if (upErr) throw upErr;
    console.log("   ✓ framework + embedding written (live).");
  }
}

// ─── ACTION 2: +test1 account — DO NOT DELETE (deliberate no-op) ───
// The first run attempted this delete and the FK on connections stopped it.
// Investigation (scripts/audit-test1-deps.mjs / audit-test1-visibility.mjs)
// showed the account's 29 sources are the PARENT rows of 1,248 of the
// database's 1,272 insights — insights owned by the MAIN account
// (a7d205f0...) via insights.source_id ON DELETE CASCADE. Deleting the
// account would cascade-destroy the entire live insight web.
// The +test1 email lives only in auth; it renders on none of the ad's
// on-camera surfaces. Left in place on purpose.
console.log(`2. +test1 account (${TEST1_EMAIL}): intentionally NOT deleted — its sources parent 1,248 main-account insights.`);

console.log("\nDone.");
