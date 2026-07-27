/* ─────────────────────────────────────────────────────────────────────────
   OpeningTitle — full-frame black, white type, lines revealing one at a time.
   Humanbloom mark small, lower left, persistent.

   Configurable: lines[] + per-line timing. A line may carry its own `atSec`;
   any line without one falls back to `staggerSec` spacing from the previous.
   ───────────────────────────────────────────────────────────────────────── */

import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { BRAND, FONT, SAFE } from "./tokens";
import { DUR, RISE_PX, reveal, riseStyle } from "./motion";
import { Mark } from "./Mark";

export type TitleLine = {
  text: string;
  /** Seconds from the start of this composition. Optional — see staggerSec. */
  atSec?: number;
  /** Visually subordinate line (smaller, softer). */
  soft?: boolean;
};

export type OpeningTitleProps = {
  lines: TitleLine[];
  /** Fallback spacing between lines that don't declare their own atSec. */
  staggerSec?: number;
  /** Seconds before the first line appears. */
  leadInSec?: number;
  background?: string;
  /** Display size of the primary lines, in px. */
  fontSize?: number;
  /** Hide the persistent lower-left mark (e.g. for an interstitial title). */
  showMark?: boolean;
};

export const OpeningTitle: React.FC<OpeningTitleProps> = ({
  lines,
  staggerSec = 1.1,
  leadInSec = 0.5,
  background = BRAND.black,
  fontSize = 76,
  showMark = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Resolve each line's start frame once, honoring explicit atSec overrides.
  let cursor = leadInSec;
  const starts = lines.map((line) => {
    const at = line.atSec ?? cursor;
    cursor = at + staggerSec;
    return Math.round(at * fps);
  });

  const markIn = reveal(frame, Math.round(0.2 * fps), DUR.slow);

  return (
    <AbsoluteFill style={{ background }}>
      <AbsoluteFill
        style={{
          padding: `${SAFE.y}px ${SAFE.x}px`,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
        }}
      >
        {lines.map((line, i) => {
          const p = reveal(frame, starts[i], DUR.slow);
          return (
            <div
              key={i}
              style={{
                fontFamily: FONT.serif,
                fontSize: line.soft ? fontSize * 0.52 : fontSize,
                lineHeight: 1.22,
                letterSpacing: "0.005em",
                color: line.soft ? BRAND.onInkSoft : BRAND.onInk,
                maxWidth: 1360,
                marginTop: i === 0 ? 0 : line.soft ? 28 : 14,
                ...riseStyle(p, RISE_PX),
              }}
            >
              {line.text}
            </div>
          );
        })}
      </AbsoluteFill>

      {showMark && (
        <div
          style={{
            position: "absolute",
            left: SAFE.x,
            bottom: SAFE.y,
            ...riseStyle(markIn, 14),
          }}
        >
          <Mark height={38} color={BRAND.onInk} />
        </div>
      )}
    </AbsoluteFill>
  );
};
