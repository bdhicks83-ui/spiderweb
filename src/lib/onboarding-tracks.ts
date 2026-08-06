// ROLE-BASED ONBOARDING — the four track definitions + the role→track resolver.
//
// ✅ CLIENT-SAFE BY CONSTRUCTION. Constants and one pure function only — no
// Supabase, no fs, no @/lib/claude. Imported by BOTH the /welcome page (client)
// and /api/welcome (server). Same boundary discipline as
// src/lib/training-formats.ts.
//
// ═══════════════════════════════════════════════════════════════════════════
// THE IDEA (DECISION-LOG 2026-07-30 — settled, do not re-open)
//
// A plant operator, a VP, and an R&D expert each need a completely different
// first five minutes. Same SHAPE — a short wizard where every step can carry
// an expandable "peek under the hood" panel — but the steps, the emphasis, and
// the DEPTH change per role, because each role has a different job with the
// system and a different fear to answer:
//
//   operator  — fear: "will this get me in trouble."  3 steps, near-ZERO
//               under-the-hood (one privacy reassurance). Leads into Floor
//               Guide.
//   expert    — fear: "am I training my replacement / will I get credit."
//               4 steps, DEEP on voice-preservation + permanent attribution.
//   executive — question: "is it worth it / how do I know." 4 steps, DEEP on
//               value + proof (/readout), light on mechanics.
//   admin     — the machine room. 5 steps, full provenance + science.
//
// ⚠️ THE DEPTH ASYMMETRY IS THE DESIGN. Do not "balance" the tracks — the
// operator getting almost nothing under the hood is as deliberate as the
// expert getting a lot.
//
// ═══════════════════════════════════════════════════════════════════════════
// COPY STATUS
//
// ✅ ALL COPY APPROVED (Brian, July 30 — render near-verbatim, do not rewrite,
//    do not add claims):
//    · operator / expert / executive step + panel copy, from
//      ROLE-ONBOARDING-CONTENT-3-tracks.md (approved with the design);
//    · the ADMIN track (drafted in-session because the original Admin content
//      file never surfaced; approved by Brian as-is, July 30);
//    · all nav/switch microcopy (seesLabel, viewingLabel, button labels,
//      skip line; approved by Brian as-is, July 30).
// ═══════════════════════════════════════════════════════════════════════════

export type TrackKey = "admin" | "executive" | "expert" | "operator";

export const TRACK_KEYS: readonly TrackKey[] = [
  "operator",
  "expert",
  "executive",
  "admin",
] as const;

export function isTrackKey(value: unknown): value is TrackKey {
  return (
    typeof value === "string" && (TRACK_KEYS as readonly string[]).includes(value)
  );
}

/** The expandable "peek under the hood" panel on a step. */
export type TrackPanel = {
  /** The toggle label the person clicks (e.g. "Is this private?"). */
  label: string;
  /** Optional bold lead-in sentence inside the panel. */
  lead?: string;
  body: string;
};

export type TrackStep = {
  title: string;
  body: string;
  /** Pre-filled sample query shown as a quoted chip (operator step 2). */
  example?: string;
  /**
   * A deep link into the REAL surface this step teaches. Opens in a new tab so
   * the tour stays where it was (it's resumable either way).
   * gate: "readout" → only rendered when the viewer can actually open /readout
   *       (manager or org admin — requireReadoutViewer's rule);
   *       "floorGuide" → href swaps to /retrieve when the viewer's Floor Guide
   *       mode isn't switched on.
   */
  link?: { label: string; href: string; gate?: "readout" | "floorGuide" };
  panel?: TrackPanel;
};

export type TrackDef = {
  key: TrackKey;
  /** Short display name for the track ("Operator"). */
  label: string;
  /** The headline over the whole track. */
  tagline: string;
  /** The switch link other roles see ("See what your operators see"). Approved copy. */
  seesLabel: string;
  /** The banner noun when viewing this track ("the tour your operators get"). Approved copy. */
  viewingLabel: string;
  closing: string;
  /** Where "Finish" lands. Operator gets the floorGuide gate (→ /retrieve fallback). */
  finish: { label: string; href: string; gate?: "floorGuide" };
  copyStatus: "approved" | "draft";
  steps: TrackStep[];
};

