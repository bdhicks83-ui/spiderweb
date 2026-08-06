// AWIP DEMO SEED — Exposure + Value Ledger (v2.60).
//
// Run AFTER:
//   • supabase/exposure-precedence-links.sql
//   • supabase/value-ledger.sql
//   • scripts/seed-awip-demo.mjs + scripts/backfill-pattern-embeddings.mjs
//
// What it does, all scoped to the AWIP demo org and nothing else:
//   1. RETRIEVAL DEMAND — a handful of learning_signals so walking-risk rows
//      can honestly say "asked N times in 90 days" during the walk.
//   2. PRECEDENCE LINKS — two 'stated' links, with the antecedent and
//      consequent DERIVED FROM THE RECORDS' OWN TEXT (never invented), plus
//      recent queries that mention each antecedent so both warnings fire.
//   3. VALUE ASSUMPTIONS — a populated row so /ledger and the readout block
//      have figures to show.
//   4. VALUE EVENTS — demo pattern_captured rows so the ledger has numbers
//      without waiting on the model. EVERY basis sentence starts with
//      "[DEMO — seeded]".
//
// 🛑 THE DEMO RATES IN STEP 3 ARE INVENTED FIGURES FOR A DEMO ORG.
// They exist so the walk has something on screen. NEVER run this against a real
// customer's org: on a real account every rate is typed by the customer, and a
// pre-filled default is exactly the failure mode the amended doctrine forbids.
// The script refuses to run against any org that is not flagged is_demo.
//
// 🛑 NEVER touches bdhicks83+test1@gmail.com or anything outside the demo org.
//
// Idempotent. Pass --force to clear this script's own rows first.
//
// Usage: node scripts/seed-exposure-ledger-demo.mjs [--force]
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import path from "node:path";

const envRaw = await readFile(path.join(process.cwd(), ".env.local"), "utf-8");
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const FORCE = process.argv.includes("--force");
const DEMO_ORG_ID = "0722f2f8-ecff-4ae3-81ea-1350454e9d54";
const DEMO_TAG = "[DEMO — seeded]";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Voyage, mirrored from src/lib/voyage.ts (the repo's copy-don't-import
// convention for one-off data ops). Antecedents embed as a QUERY — the same
// input_type the read-time matcher expects.
async function embedQuery(text) {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({ input: [text], model: "voyage-large-2", input_type: "query" }),
  });
  if (!res.ok) {
    console.warn(`  ⚠ voyage ${res.status} — link stored without a vector (lexical match still works)`);
    return null;
  }
  const data = await res.json();
  const v = data?.data?.[0]?.embedding;
  return Array.isArray(v) && v.length === 1536 ? `[${v.join(",")}]` : null;
}

