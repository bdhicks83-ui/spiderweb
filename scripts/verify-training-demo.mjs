// VERIFY — the built-out training demo (read-only, exits 1 on failure).
//
// The DONE test for seed-awip-training-demo.mjs:
//   1. The four seeded source frameworks exist, complete, and EMBEDDED.
//   2. Each storyline's supervisor problem RETRIEVES its source frameworks
//      above the 0.75 bar via the Studio's own org-pinned RPC — i.e. typing
//      the problem live would ground against the right experts.
//   3. All four storyline requests exist at status='generated' with a COMPLETE
//      three-altitude training and ⭐ routing targets carrying reasons.
//   4. The two spine conflicts (Ng × Whitfield, Harrell × Montes) are OPEN —
//      storylines 1 & 3 teach a real, flagged disagreement.
//
// Uses the SERVICE ROLE key (bypasses RLS) — fine here because every check is
// org-pinned via search_pattern_records_by_query_for_org / .eq("org_id"),
// not the cross-org verify-p3 shape. Touches nothing; reads only.
// 🛑 Never touches bdhicks83+test1@gmail.com or its insight web.
//
// Usage (PowerShell, from the repo root):
//   node scripts/verify-training-demo.mjs
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

const DEMO_ORG_ID = "0722f2f8-ecff-4ae3-81ea-1350454e9d54";
const CREATED_VIA = "seed-awip-training-demo";
const THRESHOLD = 0.75;
const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const MODEL = "voyage-large-2";

const NEW_FRAMEWORK_NAMES = [
  "The Full Re-Qual, No Skipped Steps",
  "The Lot Doesn't Tell You. The Log Does.",
  "The Compliance Intake Gate",
  "One First Week, Every Plant",
];

// storyline slug → { query: the supervisor's typed problem, expectAny: source framework names }
const RETRIEVAL_CASES = [
  {
    slug: "delam-release",
    query:
      "We've had two delamination escapes in the last month, both right after a profile changeover. The newer operators are releasing the next run before the bond-strength check clears because the line looks fine.",
    expectAny: ["The Controlled Restart Release", "The No-Release Gate"],
  },
  {
    slug: "coil-requal",
    query:
      "Maintenance keeps re-qualifying the laminator after a coil-lot change but skipping the re-check on the nip roller pressure. The 10th time is a scrap run.",
    expectAny: ["The Full Re-Qual, No Skipped Steps", "The Lot Doesn't Tell You. The Log Does."],
  },
  {
    slug: "custom-promise",
    query:
      "A rep promised a customer a custom panel profile with a two-week lead time and ops can't hit it. My newer reps don't know which custom requests are safe to promise and which need an ops check first.",
    expectAny: ["Custom Profile: Promise It or Walk", "Capacity Reality First"],
  },
  {
    slug: "compliance-intake",
    query:
      "Every new hire's first-week paperwork gets held up because the HR generalists each do the I-9 and E-Verify step slightly differently and something's always missing. I need everyone doing the compliance intake the same correct way.",
    expectAny: ["The Compliance Intake Gate", "One First Week, Every Plant"],
  },
];

// The two OPEN conflicts storylines 1 & 3 teach the boundary of.
const CONFLICT_PAIRS = [
  ["The No-Release Gate", "The Controlled Restart Release"],
  ["Custom Profile: Promise It or Walk", "Capacity Reality First"],
];

let failures = 0;
const fail = (msg) => {
  failures++;
  console.error(`  ✗ ${msg}`);
};
const pass = (msg) => console.log(`  ✓ ${msg}`);