// ─── TRACK: CONTRIBUTOR / OPERATOR ──────────────────────────────────────────
// ✅ APPROVED copy. 3 short steps. Warmth over depth; the only "under the
// hood" an operator needs is the privacy reassurance.

const OPERATOR: TrackDef = {
  key: "operator",
  label: "Operator",
  tagline: "A veteran in your pocket.",
  seesLabel: "See what your operators see",
  viewingLabel: "the welcome your operators get",
  copyStatus: "approved",
  finish: { label: "Open your Floor Guide", href: "/floor-guide", gate: "floorGuide" },
  closing:
    "That's it. Ask it anything, anytime. It's a veteran in your pocket — and it never makes you feel dumb for asking.",
  steps: [
    {
      title: "Welcome — this is yours",
      body:
        "Welcome. This is a tool that's just for you — a way to get the answers you need without having to track down the one person who knows and hope they're not busy. Ask it anything about the work. Nobody's grading you.",
      panel: {
        label: "Is this private?",
        body:
          "Yes. The questions you ask here are yours. They're not a report card, your manager doesn't get a list of what you asked, and there's no wrong question. This is the place to ask the thing you'd feel weird asking out loud. That's what it's for.",
      },
    },
    {
      title: "Ask it what you'd ask a veteran",
      body:
        "Try it. Describe something you're seeing or dealing with — in your own words, however you'd say it. You don't need the right technical term. Just say what's going on.",
      example: "the panel looks bubbled along one edge",
      link: { label: "Try it now", href: "/floor-guide", gate: "floorGuide" },
      panel: {
        label: "How does it know what I mean?",
        body:
          "You don't have to know what things are called. Say “the panel looks bubbled” and it figures out you're dealing with what the experts call delamination, and gives you their answer. Describe it however it makes sense to you — the system does the translating.",
      },
    },
    {
      title: "If nobody's written it down yet",
      body:
        "Sometimes you'll ask something nobody's captured yet. That's not a dead end — it flags it so your team knows there's a hole, and points you to the answer the moment someone fills it. And if you've found a better way to do something, you can share it — a leader takes a look, and if it's good, it gets your name on it.",
      panel: {
        label: "What happens to an idea I share?",
        body:
          "If you share something that works, it doesn't just disappear into a system — a real person looks at it, and if it becomes part of how your team works, the credit is yours, right next to the expert who confirmed it. Your good ideas get seen. That's the whole point.",
      },
    },
  ],
};

// ─── TRACK: TECHNICAL EXPERT ────────────────────────────────────────────────
// ✅ APPROVED copy. 4 steps, deep on voice-preservation + permanent credit.

