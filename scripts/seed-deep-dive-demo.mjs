// FLOOR GUIDE / PHASE C — the AWIP demo seed.
//
// Creates ONE deep-dive ask: Chuck Milner (Little Rock Plant Mgr, org admin)
// asks Devin Cross (Multi-Function Operator, contributor, Floor Guide seat)
// how he decides the line can release after a profile changeover — anchored
// on Dana Whitfield's "The No-Release Gate", the codified side of the demo's
// spine conflict.
//
// ⭐ DELIBERATELY DOES NOT SEED AN ANSWER. Answering IS the demo beat (the
// disclosure above the box, the answer, the two lenses appearing) and it is
// also the browser-verify beat — a seeded answer would close the loop on
// paper while the live path stayed unclicked, which is the exact pattern
// MASTER-STATE says to kill. Brian answers as devin.cross in the browser.
//
// Idempotent: re-running finds the existing ask and re-arms it (puts Devin
// back on the target list) instead of creating a second one.
//
// Usage (PowerShell, from the repo root):
//   node scripts/seed-deep-dive-demo.mjs
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import path from "node:path";

const envRaw = await readFile(path.join(process.cwd(), ".env.local"), "utf-8");
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TOPIC =
  "After a profile changeover finishes on the Little Rock line, how do you decide the next run can release?";

const die = (msg) => {
  console.error(`❌ ${msg}`);
  process.exit(1);
};

// ── The cast ──
const { data: chuckAuth } = await service.auth.admin.listUsers({ perPage: 1000 });
const findByEmail = (email) =>
  (chuckAuth?.users ?? []).find((u) => u.email?.toLowerCase() === email) ?? null;
const chuck = findByEmail("chuck.milner@awip-demo.example");
const devin = findByEmail("devin.cross@awip-demo.example");
if (!chuck) die("chuck.milner@awip-demo.example not found — is this the AWIP demo project?");
if (!devin) die("devin.cross@awip-demo.example not found — run the Floor Guide demo seed first.");

const { data: chuckProfile } = await service
  .from("profiles")
  .select("id, org_id, is_org_admin, display_name")
  .eq("id", chuck.id)
  .maybeSingle();
if (!chuckProfile?.org_id) die("Chuck Milner has no org.");
if (!chuckProfile.is_org_admin) {
  console.warn(
    "⚠️ chuck.milner is not an org admin — the ask will seed, but he cannot create one live in the demo."
  );
}
const { data: devinProfile } = await service
  .from("profiles")
  .select("id, org_id, role, deactivated_at")
  .eq("id", devin.id)
  .maybeSingle();
if (devinProfile?.org_id !== chuckProfile.org_id) die("Devin and Chuck are not in the same org.");
if (devinProfile?.role !== "contributor") die(`Devin's role is '${devinProfile?.role}', expected contributor.`);

// ── The anchor: Dana Whitfield's "The No-Release Gate" (fall back to any
//    release/delamination framework so a re-seeded org still works). ──
const { data: candidates } = await service
  .from("pattern_records")
  .select("id, framework, user_id")
  .eq("org_id", chuckProfile.org_id)
  .eq("status", "complete")
  .not("framework", "is", null);
const anchor =
  (candidates ?? []).find((r) => (r.framework?.name ?? "").toLowerCase().includes("no-release gate")) ??
  (candidates ?? []).find((r) => {
    const n = (r.framework?.name ?? "").toLowerCase();
    return n.includes("release") || n.includes("delam");
  }) ??
  null;
if (!anchor) die("No release/delamination framework found to anchor — check the AWIP reseed.");
console.log(`· anchor: "${anchor.framework.name}" (${anchor.id})`);

// ── Idempotence: one demo ask, re-armed on re-run. ──
const { data: existing } = await service
  .from("deep_dive_requests")
  .select("id, targets, status")
  .eq("org_id", chuckProfile.org_id)
  .eq("topic", TOPIC)
  .maybeSingle();

if (existing) {
  const targets = existing.targets.includes(devin.id)
    ? existing.targets
    : [...existing.targets, devin.id];
  // Re-arming deletes Devin's prior answer so the demo beat can run again.
  await service
    .from("deep_dive_responses")
    .delete()
    .eq("request_id", existing.id)
    .eq("user_id", devin.id);
  const { error } = await service
    .from("deep_dive_requests")
    .update({ targets, status: "open" })
    .eq("id", existing.id);
  if (error) die(`could not re-arm the existing ask: ${error.message}`);
  console.log(`✅ Re-armed the existing demo ask (${existing.id}) — Devin is back on the target list.`);
} else {
  const { data: created, error } = await service
    .from("deep_dive_requests")
    .insert({
      org_id: chuckProfile.org_id,
      created_by: chuck.id,
      topic: TOPIC,
      anchor_record_id: anchor.id,
      targets: [devin.id],
      sent_to_count: 1,
      status: "open",
    })
    .select("id")
    .single();
  if (error || !created) die(`could not create the ask: ${error?.message ?? "no row"}`);
  console.log(`✅ Created the demo ask (${created.id}).`);
}

console.log(`
Next, live in the browser (this IS the demo beat — do not script it):
  1. Sign in as devin.cross@awip-demo.example → the "deep dive for you" banner
     and badge are up. Open it. THE DISCLOSURE IS ABOVE THE BOX — that's beat one.
  2. Answer in Devin's voice, e.g.:
     "If the changeover was just a profile swap I run the first panel, do a peel
      check on the edge, and if it looks clean I let the next run go instead of
      waiting on the full bond-strength results. Waiting the full hold on a
      profile-only swap kills the shift's numbers and the peel check has never
      lied to me yet."
  3. Sign in as chuck.milner → /deep-dives shows the answer with BOTH lenses:
     diverges from "The No-Release Gate" (the specific difference named) AND,
     if it clears the bar, a candidate in the ideas queue. Route it to training.
`);
