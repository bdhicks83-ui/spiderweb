// AWIP/IMP DEMO RESEED — the whole demo org, from the approved content docs.
//
// Replaces Meridian Precision Manufacturing with All Weather Insulated Panels
// (AWIP): 15 experts, the 10 IMP frameworks VERBATIM from
// IMP-DEMO-FRAMEWORK-CONTENT.md, both OPEN conflicts, the peel-check
// prescription + escalation, one proven-effective prescription, the Marcus
// Webb win column, one open knowledge gap, and the Tyler Brooks coaching watch.
//
// ⚠️ RUN claude/AWIP-RESEED-WIPE.sql IN THE SUPABASE SQL EDITOR FIRST.
//    That block deletes the Meridian demo CONTENT (org-scoped, with a safety
//    gate on the +test1 cascade). This script only ADDS.
//
// ⭐ VERBATIM DOCTRINE — WHY THERE IS NO framePattern() MODEL CALL HERE.
// Every other seed in this repo renders each framework artifact through
// prompts/frame-pattern.md ("real pipeline, not raw inserts"). This one does
// NOT, on purpose: the handoff requires the judgment text to be inserted
// exactly as Brian approved it, and a model render paraphrases. The framework
// JSON below is composed mechanically from the doc's own sections
// (situation → when_to_apply, call → the_play, reasoning → why_it_works,
// stops-applying → boundaries), so what ships is the approved words. Flag it
// if you'd rather have model-rendered artifacts and lose verbatim fidelity.
//
// Idempotent: finds-or-creates users, skips records whose context_summary is
// already present. Pass --force to delete this script's own seeded rows first.
// NEVER touches bdhicks83+test1@gmail.com, its sources, or its insight web.
//
// Usage (PowerShell, from the repo root):
//   node scripts/seed-awip-demo.mjs
//   node scripts/seed-awip-demo.mjs --force
//
// Then, in order:
//   node scripts/backfill-pattern-embeddings.mjs
//   node scripts/seed-awip-conflicts.mjs
//   node scripts/verify-awip-demo.mjs
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import path from "node:path";

const envRaw = await readFile(path.join(process.cwd(), ".env.local"), "utf-8");
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const FORCE = process.argv.includes("--force");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DEMO_ORG_ID = "0722f2f8-ecff-4ae3-81ea-1350454e9d54";
const ORG_NAME = "All Weather Insulated Panels (AWIP) — DEMO";
const DEMO_PASSWORD = "Demo-AWIP-2026!";
const INDUSTRY = "Manufacturing";

// The 5 legacy Meridian profiles. Not deleted (auth stays intact) — just
// unhooked from the demo org so the library shows exactly the AWIP cast.
const LEGACY_PROFILE_IDS = [
  "876f3bdb-87cd-4750-886e-fc8ee5cb0a0b", // David Chen
  "7f30f60f-2984-42e9-b976-98c3cfadcbc3", // Priya Nair
  "3c3ade58-a60c-48fe-b8a4-11aa7301806c", // Tom Whitfield
  "c0c8dd9b-a311-44e0-9d71-967e1f70d5ce", // Angela Brooks
  "9af4a566-b4cf-4bd2-a025-bb032a444ad7", // Elena Ruiz
];

// ═══ THE 15 EXPERTS ════════════════════════════════════════════════════════
// persona is one of exec | technical_director | sr_manager (P-0.5 constraint).
// role is 'manager' or 'member' (P-4B). manager_id builds the chain that makes
// P-6's is_manager_of() work — Tyler Brooks reports to Chuck Milner, which is
// what puts the coaching watch on Chuck's page and nobody else's.
const EXPERTS = [
  { key: "joe",     email: "joe.paparella@awip-demo.example",   name: "Joe Paparella",   title: "President",                                    persona: "exec",                role: "manager", mgr: null },
  { key: "montes",  email: "brian.montes@awip-demo.example",    name: "Brian Montes",    title: "VP, Operations",                               persona: "exec",                role: "manager", mgr: "joe" },
  { key: "kim",     email: "kim.harrell@awip-demo.example",     name: "Kim Harrell",     title: "VP, Sales",                                    persona: "exec",                role: "manager", mgr: "joe" },
  { key: "hicks",   email: "brian.hicks@awip-demo.example",     name: "Brian Hicks",     title: "Sr. Director, HR & EHS",                       persona: "exec",                role: "manager", mgr: "joe" },
  { key: "chuck",   email: "chuck.milner@awip-demo.example",    name: "Chuck Milner",    title: "Little Rock Plant Manager",                    persona: "sr_manager",          role: "manager", mgr: "montes" },
  { key: "ng",      email: "brian.ng@awip-demo.example",        name: "Brian Ng",        title: "Panel Technical Expert / R&D",                 persona: "technical_director",  role: "member",  mgr: "montes" },
  { key: "dana",    email: "dana.whitfield@awip-demo.example",  name: "Dana Whitfield",  title: "Quality Manager, Little Rock",                 persona: "technical_director",  role: "member",  mgr: "chuck" },
  { key: "carlos",  email: "carlos.ramos@awip-demo.example",    name: "Carlos Ramos",    title: "Divisional Maintenance Manager",               persona: "sr_manager",          role: "manager", mgr: "montes" },
  { key: "zach",    email: "zach.davis@awip-demo.example",      name: "Zach Davis",      title: "Sr. Manager, EHS",                             persona: "sr_manager",          role: "member",  mgr: "hicks" },
  { key: "klaudia", email: "klaudia.donaghy@awip-demo.example", name: "Klaudia Donaghy", title: "Sr. Manager, Talent Development & Recruiting", persona: "sr_manager",          role: "member",  mgr: "hicks" },
  { key: "dial",    email: "john.dial@awip-demo.example",       name: "John Dial",       title: "Divisional Inventory Controller",              persona: "sr_manager",          role: "member",  mgr: "montes" },
  { key: "ben",     email: "ben.seger@awip-demo.example",       name: "Ben Seger",       title: "Territory Manager",                            persona: "sr_manager",          role: "member",  mgr: "kim" },
  { key: "marcus",  email: "marcus.webb@awip-demo.example",     name: "Marcus Webb",     title: "Project Manager",                              persona: "sr_manager",          role: "member",  mgr: "kim" },
  { key: "richard", email: "richard.jenkins@awip-demo.example", name: "Richard Jenkins", title: "Multi-Function Operator",                      persona: "sr_manager",          role: "member",  mgr: "chuck" },
  { key: "tyler",   email: "tyler.brooks@awip-demo.example",    name: "Tyler Brooks",    title: "Operator",                                     persona: "sr_manager",          role: "member",  mgr: "chuck" },
];

// ═══ SHARED ENTITY NAMES ═══════════════════════════════════════════════════
// The conflict detector's deterministic pre-filter is sharesEntity() ||
// sameOntologyCell() (src/lib/conflict.ts). Both conflict pairs below carry an
// IDENTICAL process entity name so they land as candidate pairs before the
// model ever judges them — that is what makes the two OPEN conflicts reliable
// rather than hopeful.
const E_POST_CHANGEOVER = "Post-changeover first-run release";
const E_QUOTE_TIME = "Custom / tight-date order at quote time";
const E_PEEL_CHECK = "First-bundle peel-check";
const E_DELAM = "Facer delamination escape";
const E_COIL_LOT = "Coil-lot / chemical-lot re-qualification";