const EXPERT: TrackDef = {
  key: "expert",
  label: "Expert",
  tagline: "Your judgment, made permanent — with your name on it.",
  seesLabel: "See what your experts see",
  viewingLabel: "the welcome your experts get",
  copyStatus: "approved",
  finish: { label: "Capture your first framework", href: "/codify" },
  closing:
    "That's the deal: your judgment, captured in your voice, credited to you by name, permanent, and compounding. You're not feeding a machine — you're building something that makes what you know impossible to lose, and impossible to un-credit.",
  steps: [
    {
      title: "Welcome — this is about YOUR judgment",
      body:
        "You've spent years building judgment most people can't see and couldn't explain if you asked them. This is a way to make that judgment last — and to make sure it's always known as yours. Not a manual. Not a policy. Your call, in your words, with your name on it.",
      panel: {
        label: "Peek under the hood",
        lead: "This is not “documenting a process.”",
        body:
          "The system doesn't ask you to write up steps. It interviews you about real, hard calls — the ones where a less-experienced person would've gotten it wrong — because that's where your actual expertise lives, in the judgment you've half-forgotten you even have. The technique behind it is the same one researchers use to pull expertise from surgeons and pilots. You talk; it captures the judgment underneath the talk.",
      },
    },
    {
      title: "Watch it stay in YOUR voice",
      body:
        "Capture one thing — a call you make well that others get wrong. The system will interview you, then turn it into a framework. Read it back. It should sound like you, because it's built from your own words.",
      link: { label: "Capture one thing", href: "/codify" },
      panel: {
        label: "Peek under the hood",
        lead: "How your voice survives the machine.",
        body:
          "When the system turns your interview into a framework, it pulls out your actual decision logic — the situation, your call, the signals you read, your reasoning — in your phrasing, not a generic rewrite. When there are several experts, the frameworks should sound distinctly different from each other, because they ARE different people's judgment. If a framework ever reads like a textbook instead of like you, that's a defect — the whole system is built to preserve the difference between how you think and how someone else does. Your judgment isn't averaged into a blob. It stays yours, distinctly.",
      },
    },
    {
      title: "Your name doesn't come off",
      body:
        "When someone across the company hits the problem you know how to handle, they get YOUR framework — with your name on it. Not anonymous “best practice.” Your judgment, attributed to you, every time it's used.",
      link: { label: "See the team's library", href: "/library" },
      panel: {
        label: "Peek under the hood",
        lead: "Why this is the opposite of losing your edge.",
        body:
          "Two things people quietly worry about, answered plainly. First — “am I training my replacement?” No. You're becoming the person whose judgment the whole company runs on, by name, in a way that's visible to leadership every time it's used. That's the opposite of replaceable. Second — “will I get credit?” The attribution is permanent and it compounds: the more your judgment gets used and proves out, the more it's recognized, and there's a running record of the wins your thinking created. Your expertise stops being invisible. It becomes the most visible thing about you.",
      },
    },
    {
      title: "It gets more valuable — and so do you",
      body:
        "The judgment you deposit here doesn't age out. It sits ready, and every time it's used and works, it's recognized as proven. You're building an asset — and it's got your name on it.",
      link: { label: "See the Win Column", href: "/win-column" },
      panel: {
        label: "Peek under the hood",
        lead: "Why your early work doesn't decay.",
        body:
          "Some systems quietly rank down anything old. This one doesn't — a call you nailed and captured two years ago is worth exactly as much when it proves out today. Quality locks in when your judgment is confirmed; corroboration only ever accrues as more people rely on it. The system grades expertise on how complete, corroborated, and consequential it is — never on how recent. Deposit your best thinking once; it keeps paying out. What it's worth is for the market to decide — the system's job is to make sure it's captured, attributed, and permanent.",
      },
    },
  ],
};

// ─── TRACK: EXECUTIVE ───────────────────────────────────────────────────────
// ✅ APPROVED copy. 4 steps, deep on value + proof, light on mechanics.

const EXECUTIVE: TrackDef = {
  key: "executive",
  label: "Executive",
  tagline: "Is this worth it — and how do I know?",
  seesLabel: "See what your executives see",
  viewingLabel: "the welcome your executives get",
  copyStatus: "approved",
  finish: { label: "Go to your dashboard", href: "/dashboard" },
  closing:
    "The short version: you're turning your people's judgment into an owned, compounding asset — one that protects you from losing it, makes everyone more capable, and proves its own value on your data. You'll see the proof before you're asked to believe it.",
  steps: [
    {
      title: "Welcome — what this actually protects",
      body:
        "Every organization has judgment walking around inside a handful of people's heads — and walking out the door when they leave. This turns that judgment into something your company owns: captured, usable by everyone, and impossible to lose in a retirement or a resignation. Here's what that looks like, and how you'll know it's working.",
      panel: {
        label: "What's the real risk this addresses?",
        body:
          "The knowledge that runs your operation mostly isn't written down — it's in your veterans' judgment, and it's the least protected asset you have. When they leave, it leaves. This captures it while they're here, in their own words, and makes it available to everyone who needs it. You're converting a walking risk into an owned asset.",
      },
    },
    {
      title: "See the judgment become usable",
      body:
        "This is your team's captured judgment — real calls your experts make, now available to anyone who hits the same situation, with the expert's name on it. Someone on the floor asks a question in plain language and gets your best person's answer in seconds.",
      link: { label: "See the team's library", href: "/library" },
      panel: {
        label: "Why this beats every knowledge tool you've tried",
        body:
          "You've almost certainly paid for a wiki, an LMS, or a SharePoint that nobody uses and nothing maintains. Those rot because writing things down is the wrong tool for capturing judgment, and because static documents go stale the day after they're written. This is different in two ways: it captures the judgment people can't easily write down (through interviews, not forms), and it gets more accurate over time instead of less, because every use teaches it what actually works. It's the rare knowledge asset that appreciates instead of decaying.",
      },
    },
    {
      title: "How you'll know it's working",
      body:
        "You don't have to take it on faith. The system produces a plain readout of what it's created — judgment captured, questions answered that would've walked out the door, gaps found and filled, training that reduced repeat problems. Real numbers, on your data, that you can hand to anyone.",
      link: { label: "Open your readout", href: "/readout", gate: "readout" },
      panel: {
        label: "How to read the proof",
        body:
          "The biggest number the readout shows is years of judgment captured — the accumulated experience your organization has made permanent and shareable, summed across the people who've contributed. It deliberately does NOT put a dollar figure on it — what it's worth to your operation is your number to run, not ours to invent. Everything on the readout is derived from real activity, dated, and conservative: a result only reads “proven” when there's genuine evidence behind it, and “early signal” when there isn't yet. It's built to be believed by a skeptic, because the caveats are right there on the page.",
      },
    },
    {
      title: "Why it compounds",
      body:
        "The reason this is worth more than it costs: it doesn't sit still. Every answer, every solved problem, and every unanswered question makes it more valuable. The asset grows on its own the more your people use it.",
      panel: {
        label: "The business case, plainly",
        body:
          "Three compounding loops run quietly: proven answers rise to the top, so your best judgment is what people reach first; unanswered questions become a to-do list of exactly what to capture next; and training learns which formats actually work in your organization. You buy it once and it appreciates — the opposite of the depreciating software you're used to. And a new hire reaches useful judgment in weeks instead of years, which is a ramp-time number your finance team already knows how to value.",
      },
    },
  ],
};

