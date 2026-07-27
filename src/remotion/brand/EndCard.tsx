/* ─────────────────────────────────────────────────────────────────────────
   EndCard — centered logo, URL beneath, static hold. NO MOTION.

   The one deliberately motionless component in the system. Everything else
   eases; this lands and stops, so the last thing on screen is the name.
   ───────────────────────────────────────────────────────────────────────── */

import React from "react";
import { AbsoluteFill } from "remotion";
import { BRAND, FONT, URL_TEXT } from "./tokens";
import { Mark } from "./Mark";

export type EndCardProps = {
  url?: string;
  /** Optional one-line kicker above the URL. Omit for the barest version. */
  kicker?: string;
  background?: string;
  markHeight?: number;
};

export const EndCard: React.FC<EndCardProps> = ({
  url = URL_TEXT,
  kicker,
  background = BRAND.black,
  markHeight = 96,
}) => (
  <AbsoluteFill
    style={{
      background,
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      gap: 40,
    }}
  >
    <Mark height={markHeight} color={BRAND.onInk} />

    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
      }}
    >
      {kicker && (
        <div
          style={{
            fontFamily: FONT.serif,
            fontSize: 30,
            color: BRAND.onInkSoft,
            letterSpacing: "0.005em",
          }}
        >
          {kicker}
        </div>
      )}
      <div
        style={{
          fontFamily: FONT.sans,
          fontSize: 26,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: BRAND.leafLight,
        }}
      >
        {url}
      </div>
    </div>
  </AbsoluteFill>
);
