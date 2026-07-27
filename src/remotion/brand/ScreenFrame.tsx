/* ─────────────────────────────────────────────────────────────────────────
   ScreenFrame — the footage slot.

   Renders Brian's screen capture when `src` is set, otherwise a labeled
   placeholder slate naming the screen he needs to record. That means the
   whole 90 seconds previews and renders BEFORE any footage exists, which is
   the entire point of the preview composition.

   Swap-in is one field per beat in ad/ad-script.ts — no component edits.
   ───────────────────────────────────────────────────────────────────────── */

import React from "react";
import { AbsoluteFill, OffthreadVideo, staticFile } from "remotion";
import { BRAND, FONT } from "./tokens";

export type ScreenFrameProps = {
  /** Path under public/, e.g. "footage/beat-01.mp4". Null → placeholder. */
  src?: string | null;
  /** What Brian records for this beat. Shown on the placeholder slate. */
  label: string;
  /** Second line on the slate — route, query string, whatever he needs. */
  hint?: string;
};

export const ScreenFrame: React.FC<ScreenFrameProps> = ({
  src,
  label,
  hint,
}) => {
  if (src) {
    return (
      <AbsoluteFill style={{ background: BRAND.black }}>
        <OffthreadVideo
          src={staticFile(src)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill
      style={{
        background: BRAND.paper2,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* Faint grid so motion over the slate is legible while previewing. */}
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${BRAND.line} 1px, transparent 1px), linear-gradient(90deg, ${BRAND.line} 1px, transparent 1px)`,
          backgroundSize: "80px 80px",
          opacity: 0.5,
        }}
      />
      <div
        style={{
          position: "relative",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          gap: 18,
          padding: "0 200px",
        }}
      >
        <div
          style={{
            fontFamily: FONT.sans,
            fontSize: 18,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: BRAND.muted,
          }}
        >
          Screen capture goes here
        </div>
        <div
          style={{
            fontFamily: FONT.serif,
            fontSize: 58,
            color: BRAND.ink,
            lineHeight: 1.18,
          }}
        >
          {label}
        </div>
        {hint && (
          <div
            style={{
              fontFamily: FONT.sans,
              fontSize: 26,
              color: BRAND.inkSoft,
              lineHeight: 1.4,
            }}
          >
            {hint}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
