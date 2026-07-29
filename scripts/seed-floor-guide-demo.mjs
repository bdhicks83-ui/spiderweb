// FLOOR GUIDE / PHASE A — THE DEMO SEAT.
//
// Adds ONE new person to the AWIP demo org: a genuinely new hire, set up as a
// CONTRIBUTOR with FLOOR GUIDE switched on. That is the whole demo beat — the
// nervous day-two operator who gets the team's judgment on his first shift, in a
// place his plant manager cannot see.
//
// ⭐ WHY A NEW SEAT RATHER THAN FLIPPING AN EXISTING ONE. Every one of the 15
// AWIP people already owns captured judgment, conflicts, or win-column mentions.
// Moving one of them to 'contributor' would leave them owning canonical
// frameworks they are no longer allowed to create — a legal state (their history
// stays; the integrity guard only blocks NEW judgment) but a confusing thing to
// explain on camera. A new hire is also just the truer story: he has nothing
// captured because he started on Monday.
//
// He REPORTS TO CHUCK MILNER on purpose. Chuck is the seat the walkthrough logs
// into, which makes the privacy proof demonstrable rather than asserted: Devin
// asks Floor Guide something, and Chuck — his own manager, an org admin, on the
// same account — has no surface anywhere that shows it.
//
// ⚠️ ADDITIVE ONLY. No deletes, no updates to anybody else, no content changes.
// It touches exactly one auth user and one profile row.
// 🛑 NEVER touches bdhicks83+test1@gmail.com. It is not referenced here at all.
//
// Run the migration FIRST (supabase/floorguide-a-contributor-tier.sql) — without
// it, role='contributor' violates profiles_role_check and this script fails
// loudly, which is the correct outcome rather than a silent 'member'.
//
// Usage (PowerShell, from the repo root):
//   node scripts/seed-floor-guide-demo.mjs
//   node scripts/verify-floor-guide.mjs
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
const DEMO_PASSWORD = "Demo-AWIP-2026!";

// The new hire. Name deliberately distinct from all 15 seeded AWIP names AND
// from the free-text entity names used by the Win Column ("Marcus Webb") and the
// coaching watch ("Tyler Brooks") — a collision there would attach him to
// somebody else's storyline through normalizePersonKey().
const NEW_HIRE = {
  email: "devin.cross@awip-demo.example",
  name: "Devin Cross",
  title: "Multi-Function Operator (new) — Little Rock",
  persona: "sr_manager", // profiles.persona vocabulary (P-0.5); affects register only
  role: "contributor",
  managerEmail: "chuck.milner@awip-demo.example",
};

async function findUserByEmail(email) {
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const found = data.users.find((u) => u.email === email);
    if (found) return found;
    if (data.users.length < 200) return null;
    page++;
  }
}

async function waitForProfile(userId) {
  for (let i = 0; i < 12; i++) {
    const { data } = await supabase.from("profiles").select("id").eq("id", userId).maybeSingle();
    if (data) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`profiles row never appeared for user ${userId}`);
}

// ─── Guard: the org must exist and be the demo org we think it is ───────────
const { data: org, error: orgError } = await supabase
  .from("orgs")
  .select("id, name, is_demo")
  .eq("id", DEMO_ORG_ID)
  .maybeSingle();
if (orgError) throw new Error(`could not read the demo org: ${orgError.message}`);
if (!org) {
  throw new Error(
    `demo org ${DEMO_ORG_ID} not found — run scripts/seed-awip-demo.mjs first, or fix DEMO_ORG_ID.`
  );
}
console.log(`org: ${org.name}`);

// ─── The manager (so the privacy proof has a real reporting line) ───────────
const mgrUser = await findUserByEmail(NEW_HIRE.managerEmail);
let managerId = null;
if (mgrUser) {
  const { data: mgrProfile } = await supabase
    .from("profiles")
    .select("id, org_id, display_name, role")
    .eq("id", mgrUser.id)
    .maybeSingle();
  if (mgrProfile && mgrProfile.org_id === DEMO_ORG_ID) {
    managerId = mgrProfile.id;
    console.log(`manager: ${mgrProfile.display_name} (${mgrProfile.role})`);
  }
}
if (!managerId) {
  // Not fatal — the seat is still useful, the demo just loses the "his own
  // manager can't see it" line. Say so rather than shipping a quiet half-seed.
  console.warn(
    `⚠️  ${NEW_HIRE.managerEmail} not found in the demo org — creating the seat with NO manager. ` +
      `The privacy beat is weaker without a reporting line; re-run after the AWIP seed if this is unexpected.`
  );
}

// ─── Find or create the auth user ──────────────────────────────────────────
let user = await findUserByEmail(NEW_HIRE.email);
if (user) {
  console.log(`auth user exists: ${NEW_HIRE.email}`);
} else {
  const { data, error } = await supabase.auth.admin.createUser({
    email: NEW_HIRE.email,
    password: DEMO_PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser failed: ${error.message}`);
  user = data.user;
  console.log(`auth user created: ${NEW_HIRE.email}`);
}
await waitForProfile(user.id);

// ─── The profile. Floor Guide ON, contributor, in the demo org ─────────────
const nowIso = new Date().toISOString();
const { error: updateError } = await supabase
  .from("profiles")
  .update({
    org_id: DEMO_ORG_ID,
    display_name: NEW_HIRE.name,
    claimed_title: NEW_HIRE.title,
    role: NEW_HIRE.role,
    persona: NEW_HIRE.persona,
    manager_id: managerId,
    is_org_admin: false,
    deactivated_at: null,
    deactivated_by: null,
    floor_guide_active: true,
    // Backdated a few days so the admin console reads "3 days in" rather than
    // "started today" — a brand-new stamp makes the onboarding view look like it
    // has nothing to say.
    floor_guide_started_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    floor_guide_activated_by: managerId,
    updated_at: nowIso,
  })
  .eq("id", user.id);

if (updateError) {
  // The most likely failure is profiles_role_check — i.e. the migration has not
  // been run. Say that out loud instead of leaving a 'member' seat behind.
  throw new Error(
    `profile update failed: ${updateError.message}\n` +
      `If this mentions profiles_role_check or floor_guide_active, run ` +
      `supabase/floorguide-a-contributor-tier.sql in the Supabase SQL editor first.`
  );
}

// ─── Report what actually landed, read back from the DB ─────────────────────
const { data: check } = await supabase
  .from("profiles")
  .select("display_name, claimed_title, role, floor_guide_active, floor_guide_started_at, manager_id")
  .eq("id", user.id)
  .maybeSingle();

console.log("\n─── seeded ─────────────────────────────────────────────");
console.log(`  ${check.display_name} — ${check.claimed_title}`);
console.log(`  role: ${check.role}`);
console.log(`  floor guide: ${check.floor_guide_active ? "ON" : "off"} (since ${check.floor_guide_started_at})`);
console.log(`  reports to: ${check.manager_id ?? "nobody"}`);
console.log(`  login: ${NEW_HIRE.email} / ${DEMO_PASSWORD}`);
console.log("────────────────────────────────────────────────────────");
console.log("\nNext: node scripts/verify-floor-guide.mjs");
