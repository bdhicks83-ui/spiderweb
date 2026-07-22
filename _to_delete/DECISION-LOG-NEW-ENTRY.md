<!-- Paste these entries at the BOTTOM of DECISION-LOG.md -->

### July 11, 2026 — Marketing homepage built as 6 phased commits off the Floema research

**Context:** Human Bloom had no marketing homepage — just the app dashboard. We had two verified research docs (floema.com mechanics + a phased application plan) and a locked motion-heavy dark/tech design standard. Needed a from-scratch homepage that borrows Floema's *mechanics* without its cream/serif/eco *brand*.

**Decision:** Built the homepage in 6 reviewable, separately-committed phases: (1) fluid clamp() grid + GSAP/ScrollTrigger/SplitText setup, (2) hero SplitText reveal + brief scroll-pin + particle web concentrated on the headline, (3) goo/metaball nav pill hover, (4) departments showcase with per-department accents + hover chips + locked states, (5) horizontal pinned-scroll pricing scrub, (6) type/color pass.

**Reasoning:** Ship-thin, gate-by-gate. One phase per commit so each is independently reviewable and revertable, rather than one giant unreviewable drop.

**Result:** All 6 phases shipped and DOM-verified. Commits d5acc5e (P1) → 49aa4dd (P6).

### July 11, 2026 — Reused the existing native-sticky scroll mechanic for the pricing scrub instead of GSAP ScrollTrigger

**Context:** The plan literally specified "ScrollTrigger horizontal scrub" for the pricing tiers. But the whole page scrolls inside a fixed `.hb-root` element (the window never scrolls), and the existing `#how` narrative already achieves pinned-scroll via native `position: sticky` + the one rAF scroll handler.

**Options considered:** (a) GSAP ScrollTrigger pin + horizontal scrub with `scroller: .hb-root`; (b) mirror the proven native-sticky mechanic and translate the track on X from scroll progress.

**Decision:** Chose (b) — native sticky + scroll-driven `translateX`, extending the existing scroll handler.

**Reasoning:** A ScrollTrigger pin-spacer inside the custom scroller risked colliding with the existing sticky/scroll math for `#how`. The native mechanic was already proven to work in this exact scroller, is house-consistent, and lower-risk. Borrowing the *mechanic* (horizontal pinned scrub), not the specific library, satisfies the plan's intent.

**Result:** Verified the scrub math — at scroll progress 1 the track translates −1083px and the last tier lands flush at the viewport edge. Swappable to literal GSAP later if desired.

### July 11, 2026 — Swapped headline face from Fraunces (serif) to Space Grotesk

**Context:** The homepage had been built through Phase 5 using Fraunces, a *serif* — directly conflicting with the locked "no serif type" rule. Phase 6 (type pass) forced the reckoning.

**Options considered:** Space Grotesk (geometric display sans), Bricolage Grotesque (expressive grotesque), or keep Fraunces and override the no-serif rule. Surfaced as an explicit choice to Brian rather than decided unilaterally.

**Decision:** Space Grotesk for all display headings; Inter stays for UI. One display face + one UI face.

**Reasoning:** Honors the no-serif rule and reads tech-forward for an AI product. A typeface change reshapes the whole visual identity — that's a brand call for Brian, not a default to assume.

**Result:** Every heading now Space Grotesk with tight negative tracking (hero −0.035em). Also kept `--muted` for secondary body copy — a reasoned deviation from Floema's "single ink only," since this page is content-dense and full-ink body text would cost readability without adding hierarchy.

### July 11, 2026 — Flagged leftover 640px body style in layout.tsx (out of scope, spun off)

**Context:** Browser console showed a hydration mismatch on every load, traced to leftover Next.js starter inline styles on `<body>` in layout.tsx (max-width 640px, system-ui, padding) — which also constrains the dashboard/login pages to a narrow column.

**Decision:** Did not fix mid-phase; spun it off as a separate background task to avoid changing app-wide layout during the homepage build.

**Reasoning:** Ship-thin — keep the homepage phases clean; app-wide layout changes need their own verification against the dashboard/login pages.
