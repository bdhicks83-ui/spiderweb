/* ─────────────────────────────────────────────────────────────────────────
   LogoStills — the Viridescent raster logo set, rendered as Remotion stills.

   Every PNG in public/brand/ is generated from these components via
   `npx remotion still` (see DECISION-LOG for the exact commands). Regenerate
   here instead of editing PNGs — the sprout paths are the same ones
   BrandHeader.tsx draws inline, and every color comes from brand/tokens.ts
   (the verbatim mirror of theme.css).

   Variants:
     LogoHorizontal      → public/brand/viridescent-horizontal.png   (header/nav, light)
     LogoStacked         → public/brand/viridescent-stacked.png      (login, light)
     LogoStackedReversed → public/brand/viridescent-stacked-reversed.png (dark surfaces)
     AppIcon             → app-icon-{32,180,192,512}.png             (favicon/PWA/apple)
     OgImage             → public/brand/og-image.png                 (social meta, 1200×630)
   ───────────────────────────────────────────────────────────────────────── */
import React from "react";
import { AbsoluteFill } from "remotion";
import { BRAND, FONT, WORDMARK, URL_TEXT } from "./tokens";

/* The sprout mark — identical geometry to Daisy in src/components/BrandHeader.tsx.
   Light surfaces: growth/newLeaf on pine text. Dark surfaces: brightened to
   newLeaf/newLeafLight so the mark reads against deepForest. */
function Sprout({
  size,
  stem,
  leftLeaf,
  rightLeaf,
}: {
  size: number;
  stem: string;
  leftLeaf: string;
  rightLeaf: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 21.5 C 12 16.5, 12 13.5, 12 10.5"
        stroke={stem}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M12 13.5 C 7.5 13.2, 4.8 10.4, 4.4 6.2 C 8.6 6.6, 11.4 9.2, 12 13.5 Z"
        fill={leftLeaf}
      />
      <path
        d="M12 10.5 C 12.6 6.6, 15.2 4.2, 19.6 3.8 C 19.2 8.2, 16.4 10.8, 12 10.5 Z"
        fill={rightLeaf}
      />
    </svg>
  );
}

const LIGHT_SPROUT = {
  stem: BRAND.growth,
  leftLeaf: BRAND.growth,
  rightLeaf: BRAND.newLeaf,
};

const DARK_SPROUT = {
  stem: BRAND.newLeaf,
  leftLeaf: BRAND.newLeaf,
  rightLeaf: BRAND.newLeafLight,
};

/* Horizontal lockup — transparent background, flush left so the header can
   render it at height:26px with no leading gap. Composition: 960×208. */
export const LogoHorizontal: React.FC = () => (
  <AbsoluteFill
    style={{
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-start",
    }}
  >
    <Sprout size={176} {...LIGHT_SPROUT} />
    <div
      style={{
        fontFamily: FONT.serif,
        fontWeight: 600,
        fontSize: 128,
        letterSpacing: "0.02em",
        color: BRAND.pine,
        marginLeft: 24,
        lineHeight: 1,
      }}
    >
      {WORDMARK}
    </div>
  </AbsoluteFill>
);

/* Stacked lockup — mark above wordmark, transparent. Composition: 640×640. */
function Stacked({
  text,
  sprout,
}: {
  text: string;
  sprout: { stem: string; leftLeaf: string; rightLeaf: string };
}) {
  return (
    <AbsoluteFill
      style={{
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Sprout size={320} {...sprout} />
      <div
        style={{
          fontFamily: FONT.serif,
          fontWeight: 600,
          fontSize: 84,
          letterSpacing: "0.02em",
          color: text,
          marginTop: 8,
          lineHeight: 1,
        }}
      >
        {WORDMARK}
      </div>
    </AbsoluteFill>
  );
}

export const LogoStacked: React.FC = () => (
  <Stacked text={BRAND.pine} sprout={LIGHT_SPROUT} />
);

export const LogoStackedReversed: React.FC = () => (
  <Stacked text={BRAND.onDark} sprout={DARK_SPROUT} />
);

/* App icon — full-bleed deepForest square (dark = Deep Forest, never black),
   bright sprout centered. Rendered at 32/180/192/512; the SVG scales. */
export const AppIcon: React.FC = () => (
  <AbsoluteFill
    style={{
      backgroundColor: BRAND.deepForest,
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    {/* 72% of frame — enough margin for maskable/rounded crops */}
    <div style={{ width: "72%", height: "72%" }}>
      <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 21.5 C 12 16.5, 12 13.5, 12 10.5"
          stroke={DARK_SPROUT.stem}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M12 13.5 C 7.5 13.2, 4.8 10.4, 4.4 6.2 C 8.6 6.6, 11.4 9.2, 12 13.5 Z"
          fill={DARK_SPROUT.leftLeaf}
        />
        <path
          d="M12 10.5 C 12.6 6.6, 15.2 4.2, 19.6 3.8 C 19.2 8.2, 16.4 10.8, 12 10.5 Z"
          fill={DARK_SPROUT.rightLeaf}
        />
      </svg>
    </div>
  </AbsoluteFill>
);

/* Social/OG card — deepForest with the marketing page's growth glow,
   stacked mark + tagline. Composition: 1200×630. */
export const OgImage: React.FC = () => (
  <AbsoluteFill
    style={{
      backgroundColor: BRAND.deepForest,
      backgroundImage: `radial-gradient(700px 360px at 80% -10%, rgba(47,122,86,0.35), transparent 60%),
        radial-gradient(600px 340px at 10% 15%, rgba(140,192,106,0.12), transparent 55%)`,
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <Sprout size={200} {...DARK_SPROUT} />
    <div
      style={{
        fontFamily: FONT.serif,
        fontWeight: 600,
        fontSize: 96,
        letterSpacing: "0.02em",
        color: BRAND.onDark,
        marginTop: 4,
        lineHeight: 1,
      }}
    >
      {WORDMARK}
    </div>
    <div
      style={{
        fontFamily: FONT.sans,
        fontWeight: 600,
        fontSize: 26,
        letterSpacing: "0.35em",
        color: BRAND.newLeaf,
        marginTop: 34,
      }}
    >
      {URL_TEXT}
    </div>
  </AbsoluteFill>
);