// ═══ THE 10 FRAMEWORKS — VERBATIM FROM IMP-DEMO-FRAMEWORK-CONTENT.md ═══════
const FRAMEWORKS = [
  // ── F1 · Dana Whitfield · CONFLICT SIDE A ────────────────────────────────
  {
    id: "f1",
    expert: "dana",
    daysAgo: 34,
    trigger_type: "judgment",
    method: "cdm",
    context_function: "Quality",
    situation_type: "Process failure",
    intervention_type: "Add",
    context_summary:
      "Quality Manager at the Little Rock insulated-metal-panel plant set the release rule for the first production run after any line changeover, where someone wants panels bundled and shipped before full inspection clears.",
    trigger_signal:
      "The first production run after a profile changeover, a thickness change, or a foam/coil lot change — when someone wants to release those panels to bundle-and-ship before full inspection clears.",
    signal_detail:
      "Any changeover in the last run — profile, thickness, foam chemical lot, or coil lot. First bundles off the line after a line stop. Any laminator parameter that drifted during the changeover and hasn't re-stabilized.",
    judgment:
      "Don't release. Hold the run until first-article bond-strength testing and a cut-section foam inspection both clear. No exceptions on the first run after a changeover.",
    rationale:
      "A delaminated panel that ships is unrecoverable. Once it's on a building and the facer separates from the foam, that's a warranty claim, a possible safety event, and our name on a failed wall. The line hold costs us minutes of capacity. The field failure costs us the customer and the reputation. That trade is not close. The first run after any changeover is exactly when bond strength is least predictable — the cure and cell formation haven't settled — so that's precisely when the gate has to hold.",
    boundaries:
      "This is about the first run after a change. A stable run that's been producing good cut-sections for hours doesn't need the full gate on every bundle — that's what in-line monitoring is for. The gate is for the transition, not steady state.",
    entity_map: [
      { type: "process", name: E_POST_CHANGEOVER, detail: "full inspection gate before release" },
      { type: "process", name: "First-article bond-strength test", detail: null },
      { type: "error_class", name: E_DELAM, detail: null },
      { type: "department", name: "Quality", detail: "Little Rock" },
    ],
    framework: {
      name: "The No-Release Gate",
      tagline:
        "Hold the first run after any changeover until bond-strength and cut-section both clear — the transition is exactly where bond strength is least predictable.",
      when_to_apply: [
        "The first production run after a profile changeover, a thickness change, or a foam/coil lot change — when someone wants to release those panels to bundle-and-ship before full inspection clears.",
      ],
      signals: [
        "Any changeover in the last run — profile, thickness, foam chemical lot, or coil lot.",
        "First bundles off the line after a line stop.",
        "Any laminator parameter that drifted during the changeover and hasn't re-stabilized.",
      ],
      the_play:
        "Don't release. Hold the run until first-article bond-strength testing and a cut-section foam inspection both clear. No exceptions on the first run after a changeover.",
      why_it_works:
        "A delaminated panel that ships is unrecoverable. Once it's on a building and the facer separates from the foam, that's a warranty claim, a possible safety event, and our name on a failed wall. The line hold costs us minutes of capacity. The field failure costs us the customer and the reputation. That trade is not close. The first run after any changeover is exactly when bond strength is least predictable — the cure and cell formation haven't settled — so that's precisely when the gate has to hold.",
      boundaries: [
        "This is about the first run after a change. A stable run that's been producing good cut-sections for hours doesn't need the full gate on every bundle — that's what in-line monitoring is for. The gate is for the transition, not steady state.",
      ],
    },
  },

  // ── F2 · Brian Ng · CONFLICT SIDE B · THE SHOOT TARGET ───────────────────
  {
    id: "f2",
    expert: "ng",
    daysAgo: 21,
    trigger_type: "judgment",
    method: "cdm",
    context_function: "Ops",
    situation_type: "Process failure",
    intervention_type: "Re-sequence",
    context_summary:
      "Panel Technical Expert (R&D) set the conditional release rule for the first run after a profile-only changeover on the Little Rock laminator line, where the foam system itself never changed.",
    trigger_signal:
      "Same trigger — first run after a changeover — but specifically when the changeover was profile-only: same foam chemistry, same coil lot, same thickness, just a different face profile.",
    signal_detail:
      "Profile-only changeover (foam chemistry, chemical lot, coil lot, and thickness all unchanged). Laminator temps and line speed back to the qualified setpoint. First-bundle peel-check shows clean cohesive foam failure, not adhesive (facer) failure.",
    judgment:
      "You can release the first bundle on a visual plus a hand peel-check, while the full cut-section bond test runs in parallel — as long as nothing about the foam system changed. Don't hold the whole line for a low-risk changeover.",
    rationale:
      "Bond strength is driven by the foam-to-facer chemistry and the cure, not by the face profile. If none of the foam variables changed, the delamination risk on a profile-only changeover is genuinely low, and the peel-check catches the large majority of adhesion problems in thirty seconds. Holding an expensive continuous line for a full cut-section cycle on a low-risk changeover burns capacity we can't get back — and capacity is the constraint that determines whether we hit the ship dates sales already promised. The judgment is matching the inspection depth to the actual risk of the change, not applying the maximum gate to every transition.",
    boundaries:
      "The moment ANY foam variable changes — new chemical lot, new coil lot, thickness change, or a laminator parameter that won't hold setpoint — this does NOT apply and you're back to the full gate. A peel-check does not substitute for a cut-section when the chemistry is in question.",
    entity_map: [
      { type: "process", name: E_POST_CHANGEOVER, detail: "profile-only changeovers" },
      { type: "process", name: E_PEEL_CHECK, detail: "cohesive vs adhesive failure read" },
      { type: "error_class", name: E_DELAM, detail: null },
      { type: "equipment_asset", name: "Little Rock laminator line", detail: null },
    ],
    framework: {
      name: "The Controlled Restart Release",
      tagline:
        "On a profile-only changeover, release the first bundle on a peel-check while the cut-section runs in parallel — match the inspection depth to the actual risk of the change.",
      when_to_apply: [
        "Same trigger — first run after a changeover — but specifically when the changeover was profile-only: same foam chemistry, same coil lot, same thickness, just a different face profile.",
      ],
      signals: [
        "Profile-only changeover (foam chemistry, chemical lot, coil lot, and thickness all unchanged).",
        "Laminator temps and line speed back to the qualified setpoint.",
        "First-bundle peel-check shows clean cohesive foam failure, not adhesive (facer) failure.",
      ],
      the_play:
        "You can release the first bundle on a visual plus a hand peel-check, while the full cut-section bond test runs in parallel — as long as nothing about the foam system changed. Don't hold the whole line for a low-risk changeover.",
      why_it_works:
        "Bond strength is driven by the foam-to-facer chemistry and the cure, not by the face profile. If none of the foam variables changed, the delamination risk on a profile-only changeover is genuinely low, and the peel-check catches the large majority of adhesion problems in thirty seconds. Holding an expensive continuous line for a full cut-section cycle on a low-risk changeover burns capacity we can't get back — and capacity is the constraint that determines whether we hit the ship dates sales already promised. The judgment is matching the inspection depth to the actual risk of the change, not applying the maximum gate to every transition.",
      boundaries: [
        "The moment ANY foam variable changes — new chemical lot, new coil lot, thickness change, or a laminator parameter that won't hold setpoint — this does NOT apply and you're back to the full gate.",
        "A peel-check does not substitute for a cut-section when the chemistry is in question.",
      ],
    },
  },

  // ── F3 · Richard Jenkins ─────────────────────────────────────────────────
  {
    id: "f3",
    expert: "richard",
    daysAgo: 48,
    trigger_type: "friction",
    method: "a3",
    context_function: "Ops",
    situation_type: "Process failure",
    intervention_type: "Measure",
    context_summary:
      "Multi-function operator on the Little Rock line described how a veteran reads a bond or foam problem starting before the cut-section saw catches it.",
    trigger_signal:
      "Running the line when a bond or foam problem is starting but the cut-section saw hasn't caught it yet.",
    signal_detail:
      "A change in the laminator sound — foam that's off-ratio or off-temp cures with a different note. Rising back-pressure or a change in how the ribbon pulls through. Panel face temperature coming off the laminator reading higher or lower than the run has been holding. Any of these before the next cut-section is due.",
    judgment:
      "Trust the laminator's behavior over the last-good cut-section. If the sound, the pull, or the temperature profile changes, treat the panels as suspect now — don't wait for the next scheduled cut to confirm it.",
    rationale:
      "The cut-section saw tells you the truth, but it tells you late — you've already made a bundle of suspect panels by the time a bad cut shows up. The laminator tells you early if you know its normal behavior. Twenty years on this line and the sound changes before the gauge does. A newer operator waits for the cut and scraps a bundle; a veteran hears it, flags it, and pulls one panel to check before the whole bundle is committed.",
    boundaries:
      "This is a leading-indicator instinct, not a measurement — it tells you when to check, not what's wrong. Always confirm with an actual cut-section before you scrap or release. Don't scrap on the sound alone; scrap on the cut the sound told you to take.",
    entity_map: [
      { type: "equipment_asset", name: "Little Rock laminator line", detail: "sound, pull, face temperature" },
      { type: "process", name: E_PEEL_CHECK, detail: "pull one panel before committing the bundle" },
      { type: "error_class", name: E_DELAM, detail: "caught early by laminator behavior" },
    ],
    framework: {
      name: "Reading the Laminator Before the Panel Tells You",
      tagline:
        "The cut-section saw tells you the truth, but late. The laminator tells you early if you know its normal behavior.",
      when_to_apply: [
        "Running the line when a bond or foam problem is starting but the cut-section saw hasn't caught it yet.",
      ],
      signals: [
        "A change in the laminator sound — foam that's off-ratio or off-temp cures with a different note.",
        "Rising back-pressure or a change in how the ribbon pulls through.",
        "Panel face temperature coming off the laminator reading higher or lower than the run has been holding.",
        "Any of these before the next cut-section is due.",
      ],
      the_play:
        "Trust the laminator's behavior over the last-good cut-section. If the sound, the pull, or the temperature profile changes, treat the panels as suspect now — don't wait for the next scheduled cut to confirm it.",
      why_it_works:
        "The cut-section saw tells you the truth, but it tells you late — you've already made a bundle of suspect panels by the time a bad cut shows up. The laminator tells you early if you know its normal behavior. Twenty years on this line and the sound changes before the gauge does. A newer operator waits for the cut and scraps a bundle; a veteran hears it, flags it, and pulls one panel to check before the whole bundle is committed.",
      boundaries: [
        "This is a leading-indicator instinct, not a measurement — it tells you when to check, not what's wrong.",
        "Always confirm with an actual cut-section before you scrap or release. Don't scrap on the sound alone; scrap on the cut the sound told you to take.",
      ],
    },
  },

  // ── F4 · Brian Ng ────────────────────────────────────────────────────────
  {
    id: "f4",
    expert: "ng",
    daysAgo: 62,
    trigger_type: "judgment",
    method: "cdm",
    context_function: "Quality",
    situation_type: "Systems",
    intervention_type: "Add",
    context_summary:
      "Panel Technical Expert (R&D) set the re-qualification rule for what carries over and what must be re-tested when a new coil lot or foam chemical lot goes into the line.",
    trigger_signal:
      "A new coil lot or a new foam chemical lot is going into the line — deciding what to re-qualify and what carries over.",
    signal_detail:
      "New chemical lot number = full re-qualify. New coil lot, same mill and coating = first-article check. New coil supplier OR new coating system = treat as a chemical-lot-level re-qualify, because the adhesion surface changed.",
    judgment:
      "Re-qualify bond strength and foam density on any new chemical lot, always. On a new coil lot of the same spec, a first-article dimensional and adhesion check is enough — but never assume adhesion carries across a coating or supplier change.",
    rationale:
      "Foam density and adhesion drift with chemical-lot variation — that's inherent to the chemistry, and it's the variable most likely to cause a delamination escape you didn't see coming. Coil dimensional properties are more stable lot-to-lot, so a lighter check suffices — unless the coating changed, because the foam bonds to the coating, not the steel. The whole rule is about spending your inspection effort where the actual variation lives.",
    boundaries:
      "Doesn't apply to within-lot running. And if you're chasing an intermittent adhesion problem, ignore this and re-qualify everything — when you're already in a failure investigation, lot boundaries stop being a safe assumption.",
    entity_map: [
      { type: "process", name: E_COIL_LOT, detail: "what carries over, what gets re-tested" },
      { type: "error_class", name: "Foam density drift", detail: "chemical-lot variation" },
      { type: "error_class", name: E_DELAM, detail: null },
    ],
    framework: {
      name: "The Coil-Lot / Chemical-Lot Changeover Rule",
      tagline:
        "Spend your inspection effort where the actual variation lives: chemistry drifts lot to lot, coil dimensions mostly don't — unless the coating changed.",
      when_to_apply: [
        "A new coil lot or a new foam chemical lot is going into the line — deciding what to re-qualify and what carries over.",
      ],
      signals: [
        "New chemical lot number = full re-qualify.",
        "New coil lot, same mill and coating = first-article check.",
        "New coil supplier OR new coating system = treat as a chemical-lot-level re-qualify, because the adhesion surface changed.",
      ],
      the_play:
        "Re-qualify bond strength and foam density on any new chemical lot, always. On a new coil lot of the same spec, a first-article dimensional and adhesion check is enough — but never assume adhesion carries across a coating or supplier change.",
      why_it_works:
        "Foam density and adhesion drift with chemical-lot variation — that's inherent to the chemistry, and it's the variable most likely to cause a delamination escape you didn't see coming. Coil dimensional properties are more stable lot-to-lot, so a lighter check suffices — unless the coating changed, because the foam bonds to the coating, not the steel. The whole rule is about spending your inspection effort where the actual variation lives.",
      boundaries: [
        "Doesn't apply to within-lot running.",
        "If you're chasing an intermittent adhesion problem, ignore this and re-qualify everything — when you're already in a failure investigation, lot boundaries stop being a safe assumption.",
      ],
    },
  },

  // ── F5 · Carlos Ramos ────────────────────────────────────────────────────
  {
    id: "f5",
    expert: "carlos",
    daysAgo: 55,
    trigger_type: "judgment",
    method: "cdm",
    context_function: "Ops",
    situation_type: "Process failure",
    intervention_type: "Re-sequence",
    context_summary:
      "Divisional Maintenance Manager set the call on whether to pull the line for maintenance or run to finish when the laminator or a saw shows early wear signs mid-run with a hot order on the line.",
    trigger_signal:
      "The laminator or a saw is showing early wear signs mid-run, and there's a hot order on the line — deciding whether to push through or pull the line for maintenance now.",
    signal_detail:
      "Quality-touching wear (metering pump drift, laminator drive, blade runout on the cut) = pull now. Non-quality wear (a guard, a non-critical conveyor) = can finish the order. The size of the run left vs. how fast the signal is trending.",
    judgment:
      "Pull the line now if the wear signal touches product quality or safety (laminator bearing, foam metering, saw blade runout). Push through only if the wear is cosmetic or on a redundant system, and you can finish the order inside the window before it becomes a real failure.",
    rationale:
      "A metering or laminator failure mid-run doesn't just stop the line — it can ruin the panels already in the laminator and mask itself as a foam problem, so you chase the wrong cause. Downtime now is scheduled and cheap; a failure mid-run is unscheduled, scraps product, and costs more total downtime. But not every wear signal is worth stopping a hot order for — a cosmetic issue on a redundant system can wait for the changeover. The judgment is whether the wear can reach the product before the order's done.",
    boundaries:
      "If a customer's ship date is genuinely at risk and the wear is confirmed non-quality, running to finish is defensible — but that's Brian Montes's capacity call to make with eyes open, not a maintenance call to make quietly.",
    entity_map: [
      { type: "equipment_asset", name: "Little Rock laminator line", detail: "metering pump, drive, blade runout" },
      { type: "process", name: "Mid-run maintenance hold decision", detail: null },
      { type: "role_person", name: "Brian Montes", detail: "VP Operations — owns the capacity call" },
    ],
    framework: {
      name: "Hold the Line for Maintenance, or Run to Order",
      tagline:
        "Pull now if the wear can reach the product. Finish the order only when the wear is cosmetic or redundant — and say so out loud.",
      when_to_apply: [
        "The laminator or a saw is showing early wear signs mid-run, and there's a hot order on the line — deciding whether to push through or pull the line for maintenance now.",
      ],
      signals: [
        "Quality-touching wear (metering pump drift, laminator drive, blade runout on the cut) = pull now.",
        "Non-quality wear (a guard, a non-critical conveyor) = can finish the order.",
        "The size of the run left vs. how fast the signal is trending.",
      ],
      the_play:
        "Pull the line now if the wear signal touches product quality or safety (laminator bearing, foam metering, saw blade runout). Push through only if the wear is cosmetic or on a redundant system, and you can finish the order inside the window before it becomes a real failure.",
      why_it_works:
        "A metering or laminator failure mid-run doesn't just stop the line — it can ruin the panels already in the laminator and mask itself as a foam problem, so you chase the wrong cause. Downtime now is scheduled and cheap; a failure mid-run is unscheduled, scraps product, and costs more total downtime. But not every wear signal is worth stopping a hot order for — a cosmetic issue on a redundant system can wait for the changeover. The judgment is whether the wear can reach the product before the order's done.",
      boundaries: [
        "If a customer's ship date is genuinely at risk and the wear is confirmed non-quality, running to finish is defensible — but that's Brian Montes's capacity call to make with eyes open, not a maintenance call to make quietly.",
      ],
    },
  },

  // ── F6 · Marcus Webb ─────────────────────────────────────────────────────
  {
    id: "f6",
    expert: "marcus",
    daysAgo: 41,
    trigger_type: "judgment",
    method: "cdm",
    context_function: "Ops",
    situation_type: "Systems",
    intervention_type: "Re-sequence",
    context_summary:
      "Project Manager set the rule for releasing shop drawings to fabrication with about 90% of the architect's information rather than waiting for a complete set, on insulated-metal-panel jobs where IMP is the critical path.",
    trigger_signal:
      "Deciding whether to release shop drawings to fabrication with ~90% of the architect's information, or wait for final tolerances and details.",
    signal_detail:
      "IMP is on the critical path — 10 to 16 weeks lead. The standard field conditions are settled even if a few details aren't. The open items are isolated and detailable later without changing panel quantities or profiles.",
    judgment:
      "Release early on standard conditions and long-lead panel quantities; hold only the specific details that are genuinely unresolved (unusual penetrations, complex roof geometry, interface details). Don't hold the whole package for a few open details.",
    rationale:
      "IMP lead time drives the whole building schedule — if we wait for a perfect drawing set, we've put the critical-path item weeks behind for the sake of details that don't touch the bulk of the order. Releasing the settled 90% buys schedule we can't recover later. The risk is rework if an open detail changes a released panel — so the skill is knowing which details can move without affecting fabricated panels, and holding exactly those. Release the schedule-drivers, hold the genuine unknowns.",
    boundaries:
      "Doesn't apply when the open items are the panel profiles, thicknesses, or quantities themselves — if the fundamentals aren't settled, releasing early just fabricates the wrong panels. Early release is for detail-level unknowns, not scope-level ones.",
    entity_map: [
      { type: "process", name: "Shop-drawing release to fabrication", detail: "10-16 week IMP lead time" },
      { type: "department", name: "Project Management", detail: null },
    ],
    framework: {
      name: "The Shop-Drawing Release Judgment",
      tagline:
        "Release the schedule-drivers, hold the genuine unknowns — IMP lead time drives the whole building schedule.",
      when_to_apply: [
        "Deciding whether to release shop drawings to fabrication with ~90% of the architect's information, or wait for final tolerances and details.",
      ],
      signals: [
        "IMP is on the critical path — 10 to 16 weeks lead.",
        "The standard field conditions are settled even if a few details aren't.",
        "The open items are isolated and detailable later without changing panel quantities or profiles.",
      ],
      the_play:
        "Release early on standard conditions and long-lead panel quantities; hold only the specific details that are genuinely unresolved (unusual penetrations, complex roof geometry, interface details). Don't hold the whole package for a few open details.",
      why_it_works:
        "IMP lead time drives the whole building schedule — if we wait for a perfect drawing set, we've put the critical-path item weeks behind for the sake of details that don't touch the bulk of the order. Releasing the settled 90% buys schedule we can't recover later. The risk is rework if an open detail changes a released panel — so the skill is knowing which details can move without affecting fabricated panels, and holding exactly those. Release the schedule-drivers, hold the genuine unknowns.",
      boundaries: [
        "Doesn't apply when the open items are the panel profiles, thicknesses, or quantities themselves — if the fundamentals aren't settled, releasing early just fabricates the wrong panels.",
        "Early release is for detail-level unknowns, not scope-level ones.",
      ],
    },
  },

  // ── F7 · Kim Harrell · SECONDARY CONFLICT SIDE A ─────────────────────────
  {
    id: "f7",
    expert: "kim",
    daysAgo: 28,
    trigger_type: "judgment",
    method: "cdm",
    context_function: "Sales",
    situation_type: "Cost",
    intervention_type: "Add",
    context_summary:
      "VP of Sales set the rule for what Sales may promise at quote time when a customer wants a custom profile, color, or tolerance the standard line may not hold.",
    trigger_signal:
      "A customer wants a custom profile, color, or tolerance, and Sales has to decide at quote time whether to promise it.",
    signal_detail:
      "Off-standard profile requiring tooling. A color outside our standard coil coatings. A dimensional tolerance tighter than the line's proven capability. A thickness between our standard laminator setpoints.",
    judgment:
      "Only promise a custom the plant has actually confirmed it can run at margin — not what we hope it can run. If it needs a new tool, an off-standard laminator setting, or a tolerance tighter than the line holds, that's a conversation with Brian Montes and Brian Ng before the quote, not after the PO.",
    rationale:
      "A custom promised at quote time that the plant can't cleanly run turns into expedite cost, scrap, and a late ship — and the margin we won the deal on evaporates. The deal that looks best on paper can be the one that loses money in the plant. Sales owns revenue, but revenue at a loss isn't a win. The discipline is a fast pre-quote reality check with Ops and R&D on anything non-standard, so the yes we give is a yes we can keep.",
    boundaries:
      "Standard profiles, standard colors, standard tolerances — promise them freely, that's what the line is built for. This gate is only for the non-standard ask.",
    entity_map: [
      { type: "process", name: E_QUOTE_TIME, detail: "the non-standard ask" },
      { type: "department", name: "Sales", detail: null },
      { type: "role_person", name: "Brian Montes", detail: "VP Operations — pre-quote reality check" },
      { type: "role_person", name: "Brian Ng", detail: "R&D — pre-quote reality check" },
    ],
    framework: {
      name: "Custom Profile: Promise It or Walk",
      tagline:
        "The yes we give has to be a yes we can keep — a fast pre-quote reality check with Ops and R&D on anything non-standard.",
      when_to_apply: [
        "A customer wants a custom profile, color, or tolerance, and Sales has to decide at quote time whether to promise it.",
      ],
      signals: [
        "Off-standard profile requiring tooling.",
        "A color outside our standard coil coatings.",
        "A dimensional tolerance tighter than the line's proven capability.",
        "A thickness between our standard laminator setpoints.",
      ],
      the_play:
        "Only promise a custom the plant has actually confirmed it can run at margin — not what we hope it can run. If it needs a new tool, an off-standard laminator setting, or a tolerance tighter than the line holds, that's a conversation with Brian Montes and Brian Ng before the quote, not after the PO.",
      why_it_works:
        "A custom promised at quote time that the plant can't cleanly run turns into expedite cost, scrap, and a late ship — and the margin we won the deal on evaporates. The deal that looks best on paper can be the one that loses money in the plant. Sales owns revenue, but revenue at a loss isn't a win. The discipline is a fast pre-quote reality check with Ops and R&D on anything non-standard, so the yes we give is a yes we can keep.",
      boundaries: [
        "Standard profiles, standard colors, standard tolerances — promise them freely, that's what the line is built for. This gate is only for the non-standard ask.",
      ],
    },
  },

  // ── F8 · Brian Montes · SECONDARY CONFLICT SIDE B ────────────────────────
  {
    id: "f8",
    expert: "montes",
    daysAgo: 16,
    trigger_type: "concern",
    method: "premortem",
    context_function: "Ops",
    situation_type: "Cost",
    intervention_type: "Add",
    context_summary:
      "VP of Operations set the plant-side rule for custom or tight-date orders at quote time, where a date promised in the deal room lands against capacity the line has already committed.",
    trigger_signal:
      "A custom or tight-date order at quote time — the same decision, from the plant's side.",
    signal_detail:
      "The requested date lands in an already-committed capacity window. The custom needs a setup that displaces other scheduled orders. The margin assumes a run rate the line hasn't proven on that profile.",
    judgment:
      "Don't let a date or a custom get promised that the line can't hit at margin. A confirmed-capacity quote beats a won deal we can't produce. Bring Ops into the quote on anything non-standard or date-tight before the number goes to the customer.",
    rationale:
      "Every order sold at a date the plant can't hit costs more than the deal is worth — expedite, overtime, bumped orders, and the reputation hit of a late ship to another customer whose slot got taken. The plant is a finite continuous line; you can't sell the same capacity twice. Sales sees the deal in front of them; Ops sees the whole schedule. The right quote is the one that accounts for what's already committed, not just what's being sold today.",
    boundaries:
      "When there's genuine open capacity and the custom is within the line's proven range, Ops shouldn't be the department of no — approve it fast and let Sales close. This is about protecting committed capacity, not gatekeeping every order.",
    entity_map: [
      { type: "process", name: E_QUOTE_TIME, detail: "from the plant's side" },
      { type: "department", name: "Operations", detail: null },
      { type: "process", name: "Capacity allocation across plants", detail: null },
    ],
    framework: {
      name: "Capacity Reality First",
      tagline:
        "A confirmed-capacity quote beats a won deal we can't produce — you can't sell the same capacity twice.",
      when_to_apply: [
        "A custom or tight-date order at quote time — the same decision, from the plant's side.",
      ],
      signals: [
        "The requested date lands in an already-committed capacity window.",
        "The custom needs a setup that displaces other scheduled orders.",
        "The margin assumes a run rate the line hasn't proven on that profile.",
      ],
      the_play:
        "Don't let a date or a custom get promised that the line can't hit at margin. A confirmed-capacity quote beats a won deal we can't produce. Bring Ops into the quote on anything non-standard or date-tight before the number goes to the customer.",
      why_it_works:
        "Every order sold at a date the plant can't hit costs more than the deal is worth — expedite, overtime, bumped orders, and the reputation hit of a late ship to another customer whose slot got taken. The plant is a finite continuous line; you can't sell the same capacity twice. Sales sees the deal in front of them; Ops sees the whole schedule. The right quote is the one that accounts for what's already committed, not just what's being sold today.",
      boundaries: [
        "When there's genuine open capacity and the custom is within the line's proven range, Ops shouldn't be the department of no — approve it fast and let Sales close. This is about protecting committed capacity, not gatekeeping every order.",
      ],
    },
  },

  // ── F9 · Ben Seger ───────────────────────────────────────────────────────
  {
    id: "f9",
    expert: "ben",
    daysAgo: 70,
    trigger_type: "friction",
    method: "a3",
    context_function: "Sales",
    situation_type: "Process failure",
    intervention_type: "Add",
    context_summary:
      "Territory Manager set the pre-ship verification rule for erected-structure tolerances on insulated-metal-panel jobs, because panels are manufactured to spec and cannot be modified in the field.",
    trigger_signal:
      "Before panels ship to a job site — deciding whether the erected structure's tolerances have been verified.",
    signal_detail:
      "Complex roof geometry or low slope. A first-time or unproven erector. A structure erected by a different trade than usual. Any job where the substrate flatness/squareness wasn't confirmed at the pre-construction meeting.",
    judgment:
      "Send a tech rep to verify the erected structure's flatness and squareness against our tolerances before the panels ship, on any job with complex geometry or a first-time erector. IMPs can't be field-modified — an out-of-tolerance substrate is a job-site crisis, not a field fix.",
    rationale:
      "Panels are manufactured to spec and cannot be cut or adjusted in the field. If the structure they're going onto is out of tolerance, the panels won't fit, and you find out with a truck full of panels at the site and a crew standing around. A pre-ship tolerance check catches it while it's a drawing correction, not a six-figure field-rework and a blown schedule. The cost of the check is one tech rep's day; the cost of the miss is the job.",
    boundaries:
      "Standard box buildings with a proven erector who's hit our tolerances before don't need the pre-check every time — that's over-caution. This is for the geometry and the erectors where the risk is real.",
    entity_map: [
      { type: "process", name: "Pre-ship substrate tolerance check", detail: "flatness and squareness" },
      { type: "error_class", name: "Out-of-tolerance substrate", detail: null },
      { type: "role_person", name: "Marcus Webb", detail: "Project Manager — runs the pre-check on the job" },
    ],
    framework: {
      name: "The Tolerance Pre-Check Before Fab",
      tagline:
        "The cost of the check is one tech rep's day; the cost of the miss is the job. IMPs can't be field-modified.",
      when_to_apply: [
        "Before panels ship to a job site — deciding whether the erected structure's tolerances have been verified.",
      ],
      signals: [
        "Complex roof geometry or low slope.",
        "A first-time or unproven erector.",
        "A structure erected by a different trade than usual.",
        "Any job where the substrate flatness/squareness wasn't confirmed at the pre-construction meeting.",
      ],
      the_play:
        "Send a tech rep to verify the erected structure's flatness and squareness against our tolerances before the panels ship, on any job with complex geometry or a first-time erector. IMPs can't be field-modified — an out-of-tolerance substrate is a job-site crisis, not a field fix.",
      why_it_works:
        "Panels are manufactured to spec and cannot be cut or adjusted in the field. If the structure they're going onto is out of tolerance, the panels won't fit, and you find out with a truck full of panels at the site and a crew standing around. A pre-ship tolerance check catches it while it's a drawing correction, not a six-figure field-rework and a blown schedule. The cost of the check is one tech rep's day; the cost of the miss is the job.",
      boundaries: [
        "Standard box buildings with a proven erector who's hit our tolerances before don't need the pre-check every time — that's over-caution. This is for the geometry and the erectors where the risk is real.",
      ],
    },
  },

  // ── F10 · Zach Davis ─────────────────────────────────────────────────────
  {
    id: "f10",
    expert: "zach",
    daysAgo: 12,
    trigger_type: "concern",
    method: "premortem",
    context_function: "Safety",
    situation_type: "Systems",
    intervention_type: "Measure",
    context_summary:
      "Sr. Manager of EHS set the rule for reading which line near-misses are leading indicators of a serious event and which are genuinely minor, across the panel plant's chemical, saw, and stacker hazards.",
    trigger_signal:
      "Reading which line near-misses are leading indicators of a serious event versus genuinely minor.",
    signal_detail:
      "Chemical handling (isocyanate exposure potential), any LOTO deviation, saw/gang-saw and robot-stacker pinch points, working-at-height near the line. High-energy sources where the gap between near-miss and serious injury is luck, not design.",
    judgment:
      "Treat any near-miss involving foam chemical exposure, a LOTO shortcut, or a pinch point on the saw/stacker as a leading indicator — investigate it like it was the real event. Genuinely minor near-misses get logged, not investigated. Know the difference by the potential, not the outcome.",
    rationale:
      "The outcome of a near-miss is random; the potential is what tells you if it'll be a fatality next time. A LOTO shortcut that didn't hurt anyone this time is the same shortcut that takes a hand next time — the only difference was luck. So we investigate by energy and potential, not by whether someone got hurt. Chasing every minor near-miss burns credibility; missing a high-potential one costs someone. The judgment is reading which is which.",
    boundaries:
      "Low-energy near-misses (a slip on a clean floor, a dropped tool from bench height) get logged and trended, not full-investigated — over-investigating the minor stuff trains people to stop reporting. Reserve the deep investigation for the high-potential events.",
    entity_map: [
      { type: "process", name: "Near-miss investigation triage", detail: "by energy and potential" },
      { type: "equipment_asset", name: "Gang saw and robot stacker", detail: "pinch points" },
      { type: "department", name: "EHS", detail: null },
    ],
    framework: {
      name: "The Near-Miss That Isn't Minor",
      tagline:
        "The outcome of a near-miss is random; the potential tells you if it'll be a fatality next time. Investigate by energy, not by injury.",
      when_to_apply: [
        "Reading which line near-misses are leading indicators of a serious event versus genuinely minor.",
      ],
      signals: [
        "Chemical handling (isocyanate exposure potential), any LOTO deviation, saw/gang-saw and robot-stacker pinch points, working-at-height near the line.",
        "High-energy sources where the gap between near-miss and serious injury is luck, not design.",
      ],
      the_play:
        "Treat any near-miss involving foam chemical exposure, a LOTO shortcut, or a pinch point on the saw/stacker as a leading indicator — investigate it like it was the real event. Genuinely minor near-misses get logged, not investigated. Know the difference by the potential, not the outcome.",
      why_it_works:
        "The outcome of a near-miss is random; the potential is what tells you if it'll be a fatality next time. A LOTO shortcut that didn't hurt anyone this time is the same shortcut that takes a hand next time — the only difference was luck. So we investigate by energy and potential, not by whether someone got hurt. Chasing every minor near-miss burns credibility; missing a high-potential one costs someone. The judgment is reading which is which.",
      boundaries: [
        "Low-energy near-misses (a slip on a clean floor, a dropped tool from bench height) get logged and trended, not full-investigated — over-investigating the minor stuff trains people to stop reporting.",
        "Reserve the deep investigation for the high-potential events.",
      ],
    },
  },
];

