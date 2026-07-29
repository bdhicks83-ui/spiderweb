"use client";
// TIER 1 / BUILD 2 — "you're answering this" banner on /codify.
//
// THE ASK IS CARRIED INTO THE INTERVIEW. Somebody clicked "Capture this" on a
// question a colleague actually wrote; if the interview then opens on a blank
// method picker, they are answering from memory two clicks later and the
// specific thing that was asked quietly becomes whatever they happened to
// think of. Same failure P-9's GapAnswerBanner exists to prevent, same fix.
//
// Reads ?request= from window.location rather than useSearchParams on purpose:
// useSearchParams forces the whole client page into a Suspense boundary in the
// App Router, and neither banner is worth restructuring /codify for.
//
// Renders NOTHING without ?request= — /codify is unchanged for everyone else.
import { useEffect, useState, type CSSProperties } from "react";

// ⚠️ DRAFT CUSTOMER-FACING COPY — PENDING BRIAN'S SIGN-OFF (T1B2).
const COPY = {
  label: "Asked of you",
  lead: (who: string) => `${who} asked you to capture this:`,
  demand: (n: number) =>
    n === 1
      ? "Somebody already went looking for this and it wasn't there."
      : `${n} people already went looking for this and it wasn't there.`,
  tail:
    "Answer it the way you'd explain it to the person who asked. When this session finishes, it links itself back — you don't have to come back and mark anything done.",
};

type Ask = {
  id: string;
  prompt: string;
  status: string;
  source: string;
  gap_asked_count: number | null;
  campaign_name: string;
  campaign_purpose: string | null;
  asked_by: string;
  is_mine: boolean;
};

export default function CaptureRequestBanner() {
  const [ask, setAsk] = useState<Ask | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const requestId = new URLSearchParams(window.location.search).get("request");
    if (!requestId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/requests/${requestId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data?.request?.is_mine) setAsk(data.request as Ask);
      } catch {
        // Silent: a missing banner must never block a capture session.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ask) return null;

  return (
    <div style={styles.wrap}>
      <div style={styles.top}>
        <span style={styles.label}>{COPY.label}</span>
        <span style={styles.campaign}>{ask.campaign_name}</span>
        {ask.source === "gap" && ask.gap_asked_count ? (
          <span style={styles.demandChip}>{COPY.demand(ask.gap_asked_count)}</span>
        ) : null}
      </div>
      <p style={styles.lead}>{COPY.lead(ask.asked_by)}</p>
      <p style={styles.prompt}>&ldquo;{ask.prompt}&rdquo;</p>
      {ask.campaign_purpose && <p style={styles.purpose}>{ask.campaign_purpose}</p>}
      <p style={styles.tail}>{COPY.tail}</p>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  // Amber = attention, not error. Same treatment as contested, Coaching Watch
  // and the gap banner it sits alongside.
  wrap: {
    background: "var(--warn-bg)",
    border: "1px solid var(--warn-border)",
    borderRadius: 14,
    padding: "16px 18px",
    margin: "0 0 20px",
  },
  top: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 },
  label: {
    fontSize: "11px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "var(--warn-strong)",
  },
  campaign: {
    fontSize: "11px",
    fontWeight: 600,
    color: "var(--warn-text)",
    background: "var(--warn-chip-bg)",
    border: "1px solid var(--warn-border)",
    borderRadius: 999,
    padding: "2px 8px",
  },
  demandChip: {
    fontSize: "11px",
    fontWeight: 700,
    color: "var(--growth-deep)",
    background: "var(--growth-soft)",
    border: "1px solid var(--new-leaf-light)",
    borderRadius: 999,
    padding: "2px 8px",
  },
  lead: { fontSize: "13px", color: "var(--warn-text)", margin: "0 0 6px" },
  prompt: {
    fontSize: "15px",
    fontWeight: 600,
    color: "var(--pine)",
    margin: "0 0 10px",
    lineHeight: 1.5,
  },
  purpose: {
    fontSize: "13px",
    color: "var(--warn-text)",
    margin: "0 0 10px",
    lineHeight: 1.55,
    fontStyle: "italic",
  },
  tail: { fontSize: "13px", color: "var(--warn-text)", margin: 0, lineHeight: 1.55 },
};
