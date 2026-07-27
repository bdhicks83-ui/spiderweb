/* ─────────────────────────────────────────────────────────────────────────
   CaptionTrack — burned-in captions from a timing file.

   MANDATORY, not optional: most cold-outbound views are muted. If the caption
   track is wrong, the ad has no voice at all.

   Mount ONCE at the top level of a composition. Cue times are absolute
   seconds from frame 0 of that composition, which is why it must NOT live
   inside a <Sequence> — a Sequence would rebase every cue.
   ───────────────────────────────────────────────────────────────────────── */

import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { BRAND, FONT, SAFE } from "./tokens";
import { DUR, envelope } from "./motion";

export type Cue = {
  /** Absolute seconds from the start of the composition. */
  fromSec: number;
  toSec: number;
  text: string;
};

export type CaptionTrackProps = {
  cues: Cue[];
  /** Distance from the bottom safe edge, in px. */
  bottomOffset?: number;
  fontSize?: number;
  /** Widest the caption block gets, in px. Keeps line count to 1–2. */
  maxWidth?: number;
};

/**
 * Sanity-check a cue list. Returns human-readable problems; returns [] when
 * clean. Overlapping or reversed cues make two captions stack silently, which
 * is the kind of thing you only notice on a 1080p freeze frame.
 */
export const validateCues = (cues: Cue[]): string[] => {
  const problems: string[] = [];
  const sorted = [...cues].sort((a, b) => a.fromSec - b.fromSec);
  sorted.forEach((cue, i) => {
    if (cue.toSec <= cue.fromSec) {
      problems.push(`cue ${i} "${cue.text.slice(0, 40)}" ends at or before it starts`);
    }
    const next = sorted[i + 1];
    if (next && next.fromSec < cue.toSec) {
      problems.push(
        `cue ${i} overlaps the next cue (${cue.toSec}s > ${next.fromSec}s)`
      );
    }
  });
  return problems;
};

export const CaptionTrack: React.FC<CaptionTrackProps> = ({
  cues,
  bottomOffset = 0,
  fontSize = 38,
  maxWidth = 1400,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {cues.map((cue, i) => {
        const inAt = Math.round(cue.fromSec * fps);
        const outAt = Math.round(cue.toSec * fps) - DUR.quick;
        const p = envelope(frame, inAt, Math.max(outAt, inAt + 1), DUR.quick, DUR.quick);
        if (p <= 0) return null;

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: SAFE.y + bottomOffset,
              display: "flex",
              justifyContent: "center",
              opacity: p,
            }}
          >
            <div
              style={{
                maxWidth,
                margin: `0 ${SAFE.x}px`,
                background: "rgba(0, 0, 0, 0.72)",
                padding: "16px 32px 18px",
                borderRadius: 4,
                fontFamily: FONT.sans,
                fontSize,
                fontWeight: 500,
                lineHeight: 1.34,
                letterSpacing: "0.002em",
                color: BRAND.onInk,
                textAlign: "center",
                textWrap: "balance",
              }}
            >
              {cue.text}
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
