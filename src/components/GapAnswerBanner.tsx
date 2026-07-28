"use client";
// P-9 Part 2 — "you're answering this" banner on /codify.
//
// THE ORIGINAL QUERY TEXT IS CARRIED INTO WHATEVER THEY DO NEXT. Somebody
// clicked "Answer it now" on a question a colleague actually typed; if the
// interview then starts on a blank page, they are answering from memory two
// clicks later. This keeps the question in front of them the whole way through.
//
// Reads the gap id from the URL with window.location rather than
// useSearchParams on purpose: useSearchParams forces the whole client page into
// a Suspense boundary in the App Router, and this banner is not worth
// restructuring /codify for.
//
// Renders NOTHING without ?gap= — /codify is unchanged for everyone else.
import { useEffect, useState, type CSSProperties } from "react";

// ⚠️ DRAFT CUSTOMER-FACING COPY — PENDING BRIAN'S SIGN-OFF (P-9).
const COPY = {
  label: "You're filling a gap",
  lead: "Somebody on your team asked this and nobody had an answer:",
  tail:
    "Capture it the way you'd explain it to them. When this session finishes, the gap closes and everyone who asked gets pointed here.",
  asked: (n: number) => (n === 1 ? "asked once" : `asked ${n} times`),
};

type Gap = { id: string; question: string; status: string; asked_count: number };

export default function GapAnswerBanner() {
  const [gap, setGap] = useState<Gap | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const gapId = new URLSearchParams(window.location.search).get("gap");
    if (!gapId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/gaps/${gapId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data?.gap) setGap(data.gap as Gap);
      } catch {
        // Silent: a missing banner must never block a capture session.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!gap) return null;

  return (
    <div style={styles.wrap}>
      <div style={styles.top}>
        <span style={styles.label}>{COPY.label}</span>
        <span style={styles.count}>{COPY.asked(gap.asked_count)}</span>
      </div>
      <p style={styles.lead}>{COPY.lead}</p>
      <p style={styles.question}>&ldquo;{gap.question}&rdquo;</p>
      <p style={styles.tail}>{COPY.tail}</p>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  // Amber = attention, not error. Same treatment as contested + Coaching Watch.
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
  count: {
    fontSize: "11px",
    fontWeight: 600,
    color: "var(--warn-text)",
    background: "var(--warn-chip-bg)",
    border: "1px solid var(--warn-border)",
    borderRadius: 999,
    padding: "2px 8px",
  },
  lead: { fontSize: "13px", color: "var(--warn-text)", margin: "0 0 6px" },
  question: {
    fontSize: "15px",
    fontWeight: 600,
    color: "var(--pine)",
    margin: "0 0 10px",
    lineHeight: 1.5,
  },
  tail: { fontSize: "13px", color: "var(--warn-text)", margin: 0, lineHeight: 1.55 },
};
