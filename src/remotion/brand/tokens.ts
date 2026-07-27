/* ─────────────────────────────────────────────────────────────────────────
   Humanbloom motion-brand tokens.

   VERBATIM MIRROR of src/styles/theme.css — copy-don't-import, same doctrine
   as buildEmbeddingText in the seed scripts. Remotion renders in its own
   Chromium bundle and never loads the app's stylesheet, so CSS custom
   properties are unavailable here. If theme.css changes, change this too.

   Nothing in this file is invented. Every hex below appears in theme.css.
   ───────────────────────────────────────────────────────────────────────── */

export const BRAND = {
  // Landing-page tokens — verbatim from theme.css
  ink: "#0c2e3b",
  inkSoft: "#2c4a54",
  paper: "#fef9f6",
  paper2: "#f4ece4",
  line: "#ddd2c7",
  accent: "#4e7e70",
  accentDeep: "#3c6255",
  accentSoft: "#dfe9df",
  leaf: "#6b9e76",
  leafLight: "#a3bda0",
  muted: "#6a7b78",
  white: "#ffffff",

  // Derived — text/lines on dark surfaces (verbatim from theme.css)
  onInk: "#ffffff",
  onInkSoft: "rgba(255, 255, 255, 0.78)",
  onInkMuted: "rgba(255, 255, 255, 0.55)",
  inkLine: "rgba(255, 255, 255, 0.16)",

  // Film black. The handoff specifies full-frame BLACK for the opening, not
  // the app's --ink. Kept as its own token so the choice is explicit and
  // swappable to `ink` in one place if Brian wants the brand-tinted version.
  black: "#000000",
} as const;

/* Type ---------------------------------------------------------------------
   theme.css declares:
     --font-serif: Georgia, 'Times New Roman', Times, serif
     --font-sans:  Inter, system-ui, -apple-system, 'Segoe UI', sans-serif
   Headings in the app are serif (h1/h2/h3 rule in theme.css), so display type
   here is serif for continuity. Inter is dropped from the sans stack on
   purpose — Remotion's Chromium has no webfont loader wired up, and a missing
   Inter silently falls back mid-render. system-ui is always present.
   -------------------------------------------------------------------------- */
export const FONT = {
  serif: "Georgia, 'Times New Roman', Times, serif",
  sans: "system-ui, -apple-system, 'Segoe UI', sans-serif",
} as const;

/* Video format — locked for every cut (90s, 30s, 3min) --------------------- */
export const VIDEO = {
  width: 1920,
  height: 1080,
  fps: 30,
} as const;

/* Safe area. 1080p broadcast-ish margin so nothing crowds the frame edge and
   captions clear the bottom on a phone crop. */
export const SAFE = {
  x: 128,
  y: 96,
} as const;

/* Logo ---------------------------------------------------------------------
   DROP THE LOGO HERE:  public/brand/HUMANBLOOMlogofinal.png
   Then change the line below to:
       export const LOGO_SRC: string | null = "brand/HUMANBLOOMlogofinal.png";

   Left null so `npm run render:ad` succeeds TODAY. Remotion's <Img> hard-fails
   a render when a staticFile() path is missing — it does not fall back — so a
   null here renders the typographic wordmark instead and the render always
   completes. One-line change, no other edits needed.
   -------------------------------------------------------------------------- */
export const LOGO_SRC: string | null = null;

export const URL_TEXT = "humanbloom.com";
export const WORDMARK = "Humanbloom";