// ═══ WIN COLUMN — 3 leader write-ups naming Marcus Webb ════════════════════
// aggregateWinColumn() filters to trigger_type='win' before anything else, and
// ranks on DISTINCT AUTHOR count. Three different leaders (Sales, Ops, Plant)
// naming the same person is the corroboration signal the surface exists for.
// daysAgo 52/23/8 accelerates, so Marcus also carries the rising-signal badge.
const WIN_RECORDS = [
  {
    id: "win-kim",
    expert: "kim",
    daysAgo: 52,
    trigger_type: "win",
    method: "aar_success_case",
    context_function: "Sales",
    situation_type: "Process failure",
    intervention_type: "Measure",
    context_summary:
      "VP of Sales wrote up how a major cold-storage job avoided a six-figure field-rework because the substrate was checked before the panels shipped.",
    trigger_signal:
      "A large cold-storage job was two weeks from its panel ship date with an erector we hadn't worked with before, and everything on paper said we were ready to load trucks.",
    signal_detail:
      "Marcus Webb wouldn't sign off on the ship release until a tech rep walked the erected structure, even though the schedule pressure from the customer was real and nobody else was asking for it. The check found the wall line out of square by enough that our panels would not have closed at the corners — with a truck already loaded, that's a crew standing around and a six-figure field-rework on a product that can't be cut to fit.",
    judgment:
      "Back Marcus's call to hold the ship release for the pre-check on any cold-storage job with an unproven erector, and tell the customer plainly why the date moved by a day.",
    rationale:
      "Sales owns the relationship, and the relationship survives a one-day slip far better than it survives a crew standing at a site with panels that don't fit. Marcus was the only person in the chain who treated the ship release as a decision rather than a formality, and that's the whole reason this job didn't become the story everybody remembers about us.",
    boundaries:
      "This wouldn't have been worth the delay on a standard box building with an erector who's hit our tolerances before — the pre-check earns its schedule cost specifically where the geometry is complex or the erector is unproven.",
    entity_map: [
      { type: "role_person", name: "Marcus Webb", detail: "Project Manager" },
      { type: "process", name: "Pre-ship substrate tolerance check", detail: null },
      { type: "error_class", name: "Out-of-tolerance substrate", detail: "cold-storage job" },
    ],
    framework: {
      name: "Back the Person Who Treats the Ship Release as a Decision",
      tagline:
        "A one-day slip survives the relationship; a truck of panels that don't fit does not.",
      when_to_apply: [
        "A job is at its panel ship date with an unproven erector and schedule pressure to release.",
      ],
      signals: [
        "An erector we haven't worked with before.",
        "Complex geometry — cold storage, low slope, tight corner conditions.",
        "Nobody in the chain is asking for the substrate check.",
      ],
      the_play:
        "Back the call to hold the ship release for the pre-check on any cold-storage job with an unproven erector, and tell the customer plainly why the date moved by a day.",
      why_it_works:
        "Sales owns the relationship, and the relationship survives a one-day slip far better than it survives a crew standing at a site with panels that don't fit. Treating the ship release as a decision rather than a formality is what keeps a job from becoming the story everybody remembers about us.",
      boundaries: [
        "Not worth the delay on a standard box building with an erector who's hit our tolerances before.",
      ],
    },
  },
  {
    id: "win-montes",
    expert: "montes",
    daysAgo: 23,
    trigger_type: "win",
    method: "aar_success_case",
    context_function: "Ops",
    situation_type: "Process failure",
    intervention_type: "Measure",
    context_summary:
      "VP of Operations wrote up the plant-side value of the cold-storage substrate catch, which protected committed capacity that a rework would have consumed.",
    trigger_signal:
      "The cold-storage job's panels were built, bundled, and staged to ship, and the line was already scheduled onto the next order behind it.",
    signal_detail:
      "Marcus Webb's pre-ship check caught the out-of-square wall line before the trucks left. What that protected on my side isn't obvious from the job's own P&L: a field-rework would have meant re-running those panels, which means displacing whatever was scheduled in that window and pushing a different customer's date to cover our own miss.",
    judgment:
      "Treat a pre-ship substrate check on complex-geometry jobs as an operations control, not just a project-management courtesy, and fund the tech-rep day out of the plant budget rather than making it a fight each time.",
    rationale:
      "Rework doesn't just cost the rework — it eats committed capacity, and on a finite continuous line the capacity you spend twice is capacity somebody else was promised. Marcus's check is the cheapest insurance we have against a schedule cascade that hits customers who had nothing to do with the original job.",
    boundaries:
      "This is about complex geometry and unproven erectors. Making the tech-rep day mandatory on every standard job would burn field time without protecting any capacity worth protecting.",
    entity_map: [
      { type: "role_person", name: "Marcus Webb", detail: "Project Manager" },
      { type: "process", name: "Pre-ship substrate tolerance check", detail: null },
      { type: "process", name: "Capacity allocation across plants", detail: null },
    ],
    framework: {
      name: "Rework Eats Capacity Somebody Else Was Promised",
      tagline:
        "On a finite continuous line, the capacity you spend twice is capacity another customer was already sold.",
      when_to_apply: [
        "Weighing whether a pre-ship quality control is worth its cost on a complex-geometry job.",
      ],
      signals: [
        "The line is already scheduled onto the next order behind this one.",
        "A rework would require re-running panels in a committed window.",
      ],
      the_play:
        "Treat a pre-ship substrate check on complex-geometry jobs as an operations control, not a project-management courtesy, and fund the tech-rep day out of the plant budget.",
      why_it_works:
        "Rework doesn't just cost the rework — it eats committed capacity, and the capacity you spend twice is capacity somebody else was promised. The check is the cheapest insurance against a schedule cascade that hits customers who had nothing to do with the original job.",
      boundaries: [
        "Complex geometry and unproven erectors only — mandatory on every standard job would burn field time protecting nothing.",
      ],
    },
  },
  {
    id: "win-chuck",
    expert: "chuck",
    daysAgo: 8,
    trigger_type: "win",
    method: "aar_success_case",
    context_function: "Ops",
    situation_type: "Process failure",
    intervention_type: "Measure",
    context_summary:
      "Little Rock Plant Manager wrote up the floor's read on the cold-storage catch — the panels were right, and the save came from checking what they were going onto.",
    trigger_signal:
      "The cold-storage bundles cleared every one of our checks: bond strength, cut-section, dimensional, all in spec, all documented.",
    signal_detail:
      "That's exactly what makes this one worth writing down. The plant did nothing wrong and the job would still have failed at the site. Marcus Webb was the only one asking a question the plant is structurally unable to ask — not 'are these panels right' but 'is the building right for these panels.' My crew would have loaded those trucks with a clean conscience.",
    judgment:
      "Name the pre-ship substrate check explicitly in the plant's ship-release checklist for complex-geometry jobs, so the floor knows a clean panel record isn't the whole gate.",
    rationale:
      "Every check we run measures our own work, and none of them can see the field condition our product has to meet. Leaving that gap to whether an individual project manager happens to be conscientious is not a system — writing it into the release checklist is. Marcus caught it because he's careful; the next one gets caught because it's on the list.",
    boundaries:
      "The plant checklist can only flag that the pre-check is required — it can't perform it. This works only if the tech-rep visit is actually resourced, otherwise the line item just becomes something the floor learns to sign past.",
    entity_map: [
      { type: "role_person", name: "Marcus Webb", detail: "Project Manager" },
      { type: "process", name: "Pre-ship substrate tolerance check", detail: null },
      { type: "process", name: "Ship-release checklist", detail: "Little Rock" },
    ],
    framework: {
      name: "A Clean Panel Record Isn't the Whole Gate",
      tagline:
        "Every check we run measures our own work. None of them can see the field condition the product has to meet.",
      when_to_apply: [
        "Releasing panels to ship on a complex-geometry job where every in-plant check has passed.",
      ],
      signals: [
        "Bond strength, cut-section, and dimensional checks all in spec and documented.",
        "Nobody has verified the structure the panels are going onto.",
      ],
      the_play:
        "Name the pre-ship substrate check explicitly in the plant's ship-release checklist for complex-geometry jobs, so the floor knows a clean panel record isn't the whole gate.",
      why_it_works:
        "Leaving the field-condition question to whether an individual project manager happens to be conscientious is not a system. Writing it into the release checklist is — the next one gets caught because it's on the list, not because someone was careful.",
      boundaries: [
        "The checklist can only flag that the pre-check is required — it can't perform it. Works only if the tech-rep visit is actually resourced.",
      ],
    },
  },
];

