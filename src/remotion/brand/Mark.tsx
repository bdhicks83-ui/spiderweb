/* ─────────────────────────────────────────────────────────────────────────
   Mark — the Humanbloom logo lockup.

   Renders the real PNG when LOGO_SRC is set (see brand/tokens.ts), otherwise
   a typographic wordmark. Deliberately NOT an onError fallback: Remotion's
   <Img> registers a delayRender handle and FAILS THE WHOLE RENDER when a
   staticFile path is missing, so the choice has to be made before the element
   exists, not after it errors.
   ───────────────────────────────────────────────────────────────────────── */

import React from "react";
import { Img, staticFile } from "remotion";
import { BRAND, FONT, LOGO_SRC, WORDMARK } from "./tokens";

export type MarkProps = {
  /** Rendered height of the mark in px. Width is intrinsic. */
  height?: number;
  /** Ink color for the typographic fallback. */
  color?: string;
  style?: React.CSSProperties;
};

export const Mark: React.FC<MarkProps> = ({
  height = 44,
  color = BRAND.onInk,
  style,
}) => {
  if (LOGO_SRC) {
    return (
      <Img
        src={staticFile(LOGO_SRC)}
        style={{ height, width: "auto", display: "block", ...style }}
      />
    );
  }

  // Typographic fallback — same serif the app's headings use.
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: height * 0.34,
        ...style,
      }}
    >
      <span
        style={{
          width: height * 0.42,
          height: height * 0.42,
          borderRadius: "50% 50% 50% 0",
          background: BRAND.leaf,
          display: "block",
          transform: "rotate(-45deg)",
        }}
      />
      <span
        style={{
          fontFamily: FONT.serif,
          fontSize: height * 0.72,
          letterSpacing: "0.012em",
          color,
          lineHeight: 1,
        }}
      >
        {WORDMARK}
      </span>
    </div>
  );
};
