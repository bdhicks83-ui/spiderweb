"use client";

// ROLE-BASED ONBOARDING — /welcome, the ONE wizard engine for all four tracks.
//
// There are not four wizards. There is one engine that renders a TrackDef
// (src/lib/onboarding-tracks.ts): ordered steps, each with main copy, an
// optional deep link into the REAL surface it teaches, and an optional
// expandable "peek under the hood" panel. The four tracks differ only in
// their definitions — steps, emphasis, depth — which is the whole design.
//
// ROUTING (2026-08-05 forced click-through). The dashboard auto-routes here
// until the person's own track is COMPLETE (see the needsOnboarding contract
// in /api/welcome), and while incomplete this page renders NO exits: no skip
// line, no step deep-links, no track switcher, and a bare (non-linking) brand
// header. Every seat clicks through its whole track once; after completion,
// all of it comes back (deep links, switcher, replay, dashboard links).
// On mount, this page still records "seen" (steps_done 0) — progress resume
// unchanged.
//
// PER-SEAT STEPS (2026-08-05). A step may carry seatVariants keyed by account
// email (awip-leadership Step 1 greets Montes/Paparella/Lusty by name) —
// resolved through resolveStepForSeat() with the email /api/welcome returns.
// Steps without variants pass through untouched.
//
// ⭐ THE SWITCH IS VIEW-ONLY, STRUCTURALLY. "?view=<track>" renders any other
// track — the trust feature (an exec reading the operator's "nobody's grading
// you" promise firsthand). While viewing, navigation is purely local state:
// this page sends no POST, and even a hostile client couldn't record progress
// on a viewed track, because /api/welcome resolves the track server-side from
// the caller's profile and ignores anything the body might claim.
//
// The deep links open in a new tab so the tour keeps its place; progress is
// resumable across sessions regardless (steps_done is monotonic, per person).
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import BrandHeader from "@/components/BrandHeader";
import {
  TRACKS,
  TRACK_KEYS,
  isTrackKey,
  resolveStepForSeat,
  type TrackDef,
  type TrackKey,
  type TrackStep,
} from "@/lib/onboarding-tracks";

type Status = {
  track: TrackKey | null;
  stepsDone: number;
  completedAt: string | null;
  seen: boolean;
  displayName: string | null;
  email: string | null;
  floorGuideActive: boolean;
  canSeeReadout: boolean;
};

