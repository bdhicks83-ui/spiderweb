/* ─────────────────────────────────────────────────────────────────────────
   Ad90 — the 90-second advertisement, assembled.

   Structure (all timing lives in ad-script.ts, none here):
     OpeningTitle → four beats (ScreenFrame footage/slate + LowerThird)
     → EndCard, with ONE CaptionTrack over everything.

   CaptionTrack mounts at the top level, outside every <Sequence> — its cue
   times are absolute from frame 0 and a Sequence would rebase them.
   ───────────────────────────────────────────────────────────────────────── */

import React from "react";
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import { CaptionTrack, validateCues } from "../brand/CaptionTrack";
import { EndCard } from "../brand/EndCard";
import { LowerThird } from "../brand/LowerThird";
import { OpeningTitle } from "../brand/OpeningTitle";
import { ScreenFrame } from "../brand/ScreenFrame";
import { BRAND } from "../brand/tokens";
import {
  BEATS,
  CUES,
  ENDCARD_FROM_SEC,
  ENDCARD_KICKER,
  OPENING_LINES,
  OPENING_SEC,
  TOTAL_SEC,
} from "./ad-script";

// Surface bad cue timing loudly at build/preview time, not on a freeze frame.
const cueProblems = validateCues(CUES);
if (cueProblems.length > 0) {
  // eslint-disable-next-line no-console
  console.warn(`[Ad90] caption cue problems:\n  ${cueProblems.join("\n  ")}`);
}

export const Ad90: React.FC = () => {
  const { fps } = useVideoConfig();
  const f = (sec: number) => Math.round(sec * fps);

  return (
    <AbsoluteFill style={{ background: BRAND.black }}>
      {/* Opening title */}
      <Sequence from={0} durationInFrames={f(OPENING_SEC)} name="Opening title">
        <OpeningTitle lines={OPENING_LINES} />
      </Sequence>

      {/* The four beats */}
      {BEATS.map((beat) => (
        <Sequence
          key={beat.number}
          from={f(beat.fromSec)}
          durationInFrames={f(beat.toSec) - f(beat.fromSec)}
          name={`Beat ${beat.number} — ${beat.title}`}
        >
          <ScreenFrame
            src={beat.footageSrc}
            label={beat.slateLabel}
            hint={beat.slateHint}
          />
          <LowerThird number={beat.number} text={beat.title} />
        </Sequence>
      ))}

      {/* End card — static hold to the last frame */}
      <Sequence
        from={f(ENDCARD_FROM_SEC)}
        durationInFrames={f(TOTAL_SEC) - f(ENDCARD_FROM_SEC)}
        name="End card"
      >
        <EndCard kicker={ENDCARD_KICKER} />
      </Sequence>

      {/* Captions — absolute cues, so OUTSIDE every Sequence. Mandatory:
          most cold-outbound views are muted. */}
      <CaptionTrack cues={CUES} />
    </AbsoluteFill>
  );
};