function daysAgo(n) {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

/** First N words, punctuation-trimmed. Keeps the expert's own vocabulary intact. */
function phrase(text, words = 7) {
  if (!text) return null;
  const clean = String(text).replace(/\s+/g, " ").trim();
  if (!clean) return null;
  const out = clean.split(" ").slice(0, words).join(" ").replace(/[.,;:—-]+$/, "");
  return out.length >= 8 ? out.toLowerCase() : null;
}

async function main() {
  console.log("── AWIP demo seed: Exposure + Value Ledger ──\n");

  // ─── Guard: demo orgs only ───
  const { data: org } = await supabase
    .from("orgs")
    .select("id, name, is_demo")
    .eq("id", DEMO_ORG_ID)
    .maybeSingle();
  if (!org) throw new Error(`Demo org ${DEMO_ORG_ID} not found — run seed-awip-demo.mjs first.`);
  if (!org.is_demo) {
    throw new Error(
      `Org "${org.name}" is not flagged is_demo. This script seeds invented rates and refuses to run.`
    );
  }
  console.log(`Org: ${org.name}\n`);

  if (FORCE) {
    console.log("--force: clearing this script's own rows…");
    await supabase.from("precedence_links").delete().eq("org_id", DEMO_ORG_ID);
    await supabase
      .from("learning_signals")
      .delete()
      .eq("org_id", DEMO_ORG_ID)
      .like("dedupe_key", "exposure-demo:%");
    // value_events is APPEND-ONLY at the database level — the trigger refuses a
    // DELETE. That is deliberate; correcting seeded ledger rows means dropping
    // the trigger on purpose. See supabase/value-ledger.sql.
    console.log("  (value_events left alone — the table is append-only by trigger.)\n");
  }

  // ─── Records to work from ───
  const { data: recordsRaw } = await supabase
    .from("pattern_records")
    .select(
      "id, user_id, created_at, framework, trigger_signal, signal_detail, context_summary, judgment"
    )
    .eq("org_id", DEMO_ORG_ID)
    .eq("status", "complete")
    .order("created_at", { ascending: true });
  const records = recordsRaw ?? [];
  if (records.length === 0) throw new Error("No complete records in the demo org.");

  const { data: peopleRaw } = await supabase
    .from("profiles")
    .select("id, display_name, claimed_years_experience")
    .eq("org_id", DEMO_ORG_ID);
  const people = new Map((peopleRaw ?? []).map((p) => [p.id, p]));
  const nameOf = (id) => people.get(id)?.display_name ?? "A teammate";

  // ═══ 1. RETRIEVAL DEMAND ═══════════════════════════════════════════════
  // So walking-risk rows carry a real "asked N times in 90 days" clause. These
  // are ORG-level demand signals with NO actor — the walk needs the count, and
  // a seeded actor would put a name on a query nobody actually typed.
  console.log("1. Retrieval demand signals…");
  {
    // Weight demand toward the most-concentrated authors so the top rows on the
    // page are the ones with a story attached.
    const byAuthor = new Map();
    for (const r of records) byAuthor.set(r.user_id, (byAuthor.get(r.user_id) ?? 0) + 1);
    const topAuthor = [...byAuthor.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const targets = records.filter((r) => r.user_id === topAuthor).slice(0, 3);
    const spread = [2, 5, 9, 14, 21, 30, 44, 61, 75];

    let n = 0;
    for (const [i, rec] of targets.entries()) {
      const times = 9 - i * 3; // 9, 6, 3 — visibly different demand on the page
      for (let k = 0; k < times; k++) {
        const { error } = await supabase.from("learning_signals").upsert(
          {
            org_id: DEMO_ORG_ID,
            source_surface: "retrieve",
            signal_type: k % 4 === 0 ? "retrieval_result_used" : "retrieval_result_opened",
            subject_type: "pattern_record",
            subject_id: rec.id,
            verdict: k % 4 === 0 ? "positive" : "neutral",
            features: { seeded_demo: true },
            payload: { query: null },
            actor_id: null,
            actor_role: "member",
            occurred_at: daysAgo(spread[k % spread.length]),
            dedupe_key: `exposure-demo:retrieval:${rec.id}:${k}`,
            written_by: "exposure-ledger-demo-seed",
          },
          { onConflict: "dedupe_key" }
        );
        if (!error) n++;
      }
      console.log(`   · "${rec.framework?.name ?? rec.id}" — ${times} retrievals`);
    }
    console.log(`   ${n} signals written.\n`);
  }

  // ═══ 2. PRECEDENCE LINKS ═══════════════════════════════════════════════
  // ⭐ ANTECEDENT AND CONSEQUENT ARE DERIVED FROM THE RECORD'S OWN WORDS. The
  // whole value of a precedence link is that it is the expert's vocabulary, and
  // inventing one for a demo would be inventing judgment.
  console.log("2. Precedence links + the queries that fire them…");
  {
    const candidates = records
      .filter((r) => phrase(r.trigger_signal) && phrase(r.signal_detail || r.context_summary, 9))
      .slice(0, 2);

    if (candidates.length < 2) {
      console.warn(
        "   ⚠ Fewer than 2 records have both a trigger_signal and a signal_detail — " +
          "seeding what is available. Block 2 will show fewer than 2 warnings."
      );
    }

    for (const [i, rec] of candidates.entries()) {
      const antecedent = phrase(rec.trigger_signal, 7);
      const consequent = phrase(rec.signal_detail || rec.context_summary, 9);
      if (!antecedent || !consequent) continue;

      const vector = await embedQuery(antecedent);
      const { error } = await supabase.from("precedence_links").upsert(
        {
          org_id: DEMO_ORG_ID,
          antecedent_text: antecedent,
          consequent_text: consequent,
          source_pattern_id: rec.id,
          antecedent_embedding: vector,
          confidence: "stated",
          extracted_at: new Date().toISOString(),
        },
        { onConflict: "source_pattern_id,antecedent_text,consequent_text" }
      );
      if (error) {
        console.warn(`   ⚠ link insert failed: ${error.message}`);
        continue;
      }
      console.log(
        `   · "${antecedent}" → "${consequent}"  (source: ${nameOf(rec.user_id)}, "${
          rec.framework?.name ?? "a framework"
        }")`
      );

      // Three recent QUESTIONS that mention the antecedent, so the warning
      // clears the ≥2-distinct-items bar. Distinct text, so they count as three.
      const asks = [
        `What do we do when ${antecedent} shows up mid-run?`,
        `Is ${antecedent} something to stop the line for?`,
        `Who should I call about ${antecedent} on second shift?`,
      ];
      for (const [k, q] of asks.entries()) {
        await supabase.from("learning_signals").upsert(
          {
            org_id: DEMO_ORG_ID,
            source_surface: "retrieve",
            signal_type: "retrieval_result_opened",
            subject_type: "pattern_record",
            subject_id: rec.id,
            verdict: "neutral",
            features: { seeded_demo: true },
            payload: { query: q },
            actor_id: null,
            actor_role: "member",
            occurred_at: daysAgo(4 + k * 6),
            dedupe_key: `exposure-demo:precedence-query:${rec.id}:${k}`,
            written_by: "exposure-ledger-demo-seed",
          },
          { onConflict: "dedupe_key" }
        );
      }
      // Mark the source as checked so the real extractor does not re-read it and
      // add a second, differently-worded link on top of the seeded one.
      await supabase
        .from("pattern_records")
        .update({ precedence_checked_at: new Date().toISOString() })
        .eq("id", rec.id);
      void i;
    }
    console.log("");
  }

  // ═══ 3. VALUE ASSUMPTIONS ══════════════════════════════════════════════
  // 🛑 INVENTED FIGURES, DEMO ORG ONLY. See the header. On a real account every
  // one of these is typed by the customer and there is no default behind it.
  console.log("3. Value assumptions (DEMO figures)…");
  {
    const { error } = await supabase.from("value_assumptions").upsert(
      {
        org_id: DEMO_ORG_ID,
        senior_loaded_rate: 118,
        expert_interruption_rate: 145,
        expert_interruption_minutes: 25,
        instructional_design_rate: 1200,
        rework_incident_cost: 4800,
        loaded_salary_annual: 96000,
        average_ramp_weeks: 26,
        ramp_weeks_credited_per_track: 3,
        annual_departure_probability: 0.12,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id" }
    );
    if (error) throw new Error(`value_assumptions upsert failed: ${error.message}`);
    console.log("   Written. Every figure on /ledger for this org is demo data.\n");
  }

  // ═══ 4. VALUE EVENTS ═══════════════════════════════════════════════════
  // pattern_captured rows so the walk has numbers without waiting on the
  // valuation model. Hours scale with how much the record actually contains —
  // still a seeded figure, and every basis sentence says so.
  console.log("4. Demo value events…");
  {
    let n = 0;
    for (const rec of records) {
      const depth = [rec.trigger_signal, rec.signal_detail, rec.judgment, rec.context_summary]
        .filter(Boolean)
        .join(" ").length;
      const years = people.get(rec.user_id)?.claimed_years_experience ?? null;
      // Deterministic, not random: the same records always produce the same
      // demo numbers, so the walk looks the same every time.
      const hours = Math.max(8, Math.min(320, Math.round(depth / 12) + (years ?? 10) * 2));
      const scarcity = Math.min(0.95, 0.55 + Math.min(0.4, depth / 4000));

      const { error } = await supabase.from("value_events").upsert(
        {
          org_id: DEMO_ORG_ID,
          event_type: "pattern_captured",
          occurred_at: rec.created_at,
          subject_type: "pattern_record",
          subject_id: rec.id,
          contributor_id: rec.user_id,
          quantity_json: {
            reproduction_hours: hours,
            scarcity: Math.round(scarcity * 100) / 100,
            blast_radius: hours > 140 ? "high" : hours > 60 ? "medium" : "low",
            half_life_years: 7,
          },
          confidence_tier: "substitution",
          basis_sentence:
            `${DEMO_TAG} "${rec.framework?.name ?? "This framework"}" scored at ${hours} senior ` +
            `hours to rediscover from scratch. This is seeded demo data, not a model score — ` +
            `re-run the valuation scorer to replace it with a real one.`,
          // ⭐ THE SAME KEY THE REAL SCORER USES (valueDedupeKey). A later real
          // scoring run therefore cannot stack a second event on top of the
          // seeded one — and value_events is append-only, so it could never be
          // cleaned up if it did.
          dedupe_key: `pattern_captured:${rec.id}`,
        },
        // ON CONFLICT DO NOTHING — a DO UPDATE would fire the append-only
        // trigger and raise on every re-run of this script.
        { onConflict: "dedupe_key", ignoreDuplicates: true }
      );
      if (!error) n++;
    }
    console.log(`   ${n} pattern_captured events written (all tagged ${DEMO_TAG}).\n`);
  }

  console.log("── Done ──");
  console.log("Next:");
  console.log("  • /exposure  — walking risk + framework warnings");
  console.log("  • /ledger    — three tiers, editable rates");
  console.log("  • POST /api/ledger/backfill  — lays down the other five event types");
}

main().catch((err) => {
  console.error("\n✗ seed failed:", err.message);
  process.exit(1);
});