// ✅ APPROVED MICROCOPY (Brian, July 30, approved as-is). All navigation
// chrome for the wizard: button labels, the skip line, the view-only banner,
// the switch-row heading. Step/panel copy lives in onboarding-tracks.ts
// (also fully approved).
const UI = {
  next: "Next",
  back: "Back",
  finishFallbackOperator: "Ask your first question",
  skip: "Skip the tour — you can come back anytime",
  stepOf: (n: number, total: number) => `Step ${n} of ${total}`,
  viewingBanner: (def: TrackDef) =>
    `You're viewing ${def.viewingLabel}. Looking around here doesn't change your own setup or your own progress.`,
  backToMine: "Back to your own welcome",
  switchHeading: "See what the rest of your team sees",
  doneHeading: "You've seen the whole tour.",
  runAgain: "Run through it again",
  toDashboard: "Back to your dashboard",
  exampleLead: "Try something like:",
};

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "var(--paper)",
    fontFamily: "var(--font-sans)",
    color: "var(--pine)",
  },
  shell: {
    maxWidth: "680px",
    margin: "0 auto",
    padding: "28px 20px 64px",
  },
  tagline: {
    fontFamily: "var(--font-serif)",
    fontSize: "28px",
    lineHeight: 1.25,
    margin: "26px 0 6px",
    color: "var(--pine)",
  },
  hello: {
    fontSize: "14px",
    color: "var(--muted)",
    margin: 0,
  },
  viewBanner: {
    marginTop: "18px",
    padding: "10px 14px",
    borderRadius: "10px",
    background: "var(--growth-soft)",
    border: "1px solid var(--ok-border)",
    color: "var(--growth-deep)",
    fontSize: "13.5px",
    lineHeight: 1.5,
  },
  progressRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    margin: "22px 0 14px",
  },
  dot: {
    width: "9px",
    height: "9px",
    borderRadius: "50%",
    display: "inline-block",
  },
  stepLabel: {
    fontSize: "12.5px",
    color: "var(--muted)",
    marginLeft: "6px",
  },
  card: {
    background: "var(--white)",
    border: "1px solid var(--line)",
    borderRadius: "14px",
    padding: "26px 26px 22px",
  },
  stepTitle: {
    fontFamily: "var(--font-serif)",
    fontSize: "21px",
    margin: "0 0 12px",
    color: "var(--pine)",
  },
  body: {
    fontSize: "15.5px",
    lineHeight: 1.65,
    color: "var(--pine-soft)",
    margin: "0 0 8px",
    whiteSpace: "pre-line",
  },
  example: {
    margin: "14px 0 4px",
    padding: "10px 14px",
    borderRadius: "10px",
    background: "var(--growth-soft)",
    color: "var(--growth-deep)",
    fontSize: "14.5px",
    fontStyle: "italic",
  },
  panelToggle: {
    marginTop: "16px",
    background: "none",
    border: "none",
    padding: 0,
    color: "var(--growth)",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "var(--font-sans)",
  },
  panel: {
    marginTop: "10px",
    padding: "14px 16px",
    borderRadius: "10px",
    background: "var(--paper)",
    border: "1px solid var(--line)",
    fontSize: "14.5px",
    lineHeight: 1.65,
    color: "var(--pine-soft)",
  },
  panelLead: {
    fontWeight: 700,
    color: "var(--pine)",
  },
  linkOut: {
    display: "inline-block",
    marginTop: "16px",
    padding: "9px 16px",
    borderRadius: "9px",
    border: "1px solid var(--growth)",
    color: "var(--growth)",
    fontSize: "14px",
    fontWeight: 600,
    textDecoration: "none",
  },
  navRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: "24px",
    gap: "12px",
  },
  primary: {
    padding: "11px 22px",
    borderRadius: "10px",
    border: "none",
    background: "var(--growth)",
    color: "var(--on-dark)",
    fontSize: "15px",
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "var(--font-sans)",
  },
  ghost: {
    padding: "11px 16px",
    borderRadius: "10px",
    border: "1px solid var(--line)",
    background: "var(--white)",
    color: "var(--muted)",
    fontSize: "14px",
    cursor: "pointer",
    fontFamily: "var(--font-sans)",
  },
  skip: {
    display: "block",
    marginTop: "18px",
    background: "none",
    border: "none",
    padding: 0,
    color: "var(--muted)",
    fontSize: "13px",
    textDecoration: "underline",
    cursor: "pointer",
    fontFamily: "var(--font-sans)",
  },
  closing: {
    fontFamily: "var(--font-serif)",
    fontSize: "18px",
    lineHeight: 1.55,
    color: "var(--pine)",
    margin: "0 0 18px",
  },
  switchWrap: {
    marginTop: "40px",
    paddingTop: "18px",
    borderTop: "1px solid var(--line)",
  },
  switchHeading: {
    fontSize: "13px",
    color: "var(--muted)",
    margin: "0 0 8px",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  switchLink: {
    display: "inline-block",
    marginRight: "18px",
    marginBottom: "6px",
    color: "var(--growth)",
    fontSize: "14px",
    textDecoration: "none",
    fontWeight: 600,
  },
  center: {
    padding: "80px 20px",
    textAlign: "center",
    color: "var(--muted)",
    fontSize: "15px",
  },
};