async function embedQuery(text) {
  const res = await fetch(VOYAGE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({ input: [text], model: MODEL, input_type: "query" }),
  });
  if (!res.ok) throw new Error(`Voyage ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return `[${json.data[0].embedding.join(",")}]`;
}

async function main() {
  console.log(`═══ VERIFY: training demo ═══`);

  // ── 1. The four seeded frameworks — present + embedded ───────────────────
  console.log(`\n─── 1. Source frameworks ───`);
  const { data: recs, error: recErr } = await supabase
    .from("pattern_records")
    .select("id, framework, status, embedding, user_id")
    .eq("org_id", DEMO_ORG_ID)
    .eq("status", "complete");
  if (recErr) throw new Error(`pattern_records read: ${recErr.message}`);
  const byName = new Map((recs || []).map((r) => [r.framework?.name, r]));
  for (const name of NEW_FRAMEWORK_NAMES) {
    const r = byName.get(name);
    if (!r) fail(`"${name}" missing — run seed-awip-training-demo.mjs`);
    else if (!r.embedding) fail(`"${name}" UNEMBEDDED — run backfill-pattern-embeddings.mjs`);
    else pass(`"${name}" present + embedded`);
  }

  // ── 2. Retrieval: the supervisor's words find the right experts ──────────
  console.log(`\n─── 2. Retrieval (org-pinned RPC, ${THRESHOLD} bar) ───`);
  for (const c of RETRIEVAL_CASES) {
    const vector = await embedQuery(c.query);
    const { data: matches, error } = await supabase.rpc(
      "search_pattern_records_by_query_for_org",
      { target_org: DEMO_ORG_ID, query_embedding: vector, match_count: 5 }
    );
    if (error) {
      fail(`${c.slug}: RPC error ${error.message}`);
      continue;
    }
    const above = (matches || []).filter((m) => m.similarity >= THRESHOLD);
    const aboveNames = above.map(
      (m) => (recs || []).find((r) => r.id === m.id)?.framework?.name ?? "(?)"
    );
    const hits = c.expectAny.filter((n) => aboveNames.includes(n));
    const top = (matches || [])[0];
    if (hits.length > 0) {
      pass(
        `${c.slug}: ${hits.map((h) => `"${h}"`).join(", ")} above bar (top ${
          top ? Math.round(top.similarity * 1000) / 1000 : "?"
        })`
      );
    } else {
      fail(
        `${c.slug}: none of ${c.expectAny.join(" / ")} above ${THRESHOLD} — got [${aboveNames.join(
          ", "
        )}], top ${top ? Math.round(top.similarity * 1000) / 1000 : "none"}`
      );
    }
  }

  // ── 3. The four storyline requests — generated, complete, routed ─────────
  console.log(`\n─── 3. Storyline requests ───`);
  const { data: reqs, error: reqErr } = await supabase
    .from("training_requests")
    .select(
      "id, issue_text, status, current_training_id, routing_targets, recommendations, chosen_format, requested_by"
    )
    .eq("org_id", DEMO_ORG_ID)
    .eq("created_via", CREATED_VIA);
  if (reqErr) throw new Error(`training_requests read: ${reqErr.message}`);
  if ((reqs || []).length !== 4) {
    fail(`expected 4 storyline requests, found ${(reqs || []).length}`);
  } else {
    pass(`4 storyline requests present`);
  }
  for (const r of reqs || []) {
    const label = r.issue_text.slice(0, 50) + "…";
    if (r.status !== "generated") fail(`"${label}": status ${r.status}, expected generated`);
    if (!r.current_training_id) {
      fail(`"${label}": no current_training_id`);
      continue;
    }
    const { data: tr } = await supabase
      .from("prescription_trainings")
      .select("altitudes, title")
      .eq("id", r.current_training_id)
      .maybeSingle();
    const a = tr?.altitudes || {};
    const complete = !!(a.floor?.body && a.supervisor?.body && a.exec?.body);
    if (!complete) fail(`"${label}": altitudes incomplete`);
    else if (a.floor.body.length < 1500)
      fail(`"${label}": floor body thin (${a.floor.body.length} chars) — not the approved depth`);
    else pass(`"${tr.title}": 3 altitudes, floor ${a.floor.body.length} chars`);

    const targets = Array.isArray(r.routing_targets) ? r.routing_targets : [];
    if (targets.length < 2) fail(`"${label}": ${targets.length} routing target(s), expected ≥2`);
    else if (targets.some((t) => !t.reason || t.reason.length < 20))
      fail(`"${label}": a routing target is missing its reason`);
    else
      pass(
        `  ⭐ who-else: ${targets
          .map((t) => (t.kind === "role" ? `[role] ${t.label}` : t.label))
          .join(" · ")}`
      );
  }

  // ── 4. The two boundary conflicts are OPEN ───────────────────────────────
  console.log(`\n─── 4. Boundary conflicts (storylines 1 & 3) ───`);
  for (const [nameA, nameB] of CONFLICT_PAIRS) {
    const a = byName.get(nameA);
    const b = byName.get(nameB);
    if (!a || !b) {
      fail(`conflict pair records missing: ${nameA} / ${nameB}`);
      continue;
    }
    const [lo, hi] = a.id < b.id ? [a, b] : [b, a];
    const { data: conf } = await supabase
      .from("framework_conflicts")
      .select("id, status")
      .eq("org_id", DEMO_ORG_ID)
      .eq("record_a_id", lo.id)
      .eq("record_b_id", hi.id)
      .maybeSingle();
    if (!conf) fail(`no conflict row for "${nameA}" × "${nameB}" — run seed-awip-conflicts.mjs`);
    else if (conf.status !== "open") fail(`"${nameA}" × "${nameB}" is ${conf.status}, expected open`);
    else pass(`OPEN: "${nameA}" × "${nameB}"`);
  }

  console.log(
    failures === 0
      ? `\n═══ ALL CHECKS PASSED — the four storylines are walkable. Demo as chuck.milner. ═══`
      : `\n═══ ${failures} CHECK(S) FAILED ═══`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}`);
  process.exit(1);
});
