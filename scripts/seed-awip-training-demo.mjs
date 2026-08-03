// AWIP TRAINING DEMO SEED — the four "training at your fingertips" storylines.
//
// Turns BUILT-OUT-TRAINING-DEMO-STORYLINES.md (approved by Brian) into live,
// walkable demo data. Two jobs:
//
//   1. THE SOURCE FRAMEWORKS — the four storylines build FROM captured
//      judgment, so the missing judgment gets seeded here, in-voice:
//        · Carlos Ramos  — "The Full Re-Qual, No Skipped Steps"   (storyline 2)
//        · John Dial     — "The Lot Doesn't Tell You. The Log Does." (storyline 2)
//        · Brian Hicks   — "The Compliance Intake Gate"           (storyline 4)
//        · Klaudia Donaghy — "One First Week, Every Plant"        (storyline 4)
//      (Storylines 1 & 3 build from frameworks the AWIP seed already carries:
//       Ng's Controlled Restart Release × Whitfield's No-Release Gate, and
//       Harrell's Promise It or Walk × Montes's Capacity Reality First.)
//
//   2. THE FOUR STORYLINES END-TO-END — for each: the supervisor's typed
//      problem (training_requests), the format pick with cited rationale, a
//      COMPLETE rich training at all three altitudes (prescription_trainings,
//      seeded at the approved storyline depth), and the ⭐ "who else needs it"
//      routing with named people + exposure/role-framed reasons
//      (routing_targets). Requests sit at status='generated' so the approve
//      gate is a LIVE beat in the demo.
//
// ⚠️ RUN supabase/training-routing-targets.sql IN THE SQL EDITOR FIRST
//    (adds training_requests.routing_targets / routed_at / routed_by).
//
// ⭐ VERBATIM DOCTRINE (same as seed-awip-demo.mjs): no model calls. The
// framework text and the training bodies below are composed from the approved
// storyline doc, so what ships is the approved substance. The generated-live
// path (deepened prompts) exists alongside; these seeds guarantee the depth
// on screen regardless of model weather.
//
// 🛡️ TRAINING-NOT-SURVEILLANCE: every routing reason below is exposure/
// recency/role-framed — who needs the training, never who's failing.
//
// Idempotent: skips frameworks whose context_summary exists and requests
// whose (created_via, issue_text) exists. --force deletes ONLY this script's
// own rows first. 🛑 NEVER touches bdhicks83+test1@gmail.com or its web.
//
// Usage (PowerShell, from the repo root):
//   node scripts/seed-awip-training-demo.mjs
//   node scripts/seed-awip-training-demo.mjs --force
// Then, in order:
//   node scripts/backfill-pattern-embeddings.mjs
//   node scripts/verify-training-demo.mjs
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
const INDUSTRY = "Manufacturing";
const CREATED_VIA = "seed-awip-training-demo";

// Shared entity names — MUST match seed-awip-demo.mjs verbatim where reused,
// so the entity web stays connected.
const E_COIL_LOT = "Coil-lot / chemical-lot re-qualification";
const E_NIP = "Nip roller pressure re-check";
const E_POST_CHANGEOVER = "Post-changeover first-run release";
const E_PEEL_CHECK = "First-bundle peel-check";
const E_DELAM = "Facer delamination escape";
const E_QUOTE_TIME = "Custom / tight-date order at quote time";
const E_INTAKE = "New-hire compliance intake (I-9 / E-Verify)";
const E_FIRST_WEEK = "First-week onboarding sequence";