// ─── Training Studio visual (2026-08-06) ────────────────────────────────────
// Two example training artifacts rendered ON the Training Studio step
// (step.visual === "trainingStudio") so a leader sees what the studio
// produces before they've captured anything. Pure illustration — static
// content, brand tokens only, no data fetch, no links (forced click-through
// stays intact). The examples mirror real seeded AWIP demo content (Brian
// Ng's controlled-restart framework; the peel-check drill) so the library
// they meet later feels continuous with the tour.
const tsStyles: Record<string, CSSProperties> = {
  wrap: { display: "flex", gap: "12px", flexWrap: "wrap", margin: "16px 0 4px" },
  card: {
    flex: "1 1 240px",
    minWidth: "230px",
    background: "var(--paper)",
    border: "1px solid var(--line)",
    borderRadius: "12px",
    padding: "14px 16px 12px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
  },
  tagRow: { display: "flex", alignItems: "center", gap: "8px" },
  tag: {
    background: "var(--growth-soft)",
    color: "var(--growth-deep)",
    fontSize: "10.5px",
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    padding: "3px 9px",
    borderRadius: "999px",
  },
  audience: {
    color: "var(--muted)",
    fontSize: "11px",
    border: "1px solid var(--line)",
    borderRadius: "999px",
    padding: "2px 9px",
    background: "var(--white)",
  },
  title: {
    fontFamily: "var(--font-serif)",
    fontSize: "15.5px",
    color: "var(--pine)",
    margin: "11px 0 9px",
    lineHeight: 1.35,
  },
  row: {
    display: "flex",
    gap: "8px",
    fontSize: "13px",
    color: "var(--pine-soft)",
    lineHeight: 1.5,
    marginBottom: "6px",
  },
  check: { color: "var(--growth)", fontWeight: 700, flexShrink: 0 },
  foot: {
    marginTop: "10px",
    paddingTop: "10px",
    borderTop: "1px dashed var(--line)",
    fontSize: "11.5px",
    color: "var(--muted)",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
  proven: {
    background: "var(--growth-soft)",
    color: "var(--growth-deep)",
    border: "1px solid var(--ok-border)",
    borderRadius: "6px",
    padding: "2px 8px",
    fontSize: "11px",
    fontWeight: 600,
    whiteSpace: "nowrap",
  },
};

function TrainingStudioVisual() {
  return (
    <div style={tsStyles.wrap} aria-hidden="true">
      <div style={tsStyles.card}>
        <div style={tsStyles.tagRow}>
          <span style={tsStyles.tag}>Job aid</span>
          <span style={tsStyles.audience}>Floor</span>
        </div>
        <p style={tsStyles.title}>Post-Changeover First-Run Release Check</p>
        <div style={tsStyles.row}>
          <span style={tsStyles.check}>✓</span>
          <span>First-piece inspection cleared — and logged</span>
        </div>
        <div style={tsStyles.row}>
          <span style={tsStyles.check}>✓</span>
          <span>Bond-strength check on the first run, not the second</span>
        </div>
        <div style={tsStyles.row}>
          <span style={tsStyles.check}>✓</span>
          <span>Any drift: hold the run, flag Quality</span>
        </div>
        <div style={tsStyles.foot}>
          <span>Built from Brian Ng&apos;s “The Controlled Restart Release”</span>
        </div>
      </div>
      <div style={tsStyles.card}>
        <div style={tsStyles.tagRow}>
          <span style={tsStyles.tag}>Hands-on drill</span>
          <span style={tsStyles.audience}>Supervisor</span>
        </div>
        <p style={tsStyles.title}>Peel-Check Drill: Catch It Before It Ships</p>
        <div style={tsStyles.row}>
          <span style={tsStyles.check}>✓</span>
          <span>20 minutes, on the line, three panels</span>
        </div>
        <div style={tsStyles.row}>
          <span style={tsStyles.check}>✓</span>
          <span>One seeded peel defect — find it</span>
        </div>
        <div style={tsStyles.row}>
          <span style={tsStyles.check}>✓</span>
          <span>Teach-back scored, not checked off</span>
        </div>
        <div style={tsStyles.foot}>
          <span style={tsStyles.proven}>✓ Proven — no recurrence in 20 days</span>
        </div>
      </div>
    </div>
  );
}

function StepCard({
  step,
  floorGuideActive,
  canSeeReadout,
  linksLocked,
}: {
  step: TrackStep;
  floorGuideActive: boolean;
  canSeeReadout: boolean;
  /** 2026-08-05 forced click-through: while the person's own track is
   *  incomplete, no step renders a link out of the wizard — for everyone. */
  linksLocked: boolean;
}) {
  const [open, setOpen] = useState(false);

  // Deep-link gates: never render a link that would 403 (readout) or land on
  // a surface that isn't switched on for this seat (floor guide → /retrieve).
  let link = step.link ?? null;
  if (linksLocked) link = null;
  if (link?.gate === "readout" && !canSeeReadout) link = null;
  if (link?.gate === "floorGuide" && !floorGuideActive) {
    link = { ...link, href: "/retrieve" };
  }

  return (
    <div style={styles.card}>
      <h2 style={styles.stepTitle}>{step.title}</h2>
      <p style={styles.body}>{step.body}</p>
      {step.example ? (
        <div style={styles.example}>
          <span style={{ fontStyle: "normal", color: "var(--muted)", fontSize: "12.5px" }}>
            {UI.exampleLead}
          </span>{" "}
          “{step.example}”
        </div>
      ) : null}
      {step.visual === "trainingStudio" ? <TrainingStudioVisual /> : null}
      {link ? (
        <a href={link.href} target="_blank" rel="noreferrer" style={styles.linkOut}>
          {link.label} →
        </a>
      ) : null}
      {step.panel ? (
        <>
          <button
            type="button"
            style={styles.panelToggle}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "▿" : "▹"} {step.panel.label}
          </button>
          {open ? (
            <div style={styles.panel}>
              {step.panel.lead ? (
                <span style={styles.panelLead}>{step.panel.lead} </span>
              ) : null}
              {step.panel.body}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export default function WelcomePage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewKey, setViewKey] = useState<TrackKey | null>(null);
  const [index, setIndex] = useState(0);
  // "Run through it again" for someone whose track is already complete —
  // local replay only; completion never un-writes.
  const [reviewing, setReviewing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Read ?view= from the URL without useSearchParams (no Suspense boundary
  // needed; this page is client-rendered anyway).
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("view");
    if (isTrackKey(raw)) setViewKey(raw);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/welcome", { cache: "no-store" });
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        if (!res.ok) throw new Error("status " + res.status);
        const j = (await res.json()) as Status & { track: TrackKey | null };
        if (cancelled) return;
        setStatus(j);
        if (j.track) {
          const count = TRACKS[j.track].steps.length;
          setIndex(Math.min(j.stepsDone ?? 0, count - 1));
          // Mark "seen" once, so the dashboard never force-routes again.
          if (!j.seen) {
            fetch("/api/welcome", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ stepsDone: 0 }),
            }).catch(() => {});
          }
        }
      } catch {
        if (!cancelled) {
          setLoadError("Couldn't load your welcome tour. Refresh to try again.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const ownKey = status?.track ?? null;
  // 2026-08-05 forced click-through: everything that leads out of the wizard
  // (skip, deep links, the track switcher, even the header's home link) stays
  // hidden until the person's OWN track is complete.
  const ownDone = !!status?.completedAt;
  // Viewing another track is a post-completion feature now — an incomplete
  // seat typing ?view= by hand still gets their own track.
  const viewing = ownDone && !!(viewKey && ownKey && viewKey !== ownKey);
  const activeKey: TrackKey | null = viewing ? viewKey : ownKey;
  const def: TrackDef | null = activeKey ? TRACKS[activeKey] : null;

  // Viewing another track always starts at its first step, local-only.
  useEffect(() => {
    if (viewing) setIndex(0);
  }, [viewing]);

  const completed = !viewing && !!status?.completedAt && !reviewing;

  const otherTracks = useMemo(
    () => TRACK_KEYS.filter((k) => k !== ownKey),
    [ownKey]
  );

  async function recordProgress(stepsDone: number, complete: boolean) {
    if (viewing) return; // ⭐ view-only: no writes, ever.
    try {
      await fetch("/api/welcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(complete ? { complete: true } : { stepsDone }),
      });
    } catch {
      // Progress is a convenience; never block the person on telemetry.
    }
  }

  function finishHref(d: TrackDef): { label: string; href: string } {
    if (d.finish.gate === "floorGuide" && !status?.floorGuideActive) {
      return { label: UI.finishFallbackOperator, href: "/retrieve" };
    }
    return { label: d.finish.label, href: d.finish.href };
  }

  async function onNext() {
    if (!def) return;
    const last = index >= def.steps.length - 1;
    if (!last) {
      const nextIndex = index + 1;
      setIndex(nextIndex);
      void recordProgress(nextIndex, false);
      return;
    }
    // Finish (2026-08-06, Brian): record completion, then land DIRECTLY on
    // the surface this track leads into — no closing/confirmation stop. The
    // closing card still renders for a completed person who revisits
    // /welcome; it just isn't a gate on the way out anymore. If the write
    // ever failed, the dashboard's needsOnboarding check routes them back —
    // self-healing, never stranding.
    setSaving(true);
    await recordProgress(def.steps.length, true);
    setSaving(false);
    router.push(finishHref(def).href);
  }

  async function onSkip() {
    await recordProgress(0, true);
    router.push("/dashboard");
  }

  if (loadError) {
    return (
      <div style={styles.page}>
        <div style={styles.shell}>
          <BrandHeader bare />
          <p style={styles.center}>{loadError}</p>
        </div>
      </div>
    );
  }

  if (!status || !def || !activeKey) {
    return (
      <div style={styles.page}>
        <div style={styles.shell}>
          <BrandHeader bare />
          <p style={styles.center}>Loading…</p>
        </div>
      </div>
    );
  }

  const showClosing = completed;
  // Per-seat step resolution (awip-leadership Step 1A/1B/1C) — identity for
  // every step without seatVariants.
  const step = resolveStepForSeat(
    def.steps[Math.min(index, def.steps.length - 1)],
    status.email
  );
  const fin = finishHref(def);

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <BrandHeader bare={!ownDone} />

        <h1 style={styles.tagline}>{def.tagline}</h1>
        {!viewing && status.displayName ? (
          <p style={styles.hello}>For {status.displayName}</p>
        ) : null}

        {viewing ? <div style={styles.viewBanner}>{UI.viewingBanner(def)}</div> : null}

        {showClosing ? (
          <div style={{ marginTop: "26px" }}>
            <div style={styles.card}>
              <p style={styles.closing}>{def.closing}</p>
              <div style={styles.navRow}>
                <button
                  type="button"
                  style={styles.ghost}
                  onClick={() => {
                    setReviewing(true);
                    setIndex(0);
                  }}
                >
                  {UI.runAgain}
                </button>
                <a href={fin.href} style={{ ...styles.primary, textDecoration: "none" }}>
                  {fin.label} →
                </a>
              </div>
            </div>
            <a
              href="/dashboard"
              style={{ ...styles.skip, display: "inline-block", textAlign: "left" }}
            >
              {UI.toDashboard}
            </a>
          </div>
        ) : (
          <>
            <div style={styles.progressRow}>
              {def.steps.map((s, i) => (
                <span
                  key={s.title}
                  style={{
                    ...styles.dot,
                    background: i <= index ? "var(--growth)" : "var(--line)",
                  }}
                />
              ))}
              <span style={styles.stepLabel}>
                {UI.stepOf(index + 1, def.steps.length)}
              </span>
            </div>

            <StepCard
              key={activeKey + ":" + index}
              step={step}
              floorGuideActive={!!status.floorGuideActive}
              canSeeReadout={!!status.canSeeReadout}
              linksLocked={!ownDone}
            />

            <div style={styles.navRow}>
              {index > 0 ? (
                <button
                  type="button"
                  style={styles.ghost}
                  onClick={() => setIndex((i) => Math.max(0, i - 1))}
                >
                  {UI.back}
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                style={styles.primary}
                disabled={saving}
                onClick={() => void onNext()}
              >
                {index >= def.steps.length - 1
                  ? viewing
                    ? UI.next
                    : fin.label + " →"
                  : UI.next}
              </button>
            </div>

            {viewing ? (
              <a href="/welcome" style={styles.skip}>
                {UI.backToMine}
              </a>
            ) : ownDone ? (
              // Skip only exists once the tour is already complete (a replay
              // convenience) — forced click-through means no skipping the
              // first run, for anyone.
              <button type="button" style={styles.skip} onClick={() => void onSkip()}>
                {UI.skip}
              </button>
            ) : null}
          </>
        )}

        {ownDone ? (
          <div style={styles.switchWrap}>
            <p style={styles.switchHeading}>{UI.switchHeading}</p>
            {otherTracks.map((k) => (
              <a key={k} href={`/welcome?view=${k}`} style={styles.switchLink}>
                {TRACKS[k].seesLabel} →
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
