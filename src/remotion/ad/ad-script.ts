/* ─────────────────────────────────────────────────────────────────────────
   THE BRAND AD (~100s) — all content and timing in ONE file.

   This is the only file Brian edits. Components never hardcode copy.

   ⚠ PLACEHOLDER COPY: AD-SCRIPT-90sec-2026-07-26.md is not in the repo (it
   lives in the Claude project). Every line and caption below is a placeholder
   written to the same storyline (the die-changeover conflict) and the same
   beat structure. Paste the real script lines over these — timings are
   already laid out at the right cadence for a calm ~100-second read.

   Timing model: all times are ABSOLUTE seconds from frame 0 of the Ad90
   composition. Beats are back-to-back; captions are one flat list.
   ───────────────────────────────────────────────────────────────────────── */

import type { TitleLine } from "../brand/OpeningTitle";
import type { Cue } from "../brand/CaptionTrack";

export const TOTAL_SEC = 103;

/* ── Opening title (0 → OPENING_SEC) ────────────────────────────────────── */
export const OPENING_SEC = 7;
export const OPENING_LINES: TitleLine[] = [
  { text: "Your best people carry twenty years", atSec: 0.8 },
  { text: "of judgment in their heads.", atSec: 1.9 },
  { text: "When they leave, it walks out with them.", atSec: 3.6, soft: true },
];

/* ── The five beats ─────────────────────────────────────────────────────── */
export type Beat = {
  number: string;
  title: string;
  fromSec: number;
  toSec: number;
  /** Screen capture under public/, e.g. "footage/beat-01.mp4". Null → slate. */
  footageSrc: string | null;
  /** What Brian records for this beat — shown on the placeholder slate. */
  slateLabel: string;
  slateHint?: string;
};

export const BEATS: Beat[] = [
  {
    number: "01",
    title: "Their judgment, captured.",
    fromSec: 7,
    toSec: 25,
    footageSrc: null,
    slateLabel: "The codify interview",
    slateHint: "/codify — Angela's Quarantined Restart session, 2 interview turns",
  },
  {
    number: "02",
    title: "The contradiction, surfaced.",
    fromSec: 25,
    toSec: 43,
    footageSrc: null,
    slateLabel: "The conflict review screen",
    slateHint: "Conflict X-ray — Quarantined Restart vs. No-Exceptions Gate, status OPEN",
  },
  {
    number: "03",
    title: "Asked, and answered.",
    fromSec: 43,
    toSec: 61,
    footageSrc: null,
    slateLabel: "Retrieval",
    slateHint:
      "/retrieve — “We had a quality escape right after a die changeover on the press line — should we release the next production run before first-piece inspection clears?”",
  },
  {
    number: "04",
    title: "Judgment that trains the next shift.",
    fromSec: 61,
    toSec: 79,
    footageSrc: null,
    slateLabel: "Training module + Win Column",
    slateHint: "/prescriptions detail → training altitudes, then the Win Column",
  },
  {
    number: "05",
    title: "Everything feeds the web.",
    fromSec: 79,
    toSec: 92,
    footageSrc: null,
    slateLabel: "The compounding loop",
    slateHint:
      "Outcome → graph → retrieval — the Format Agent reading the org's own track record",
  },
];

/* ── End card (last beat → TOTAL_SEC) ─────────────────────────────────────
   The card itself is the tagline: the mark reads "Viridescent", the line
   under it reads KNOWLEDGE THAT APPRECIATES (URL_TEXT in brand/tokens.ts).
   Kicker is null on purpose — a serif "Knowledge that appreciates." above
   that line would print the same sentence twice. The closing caption speaks
   the full button.
   ───────────────────────────────────────────────────────────────────────── */
export const ENDCARD_FROM_SEC = 92;
export const ENDCARD_KICKER: string | null = null;

/* ── Burned-in captions — the whole voiceover, timed ────────────────────── */
export const CUES: Cue[] = [
  // Opening
  { fromSec: 0.8, toSec: 4.2, text: "Your best people carry twenty years of judgment in their heads." },
  { fromSec: 4.4, toSec: 6.8, text: "When they leave, it walks out with them." },

  // Beat 01 — capture
  { fromSec: 7.5, toSec: 11.5, text: "Viridescent interviews your experts the way a colleague would —" },
  { fromSec: 11.7, toSec: 15.6, text: "and turns what they know into frameworks the whole team can use." },
  { fromSec: 16.0, toSec: 20.0, text: "Real decisions. Real boundaries. In their own words." },
  { fromSec: 20.4, toSec: 24.4, text: "Captured in minutes, not workshops." },

  // Beat 02 — conflict
  { fromSec: 25.5, toSec: 29.4, text: "When two experts disagree, most companies never find out." },
  { fromSec: 29.6, toSec: 33.8, text: "Viridescent flags the contradiction the moment it appears —" },
  { fromSec: 34.0, toSec: 38.4, text: "both sides, side by side, with the reasoning attached." },
  { fromSec: 38.6, toSec: 42.6, text: "So the org decides once — instead of every shift deciding alone." },

  // Beat 03 — retrieval
  { fromSec: 43.5, toSec: 47.4, text: "Ask a question the way an operator would actually ask it." },
  { fromSec: 47.6, toSec: 51.8, text: "The right framework comes back in seconds —" },
  { fromSec: 52.0, toSec: 56.2, text: "with the name of the expert who wrote it." },
  { fromSec: 56.4, toSec: 60.4, text: "Twenty years of judgment, on demand." },

  // Beat 04 — training loop
  { fromSec: 61.5, toSec: 65.4, text: "And when a mistake keeps repeating, Viridescent notices —" },
  { fromSec: 65.6, toSec: 69.8, text: "and builds the training to fix it, from your own experts' playbook." },
  { fromSec: 70.0, toSec: 74.2, text: "Then it measures whether the fix actually held." },
  { fromSec: 74.4, toSec: 78.4, text: "Knowledge in. Judgment out. Nothing lost in between." },

  // Beat 05 — the flywheel
  { fromSec: 79.5, toSec: 83.4, text: "And every fix that works feeds back in —" },
  { fromSec: 83.6, toSec: 87.6, text: "so the answer's already there next time." },
  { fromSec: 87.8, toSec: 91.8, text: "Knowledge that compounds instead of walking out the door." },

  // End card
  { fromSec: 93.0, toSec: 97.5, text: "Viridescent. Knowledge that appreciates." },
];