// ═══ PRESCRIPTION EVIDENCE — the recurring peel-check gap ══════════════════
// Two delamination escapes tied to the peel-check being skipped. These are the
// detection's evidence chain; the third (post-delivery) recurrence that drives
// the rung 2 → 3 escalation is seeded separately below.
const EVIDENCE_RECORDS = [
  {
    id: "eve-1",
    expert: "dana",
    daysAgo: 44,
    trigger_type: "broke",
    method: "5whys_fishbone",
    context_function: "Quality",
    situation_type: "Process failure",
    intervention_type: "Add",
    context_summary:
      "Quality Manager investigated a delamination escape on the Little Rock line where a post-changeover bundle shipped without the first-bundle peel-check being run.",
    trigger_signal:
      "A customer returned wall panels from a distribution-center job with facer separation along one edge, traced back to a bundle produced in the first hour after a profile changeover.",
    signal_detail:
      "The changeover log shows a profile-only swap and the operator released the bundle on a visual. The first-bundle peel-check was never run — not refused, just skipped under a changeover the crew read as routine. The cut-section came back later and was marginal, but the bundle was already banded and staged by then.",
    judgment:
      "Treat the peel-check as a gating step the release cannot proceed without, rather than a step the operator performs when the changeover feels non-routine.",
    rationale:
      "The release rule already allows a fast path on profile-only changeovers, but the fast path depends entirely on the peel-check actually happening. A gate that gets skipped when the changeover feels routine isn't a gate — and 'feels routine' is precisely the condition under which the escape happens.",
    boundaries:
      "This is about the first bundle after a changeover. Adding a peel-check to every bundle in a stable run would consume line time without buying anything the in-line monitoring doesn't already cover.",
    entity_map: [
      { type: "process", name: E_PEEL_CHECK, detail: "skipped on a profile-only changeover" },
      { type: "error_class", name: E_DELAM, detail: "facer separation, distribution-center job" },
      { type: "process", name: E_POST_CHANGEOVER, detail: null },
    ],
    framework: {
      name: "A Gate That Gets Skipped When It Feels Routine Isn't a Gate",
      tagline:
        "The fast path on a low-risk changeover only works if the check the fast path depends on actually happens.",
      when_to_apply: [
        "A conditional release rule allows a fast path that depends on one quick operator check.",
      ],
      signals: [
        "The check is skipped rather than refused — nobody decided against it.",
        "The skip clusters on changeovers the crew reads as routine.",
      ],
      the_play:
        "Treat the check as a gating step the release cannot proceed without, rather than a step the operator performs when the changeover feels non-routine.",
      why_it_works:
        "'Feels routine' is precisely the condition under which the escape happens, so a gate conditioned on the operator's read of routineness fails exactly where it is needed.",
      boundaries: [
        "First bundle after a changeover only — every bundle in a stable run would consume line time for nothing.",
      ],
    },
  },
  {
    id: "eve-2",
    expert: "chuck",
    daysAgo: 30,
    trigger_type: "friction",
    method: "a3",
    context_function: "Ops",
    situation_type: "Process failure",
    intervention_type: "Measure",
    context_summary:
      "Little Rock Plant Manager traced a second delamination escape in six weeks to the same missing first-bundle peel-check after a changeover.",
    trigger_signal:
      "Second delamination escape in six weeks, both from bundles produced in the first hour after a profile changeover, both from crews with newer operators on the release.",
    signal_detail:
      "The pattern is not that operators disagree with the peel-check — every one of them can explain why it matters. It's that the release decision happens under changeover time pressure and the check is the only step with no machine forcing it. The operators who skip it are the ones who haven't yet felt a bad peel in their hands, so it reads as paperwork rather than a measurement.",
    judgment:
      "Stop treating this as two separate incidents and name it as a recurring capability gap on the newer operators' release judgment after changeovers.",
    rationale:
      "Two escapes from the same missing step is a pattern, and the pattern points at capability rather than compliance — the crews know the rule and can recite the reasoning. What they don't have is the hands-on reference for what a bad peel actually feels like, which is the thing that makes the check feel worth the ninety seconds under pressure.",
    boundaries:
      "This read only holds while the escapes cluster on newer operators and on the post-changeover window. If experienced crews start missing it too, that's a line-condition or a scheduling-pressure problem, not a capability gap, and it needs a different fix.",
    entity_map: [
      { type: "process", name: E_PEEL_CHECK, detail: "skipped under changeover time pressure" },
      { type: "error_class", name: E_DELAM, detail: "second escape in six weeks" },
      { type: "department", name: "Little Rock Production", detail: null },
    ],
    framework: {
      name: "Two From the Same Missing Step Is a Capability Gap",
      tagline:
        "When crews can recite the rule and still skip it, the missing thing is the hands-on reference, not the reasoning.",
      when_to_apply: [
        "The same procedural step goes missing twice, and the people skipping it can explain why it matters.",
      ],
      signals: [
        "The skips cluster on newer operators and on a time-pressured window.",
        "The step is the only one with no machine forcing it.",
      ],
      the_play:
        "Stop treating it as separate incidents and name it as a recurring capability gap on release judgment.",
      why_it_works:
        "The crews know the rule and can recite the reasoning. What they don't have is the hands-on reference for what a bad result actually feels like, which is what makes the check feel worth the time under pressure.",
      boundaries: [
        "Holds only while the misses cluster on newer operators. Experienced crews missing it too means a line-condition or scheduling problem instead.",
      ],
    },
  },
  // The post-delivery recurrence that drives the rung 2 → 3 escalation. Dated
  // AFTER the job aid's delivery so the efficacy loop reads it as "didn't land."
  {
    id: "eve-3",
    expert: "richard",
    daysAgo: 5,
    trigger_type: "broke",
    method: "5whys_fishbone",
    context_function: "Ops",
    situation_type: "Process failure",
    intervention_type: "Measure",
    context_summary:
      "Multi-function operator documented another scrapped bundle from a missed peel-check, weeks after the written job aid on the peel-check gate went up at the release station.",
    trigger_signal:
      "A bundle scrapped for facer separation after a profile changeover, with the peel-check job aid posted three feet from where the release happened.",
    signal_detail:
      "The card is up, it's readable, and the crew has read it. What the card can't do is put a good peel and a bad peel in somebody's hands. The operator who missed it told me he pulled the panel and it looked fine — and it did look fine, because an adhesive failure on a fresh panel doesn't announce itself visually. You have to have felt the difference to know what you're feeling for.",
    judgment:
      "Take the peel-check off the wall and put it in the crews' hands — run deliberate peel-checks on real first-bundle samples until every operator has felt both a good one and a bad one.",
    rationale:
      "A written gate transfers the rule, not the discriminating ability the rule depends on. Reading that a cohesive foam failure differs from an adhesive facer failure doesn't build the reference you need to tell them apart in thirty seconds under changeover pressure. That's a hands-on skill and it only transfers hands-on.",
    boundaries:
      "This applies to the tactile judgment specifically. The parts of the release rule that are genuinely procedural — which changeovers qualify for the fast path — are fine on a card and don't need a drill.",
    entity_map: [
      { type: "process", name: E_PEEL_CHECK, detail: "job aid posted, still missed" },
      { type: "error_class", name: E_DELAM, detail: "scrapped bundle, post-job-aid" },
      { type: "process", name: E_POST_CHANGEOVER, detail: null },
    ],
    framework: {
      name: "A Card Transfers the Rule, Not the Hands",
      tagline:
        "Reading that cohesive differs from adhesive failure doesn't build the reference you need to tell them apart under pressure.",
      when_to_apply: [
        "A written job aid is deployed and correct, and the failure it targets keeps happening anyway.",
      ],
      signals: [
        "The crew has read the card and can state the rule.",
        "The missed judgment is tactile or perceptual, not procedural.",
        "The failure mode doesn't announce itself visually.",
      ],
      the_play:
        "Take the check off the wall and put it in the crews' hands — run deliberate practice on real samples until everyone has felt both a good one and a bad one.",
      why_it_works:
        "A written gate transfers the rule, not the discriminating ability the rule depends on. That's a hands-on skill and it only transfers hands-on.",
      boundaries: [
        "Applies to the tactile judgment specifically. Genuinely procedural parts of the rule are fine on a card.",
      ],
    },
  },
];

