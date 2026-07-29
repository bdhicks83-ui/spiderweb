"use client";
// TIER 1 / BUILD 2 — the nav badge. "Somebody asked you for something."
//
// Same discipline as P-9's GapBadge, and for the same reason: it renders
// NOTHING when there is nothing to say, never shows an error, never blocks
// anything, and adds one cheap count query to a page load. A person who has
// been asked to write down how they decide something should find out without
// being emailed about it.
//
// No email, no push, no toast in v1 — an unread indicator plus a persistent
// list is enough to close the loop, and anything louder is a notification
// system nobody asked for. (Verbatim the P-9 call; the two badges sit next to
// each other and should behave identically.)
import { useEffect, useState, type CSSProperties } from "react";

export default function CaptureRequestBadge() {
  const [open, setOpen] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/requests/mine?count=1");
        if (!res.ok) return; // 401 on a logged-out page is expected and silent
        const data = await res.json();
        if (!cancelled && typeof data?.open === "number") setOpen(data.open);
      } catch {
        // Never surfaces. A badge that can show an error is worse than no badge.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (open < 1) return null;

  return (
    <a href="/requests" style={styles.badge} title={COPY.title(open)}>
      <span style={styles.dot} />
      {COPY.label(open)}
    </a>
  );
}

// ⚠️ DRAFT CUSTOMER-FACING COPY — PENDING BRIAN'S SIGN-OFF (T1B2).
// "Asked of you" not "assigned to you": one is a colleague wanting your
// judgment, the other is a ticket. The whole build depends on which one this
// feels like.
const COPY = {
  label: (n: number) => (n === 1 ? "1 asked of you" : `${n} asked of you`),
  title: (n: number) =>
    n === 1
      ? "Someone on your team asked you to capture something."
      : `${n} things your team has asked you to capture.`,
};

const styles: Record<string, CSSProperties> = {
  // Amber, matching the gaps/contested/coaching family: attention, not error,
  // and visually distinct from GapBadge's green "here's something good for you."
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: "12px",
    fontWeight: 700,
    color: "var(--warn-text)",
    background: "var(--warn-chip-bg)",
    border: "1px solid var(--warn-border)",
    borderRadius: 999,
    padding: "3px 10px",
    textDecoration: "none",
    fontFamily: "var(--font-sans)",
    whiteSpace: "nowrap",
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    background: "var(--warn-strong)",
    display: "inline-block",
  },
};