// ═══ 1. THE FOUR NEW SOURCE FRAMEWORKS (in-voice, IMP register) ════════════
const NEW_FRAMEWORKS = [
  // ── NF1 · Carlos Ramos — the maintenance re-qual discipline ──────────────
  {
    id: "nf1",
    email: "carlos.ramos@awip-demo.example",
    expertName: "Carlos Ramos",
    daysAgo: 19,
    trigger_type: "friction",
    method: "a3",
    context_function: "Maintenance",
    situation_type: "Process failure",
    intervention_type: "Add",
    context_summary:
      "Divisional Maintenance Manager set the full laminator re-qualification sequence for a coil-lot changeover, after scrap runs kept tracing back to the one re-check the crews skip.",
    trigger_signal:
      "A coil-lot change on the laminator where the re-qual gets done fast — temperature verified, first bundle checked — but the nip roller pressure re-check gets skipped because the last lot ran fine at the current setting.",
    signal_detail:
      "Coil-lot change logged but no nip pressure reading recorded with it. Re-qual sign-off faster than the full sequence takes. A scrap run on the first panels of a new coil lot when everything 'looked normal' at changeover.",
    judgment:
      "The re-qual is the FULL sequence, every coil-lot change, no judgment call about which steps this lot needs: confirm the lot is logged and the variance flag checked, re-verify laminator temperature to the lot spec, re-check AND record the nip roller pressure, run the first-bundle peel-check, sign off with the lot number attached. The nip re-check is not optional because the last lot ran fine — that's exactly the reasoning that produces the tenth-run scrap.",
    rationale:
      "Coil gauge varies lot to lot — a few thousandths is normal and inside spec at the mill. The nip pressure that was right for the last lot is wrong for this one by exactly that variance, and a nip that's wrong by a few thou changes the bond without changing anything you can see from the walkway. Nine times out of ten the lots are close enough and skipping the re-check costs nothing, which is precisely why people skip it. The tenth time is a scrap run that costs more than a year of thirty-second re-checks. You don't get to know in advance which lot is the tenth one.",
    boundaries:
      "This is the COIL-lot sequence. A chemical-lot change is a different animal — that one goes to the full bond-strength re-qualification, not just this checklist. And a mid-lot restart with no lot change doesn't need the full sequence — that's what the standard startup check covers.",
    entity_map: [
      { type: "process", name: E_COIL_LOT, detail: "full re-qual sequence, every step" },
      { type: "process", name: E_NIP, detail: "the step most often skipped" },
      { type: "equipment_asset", name: "Little Rock laminator line", detail: null },
      { type: "department", name: "Maintenance", detail: "Divisional" },
    ],
    framework: {
      name: "The Full Re-Qual, No Skipped Steps",
      tagline:
        "A coil-lot changeover gets the whole re-qual sequence every time — the nip re-check most of all, because lot-to-lot gauge variance changes the bond without changing anything you can see.",
      when_to_apply: [
        "Any coil-lot change on the laminator, before the line is released to run — especially when the changeover feels routine and the last lot ran clean.",
      ],
      signals: [
        "Coil-lot change logged with no nip pressure reading recorded alongside it.",
        "Re-qual sign-off coming back faster than the full sequence physically takes.",
        "A scrap run on the first panels of a new lot when the changeover 'looked normal.'",
      ],
      the_play:
        "Run the full sequence, in order, every coil-lot change: 1) lot logged and variance flag checked, 2) laminator temperature re-verified to lot spec, 3) nip roller pressure re-checked AND recorded, 4) first-bundle peel-check, 5) sign-off with the lot number attached. No step is optional because the last lot ran fine.",
      why_it_works:
        "Coil gauge varies lot to lot by a few thousandths — normal, in-spec, and invisible from the walkway. The nip pressure that was right for the last lot is wrong for this one by exactly that variance, and a nip off by a few thou changes the bond. Nine of ten lots are close enough that skipping costs nothing — which is why the skip happens, and why the tenth run is scrap. The recorded reading is the difference between a re-qual and a walk-past.",
      boundaries: [
        "Coil-lot changes only — a chemical-lot change escalates to the full bond-strength re-qualification, not this checklist.",
        "A mid-lot restart with no lot change is the standard startup check, not the full sequence.",
      ],
    },
  },

  // ── NF2 · John Dial — the coil-lot variance notes ────────────────────────
  {
    id: "nf2",
    email: "john.dial@awip-demo.example",
    expertName: "John Dial",
    daysAgo: 26,
    trigger_type: "friction",
    method: "a3",
    context_function: "Ops",
    situation_type: "Process failure",
    intervention_type: "Add",
    context_summary:
      "Divisional Inventory Controller built the coil-lot logging and variance-flag system that tells the floor which incoming lots need extra attention at changeover, after drift problems kept arriving unannounced.",
    trigger_signal:
      "A new coil lot arriving at the line with nobody having looked at how it differs from the lot it replaces — gauge, coating, mill of origin — until the panels tell you.",
    signal_detail:
      "A coil lot staged for the laminator with no log entry against it. A variance flag sitting unchecked at changeover. Maintenance asking 'was there anything different about this lot?' AFTER a bad run instead of before it.",
    judgment:
      "Every coil lot gets logged when it lands, and gets a variance flag when it differs from the running lot in gauge, coating system, or mill. The flag is not paperwork — it's the message to whoever runs the changeover re-qual: this one moved, re-check what the movement touches. The floor should never learn about a lot difference from the panels.",
    rationale:
      "The mill's paperwork is honest but nobody on the line reads certs at 2 AM. Lot-to-lot variance is normal — a few thou of gauge, a different coating batch — and almost always fine IF the changeover re-qual accounts for it. The failure mode is never the variance itself; it's the variance arriving unannounced, so the re-qual runs on last lot's assumptions. A one-line log entry and a flag turns 'surprise' into 'known input.' Cheap on my side, decisive on theirs.",
    boundaries:
      "The flag says CHECK, it doesn't say what you'll find — it never substitutes for the physical re-checks at the machine. And it only covers what the mill declares plus what receiving measures; a within-spec lot that still runs different is exactly why the machine-side re-qual exists.",
    entity_map: [
      { type: "process", name: E_COIL_LOT, detail: "lot logging + variance flag" },
      { type: "process", name: "Coil-lot variance flag", detail: "checked at changeover" },
      { type: "department", name: "Inventory", detail: "Divisional" },
    ],
    framework: {
      name: "The Lot Doesn't Tell You. The Log Does.",
      tagline:
        "Log every coil lot when it lands and flag any variance from the running lot — the floor should never learn about a lot difference from the panels.",
      when_to_apply: [
        "Every incoming coil lot, at receiving — and every changeover, where the variance flag is the first thing the re-qual crew checks.",
      ],
      signals: [
        "A coil lot staged for the line with no log entry against it.",
        "A variance flag sitting unchecked at changeover time.",
        "Maintenance asking what was different about a lot AFTER a bad run.",
      ],
      the_play:
        "Log the lot on arrival: gauge as-received, coating system, mill. Compare against the running lot; any difference gets the variance flag. At changeover, the flag is the handoff — it tells the re-qual crew 'this one moved, re-check what the movement touches,' starting with nip pressure on a gauge change.",
      why_it_works:
        "Lot-to-lot variance is normal and almost always fine — IF the re-qual accounts for it. The failure is variance arriving unannounced, so the re-qual runs on the last lot's assumptions. A one-line log and a flag turns a surprise into a known input. It costs a minute at receiving and saves the scrap run nobody can predict.",
      boundaries: [
        "The flag says CHECK — it never substitutes for the physical re-checks at the machine.",
        "It covers declared and measured variance only; a within-spec lot that still runs different is what the machine-side re-qual is for.",
      ],
    },
  },

  // ── NF3 · Brian Hicks — the compliance-intake judgment ───────────────────
  {
    id: "nf3",
    email: "brian.hicks@awip-demo.example",
    expertName: "Brian Hicks",
    daysAgo: 31,
    trigger_type: "judgment",
    method: "cdm",
    context_function: "HR",
    situation_type: "Process failure",
    intervention_type: "Add",
    context_summary:
      "Senior Director of HR & EHS codified the new-hire compliance intake judgment — I-9, E-Verify, the completeness gate, and the never-guess escalation rule — after first-week paperwork kept getting held up and chased across the plants.",
    trigger_signal:
      "A new hire's first-week file moving through I-9 and E-Verify with each generalist doing the sequence slightly differently — something missing, something late, and somebody chasing it in week three.",
    signal_detail:
      "I-9 Section 1 not completed by end of the employee's first day. Section 2 document examination pushed past the third business day. An E-Verify case submitted outside the window, or a confirmation that never got attached to the file. A generalist making a judgment call on an unusual document instead of escalating.",
    judgment:
      "Compliance intake is one correct sequence, not a style. I-9 Section 1 by end of day one — the employee's part, and the three most-missed fields get checked before they leave. Section 2 document examination within three business days, against the acceptable-document combinations — you match the combination, you never improvise one. E-Verify inside the required window, confirmation attached to the file. The file isn't done until the completeness gate passes — the five-item check. And the moment a document is missing, expired, or just reads wrong: stop and escalate to me. A generalist never guesses on a compliance call. Guessing wrong in this lane isn't rework, it's federal exposure.",
    rationale:
      "Every one of these steps has a clock or a legal edge on it. The variation between generalists isn't anyone being careless — it's that the sequence lived in five heads five slightly different ways, and each version was locally reasonable. But I-9 and E-Verify don't grade on reasonable; they grade on exact. The completeness gate exists because a missing item found in week one is a ten-minute fix, and the same item found in an audit is a finding. The escalation rule exists because the rare weird document is exactly where a confident guess does the most damage — and because taking that judgment OFF the generalist's shoulders is what makes the rest of the sequence fast.",
    boundaries:
      "This is the INTAKE sequence — it doesn't cover reverification timing, remote-hire document procedures, or what happens after a tentative nonconfirmation; those each have their own rule and the answer is still 'escalate, don't improvise.' And the gate is about completeness, not judgment of the hire — nothing in this sequence evaluates the person being onboarded.",
    entity_map: [
      { type: "process", name: E_INTAKE, detail: "one correct sequence, five-item gate" },
      { type: "process", name: "Acceptable-document combinations (I-9 Section 2)", detail: "match, never improvise" },
      { type: "department", name: "HR", detail: "all three plants" },
    ],
    framework: {
      name: "The Compliance Intake Gate",
      tagline:
        "I-9 and E-Verify don't grade on reasonable, they grade on exact — one sequence, a five-item completeness gate, and a never-guess escalation rule.",
      when_to_apply: [
        "Every new hire's first-week compliance file — I-9 Section 1 and 2, E-Verify, and the completeness check before the file is marked done.",
      ],
      signals: [
        "Section 1 not done by end of the employee's first day, or Section 2 examination drifting past day three.",
        "An E-Verify case without its confirmation attached to the file.",
        "A generalist reasoning out loud about whether an unusual document 'probably counts.'",
      ],
      the_play:
        "Run the one sequence: 1) Section 1 by end of day one, three most-missed fields checked before the employee leaves. 2) Section 2 within three business days, documents matched against the acceptable combinations — never improvised. 3) E-Verify inside the window, confirmation attached. 4) The five-item completeness gate before the file is marked done. 5) Anything missing, expired, or odd — stop and escalate. Nobody guesses on a compliance call.",
      why_it_works:
        "Every step has a clock or a legal edge. The generalist-to-generalist variation was five locally-reasonable versions of a sequence that grades on exact. A missing item caught at the gate is a ten-minute fix; the same item in an audit is a finding. And the escalation rule is what makes the sequence fast — the rare weird document is where a confident guess does the most damage, so that judgment comes off the generalist's shoulders entirely.",
      boundaries: [
        "Intake only — reverification, remote-hire procedures, and tentative-nonconfirmation handling each have their own rule, and the answer there is still escalate, don't improvise.",
        "The gate checks the FILE's completeness, never the person — nothing in this sequence evaluates the hire.",
      ],
    },
  },

  // ── NF4 · Klaudia Donaghy — the onboarding sequence ──────────────────────
  {
    id: "nf4",
    email: "klaudia.donaghy@awip-demo.example",
    expertName: "Klaudia Donaghy",
    daysAgo: 24,
    trigger_type: "friction",
    method: "a3",
    context_function: "HR",
    situation_type: "Process failure",
    intervention_type: "Re-sequence",
    context_summary:
      "Senior Manager of Talent Development sequenced the new-hire first week so the compliance intake happens once, correctly, and early — because every downstream first-week step quietly depends on the paperwork being done.",
    trigger_signal:
      "A new hire's first week where orientation, badging, and systems access all started before the compliance file was complete — and then the whole week stalls while somebody chases a missing item.",
    signal_detail:
      "A start date scheduled without the day-one paperwork block on the calendar. Badge or system access requested while the I-9 is still open. The same new hire being pulled back to HR twice in week one for 'one more thing.' Different plants running the first week in different orders.",
    judgment:
      "The first week runs in one order at every plant: the compliance intake block happens day one, before anything that depends on it — badging, systems, training assignments. One sitting, everything collected, the completeness gate passed, and the new hire never comes back for 'one more thing.' The sequence is the same at Little Rock as everywhere else, because the moment plants improvise their own order, the chase comes back.",
    rationale:
      "Every downstream first-week step quietly assumes the paperwork is done — badging wants the file, systems access wants the badge, training wants systems. When intake happens 'sometime this week,' each dependency turns into a stall, and every stall turns into a chase. Doing it day one, in one sitting, isn't bureaucratic tidiness — it's what makes the rest of the week free for the job. And one order across plants is what lets a generalist cover for another plant without relearning the week.",
    boundaries:
      "This sequences the WEEK — it doesn't decide the compliance content. What counts as an acceptable document, and what to do with an odd one, is Brian Hicks's intake gate, and this sequence hands off to it rather than restating it. Batch-start weeks (five hires on one Monday) keep the same order but need the intake block sized for the batch.",
    entity_map: [
      { type: "process", name: E_FIRST_WEEK, detail: "one order, every plant" },
      { type: "process", name: E_INTAKE, detail: "day one, one sitting" },
      { type: "department", name: "HR", detail: "Talent Development" },
    ],
    framework: {
      name: "One First Week, Every Plant",
      tagline:
        "Compliance intake happens day one, in one sitting, before everything that depends on it — one order at every plant, so nobody chases and nobody improvises.",
      when_to_apply: [
        "Scheduling and running any new hire's first week — and any time a plant proposes its own variation on the order.",
      ],
      signals: [
        "A start date on the calendar with no day-one paperwork block.",
        "Badge or systems access requested while the I-9 is still open.",
        "The same new hire back at HR twice in week one for 'one more thing.'",
      ],
      the_play:
        "Day one, first block: the compliance intake, one sitting, completeness gate passed — then badging, then systems, then training assignments, in that order. Same sequence at every plant. If the intake can't complete (missing document), the dependent steps WAIT and the escalation goes to Brian Hicks's gate — the week doesn't route around an open file.",
      why_it_works:
        "Every downstream step quietly assumes the paperwork is done — badging wants the file, systems want the badge, training wants systems. Intake 'sometime this week' turns each dependency into a stall and each stall into a chase. Day one in one sitting frees the rest of the week for the actual job, and one order across plants means any generalist can cover any plant without relearning the week.",
      boundaries: [
        "Sequences the week only — document judgment belongs to the Compliance Intake Gate, and this hands off to it rather than restating it.",
        "Batch-start weeks keep the order but size the intake block for the batch.",
      ],
    },
  },
];