// ═══ COACHING WATCH — Tyler Brooks, 2 records, manager-only ════════════════
// detectRetrainingCandidates() needs 2+ concern/friction records naming a
// REGISTERED profile who has a manager_id. Tyler reports to Chuck Milner, so
// the signal lands on Chuck's page and nowhere else. Neither record is authored
// by Tyler or by Chuck — blameless framing throughout: the pattern is the
// subject, never the person's competence.
const COACHING_RECORDS = [
  {
    id: "coach-1",
    expert: "zach",
    daysAgo: 26,
    trigger_type: "concern",
    method: "premortem",
    context_function: "Safety",
    situation_type: "Process failure",
    intervention_type: "Measure",
    context_summary:
      "Sr. Manager of EHS logged a near-miss on a saw changeover where a guard was re-seated after the blade was already turning.",
    trigger_signal:
      "During a gang-saw blade changeover, the machine was brought up before the guard interlock was fully re-seated — no injury, no contact, but the sequence was wrong.",
    signal_detail:
      "Tyler Brooks was on the changeover. The sequence he ran is the one you learn by watching a busy line rather than by being walked through it — guard last, because the guard is the slowest part and the line is waiting. It's a high-potential near-miss by our own framework: the gap between this and a hand injury was luck, not design.",
    judgment:
      "Log this as a high-potential near-miss and ask the plant to walk the changeover sequence with the newer operators directly, rather than reissuing the LOTO reminder to the whole floor.",
    rationale:
      "A floor-wide reminder is what you do when the standard is unclear, and it isn't — the sequence is posted and correct. When a newer operator runs the wrong order under line pressure, the missing thing is a walkthrough with somebody who can explain why the order is the order, which is a coaching conversation, not a bulletin.",
    boundaries:
      "This read holds for a newer operator learning sequence under pressure. The same near-miss from an experienced crew would be a different problem — that would be a standard eroding, and a bulletin would be exactly the wrong response there too, but for the opposite reason.",
    entity_map: [
      { type: "role_person", name: "Tyler Brooks", detail: "Operator — Little Rock line" },
      { type: "process", name: "Saw changeover sequence", detail: "guard interlock re-seating" },
      { type: "equipment_asset", name: "Gang saw and robot stacker", detail: null },
    ],
    framework: {
      name: "Walk the Sequence, Don't Reissue the Bulletin",
      tagline:
        "When the standard is posted and correct, a floor-wide reminder is the wrong instrument.",
      when_to_apply: [
        "A newer operator runs a safety-relevant sequence in the wrong order under line pressure.",
      ],
      signals: [
        "The posted standard is clear and correct.",
        "The wrong order is the one you'd learn by watching a busy line.",
        "The gap between the near-miss and an injury was luck, not design.",
      ],
      the_play:
        "Log it as a high-potential near-miss and walk the sequence with the newer operators directly, rather than reissuing a reminder to the whole floor.",
      why_it_works:
        "A floor-wide reminder is what you do when the standard is unclear. When it's clear, the missing thing is a walkthrough with somebody who can explain why the order is the order.",
      boundaries: [
        "Holds for a newer operator learning under pressure. The same near-miss from an experienced crew is a standard eroding, which needs a different response.",
      ],
    },
  },
  {
    id: "coach-2",
    expert: "dana",
    daysAgo: 11,
    trigger_type: "friction",
    method: "a3",
    context_function: "Quality",
    situation_type: "Process failure",
    intervention_type: "Measure",
    context_summary:
      "Quality Manager reviewed a scrapped bundle from a missed peel-check and found the same newer operator on the release both times the check went missing this month.",
    trigger_signal:
      "A bundle scrapped for facer separation, released after a profile changeover without the first-bundle peel-check being performed.",
    signal_detail:
      "Tyler Brooks was on the release. This is the second time this month the peel-check went missing on his shift, and both times the changeover was one the crew read as routine. Talking it through, he can state the rule accurately and explain why it matters — what he doesn't have is the hands-on reference for what a bad peel feels like, so under time pressure it reads as a formality rather than a measurement.",
    judgment:
      "Flag the recurrence for the plant manager as a coaching signal on release judgment, and prioritize this operator for the hands-on peel-check drill rather than another pass at the written gate.",
    rationale:
      "One miss is a bad shift; two in a month on the same judgment call is a signal worth naming while it's still a coaching conversation instead of a documented failure. The specific gap is tactile, not motivational — he isn't cutting corners, he's missing a reference he was never given.",
    boundaries:
      "This is scoped to the peel-check judgment specifically and says nothing about the rest of his work, which has been solid. If the drill lands and the misses stop, there's nothing further here.",
    entity_map: [
      { type: "role_person", name: "Tyler Brooks", detail: "Operator — Little Rock line" },
      { type: "process", name: E_PEEL_CHECK, detail: "missed twice this month" },
      { type: "error_class", name: E_DELAM, detail: null },
    ],
    framework: {
      name: "Name It While It's Still a Coaching Conversation",
      tagline:
        "One miss is a bad shift. Two on the same judgment call is a signal worth naming before it becomes a documented failure.",
      when_to_apply: [
        "The same person misses the same judgment call twice in a short window, and can accurately state the rule.",
      ],
      signals: [
        "The misses cluster on one specific judgment, not on effort generally.",
        "The person explains the reasoning correctly when asked.",
        "The gap is tactile or perceptual rather than motivational.",
      ],
      the_play:
        "Flag the recurrence to the manager as a coaching signal and prioritize the hands-on drill rather than another pass at the written gate.",
      why_it_works:
        "Naming it early keeps it a coaching conversation instead of a documented failure, and pointing at the tactile gap fixes the thing that's actually missing.",
      boundaries: [
        "Scoped to the one judgment call. Says nothing about the rest of the person's work.",
      ],
    },
  },
];

