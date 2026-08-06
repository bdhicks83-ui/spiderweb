// ═══════════════════════════════════════════════════════════════════════════
// AWIP LEADERSHIP SEATS (2026-08-05) — verify + create + set passwords
// Run from PowerShell (needs .env.local + service role — live network):
//   node scripts/setup-awip-leadership-seats.mjs
//
// WHAT IT DOES (idempotent — safe to re-run):
//   1. VERIFIES the two existing pinned seats by exact email
//      (brian.montes@ / joe.paparella@awip-demo.example) and prints their
//      profile state. Loudly distinguishes brian.ng@ — a different person.
//   2. CREATES the Greg Lusty seat if absent:
//      greg.lusty@awip-demo.example · password AWIP2026 · AWIP demo org ·
//      "Greg Lusty" · President · persona 'exec' · role 'manager' ·
//      is_org_admin FALSE. (Role mirrors Joe's President seat from
//      seed-awip-demo.mjs; the onboarding track comes from the email pin,
//      not the role.)
//   3. SETS Montes' and Paparella's passwords to exactly AWIP2026 (the login
//      alias shim uppercases whatever is typed, so any casing works live).
//   4. ASSERTS none of the three seats has ANY onboarding_progress row, so
//      the forced click-through fires naturally on next login. Run
//      supabase/awip-leadership-track.sql FIRST (constraint + row deletes) —
//      this script only reports leftovers, it does not delete.
//
// 🛑 NEVER touches bdhicks83+test1@gmail.com (or anything else) — the only
// writes are: createUser(greg), greg's profile row, two password updates.
// ═══════════════════════════════════════════════════════════════════════════
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
const SEAT_PASSWORD = "AWIP2026"; // exact — the login shim uppercases input

const MONTES = "brian.montes@awip-demo.example";
const JOE = "joe.paparella@awip-demo.example";
const GREG = "greg.lusty@awip-demo.example";
const NG = "brian.ng@awip-demo.example"; // ⚠️ different Brian — read-only here

let failures = 0;
const fail = (msg) => {
  failures++;
  console.log(`  ✗ ${msg}`);
};
const ok = (msg) => console.log(`  ✓ ${msg}`);

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

async function profileOf(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, org_id, display_name, claimed_title, role, persona, is_org_admin, manager_id, deactivated_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(`profile read failed: ${error.message}`);
  return data;
}

async function waitForProfile(userId) {
  for (let i = 0; i < 12; i++) {
    const { data } = await supabase.from("profiles").select("id").eq("id", userId).maybeSingle();
    if (data) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`profiles row never appeared for user ${userId}`);
}

async function progressRows(userId) {
  const { data, error } = await supabase
    .from("onboarding_progress")
    .select("track, steps_done, completed_at")
    .eq("user_id", userId);
  if (error) throw new Error(`onboarding_progress read failed: ${error.message}`);
  return data ?? [];
}

// ── 1. Verify the two existing seats ─────────────────────────────────────────
console.log("─── 1. Existing pinned seats ───");
const montes = await findUserByEmail(MONTES);
const joe = await findUserByEmail(JOE);
if (!montes) fail(`${MONTES} NOT FOUND in auth — wrong project?`);
else ok(`${MONTES} exists (${montes.id})`);
if (!joe) fail(`${JOE} NOT FOUND in auth — wrong project?`);
else ok(`${JOE} exists (${joe.id})`);
const ng = await findUserByEmail(NG);
if (ng && montes && ng.id === montes.id) fail("brian.ng and brian.montes resolve to the SAME user — stop.");
else if (ng) ok(`${NG} is a separate user (${ng.id}) — untouched by this script`);

for (const [label, user] of [["Montes", montes], ["Paparella", joe]]) {
  if (!user) continue;
  const p = await profileOf(user.id);
  if (!p) { fail(`${label}: no profiles row`); continue; }
  if (p.org_id !== DEMO_ORG_ID) fail(`${label}: org_id ${p.org_id} ≠ AWIP demo org`);
  else ok(`${label}: in AWIP demo org · role=${p.role} · persona=${p.persona} · is_org_admin=${p.is_org_admin}`);
}

// ── 2. Greg Lusty ────────────────────────────────────────────────────────────
console.log("\n─── 2. Greg Lusty seat ───");
let greg = await findUserByEmail(GREG);
if (greg) {
  ok(`${GREG} already exists (${greg.id}) — not recreated`);
} else {
  const { data, error } = await supabase.auth.admin.createUser({
    email: GREG,
    password: SEAT_PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser(${GREG}) failed: ${error.message}`);
  greg = data.user;
  ok(`created ${GREG} (${greg.id}) · password ${SEAT_PASSWORD}`);
}
await waitForProfile(greg.id);
{
  const { error } = await supabase
    .from("profiles")
    .update({
      org_id: DEMO_ORG_ID,
      display_name: "Greg Lusty",
      claimed_title: "President",
      persona: "exec",
      role: "manager",
      is_org_admin: false,
      manager_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", greg.id);
  if (error) throw new Error(`Greg profile update failed: ${error.message}`);
  const p = await profileOf(greg.id);
  if (p.is_org_admin) fail("Greg is org admin — must NOT be");
  else ok(`profile set: "Greg Lusty" · President · persona=exec · role=manager · is_org_admin=false`);
}

// ── 3. Passwords for the two existing seats ──────────────────────────────────
console.log("\n─── 3. Passwords → AWIP2026 ───");
for (const [label, user] of [["Montes", montes], ["Paparella", joe]]) {
  if (!user) continue;
  const { error } = await supabase.auth.admin.updateUserById(user.id, {
    password: SEAT_PASSWORD,
  });
  if (error) fail(`${label} password update failed: ${error.message}`);
  else ok(`${label} password set to ${SEAT_PASSWORD}`);
}

// ── 4. Onboarding must fire naturally ────────────────────────────────────────
console.log("\n─── 4. onboarding_progress (expect ZERO rows each) ───");
for (const [label, user] of [["Montes", montes], ["Paparella", joe], ["Lusty", greg]]) {
  if (!user) continue;
  const rows = await progressRows(user.id);
  if (rows.length === 0) ok(`${label}: no rows — /welcome will fire on next login`);
  else
    fail(
      `${label}: ${rows.length} row(s) present [${rows
        .map((r) => `${r.track}:${r.steps_done}${r.completed_at ? "✓" : ""}`)
        .join(", ")}] — run supabase/awip-leadership-track.sql (Montes/Joe) or investigate (Greg should never have one)`
    );
}

console.log(
  failures === 0
    ? "\n✅ ALL CHECKS PASSED — login as Brian / Joe / Greg with any-casing awip2026."
    : `\n❌ ${failures} check(s) failed — see ✗ lines above.`
);
process.exit(failures === 0 ? 0 : 1);