// qa_pairs synthesis — same shape as seed-awip-demo.mjs (7-rung transcript).
const METHOD_Q = {
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

// ═══ 2. THE FOUR STORYLINES ════════════════════════════════════════════════
// Each: the supervisor's typed problem → the recommended+chosen format with
// cited rationale → the COMPLETE training (three altitudes, approved depth) →
// the ⭐ who-else routing with reasons. Framework name strings below must
// match the seeds exactly — they're resolved to record ids at run time.
//
// ⚠️ DRAFT CUSTOMER-FACING CONTENT — the bodies are composed from the four
// APPROVED storylines; surface any drift to Brian before filming.

function storylines(u) {
  return [
    // ══ STORYLINE 1 · FLOOR · Chuck Milner — the delamination release call ══
    {
      slug: "delam-release",
      requestedBy: u.chuck,
      approvedNote: "storyline 1 — teaches the Ng × Whitfield BOUNDARY",
      daysAgo: 1,
      issue_text:
        "We've had two delamination escapes in the last month, both right after a profile changeover. The newer operators are releasing the next run before the bond-strength check clears because the line looks fine. I need them to understand when it's safe to release and when it absolutely is not.",
      issue_restated:
        "Newer operators are making the post-changeover release call without the release judgment — when a peel-check release is genuinely available versus when the full hold is mandatory. The escapes are a knowledge-transfer gap on a judgment two experts have already codified.",
      issue_type: "judgment_gap",
      audience_role: "Multi-Function Operator",
      audience_team: "Little Rock line",
      audience_experience: "new",
      audience_summary: "Little Rock line operators — newer to post-changeover release (new to this work)",
      subject_entities: [
        { type: "process", name: E_POST_CHANGEOVER, detail: "hold vs release judgment" },
        { type: "process", name: E_PEEL_CHECK, detail: null },
        { type: "error_class", name: E_DELAM, detail: "two escapes in a month" },
      ],
      understanding_note:
        "The operators aren't careless — the release judgment lives in two experts' frameworks and hasn't reached the newer seats. Two of our experts draw the release line in different places, and knowing WHY is the whole skill, so the training teaches the boundary between them.",
      experts: [
        { email: "brian.ng@awip-demo.example", frameworkName: "The Controlled Restart Release" },
        { email: "dana.whitfield@awip-demo.example", frameworkName: "The No-Release Gate" },
      ],
      format_key: "hands_on_drill",
      format_name: "Hands-on drill",
      rung: 2,
      recommendations: {
        headline:
          "This is a judgment-under-pressure call, not a facts-recall gap — the operators can hear the rule and still release when the line looks fine. A drill at the line, calling real scenarios out loud before acting, is what moves it.",
        tradeoff: "Takes the crew to the line for 25 minutes per group — a written card would be cheaper and would not transfer this.",
        grounding_caution:
          "The two source experts DISAGREE on where the release line sits — the X-ray holds an open flag between them. This training teaches the boundary between their frameworks, not an average of them.",
        grounding_summary:
          'Built from 2 codified frameworks by Brian Ng, Dana Whitfield — "The Controlled Restart Release", "The No-Release Gate".',
        capture_first: false,
        ranked: [
          {
            format_key: "hands_on_drill",
            format_name: "Hands-on drill",
            effort: "15-30 minutes at the work area",
            rank: 1,
            is_primary: true,
            rationale:
              "The gap is in the doing under pressure: operators must state what changed, whose path applies, and the release call — out loud, at the line, before they act. Repetition with immediate feedback is the only format that builds that reflex.",
            citations: [
              "Deliberate practice",
              "Retrieval practice (the testing effect)",
              "Situated learning / authentic context",
            ],
          },
          {
            format_key: "written_framework",
            format_name: "Written framework",
            effort: "5-minute read",
            rank: 2,
            is_primary: false,
            rationale:
              "Would state both experts' rules cleanly, but two escapes happened with the rule already stated — reading doesn't rehearse the call.",
            citations: ["Cognitive load theory"],
          },
        ],
      },
      training: {
        title: "Post-Changeover Release: When to Hold, When to Run",
        strategy: "boundary drill between two expert paths",
        floor_title: "Post-Changeover Release: When to Hold, When to Run",
        floor_body: `THE TWO-MINUTE WHY

A delamination escape after a changeover isn't a fluke — it's a release decision made too early. We've had two in a month, both right after profile changeovers, both released because the line looked fine. Delamination hides at the bond line; the surface tells you nothing. Two of our experts have codified how to make this call. They agree on the danger. They draw the release line in slightly different places — and knowing WHY is the whole skill this drill builds.

WHAT YOU NEED

- The release station on the Little Rock line, at a real or staged changeover
- Sample panels for peel-checks (use held stock — never manufacture a defect)
- The changeover log for the run in front of you

THE DECISION, WALKED

1. WHEN YOU MAY RELEASE ON A PEEL-CHECK — Brian Ng's Controlled Restart Release. Profile-only changeover: same foam chemistry, same coil lot, same thickness. Laminator temps and line speed back at the qualified setpoint. First-bundle peel-check shows clean cohesive foam failure — the foam tears, the facer holds. Then you may release the first bundle while the full cut-section runs in parallel. Match the inspection depth to the actual risk of the change.

2. WHEN YOU MUST HOLD FOR THE FULL GATE — Dana Whitfield's No-Release Gate. The changeover touched foam chemistry, a chemical or coil lot, thickness, or a laminator parameter that won't hold setpoint. Hold everything until first-article bond-strength AND the cut-section both clear. No exceptions, no "it looks fine." The first run after that kind of change is exactly when bond strength is least predictable.

3. THE TELL THAT DECIDES WHICH ONE YOU'RE IN — what actually changed at the changeover. Read the changeover log, not the panels. Profile-only: Ng's path is available. Chemistry, lot, thickness, or drifting parameters touched: Whitfield's gate, always. If you cannot say for certain what changed, you don't have a profile-only changeover — you have the gate.

THE DRILL

Three staged scenarios. For each one, say it OUT LOUD before anyone acts: what changed, whose path applies, and your release call.

1. Profile swap, same foam lot, peel-check passes clean.
   CORRECT: Release available — Ng's Controlled Restart Release. Nothing in the foam system moved, the peel-check reads cohesive, and the cut-section still runs in parallel. Feedback: this is the exact situation Ng's framework was built for — holding here burns capacity for no risk reduction.

2. Profile swap, but the new coil lot carries John Dial's variance flag.
   CORRECT: Hold — the coil-lot variable pulls you out of profile-only and into Whitfield's gate. Feedback: the peel-check cannot clear a lot change; a gauge shift changes the bond without changing what you see. The flag is the tell.

3. Temperature setpoint was adjusted mid-run to chase a cure issue.
   CORRECT: Whitfield's No-Release Gate, full hold. Feedback: a parameter that moved is a foam variable in motion — Dana's framework says the gate holds until bond-strength and cut-section both clear, and nothing about how the panels look changes that.

WHAT GOOD LOOKS LIKE

The operator names what changed FIRST, names the expert path SECOND, and makes the call THIRD — in that order, without prompting, on all three scenarios. Speed matters less than order: the call comes from the changeover, never from the panel's surface.

COACHING CUES

- "What does the changeover log say moved?" — before any other question.
- "Which framework are you standing in right now — Ng's or Whitfield's?"
- "What would have to be true for the other path to apply?"

THE ONE THING TO NEVER DO

Never release because the panel looks fine. Delamination hides at the bond line — the surface tells you nothing. The check clears it, or you hold. Both experts agree on exactly this, and both escapes started here.

TIME

25 minutes at the line, per group of three.`,
        supervisor_title: "Running the release drill — supervisor guide",
        supervisor_body: `WHAT TO SET UP

Stage the three scenarios at the release station with real paperwork: a clean profile-only changeover log, one with John Dial's variance flag on the incoming coil lot, and one with a mid-run temperature adjustment. Use held stock for peel samples. Groups of three, 25 minutes.

HOW TO RUN IT

Each operator makes each call OUT LOUD before anyone acts, in this order: what changed, whose path applies — Brian Ng's Controlled Restart Release or Dana Whitfield's No-Release Gate — then the release call. The order is the skill. An operator who jumps straight to "release" or "hold" without naming what changed is pattern-matching on how the line looks, which is exactly what produced the two escapes.

WHAT TO WATCH FOR

- The operator who gets the right answer from the wrong place — "it looks fine" — correct the reasoning even when the call is right.
- Hesitation on scenario 2: the coil-lot flag is the subtlest tell. If they miss it, walk them back to the changeover log, not the panel.
- Anyone treating the two experts as a contradiction to pick sides on. They're not — each is right in its own territory, and the drill teaches the border.

HOW YOU KNOW IT LANDED

All three scenarios called in the right order, unprompted, including the boundary case. Re-run the drill for anyone who clears it slowly — under changeover pressure, slow becomes skipped.

WHEN THIS DOESN'T FIT

If a changeover's scope is genuinely unclear even from the log, that's not a drill gap — escalate to Dana Whitfield's full gate and flag the log practice itself.`,
        exec_title: "Executive summary — post-changeover release drill",
        exec_body: `Two delamination escapes in a month traced to the same decision: newer operators releasing post-changeover runs because the line looked fine. The judgment for that call already exists — Brian Ng's conditional release for low-risk changeovers and Dana Whitfield's mandatory hold when the foam system moved — and the training teaches the boundary between them, which is where the escapes lived. Delivered as a 25-minute drill at the line because the gap is judgment under pressure, not missing facts. Success looks like release calls made from the changeover log instead of the panel's surface, and no repeat escape across the watch window.`,
      },
      routing: [
        {
          kind: "person",
          email: "devin.cross@awip-demo.example",
          label: "Devin Cross",
          detail: "Multi-Function Operator (new) — Little Rock",
          reason:
            "Newest on the line with the highest changeover exposure — no release-decision training on record yet. Priority.",
        },
        {
          kind: "person",
          email: "richard.jenkins@awip-demo.example",
          label: "Richard Jenkins",
          detail: "Multi-Function Operator",
          reason:
            "Runs second shift, where the profile changes most often — his last recorded framework interaction predates the No-Release Gate codification.",
        },
        {
          kind: "role",
          email: null,
          label: "Multi-Function Operator — Little Rock, hired in the last 6 months",
          detail: "everyone in the seat",
          reason:
            "Same exposure window as both escapes. Routing to the seat keeps this a training gap the onboarding missed — never a mark against any one person.",
        },
      ],
    },

    // ══ STORYLINE 2 · FLOOR · Carlos Ramos — the coil-lot changeover miss ═══
    {
      slug: "coil-requal",
      requestedBy: u.carlos,
      approvedNote: "storyline 2 — job aid + teach-back from Ramos + Dial",
      daysAgo: 2,
      issue_text:
        "Maintenance keeps re-qualifying the laminator after a coil-lot change but skipping the re-check on the nip roller pressure. It's fine 9 times out of 10, but the 10th is a scrap run. I need the changeover re-qual to include the nip check every time.",
      issue_restated:
        "The coil-lot changeover re-qual is being run partially — the nip roller pressure re-check gets skipped because the last lot ran fine. The full sequence exists in Carlos Ramos's framework; it needs to reach every tech who runs the re-qual, with the WHY attached so the step survives.",
      issue_type: "recurring_error",
      audience_role: "Maintenance Technician",
      audience_team: "Divisional Maintenance",
      audience_experience: "mixed",
      audience_summary: "Maintenance technicians who perform laminator changeover re-qual (mixed experience)",
      subject_entities: [
        { type: "process", name: E_COIL_LOT, detail: "full sequence, every time" },
        { type: "process", name: E_NIP, detail: "the skipped step" },
        { type: "equipment_asset", name: "Little Rock laminator line", detail: null },
      ],
      understanding_note:
        "The skip is a process gap, not one person's shortcut — the step most often skipped is the one whose reason was never taught. The job aid pins the sequence at the machine; the teach-back proves the WHY transferred, because a tech who can explain it will never skip it.",
      experts: [
        { email: "carlos.ramos@awip-demo.example", frameworkName: "The Full Re-Qual, No Skipped Steps" },
        { email: "john.dial@awip-demo.example", frameworkName: "The Lot Doesn't Tell You. The Log Does." },
      ],
      format_key: "job_aid",
      format_name: "Job aid",
      rung: 1,
      recommendations: {
        headline:
          "The sequence is a lookup, not a skill — it belongs ON the machine, not in a session. The one-time teach-back closes the actual gap: the WHY behind the nip re-check, because a tech who owns the reason never skips the step.",
        tradeoff:
          "A card can't police itself — the teach-back and the recorded nip reading are what make the skipped step visible.",
        grounding_caution: null,
        grounding_summary:
          'Built from 2 codified frameworks by Carlos Ramos, John Dial — "The Full Re-Qual, No Skipped Steps", "The Lot Doesn\'t Tell You. The Log Does."',
        capture_first: false,
        ranked: [
          {
            format_key: "job_aid",
            format_name: "Job aid",
            effort: "one page, no session",
            rank: 1,
            is_primary: true,
            rationale:
              "A low-frequency sequence with a hard order and a hard stop condition, needed at the machine at the moment of the lot change — the definition of point-of-need support. Paired with a 10-minute teach-back so the reason behind the most-skipped step transfers, not just the step.",
            citations: [
              "Performance support at the point of need",
              "Learning by teaching (the protégé effect)",
              "Cognitive load theory",
            ],
          },
          {
            format_key: "hands_on_drill",
            format_name: "Hands-on drill",
            effort: "15-30 minutes at the work area",
            rank: 2,
            is_primary: false,
            rationale:
              "The techs can already perform every step — the gap is one step being skipped, not a skill deficit, so drilling the whole sequence buys little.",
            citations: ["Deliberate practice"],
          },
        ],
      },
      training: {
        title: "Coil-Lot Changeover: The Full Re-Qual, No Skipped Steps",
        strategy: "point-of-use checklist plus why-transfer teach-back",
        floor_title: "Coil-Lot Re-Qual — every step, every time",
        floor_body: `WHY THIS CARD EXISTS

Nine coil lots out of ten are close enough that a skipped nip check costs nothing. The tenth is a scrap run — and nobody gets to know in advance which lot is the tenth. This is Carlos Ramos's full sequence with John Dial's lot log feeding it. It lives at the laminator. Every coil-lot change, every step, every time.

WHEN TO USE THIS

Any coil-lot change on the laminator, before the line is released to run.

DO THIS

1. Confirm the new coil lot is logged in John Dial's system and CHECK THE VARIANCE FLAG. Flagged = this lot moved; the flag tells you what to re-check first.
2. Re-verify laminator temperature to the lot spec.
3. RE-CHECK THE NIP ROLLER PRESSURE AND RECORD THE READING. This is the step most often skipped. Coil gauge varies lot to lot by a few thou — the nip that was right for the last lot is wrong for this one by exactly that much, and it changes the bond without changing anything you can see.
4. Run the first-bundle peel-check.
5. Sign off WITH THE LOT NUMBER ATTACHED. No lot number, no sign-off.

CHECK

The re-qual record shows a nip reading dated today, against this lot number. If the reading isn't recorded, the check didn't happen — "I looked at it" doesn't survive to the next shift.

STOP IF

- The changeover involved a CHEMICAL lot change — that's the full bond-strength re-qualification, not this card.
- The nip reading is outside the lot spec and you can't bring it in — hold the line and call it in.
- The peel-check reads adhesive (facer) failure — hold, full gate, no release.

WHO TO CALL

Carlos Ramos (Divisional Maintenance) for the sequence. John Dial (Inventory) for anything odd on the lot log or variance flag.

THE TEACH-BACK — 10 MINUTES, ONCE

Before this card is yours, explain back to your lead WHY the nip check matters on a coil-lot change specifically. The answer that counts: coil gauge varies lot to lot, so the nip pressure that was right for the last lot can be wrong for this one — and a nip off by a few thou changes the bond invisibly. If you can explain that, you'll never skip the step. If it won't come out clean, that's not a mark — it's the cue to walk the card once more with your lead.

THE ONE THING TO NEVER DO

Never carry the last lot's setup forward because it ran fine. "It ran fine" is the exact reasoning that produces the tenth-run scrap.`,
        supervisor_title: "Supervisor brief — Coil-Lot Re-Qual card + teach-back",
        supervisor_body: `WHAT'S DEPLOYED

Carlos Ramos's full re-qual sequence is now a laminated card at the laminator, fed by John Dial's lot log and variance flag. Five steps, hard order, with the nip roller re-check called out as the step that gets skipped — and a required recorded reading so a skip is visible instead of invisible.

YOUR PART

Run the one-time teach-back with each tech: ten minutes, one question — why does the nip check matter on a coil-lot change specifically? The answer you're listening for is the mechanism: gauge varies lot to lot, the last lot's nip is this lot's wrong nip, and the bond changes without anything visible changing. A tech who owns that reason never skips the step. A tech who recites the steps but can't say why — re-walk the card with them once more. That's a transfer gap closing, not a performance note.

WHAT TO WATCH FOR

- Sign-offs coming back faster than the sequence physically takes.
- Re-qual records with no nip reading against the new lot number.
- A variance-flagged lot released with no note of what was re-checked.

WHEN IT DOESN'T FIT

A chemical-lot change is outside this card — full bond-strength re-qualification. If a tech hits a nip reading they can't bring into spec, the card says hold and call — back them on the hold.

HOW YOU KNOW IT LANDED

Every coil-lot change shows a recorded nip reading, and the tenth-run scrap stops happening. Quiet is the success signal here.`,
        exec_title: "Executive summary — coil-lot re-qual",
        exec_body: `Recurring scrap runs traced to one skipped step in the coil-lot changeover re-qual: the nip roller pressure re-check, skipped because nine lots out of ten forgive it. Deployed as a permanent card at the machine — Carlos Ramos's full sequence, fed by John Dial's lot-variance flag — plus a one-time ten-minute teach-back per tech, because a tech who can explain WHY the step matters never skips it. Cost is thirty seconds per changeover against a scrap run whose timing nobody can predict. Watching for recorded nip readings on every lot change and quiet on the scrap signal.`,
      },
      routing: [
        {
          kind: "role",
          email: null,
          label: "Maintenance Technician — changeover re-qual",
          detail: "everyone who runs the re-qual",
          reason:
            "The skip is a process gap, not one person's mistake — every tech who performs the re-qual gets the card and the teach-back, so the fix lands on the seat, not on a name.",
        },
        {
          kind: "person",
          email: "richard.jenkins@awip-demo.example",
          label: "Richard Jenkins",
          detail: "Multi-Function Operator",
          reason:
            "Performs the re-qual on off-shifts when maintenance is thin — same gap, different seat, same card.",
        },
      ],
    },

    // ══ STORYLINE 3 · OFFICE · Kim Harrell — the custom-profile promise ═════
    {
      slug: "custom-promise",
      requestedBy: u.kim,
      approvedNote: "storyline 3 — teaches the Harrell × Montes BOUNDARY",
      daysAgo: 3,
      issue_text:
        "A rep just promised a customer a custom panel profile with a two-week lead time. Ops can't hit it, and now we're either eating the cost or breaking a promise. My newer reps don't know which custom requests are safe to promise and which need an ops check first. I need them to stop promising things we can't build.",
      issue_restated:
        "Newer reps can't yet tell which custom-profile requests are safe to promise on the spot and which require an ops check first — the judgment two leaders have codified from opposite sides of the same territory. The training teaches when each side's rule applies.",
      issue_type: "judgment_gap",
      audience_role: "Sales Representative",
      audience_team: "Sales",
      audience_experience: "new",
      audience_summary: "Sales reps — newer to custom-profile quoting (new to this work)",
      subject_entities: [
        { type: "process", name: E_QUOTE_TIME, detail: "promise vs ops-check judgment" },
        { type: "department", name: "Sales", detail: null },
        { type: "department", name: "Operations", detail: "capacity reality" },
      ],
      understanding_note:
        "Sales wants to say yes and Ops needs reality respected — both are right, and the X-ray holds an open flag between their frameworks. The skill is knowing which situation you're in BEFORE you promise, so the training is decision practice on realistic requests, teaching the boundary rather than picking a winner.",
      experts: [
        { email: "kim.harrell@awip-demo.example", frameworkName: "Custom Profile: Promise It or Walk" },
        { email: "brian.montes@awip-demo.example", frameworkName: "Capacity Reality First" },
      ],
      format_key: "scenario_walkthrough",
      format_name: "Scenario walkthrough",
      rung: 3,
      recommendations: {
        headline:
          "The reps don't lack facts — they lack the reflex of reading WHICH situation a request is before answering. Short decision scenarios with immediate feedback build exactly that reflex, and they fit inside a sales day.",
        tradeoff:
          "Self-paced scenarios reach everyone fast but nobody watches the rep decide — the feedback lines carry the coaching.",
        grounding_caution:
          "The two source experts DISAGREE — Kim Harrell's promise-wins-accounts rule and Brian Montes's capacity-reality rule hold an open conflict flag. The training teaches when each one's path applies, never an average.",
        grounding_summary:
          'Built from 2 codified frameworks by Kim Harrell, Brian Montes — "Custom Profile: Promise It or Walk", "Capacity Reality First".',
        capture_first: false,
        ranked: [
          {
            format_key: "scenario_walkthrough",
            format_name: "Scenario walkthrough",
            effort: "30-45 minute session",
            rank: 1,
            is_primary: true,
            rationale:
              "Judgment under ambiguity — the answer depends on reading the request, not following a step. Five realistic requests, the rep makes the call on each, and the feedback cites which expert's judgment applies and why. Deciding, not reading, is what builds the reflex.",
            citations: [
              "Retrieval practice (the testing effect)",
              "Situated learning / authentic context",
              "Bloom's taxonomy (revised)",
            ],
          },
          {
            format_key: "discussion_guide",
            format_name: "Discussion guide",
            effort: "45-60 minute facilitated session",
            rank: 2,
            is_primary: false,
            rationale:
              "Right shape for the LEADERS' seam, but the reps' gap is individual decision reflex — and the two experts' boundary is already codified, so the room doesn't need to renegotiate it.",
            citations: ["Conceptual change"],
          },
        ],
      },
      training: {
        title: "Before You Promise a Custom Profile: The 90-Second Ops Check",
        strategy: "decision scenarios across a two-expert boundary",
        floor_title: "Before You Promise a Custom Profile: The 90-Second Ops Check",
        floor_body: `THE SETUP

You're on the phone. The customer wants a custom panel profile and they want a date. Say yes and hit it — you've won the account for years. Say yes and miss it — you've lost the account AND the margin. This training exists because both of those sentences are true, and they come from two of our own leaders.

THE TENSION, NAMED HONESTLY

Kim Harrell's rule — Promise It or Walk: a promise you keep wins the account for years; hedge on everything and you're just slower than the competitor who commits. Brian Montes's rule — Capacity Reality First: a promise we can't build costs the account and the margin, and Ops ends up paying for optimism it never signed up for. Both are right. The skill is knowing WHICH situation you're in before you promise. That's the whole training.

WHO IS IN THE ROOM

You, self-paced, 15 minutes. Each scenario: make your call FIRST, then read the feedback.

THE 90-SECOND CHECK — RUN IT BEFORE ANY CUSTOM PROMISE

1. Have we run this profile in the last 90 days? Yes → likely safe: Kim's promise-it path is open.
2. Does it need a tooling change, or a foam chemistry the plant isn't currently running? Yes → stop: Brian Montes's path — no promise until Ops confirms.
3. Is the lead time inside our standard, or is the customer compressing it? Compression → always the ops check, no matter how familiar the profile.

DECISION POINT 1 — Standard profile, standard lead time.
YOUR CALL, then read on.
CORRECT: Promise it. Kim Harrell's path — this is the yes that wins accounts, and hedging here just makes us slower. Nothing in the request touches capacity risk.

DECISION POINT 2 — Custom profile we ran last month, standard lead time.
CORRECT: Promise it, and note the prior run in the quote. The 90-day question is doing its job — recent production is the evidence the promise is buildable. Kim's path, earned by the check.

DECISION POINT 3 — New profile requiring a tooling change.
CORRECT: Ops-check first. Brian Montes's path — a tooling change means capacity and schedule are in play, and only Ops can see that board. Promising here is promising someone else's week.

DECISION POINT 4 — Standard profile, compressed lead time.
CORRECT: Ops-check the compression. The profile is safe; the DATE isn't. Compression is always Montes territory — the familiar profile is exactly what makes this one feel safer than it is.

DECISION POINT 5 — Custom foam spec the plant isn't currently running.
CORRECT: Hard stop, ops-check. Montes's path at full strength — a chemistry the plant isn't running is a capacity question wearing a product costume. No promise of any kind until Ops speaks.

THE SCRIPT — WHAT TO SAY WHILE YOU CHECK

"Let me confirm our production slot so I can give you a date we'll actually hit — I'll have it to you within the hour." That's diligence, not hesitation. Customers keep vendors who hit dates; nobody remembers the extra hour.

THE DEBRIEF — ASK YOURSELF

- Which question in the 90-second check decided each scenario?
- Which scenario would you have gotten wrong a month ago, and what would it have cost?
- Where does YOUR next live request sit?

THE ONE THING TO NEVER DO

Never promise a compressed date or an un-run spec to close the call faster. That yes doesn't win the account — it hands Ops a promise they never made, and the miss costs the account AND the margin. When in doubt, run the check: 90 seconds against years of the relationship.`,
        supervisor_title: "Running the ops-check scenarios — sales manager guide",
        supervisor_body: `WHAT THIS IS

Five decision scenarios teaching newer reps the boundary between Kim Harrell's Promise It or Walk and Brian Montes's Capacity Reality First — when the fast yes wins, and when the request has to go through Ops first. Self-paced, 15 minutes; the feedback lines carry the coaching.

HOW TO RUN IT

Assign it before your next pipeline review, then spend five minutes of that review on it: have each rep name the scenario they'd have called differently a month ago. That single question surfaces who owns the boundary and who's still guessing.

WHAT TO WATCH FOR

- Reps who treat the ops check as losing the deal — point them at the script line. It reads as diligence to the customer, and the reps carrying the most custom requests use it most.
- Reps who start ops-checking EVERYTHING — that's Kim's half of the boundary being lost. A standard profile at standard lead is a promise, not a ticket. Over-checking makes us slower than the competitor who commits.
- The compression case (scenario 4) is the one experienced reps miss — familiarity of the profile masks the date risk.

HOW YOU KNOW IT LANDED

Custom requests start arriving at Ops BEFORE the promise instead of after it — and standard requests keep getting promised on the call. Both halves matter; either one alone means the boundary didn't transfer.

WHEN IT DOESN'T FIT

If a rep and Ops read the same request differently after the check, that's not a rep gap — that's the leaders' seam, and it goes to Kim and Brian Montes's table, not another round of this training.`,
        exec_title: "Executive summary — the 90-second ops check",
        exec_body: `A rep promised a custom profile on a two-week lead Ops can't hit — eat the cost or break the promise. The judgment for that call already exists on both sides of the house: Kim Harrell's promise-wins-accounts rule and Brian Montes's capacity-reality rule, an open conflict the training turns into a taught boundary — three questions, ninety seconds, run before any custom promise. Newer reps learn it by deciding five realistic requests with expert-cited feedback. Success: custom requests reaching Ops before the promise, standard requests still promised on the call, and no more eating the cost of optimism.`,
      },
      routing: [
        {
          kind: "person",
          email: "ben.seger@awip-demo.example",
          label: "Ben Seger",
          detail: "Territory Manager",
          reason:
            "Carries the most custom-profile requests of any territory and is newest to the custom line — highest exposure to exactly this call.",
        },
        {
          kind: "role",
          email: null,
          label: "Sales Representative — all territories",
          detail: "everyone in the seat",
          reason:
            "The gap is the ops-check reflex, which is training for the seat, not an individual failing — routing to the role is what keeps it that way.",
        },
      ],
    },

    // ══ STORYLINE 4 · OFFICE · Klaudia Donaghy — the onboarding bottleneck ══
    {
      slug: "compliance-intake",
      requestedBy: u.klaudia,
      approvedNote: "storyline 4 — walkthrough + reference from Hicks + Donaghy",
      daysAgo: 4,
      issue_text:
        "Every new hire's first-week paperwork gets held up because the HR generalists each do the I-9 and E-Verify step slightly differently, and half the time something's missing and we have to chase it. I need everyone doing the compliance intake the same correct way, the first time.",
      issue_restated:
        "The compliance intake runs five slightly different ways across the generalists, so files come back incomplete and get chased. One correct sequence already exists — Brian Hicks's intake gate inside Klaudia Donaghy's first-week order — and it needs to reach every generalist as the one way, with the reference kept at hand.",
      issue_type: "procedural_skill",
      audience_role: "HR Generalist",
      audience_team: "All three plants",
      audience_experience: "mixed",
      audience_summary: "HR generalists across all three plants (mixed experience)",
      subject_entities: [
        { type: "process", name: E_INTAKE, detail: "one correct way, first time" },
        { type: "process", name: E_FIRST_WEEK, detail: null },
        { type: "department", name: "HR", detail: "all three plants" },
      ],
      understanding_note:
        "The inconsistency is the problem — five locally-reasonable versions of a sequence that grades on exact. The walkthrough installs the one sequence by doing it alongside a real file; the permanent reference means consistency never depends on memory.",
      experts: [
        { email: "brian.hicks@awip-demo.example", frameworkName: "The Compliance Intake Gate" },
        { email: "klaudia.donaghy@awip-demo.example", frameworkName: "One First Week, Every Plant" },
      ],
      format_key: "scenario_walkthrough",
      format_name: "Scenario walkthrough",
      rung: 3,
      recommendations: {
        headline:
          "For a compliance process, consistency beats improvisation — a guided walkthrough done alongside a real file installs the sequence as worked example, and the permanent reference means it never has to be remembered under pressure.",
        tradeoff:
          "A walkthrough takes each generalist 20 minutes with a live or sample file — a memo would be faster and would change nothing.",
        grounding_caution: null,
        grounding_summary:
          'Built from 2 codified frameworks by Brian Hicks, Klaudia Donaghy — "The Compliance Intake Gate", "One First Week, Every Plant".',
        capture_first: false,
        ranked: [
          {
            format_key: "scenario_walkthrough",
            format_name: "Scenario walkthrough",
            effort: "30-45 minute session",
            rank: 1,
            is_primary: true,
            rationale:
              "Do-it-alongside on a real new-hire file: each step performed in order, with the two judgment moments — the document combinations and the escalation rule — practiced against realistic cases. Worked-example learning is the right tool when the standard is exactness, and the reference card makes it permanent.",
            citations: [
              "Situated learning / authentic context",
              "Cognitive load theory",
              "Performance support at the point of need",
            ],
          },
          {
            format_key: "job_aid",
            format_name: "Job aid",
            effort: "one page, no session",
            rank: 2,
            is_primary: false,
            rationale:
              "The reference alone would document the sequence without installing it — the generalists each already HAVE a version they trust, and a card doesn't displace a habit.",
            citations: ["Performance support at the point of need"],
          },
        ],
      },
      training: {
        title: "New-Hire Compliance Intake: One Correct Way, First Time",
        strategy: "guided worked example plus permanent reference",
        floor_title: "New-Hire Compliance Intake: One Correct Way, First Time",
        floor_body: `THE SETUP

A new hire starts Monday. Their first-week file — I-9, E-Verify, the completeness check — is your first block of day one, per Klaudia Donaghy's first-week sequence, before badging, before systems, before anything that depends on it. This walkthrough is Brian Hicks's intake gate, done alongside a real or sample file, once, so the one correct way becomes YOUR way. It grades on exact, not on reasonable — that's why there's one sequence and not five.

WHO IS IN THE ROOM

You, a lead or Klaudia, and one file — live new hire or the sample packet. 20 minutes.

THE WALKTHROUGH — DO EACH STEP ON THE FILE IN FRONT OF YOU

1. I-9 SECTION 1 — completed BY THE EMPLOYEE by end of day one. Before they leave the room, check the three most-missed fields: the other-last-names field, the attestation checkbox, and the signature date matching day one. Ten seconds now versus a chase in week three.

2. I-9 SECTION 2 — document examination within 3 business days. Match what they hand you against the acceptable-document combinations ON THE REFERENCE — one List A document, OR one List B plus one List C. You match a combination; you never improvise one. If what's on the table doesn't cleanly match a line on the matrix, that is not a judgment call — that's step 5.

3. E-VERIFY — submit within the required window, then attach the confirmation to the file. Not "submitted" — attached. The case that exists without its confirmation in the file is the finding an audit loves.

4. THE COMPLETENESS GATE — before the file is marked done, the five-item check: Section 1 complete and dated day one · Section 2 examined and dated inside three days · document combination matches the matrix · E-Verify confirmation attached · everything signed. Five items, thirty seconds, and nothing gets chased later.

DECISION POINT — A DOCUMENT IS MISSING, EXPIRED, OR JUST READS WRONG

Your call, then read on.
CORRECT: Stop. Don't guess, don't improvise a combination, don't mark the file done "pending." Escalate to Brian Hicks — that's the sequence working, not the sequence failing. Per his gate: a generalist never guesses on a compliance call, because guessing wrong here isn't rework, it's federal exposure. The dependent steps (badge, systems) WAIT per Klaudia's sequence — the week doesn't route around an open file.

THE DEBRIEF

- Which of the five gate items has bitten your plant before?
- What's the difference between escalating and being unsure? (Nothing — that's the point. Escalation is the designed path, not a confession.)
- Where does the reference live at your desk, starting today?

THE REFERENCE — KEEP THIS

The same five steps plus the acceptable-document matrix as a one-page card. Consistency doesn't depend on memory: it's the same sequence at every plant, so any generalist can cover any plant, per Klaudia Donaghy's One First Week.

WHAT TO WATCH FOR

You know it's yours when the file passes the five-item gate the first time, with no chase — and when an odd document goes to Brian Hicks the same day instead of sitting on a maybe.

THE ONE THING TO NEVER DO

Never mark a file done that hasn't passed the gate, and never guess on a document call. A missing item found today is a ten-minute fix; the same item found in an audit is a finding with our name on it.`,
        supervisor_title: "Running the intake walkthrough — HR lead guide",
        supervisor_body: `WHAT THIS IS

The one correct compliance-intake sequence — Brian Hicks's gate, inside Klaudia Donaghy's first-week order — installed by walkthrough: each generalist does the five steps alongside a real or sample file once, then keeps the reference card. 20 minutes per generalist, all three plants, same sequence.

HOW TO RUN IT

Use a live file when the calendar allows — the walkthrough sticks best when the file is real. Let the generalist DO each step; you narrate only the why. The two moments that matter most: the document-combination match (watch for improvising instead of matching against the matrix) and the escalation decision point (watch for reluctance — some generalists hear "escalate" as "admit you don't know," and the reframe is that escalation IS the sequence).

WHAT TO WATCH FOR

- A generalist defending their current version of the sequence — expected, blameless, and exactly why this is a walkthrough and not a memo. Every version was locally reasonable; the standard is exact, not reasonable.
- Files marked done without the five-item gate — the gate is the piece that kills the chase.
- Post-walkthrough: E-Verify confirmations actually attached, not just submitted.

HOW YOU KNOW IT LANDED

First-week files pass the gate first time, chases stop, and odd documents reach Brian Hicks same-day. When a generalist covers another plant and the week runs identically — that's Klaudia's sequence doing its job.

WHEN IT DOESN'T FIT

Reverification, remote hires, and tentative nonconfirmations are OUTSIDE this walkthrough — each has its own rule, and the answer is still escalate, never improvise.`,
        exec_title: "Executive summary — compliance intake, one correct way",
        exec_body: `First-week paperwork was stalling because the I-9/E-Verify intake ran five slightly different ways across the generalists — each locally reasonable, on a process that grades on exact. Deployed as a 20-minute guided walkthrough per generalist plus a permanent reference: Brian Hicks's intake gate (the five steps, the document matrix, the never-guess escalation) inside Klaudia Donaghy's one first-week order for all three plants. Compliance exposure drops with the guessing; the chase disappears with the completeness gate. Success: files passing the gate first time, and one sequence any generalist can run at any plant.`,
      },
      routing: [
        {
          kind: "role",
          email: null,
          label: "HR Generalist — all three plants",
          detail: "everyone in the seat",
          reason:
            "The inconsistency IS the problem — the whole role gets the one correct way, so consistency stops depending on which generalist a new hire draws.",
        },
        {
          kind: "person",
          email: "zach.davis@awip-demo.example",
          label: "Zach Davis",
          detail: "Sr. Manager, EHS",
          reason:
            "Handles intake-compliance overlap on the EHS side — same process, adjacent seat.",
        },
      ],
    },
  ];
}

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

async function recordByFrameworkName(name) {
  const { data, error } = await supabase
    .from("pattern_records")
    .select("id, user_id, framework")
    .eq("org_id", DEMO_ORG_ID)
    .eq("status", "complete");
  if (error) throw new Error(`pattern_records read failed: ${error.message}`);
  return (data || []).find((r) => r.framework?.name === name) ?? null;
}

// ═══ main ══════════════════════════════════════════════════════════════════
async function main() {
  console.log(`═══ AWIP TRAINING DEMO SEED ═══`);

  // ── 0. Resolve the cast (must already exist from seed-awip-demo.mjs) ─────
  const emails = {
    chuck: "chuck.milner@awip-demo.example",
    carlos: "carlos.ramos@awip-demo.example",
    kim: "kim.harrell@awip-demo.example",
    klaudia: "klaudia.donaghy@awip-demo.example",
  };
  const u = {};
  for (const [key, email] of Object.entries(emails)) {
    const user = await findUserByEmail(email);
    if (!user) throw new Error(`${email} not found — run seed-awip-demo.mjs first.`);
    u[key] = user.id;
  }
  const routingUserIds = {};
  for (const email of [
    "devin.cross@awip-demo.example",
    "richard.jenkins@awip-demo.example",
    "ben.seger@awip-demo.example",
    "zach.davis@awip-demo.example",
  ]) {
    const user = await findUserByEmail(email);
    if (!user) {
      console.warn(`  ⚠️ ${email} not found — routing target will carry no user_id`);
      routingUserIds[email] = null;
    } else {
      routingUserIds[email] = user.id;
    }
  }

  const S = storylines(u);

  // ── 1. --force: remove this script's own rows ────────────────────────────
  if (FORCE) {
    const { data: myReqs } = await supabase
      .from("training_requests")
      .select("id, prescription_id, detection_id")
      .eq("org_id", DEMO_ORG_ID)
      .eq("created_via", CREATED_VIA);
    const reqs = myReqs || [];
    if (reqs.length) {
      const reqIds = reqs.map((r) => r.id);
      const rxIds = reqs.map((r) => r.prescription_id).filter(Boolean);
      const detIds = reqs.map((r) => r.detection_id).filter(Boolean);
      await supabase.from("training_format_outcomes").delete().in("training_request_id", reqIds);
      await supabase.from("training_requests").delete().in("id", reqIds);
      if (rxIds.length) {
        await supabase.from("prescription_trainings").delete().in("prescription_id", rxIds);
        await supabase.from("prescription_fidelity").delete().in("prescription_id", rxIds);
        await supabase.from("prescriptions").delete().in("id", rxIds);
      }
      if (detIds.length) {
        await supabase.from("prescription_detections").delete().in("id", detIds);
      }
      console.log(`--force: deleted ${reqs.length} storyline request(s) + their engine rows.`);
    }
    const summaries = NEW_FRAMEWORKS.map((r) => r.context_summary);
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
      console.log(`--force: deleted ${ids.length} seeded framework(s).`);
    }
  }

  // ── 2. The four new source frameworks ────────────────────────────────────
  console.log(`\n─── Source frameworks (${NEW_FRAMEWORKS.length}) ───`);
  const now = Date.now();
  let inserted = 0;
  for (const rec of NEW_FRAMEWORKS) {
    const { data: existing } = await supabase
      .from("pattern_records")
      .select("id")
      .eq("org_id", DEMO_ORG_ID)
      .eq("context_summary", rec.context_summary)
      .maybeSingle();
    if (existing) {
      console.log(`  · already present: "${rec.framework.name}"`);
      continue;
    }
    const author = await findUserByEmail(rec.email);
    if (!author) throw new Error(`${rec.email} not found — run seed-awip-demo.mjs first.`);

    const sessionStart = new Date(now - rec.daysAgo * 86_400_000);
    const ttfvSeconds = 360 + (rec.daysAgo % 7) * 90;
    const framedAt = new Date(sessionStart.getTime() + ttfvSeconds * 1000);

    const { error } = await supabase.from("pattern_records").insert({
      user_id: author.id,
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
    });
    if (error) throw new Error(`insert failed for ${rec.id}: ${error.message}`);
    inserted++;
    console.log(`  ✓ "${rec.framework.name}" — ${rec.expertName}`);
  }
  console.log(`  ${inserted} inserted, ${NEW_FRAMEWORKS.length - inserted} already present.`);
  if (inserted > 0) {
    console.log(`  ⚠️ New frameworks are UNEMBEDDED — run backfill-pattern-embeddings.mjs next.`);
  }

  // ── 3. The four storylines end-to-end ────────────────────────────────────
  console.log(`\n─── Storylines (${S.length}) ───`);
  for (const s of S) {
    const { data: existingReq } = await supabase
      .from("training_requests")
      .select("id")
      .eq("org_id", DEMO_ORG_ID)
      .eq("created_via", CREATED_VIA)
      .eq("issue_text", s.issue_text)
      .maybeSingle();
    if (existingReq) {
      console.log(`  · already present: ${s.slug}`);
      continue;
    }

    // Resolve source-expert framework records (must exist + be this expert's).
    const experts = [];
    let groundingOk = true;
    for (const e of s.experts) {
      const rec = await recordByFrameworkName(e.frameworkName);
      if (!rec) {
        console.error(`  ✗ ${s.slug}: framework "${e.frameworkName}" not found — skipping storyline.`);
        groundingOk = false;
        break;
      }
      experts.push({ user_id: rec.user_id, record_id: rec.id });
    }
    if (!groundingOk) continue;

    const createdAt = new Date(now - s.daysAgo * 86_400_000);
    const generatedAt = new Date(createdAt.getTime() + 6 * 60_000);

    // Detection → prescription → request → training → outcome log.
    const { data: det, error: detErr } = await supabase
      .from("prescription_detections")
      .insert({
        org_id: DEMO_ORG_ID,
        source_type: "leader_request",
        dedupe_key: `training-demo:${s.slug}`,
        subject_entities: s.subject_entities,
        evidence_record_ids: experts.map((e) => e.record_id),
        summary: s.issue_restated,
        detail: s.understanding_note,
        recurrence: 1,
        status: "prescribed",
        detected_by: CREATED_VIA,
        detected_at: createdAt.toISOString(),
      })
      .select("id")
      .single();
    if (detErr) throw new Error(`${s.slug} detection insert: ${detErr.message}`);

    const { data: rx, error: rxErr } = await supabase
      .from("prescriptions")
      .insert({
        org_id: DEMO_ORG_ID,
        detection_id: det.id,
        rung: s.rung,
        rung_rationale: s.recommendations.headline,
        gap_summary: s.issue_restated,
        experts,
        capture_first: false,
        audience: s.audience_summary,
        audience_entities: s.subject_entities,
        pairing_summary: s.recommendations.grounding_summary,
        recurrence: 1,
        severity: s.rung,
        roi_score: s.rung,
        rank_rationale: `Leader request × rung ${s.rung} (${s.format_name})`,
        status: "approved",
        approved_by: s.requestedBy,
        approved_at: createdAt.toISOString(),
        triaged_by: CREATED_VIA,
        created_at: createdAt.toISOString(),
      })
      .select("id")
      .single();
    if (rxErr) throw new Error(`${s.slug} prescription insert: ${rxErr.message}`);

    const { data: training, error: trErr } = await supabase
      .from("prescription_trainings")
      .insert({
        org_id: DEMO_ORG_ID,
        prescription_id: rx.id,
        version: 1,
        strategy: s.training.strategy,
        rung: s.rung,
        format: s.format_name,
        format_key: s.format_key,
        title: s.training.title,
        altitudes: {
          floor: { title: s.training.floor_title, body: s.training.floor_body },
          supervisor: { title: s.training.supervisor_title, body: s.training.supervisor_body },
          exec: { title: s.training.exec_title, body: s.training.exec_body },
        },
        generated_by: CREATED_VIA,
        generated_at: generatedAt.toISOString(),
      })
      .select("id")
      .single();
    if (trErr) throw new Error(`${s.slug} training insert: ${trErr.message}`);

    // ⭐ The who-else beat, exactly as approved — names + reasons.
    const routing_targets = s.routing.map((t) => ({
      kind: t.kind,
      user_id: t.email ? (routingUserIds[t.email] ?? null) : null,
      label: t.label,
      detail: t.detail,
      reason: t.reason,
    }));

    const { data: reqRow, error: reqErr } = await supabase
      .from("training_requests")
      .insert({
        org_id: DEMO_ORG_ID,
        requested_by: s.requestedBy,
        issue_text: s.issue_text,
        audience_role: s.audience_role,
        audience_team: s.audience_team,
        audience_experience: s.audience_experience,
        audience_summary: s.audience_summary,
        issue_type: s.issue_type,
        issue_restated: s.issue_restated,
        subject_entities: s.subject_entities,
        understanding_note: s.understanding_note,
        detection_id: det.id,
        prescription_id: rx.id,
        recommendations: s.recommendations,
        recommended_format: s.format_key,
        recommended_at: createdAt.toISOString(),
        chosen_format: s.format_key,
        format_overridden: false,
        format_chosen_by: s.requestedBy,
        format_chosen_at: createdAt.toISOString(),
        // 'generated' — all three altitudes exist, so the APPROVE GATE is a
        // live beat: the supervisor reads the complete training and approves
        // it in front of the buyer.
        status: "generated",
        current_training_id: training.id,
        attempt_count: 1,
        created_via: CREATED_VIA,
        routing_targets,
        created_at: createdAt.toISOString(),
      })
      .select("id")
      .single();
    if (reqErr) throw new Error(`${s.slug} request insert: ${reqErr.message}`);

    const { error: logErr } = await supabase.from("training_format_outcomes").upsert(
      {
        org_id: DEMO_ORG_ID,
        training_request_id: reqRow.id,
        prescription_id: rx.id,
        training_id: training.id,
        attempt: 1,
        issue_type: s.issue_type,
        audience_role: s.audience_role,
        audience_team: s.audience_team,
        audience_experience: s.audience_experience,
        recommended_format: s.format_key,
        chosen_format: s.format_key,
        was_override: false,
        agent_rationale: s.recommendations.ranked,
        outcome: "pending",
      },
      { onConflict: "training_request_id,attempt" }
    );
    if (logErr) console.warn(`  ⚠️ ${s.slug} outcome-log write skipped: ${logErr.message}`);

    console.log(`  ✓ ${s.slug} — "${s.training.title}" (${s.format_name}, ${s.routing.length} routing targets) [${s.approvedNote}]`);
  }

  console.log(`\n═══ DONE ═══`);
  console.log(`Next, in order:`);
  console.log(`  node scripts/backfill-pattern-embeddings.mjs`);
  console.log(`  node scripts/verify-training-demo.mjs`);
  console.log(`Demo seat: chuck.milner@awip-demo.example → /training-studio (all four storylines listed).`);
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}`);
  process.exit(1);
});