const ALL_RECORDS = [...FRAMEWORKS, ...WIN_RECORDS, ...EVIDENCE_RECORDS, ...COACHING_RECORDS];

// ═══ helpers ═══════════════════════════════════════════════════════════════
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

const METHOD_Q = {
  "5whys_fishbone": {
    signal: "What broke, specifically — what did you see, hear, or measure that told you something had failed?",
    reasoning: "Why did that actually cause the failure — walk the chain of causes, not just the first domino.",
    entity: "Which machine or equipment, which process step, and what error type was this? Name the specific asset if there is one.",
    boundaries: "Where would this same fix NOT hold — a different machine, a different failure mode, a different scale?",
  },
  aar_success_case: {
    signal: "What specifically happened that made this a win — the concrete moment or decision, not just the outcome?",
    reasoning: "Why did that approach work — what made it the right move rather than the default one?",
    entity: "Who was involved in making this work, and who else benefits downstream? Names are fine — they stay internal to your org.",
    boundaries: "Under what conditions would this NOT work as well — a different team, a different starting point, a different scale?",
  },
  premortem: {
    signal: "What specifically are you worried could go wrong — the concrete failure mode, not just a general worry?",
    reasoning: "Why is that risk real — what would have to be true for it to actually happen?",
    entity: "What equipment, process, team, or department would bear this risk if it played out?",
    boundaries: "Under what conditions would this risk NOT apply, or your mitigation fail?",
  },
  a3: {
    signal: "What specifically keeps recurring — the concrete gap between what should happen and what actually does?",
    reasoning: "Why does that gap keep recurring instead of getting fixed for good?",
    entity: "Which process, department, or role does this friction keep showing up in?",
    boundaries: "Where does this correction NOT apply — a different process, or a different root cause?",
  },
  cdm: {
    signal: "What specifically did you notice that told you this was a critical moment — the cue someone else might have missed?",
    reasoning: "Why was that the right call rather than the obvious alternative?",
    entity: "Who made this call, who else was involved, and who's affected by it? Names are fine — they stay internal to your org.",
    boundaries: "Where would this same call have been the WRONG one?",
  },
};
const OPENING_QUESTION =
  "Think of a recent situation you'd want captured — the one you just flagged. " +
  "To start: roughly how big is the org, what part of the business, and what was going on?";
