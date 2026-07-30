// FLOOR GUIDE / PHASE B — DEMO SEED.
//
// Puts ONE explicit candidate insight in the AWIP demo org's queue, from the
// contributor Phase A created (Devin Cross), so the walkthrough has something to
// promote on camera instead of somebody having to type a paragraph live.
//
// ⭐ WHY EXPLICIT AND NOT PASSIVE. A seeded passive candidate would be a lie in
// the demo: it would carry a confidence score no detector produced, and the beat
// Brian is showing is "somebody chose to tell us." The passive path is real and is
// proven by scripts/verify-floor-guide-b.mjs; it does not need to be faked here.
//
// ⭐ WHY THE IDEA IS ABOUT SOMETHING THE LIBRARY DOESN'T COVER. If the seeded
// idea duplicated an existing framework, promoting it would put a second copy of
// the same judgment in the library — and an admin watching the demo would be
// right to think the queue doesn't check. It is deliberately adjacent: the same
// laminator, a different moment.
//
// 🛑 NEVER TOUCHES +test1. Filters to the AWIP demo org by name and refuses to
// run if it can't find exactly one.
//
// Safe to re-run: the candidate is upserted on its de-dupe key, so a second run
// finds the existing row instead of stacking duplicates.
//
// Usage (PowerShell, from the repo root):
//   node scripts/seed-floor-guide-b-demo.mjs
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

// The idea, in the contributor's own register — short sentences, no jargon they
// wouldn't use, one concrete tell and one reason. It reads like somebody talking,
// because the queue shows it verbatim and a paragraph of polished prose would
// give the whole demo away.
const IDEA =
  "When I come back after break I put my hand flat on the outfeed table before I " +
  "run anything. If it's warmer than the infeed side the rollers have been " +
  "sitting loaded and the first two or three panels come out with a soft edge. " +
  "I run those into the offcut bin instead of the stack and nobody downstream " +
  "ever sees them. Took me about a month to work out that's what was causing " +
  "the edge rejects that only ever showed up after a break.";

const CONTEXT_NOTE = "Shared from the Floor Guide start screen";

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,;:!?]+$/g, "")
    .trim()
    .slice(0, 2000);
}

console.log("═══ FLOOR GUIDE PHASE B — DEMO SEED ═══════════════════════════\n");

// ── 1. The org. 🛑 Refuse rather than guess.
const { data: orgs, error: orgError } = await supabase
  .from("orgs")
  .select("id, name, is_demo")
  .ilike("name", "%AWIP%");
if (orgError) {
  console.error(`❌ could not read orgs: ${orgError.message}`);
  process.exit(1);
}
if (!orgs || orgs.length !== 1) {
  console.error(
    `❌ expected exactly one org matching "AWIP", found ${orgs?.length ?? 0}. ` +
      `Refusing to guess — nothing was written.`
  );
  process.exit(1);
}
const org = orgs[0];
console.log(`org: ${org.name} (${org.id})`);

// ── 2. The contributor. Phase A's seed created Devin Cross; fall back to any
//    contributor in this org rather than failing, but say which was used.
const { data: candidates, error: peopleError } = await supabase
  .from("profiles")
  .select("id, display_name, claimed_title, role, org_id")
  .eq("org_id", org.id)
  .eq("role", "contributor");
if (peopleError) {
  console.error(`❌ could not read profiles: ${peopleError.message}`);
  process.exit(1);
}
if (!candidates || candidates.length === 0) {
  console.error(
    "❌ no contributor in this org. Run scripts/seed-floor-guide-demo.mjs first — " +
      "Phase B has nobody to surface an idea."
  );
  process.exit(1);
}
const person =
  candidates.find((p) => (p.display_name ?? "").toLowerCase().includes("devin")) ?? candidates[0];
console.log(`contributor: ${person.display_name} — ${person.claimed_title ?? "no title"}`);

// ── 3. The candidate.
const inputNorm = normalize(IDEA);
const { data: existing } = await supabase
  .from("candidate_insights")
  .select("id, status, created_at")
  .eq("org_id", org.id)
  .eq("user_id", person.id)
  .eq("input_norm", inputNorm)
  .maybeSingle();

if (existing) {
  console.log(
    `\n✅ already seeded (${existing.id}, status '${existing.status}'). Nothing changed.`
  );
  if (existing.status !== "new") {
    console.log(
      `   ⚠️ it has already been acted on. To re-run the demo beat, set its status back:\n` +
        `   update candidate_insights set status='new', acted_by=null, acted_at=null,\n` +
        `     promoted_record_id=null, notified_at=now(), seen_at=null where id='${existing.id}';`
    );
  }
} else {
  const { data: created, error: insertError } = await supabase
    .from("candidate_insights")
    .insert({
      org_id: org.id,
      user_id: person.id,
      source: "explicit",
      surface: "floor_guide",
      raw_input: IDEA,
      context_note: CONTEXT_NOTE,
      detector: "contributor-explicit-v1",
      status: "new",
      // Stamped so the contributor's badge is already lit when Brian logs in as
      // Devin — the "somebody is looking at your idea" beat needs no clicking.
      notified_at: new Date().toISOString(),
      input_norm: inputNorm,
    })
    .select("id")
    .single();
  if (insertError || !created) {
    console.error(`❌ insert failed: ${insertError?.message ?? "no row returned"}`);
    process.exit(1);
  }
  console.log(`\n✅ seeded candidate ${created.id}`);
}

// ── 4. Say what the demo beat is, so nobody has to reconstruct it.
console.log("\nThe beat:");
console.log("  1. Log in as the contributor → the nav badge reads \"1 idea moving\"");
console.log("     /insights/mine shows \"Your idea's with your leadership team.\"");
console.log("  2. Log in as an org admin → dashboard tile \"💡 Ideas from the floor\"");
console.log("     /insights shows it as \"Shared directly\" (the warmer card)");
console.log("  3. Make it a Framework → it appears in /library with");
console.log("     \"Surfaced by " + (person.display_name ?? "them") + " · codified with <you>\"");
console.log("  4. Back as the contributor → \"That's in the playbook now.\"");
console.log("  5. /win-column shows " + (person.display_name ?? "them") + " credited\n");
console.log("⚠️ After promoting: node scripts/backfill-pattern-embeddings.mjs");
console.log("   then node scripts/verify-p3.mjs — embedding on the codify path is unreliable.\n");
