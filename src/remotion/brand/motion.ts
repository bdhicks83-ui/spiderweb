/* ─────────────────────────────────────────────────────────────────────────
   Motion vocabulary — the whole brand system's easing and timing live here.

   DESIGN BAR (locked, see DECISION-LOG 2026-07-27): restrained and expensive.
   Short durations, ease-out, NO spring, NO bounce, NO overshoot. Enterprise
   ad, not a launch video. Brian's standing motion-heavy preference is a
   WEBSITE preference — ad titles that call attention to themselves read cheap.

   Every animated value in this system goes through `reveal()` or `fade()`.
   That is deliberate: one place to retune the feel of the entire brand.
   ───────────────────────────────────────────────────────────────────────── */

import { Easing, interpolate } from "remotion";

/** The single ease. Cubic ease-out — decelerates in, never overshoots. */
export const EASE = Easing.out(Easing.cubic);

/** Symmetric ease for out-animations that need to accelerate away. */
export const EASE_IN = Easing.in(Easing.cubic);

/** Canonical durations, in frames @30fps. */
export const DUR = {
  /** 0.4s — text lines, chips, captions. */
  quick: 12,
  /** 0.6s — lower thirds in/out, mark reveal. */
  base: 18,
  /** 0.8s — full-frame title cards. */
  slow: 24,
} as const;

/**
 * A 0→1 progress ramp starting at `start`, eased out.
 * Clamped at both ends so a value never runs past its target.
 */
export const reveal = (
  frame: number,
  start: number,
  duration: number = DUR.base
): number =>
  interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });

/**
 * In → hold → out envelope for anything with a finite life (lower thirds,
 * captions). Returns 0→1→0. `outAt` is the frame the exit BEGINS.
 */
export const envelope = (
  frame: number,
  inAt: number,
  outAt: number,
  inDur: number = DUR.base,
  outDur: number = DUR.quick
): number => {
  const rise = interpolate(frame, [inAt, inAt + inDur], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });
  const fall = interpolate(frame, [outAt, outAt + outDur], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_IN,
  });
  return Math.min(rise, fall);
};

/** Translate distance for reveals, in px. Small on purpose. */
export const RISE_PX = 26;

/** Helper: opacity + translateY from a single 0→1 progress value. */
export const riseStyle = (
  progress: number,
  distance: number = RISE_PX,
  axis: "y" | "x" = "y"
): React.CSSProperties => ({
  opacity: progress,
  transform:
    axis === "y"
      ? `translateY(${(1 - progress) * distance}px)`
      : `translateX(${(1 - progress) * -distance}px)`,
});