const GENERIC_CLASSIFY = "What did you observe that told you something needed to change — what prompted your involvement?";
const GENERIC_CALL = "What did you recommend, or what call did you make?";

function buildQaPairs(rec) {
  const m = METHOD_Q[rec.method];
  return [
    { rung: 1, question: OPENING_QUESTION, answer: rec.context_summary },
    { rung: 2, question: GENERIC_CLASSIFY, answer: rec.trigger_signal },
    { rung: 3, question: GENERIC_CALL, answer: rec.judgment },
    { rung: 4, question: m.signal, answer: rec.signal_detail },
    { rung: 5, question: m.reasoning, answer: rec.rationale },
    { rung: 6, question: m.entity, answer: rec.entity_map.map((e) => e.name).join(", ") },
    { rung: 7, question: m.boundaries, answer: rec.boundaries },
  ];
}

// ═══ main ══════════════════════════════════════════════════════════════════
async function main() {
  // ── 0. Org identity ──────────────────────────────────────────────────────
  const { data: org, error: orgErr } = await supabase
    .from("orgs")
    .select("id, name, is_demo")
    .eq("id", DEMO_ORG_ID)
    .maybeSingle();
  if (orgErr) throw new Error(`org lookup failed: ${orgErr.message}`);
  if (!org) throw new Error(`Demo org ${DEMO_ORG_ID} not found — wrong project?`);

  if (org.name !== ORG_NAME) {
    const { error } = await supabase
      .from("orgs")
      .update({ name: ORG_NAME, is_demo: true })
      .eq("id", DEMO_ORG_ID);
    if (error) throw new Error(`org rename failed: ${error.message}`);
    console.log(`✓ Org renamed: "${org.name}" → "${ORG_NAME}"`);
  } else {
    console.log(`✓ Org already named "${ORG_NAME}"`);
  }

  // ── 1. Unhook the 5 legacy Meridian profiles ─────────────────────────────
  // Not deleted: auth users stay intact, they just leave the demo org so the
  // library and the people surfaces show exactly the AWIP cast.
  const { error: legacyErr } = await supabase
    .from("profiles")
    .update({ org_id: null, manager_id: null })
    .in("id", LEGACY_PROFILE_IDS)
    .eq("org_id", DEMO_ORG_ID);
  if (legacyErr) throw new Error(`legacy profile unhook failed: ${legacyErr.message}`);
  console.log(`✓ Legacy Meridian profiles unhooked from the demo org (auth untouched)`);

  // ── 2. The 15 AWIP experts ───────────────────────────────────────────────
  console.log(`\n─── Experts ───`);
  const uid = {};
  for (const e of EXPERTS) {
    let user = await findUserByEmail(e.email);
    if (!user) {
      const { data, error } = await supabase.auth.admin.createUser({
        email: e.email,
        password: DEMO_PASSWORD,
        email_confirm: true,
      });
      if (error) throw new Error(`createUser(${e.email}) failed: ${error.message}`);
      user = data.user;
    }
    await waitForProfile(user.id);
    uid[e.key] = user.id;
  }
  // Two passes: every profile exists before any manager_id points at one.
  for (const e of EXPERTS) {
    const { error } = await supabase
      .from("profiles")
      .update({
        org_id: DEMO_ORG_ID,
        display_name: e.name,
        persona: e.persona,
        role: e.role,
        manager_id: e.mgr ? uid[e.mgr] : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", uid[e.key]);
    if (error) throw new Error(`profile update failed for ${e.email}: ${error.message}`);
    console.log(`  ${e.name.padEnd(16)} ${e.role.padEnd(8)} ${e.title}`);
  }

  // ── 3. --force: remove this script's own seeded records ──────────────────
  if (FORCE) {
    const summaries = ALL_RECORDS.map((r) => r.context_summary);
    const { data: mine } = await supabase
      .from("pattern_records")
      .select("id")
      .eq("org_id", DEMO_ORG_ID)
      .in("context_summary", summaries);
    const ids = (mine || []).map((r) => r.id);
    if (ids.length) {
      await supabase
        .from("framework_conflicts")
        .delete()
        .or(`record_a_id.in.(${ids.join(",")}),record_b_id.in.(${ids.join(",")})`);
      await supabase.from("pattern_records").delete().in("id", ids);
      console.log(`\n--force: deleted ${ids.length} previously seeded record(s) + their conflicts.`);
    }
  }

  // ── 4. Pattern records ───────────────────────────────────────────────────
  console.log(`\n─── Pattern records (${ALL_RECORDS.length}) ───`);
  const now = Date.now();
  const recordIdByKey = {};
  let inserted = 0;
  for (const rec of ALL_RECORDS) {
    const { data: existing } = await supabase
      .from("pattern_records")
      .select("id")
      .eq("org_id", DEMO_ORG_ID)
      .eq("context_summary", rec.context_summary)
      .maybeSingle();
    if (existing) {
      recordIdByKey[rec.id] = existing.id;
      console.log(`  · already present: "${rec.framework.name}"`);
      continue;
    }

    const sessionStart = new Date(now - rec.daysAgo * 86_400_000);
    const ttfvSeconds = 360 + (rec.daysAgo % 7) * 90;
    const framedAt = new Date(sessionStart.getTime() + ttfvSeconds * 1000);

    const { data: row, error } = await supabase
      .from("pattern_records")
      .insert({
        user_id: uid[rec.expert],
        qa_pairs: buildQaPairs(rec),
        pending_question: null,
        pending_rung: null,
        status: "complete",
        trigger_type: rec.trigger_type,
        method: rec.method,
        scrub_status: "not_scrubbed_by_design",
        context_summary: rec.context_summary,
        context_org_size: "200-1000",
        context_industry: INDUSTRY,
        context_function: rec.context_function,
        situation_type: rec.situation_type,
        intervention_type: rec.intervention_type,
        trigger_signal: rec.trigger_signal,
        signal_detail: rec.signal_detail,
        judgment: rec.judgment,
        rationale: rec.rationale,
        boundaries: rec.boundaries,
        entity_map: rec.entity_map,
        framework: rec.framework,
        session_start: sessionStart.toISOString(),
        framework_rendered_at: framedAt.toISOString(),
        time_to_first_value_seconds: ttfvSeconds,
        created_at: sessionStart.toISOString(),
        updated_at: framedAt.toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error(`insert failed for ${rec.id}: ${error.message}`);
    recordIdByKey[rec.id] = row.id;
    inserted++;
    console.log(`  ✓ "${rec.framework.name}" — ${EXPERTS.find((e) => e.key === rec.expert).name}`);
  }
  console.log(`  ${inserted} inserted, ${ALL_RECORDS.length - inserted} already present.`);

  // ── 5. Knowledge gap (P-9) — OPEN, for Brian Ng to fill on camera ────────
  console.log(`\n─── Knowledge gap ───`);
  const GAP_Q =
    "What's our policy on approving a customer's request for a panel thickness that falls between our two standard laminator settings?";
  // normalizeGapQuestion(), verbatim from src/lib/knowledge-gaps.ts.
  const gapNorm = GAP_Q.toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1000);
  const { data: existingGap } = await supabase
    .from("knowledge_gaps")
    .select("id, status")
    .eq("org_id", DEMO_ORG_ID)
    .eq("question_norm", gapNorm)
    .maybeSingle();
  let gapId = existingGap?.id;
  if (!gapId) {
    const askedFirst = new Date(now - 9 * 86_400_000).toISOString();
    const askedLast = new Date(now - 2 * 86_400_000).toISOString();
    const { data: gap, error } = await supabase
      .from("knowledge_gaps")
      .insert({
        org_id: DEMO_ORG_ID,
        question_text: GAP_Q,
        question_norm: gapNorm,
        status: "open",
        asked_count: 3,
        first_asked_at: askedFirst,
        last_asked_at: askedLast,
        top_similarity: 0.681, // best near-miss, honestly below the 0.75 bar
        created_at: askedFirst,
        updated_at: askedLast,
      })
      .select("id")
      .single();
    if (error) throw new Error(`knowledge_gaps insert failed: ${error.message}`);
    gapId = gap.id;
    // Askers: Ben Seger hit it in the field, Kim Harrell at quote time. The
    // org-wide gap row carries only the count; names live here, own-rows-only.
    for (const [key, count, ago] of [["ben", 2, 9], ["kim", 1, 2]]) {
      const { error: aErr } = await supabase.from("knowledge_gap_askers").upsert(
        {
          gap_id: gapId,
          org_id: DEMO_ORG_ID,
          user_id: uid[key],
          asked_count: count,
          first_asked_at: new Date(now - ago * 86_400_000).toISOString(),
          last_asked_at: new Date(now - ago * 86_400_000).toISOString(),
        },
        { onConflict: "gap_id,user_id" }
      );
      if (aErr) throw new Error(`gap asker insert failed: ${aErr.message}`);
    }
    // The gap belongs in the P-8 ledger — negative evidence about retrieval
    // COVERAGE, never about a person.
    await supabase.from("learning_signals").insert({
      org_id: DEMO_ORG_ID,
      scope: "org",
      source_surface: "retrieve",
      signal_type: "knowledge_gap_opened",
      subject_type: "retrieval_query",
      subject_id: gapId,
      verdict: "negative",
      features: { similarity: 0.681, asked_count: 3 },
      payload: { question: GAP_Q },
      dedupe_key: `seed-awip:gap_opened:${gapId}`,
      occurred_at: askedFirst,
      written_by: "seed-awip-demo",
    });
    console.log(`  ✓ OPEN gap seeded (asked 3×, top near-miss 0.681) → ${gapId}`);
  } else {
    console.log(`  · gap already present (${existingGap.status}) → ${gapId}`);
  }

  console.log(`\n─────────────────────────────────────────────────────────────`);
  console.log(`Records seeded. NEXT, in this order:`);
  console.log(`  1. node scripts/backfill-pattern-embeddings.mjs`);
  console.log(`  2. node scripts/seed-awip-conflicts.mjs      (conflicts + prescriptions + coaching)`);
  console.log(`  3. node scripts/verify-awip-demo.mjs         (the DONE test)`);
  console.log(`\nLogin: <expert email> / ${DEMO_PASSWORD}`);
  console.log(`  Plant manager (coaching watch + manager gate): chuck.milner@awip-demo.example`);
  console.log(`  R&D (fills the gap on camera):                 brian.ng@awip-demo.example`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
