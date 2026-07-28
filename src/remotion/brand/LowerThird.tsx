/* ─────────────────────────────────────────────────────────────────────────
   LowerThird — numbered section title ("01 — Their judgment, captured.")

   Animates in from the lower left, holds, animates out. Sits OVER footage, so
   it carries its own scrim rather than relying on what's underneath.

   Timing is relative to the Sequence it lives in: `inSec` after that sequence
   starts, held for `holdSec`, then out. Mount it inside <Sequence> and it
   needs no absolute frame math.
   ───────────────────────────────────────────────────────────────────────── */

import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { BRAND, FONT, SAFE } from "./tokens";
import { DUR, RISE_PX, envelope } from "./motion";

export type LowerThirdProps = {
  /** Section number, e.g. "01". Rendered verbatim — pad it yourself. */
  number: string;
  text: string;
  /** Seconds after this sequence starts before it animates in. */
  inSec?: number;
  /** Seconds it stays fully on screen before animating out. */
  holdSec?: number;
  accent?: string;
};

export const LowerThird: React.FC<LowerThirdProps> = ({
  number,
  text,
  inSec = 0.4,
  holdSec = 3.6,
  accent = BRAND.newLeafLight,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const inAt = Math.round(inSec * fps);
  const outAt = Math.round((inSec + holdSec) * fps) + DUR.base;
  const p = envelope(frame, inAt, outAt, DUR.base, DUR.quick);

  if (p <= 0) return null;

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: SAFE.x,
          bottom: SAFE.y + 88,
          display: "flex",
          alignItems: "stretch",
          opacity: p,
          transform: `translateX(${(1 - p) * -RISE_PX}px)`,
        }}
      >
        {/* Accent rule — grows with the reveal, never bounces. */}
        <div
          style={{
            width: 3,
            background: accent,
            borderRadius: 2,
            transform: `scaleY(${p})`,
            transformOrigin: "bottom",
          }}
        />
        <div
          style={{
            background: "rgba(12, 46, 59, 0.86)",
            padding: "22px 34px 24px 28px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            backdropFilter: "blur(6px)",
          }}
        >
          <div
            style={{
              fontFamily: FONT.sans,
              fontSize: 20,
              fontWeight: 600,
              letterSpacing: "0.16em",
              color: accent,
              lineHeight: 1,
            }}
          >
            {number}
          </div>
          <div
            style={{
              fontFamily: FONT.serif,
              fontSize: 46,
              lineHeight: 1.15,
              letterSpacing: "0.005em",
              color: BRAND.onDark,
              whiteSpace: "nowrap",
            }}
          >
            {text}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