// ─── TRACK: ADMIN ───────────────────────────────────────────────────────────
// ✅ APPROVED (Brian, July 30). Drafted in-session (the original Admin content
// file never surfaced), grounded in the real system (T1B1 console, roles
// ladder, elicitation methods, campaigns, readout); makes no claim the shipped
// product doesn't keep. Approved as-is — render near-verbatim.

const ADMIN: TrackDef = {
  key: "admin",
  label: "Admin",
  tagline: "You're holding the keys — here's the whole machine.",
  seesLabel: "See what your admins see",
  viewingLabel: "the welcome your admins get",
  copyStatus: "approved",
  finish: { label: "Open the admin console", href: "/admin" },
  closing:
    "That's the machine: seats and roles you control, capture that respects your experts, human gates on everything that becomes official, and proof you can hand to anyone. Run it from the console — it'll tell you what's left to set up.",
  steps: [
    {
      title: "Welcome — this is the machine room",
      body:
        "You run this account. Everything your people experience — who has a seat, what their role lets them do, what gets captured, and what counts as proof — is set up and steered from here, without a line of SQL or a call to us.",
      link: { label: "Open the admin console", href: "/admin" },
      panel: {
        label: "Peek under the hood",
        lead: "The pipeline, end to end.",
        body:
          "An expert sits for a guided interview about a real, hard call. The system pulls out the judgment underneath — in their words, not a rewrite — names it as a framework with their name attached, and makes it findable: anyone who hits the same situation asks in plain language and gets that expert's answer, attributed, in seconds. Every use feeds back in, so the library gets sharper instead of stale. Everything is scoped to your organization and gated by role, enforced at the database layer — not just in the interface.",
      },
    },
    {
      title: "Set up your people",
      body:
        "Invite people with a link, set their title, and give each seat a role: contributors use everything and are never graded; members and managers can put the team's official judgment on record; managers also see their own people's early-support signals. Admin is a separate key — it's about running the account, not managing people.",
      link: { label: "Invite your people", href: "/admin" },
      panel: {
        label: "Peek under the hood",
        lead: "Roles are the integrity model, not a permissions chart.",
        body:
          "The one question a role answers is: whose input becomes the team's canonical judgment? A contributor's never does automatically — anything they surface goes to a human for review first, and if it's promoted, the credit stays theirs, next to the expert who confirmed it. Nothing becomes official without a person deciding it should. That's enforced where it can't be bypassed: in the database, not the UI.",
      },
    },
    {
      title: "How the capture actually works",
      body:
        "Nobody fills out forms here. The system interviews your experts about real decisions — the calls where a less-experienced person would've gotten it wrong — and turns what it hears into named, attributed frameworks that sound like the person who gave them.",
      panel: {
        label: "Peek under the hood",
        lead: "The science it borrows.",
        body:
          "The interview technique is the same family researchers use to pull expertise from surgeons and pilots — asking about specific hard cases, the signals that were read, and the reasoning behind the call, because that's where real expertise lives. The system picks the interview method to fit the kind of problem, and it preserves each expert's phrasing on purpose: two experts on the same topic should read differently, because they think differently. A framework that reads like a textbook is treated as a defect.",
      },
    },
    {
      title: "Run capture like a rollout, not a hope",
      body:
        "Hope isn't a plan. A capture campaign turns it into a tracked initiative: pick the topics that matter, pick the experts, and watch coverage fill in — who's done, who's pending, what's still exposed.",
      link: { label: "Start a campaign", href: "/campaigns" },
      panel: {
        label: "Peek under the hood",
        lead: "Why campaigns exist.",
        body:
          "The riskiest knowledge is the kind only one person holds — and that person is busy. A campaign gives the capture a finish line and makes the remaining exposure visible, so “get the Little Rock line's top five on record this month” is a plan you can track instead of a wish. The requests land on each expert's own screen, and you see progress without chasing anyone.",
      },
    },
    {
      title: "Proof you can hand to anyone",
      body:
        "The readout is the account's plain-numbers report: judgment captured, questions answered that would've walked out the door, gaps found and filled, training that reduced repeat problems. Derived from real activity, dated, and conservative — built to be believed by a skeptic.",
      link: { label: "Open the readout", href: "/readout", gate: "readout" },
      panel: {
        label: "Peek under the hood",
        lead: "Where the numbers come from.",
        body:
          "Every figure is derived from things that actually happened in your account — captures, retrievals, filled gaps, training outcomes — never estimated and never padded. A result only reads “proven” when there's genuine evidence behind it; with thin data it says “early signal” out loud. The readout deliberately puts no dollar figure on the asset: what it's worth to your operation is your number to run, not ours to invent. Export it as a PDF and hand it to whoever asks.",
      },
    },
  ],
};

