/* ─────────────────────────────────────────────────────────────────────────
   Viridescent motion-brand tokens.

   VERBATIM MIRROR of src/styles/theme.css — copy-don't-import, same doctrine
   as buildEmbeddingText in the seed scripts. Remotion renders in its own
   Chromium bundle and never loads the app's stylesheet, so CSS custom
   properties are unavailable here. If theme.css changes, change this too.

   Nothing in this file is invented. Every hex below appears in theme.css.
   Brand rule: dark surfaces use deepForest, never #000 — the old film-black
   opening/end-card background is retired with the Humanbloom palette.
   ───────────────────────────────────────────────────────────────────────── */

export const BRAND = {
  // Viridescent base palette — verbatim from theme.css
  deepForest: "#0e2f2c",
  pine: "#1b4d49",
  growth: "#2f7a56",
  newLeaf: "#8cc06a",
  paper: "#f7f8f6",

  // Derived tints/shades — verbatim from theme.css
  pineSoft: "#33625d",
  paper2: "#ecf0ec",
  line: "#d7ded6",
  growthDeep: "#256345",
  growthSoft: "#e0ede4",
  newLeafLight: "#c6ddb0",
  muted: "#52706c",
  white: "#ffffff",

  // Derived — text/lines on dark (deepForest) surfaces (verbatim from theme.css)
  onDark: "#ffffff",
  onDarkSoft: "rgba(255, 255, 255, 0.78)",
  onDarkMuted: "rgba(255, 255, 255, 0.55)",
  darkLine: "rgba(255, 255, 255, 0.16)",
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
   public/brand/viridescent-stacked-reversed.png exists (verified on disk) —
   the reversed stacked variant, since the ad's title/end cards sit on
   deepForest. If the PNG is ever removed, set this back to null: Remotion's
   <Img> hard-fails a render when a staticFile() path is missing — it does not
   fall back — and null renders the typographic wordmark instead.
   -------------------------------------------------------------------------- */
export const LOGO_SRC: string | null = "brand/viridescent-stacked-reversed.png";

/* End-card line under the mark. The Viridescent domain is NOT confirmed —
   do not put a guessed URL on camera. Tagline until Brian supplies one. */
export const URL_TEXT = "KNOWLEDGE THAT APPRECIATES";
export const WORDMARK = "Viridescent";