export const TRACKS: Record<TrackKey, TrackDef> = {
  operator: OPERATOR,
  expert: EXPERT,
  executive: EXECUTIVE,
  admin: ADMIN,
};

// ─── The role → track resolver ──────────────────────────────────────────────
//
// ⭐ THE PRECEDENCE ORDER (decided here, documented here, mirrored in the
// migration backfill in supabase/role-onboarding.sql — change one, change
// BOTH):
//
//   1. is_org_admin            → admin      (they run the account; the machine
//                                            room comes first)
//   2. role = 'contributor'    → operator   (their seat IS the floor — even a
//                                            contributor with an odd persona
//                                            must land on the track whose CTAs
//                                            they can actually use; /codify
//                                            would refuse them)
//   3. persona = 'technical_director' → expert  (expert-ness beats manager-ness:
//                                            an expert who is also a manager
//                                            gets the Expert track — the
//                                            handoff's explicit example)
//   4. persona = 'exec'        → executive
//   5. role = 'manager' or persona = 'sr_manager' → executive  (a people-leader
//                                            without deep-expert identity cares
//                                            about value + proof, and the
//                                            done-test groups "an exec/manager
//                                            seat" on the Executive track)
//   6. everything else         → expert     (a plain member can codify — the
//                                            member tier exists to put judgment
//                                            on record, so the capture-side
//                                            welcome is the honest default)
//
// The resolver is deliberately a pure function of three profile fields so the
// API route, the page, and the SQL backfill can never disagree about who lands
// where.
export function resolveTrackKey(p: {
  isOrgAdmin?: boolean | null;
  role?: string | null;
  persona?: string | null;
}): TrackKey {
  if (p.isOrgAdmin) return "admin";
  if (p.role === "contributor") return "operator";
  if (p.persona === "technical_director") return "expert";
  if (p.persona === "exec") return "executive";
  if (p.role === "manager" || p.persona === "sr_manager") return "executive";
  return "expert";
}

/** Sentinel steps_done value meaning "completed" regardless of track length. */
export const STEPS_DONE_COMPLETE = 99;
