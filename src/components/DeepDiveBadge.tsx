"use client";
// FLOOR GUIDE / PHASE C — the nav badge. "Someone asked how you really do it."
//
// Fourth in the family, T1B2's pattern verbatim: renders NOTHING when there is
// nothing to say, never shows an error, never blocks anything, one cheap count
// query per page load.
//
// ⭐ IT CAN ONLY EVER MEAN "AN ASK IS WAITING." The count comes from the live
// target list — answering or declining removes you from it, so the badge goes
// dark either way and can never nag about an ask you already dealt with. And
// because a decline leaves no record (DECISION 5), there is no state for this
// badge to leak.
import { useEffect, useState, type CSSProperties } from "react";

export default function DeepDiveBadge() {
  const [open, setOpen] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/deep-dives/mine?count=1");
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
    <a href="/deep-dives/mine" style={styles.badge} title={COPY.title(open)}>
      <span style={styles.dot} />
      {COPY.label(open)}
    </a>
  );
}

// ✅ CUSTOMER-FACING COPY APPROVED BY BRIAN — July 29, 2026 (Floor Guide C).
// "Wants to know" not "assigned": one is a person curious how you work, the
// other is a ticket — same distinction T1B2 drew, and it matters more here
// because this one is declinable and the wording has to feel that way.
const COPY = {
  label: (n: number) => (n === 1 ? "1 deep dive for you" : `${n} deep dives for you`),
  title: (n: number) =>
    n === 1
      ? "Someone running your account wants to know how you really do something. You can answer or decline."
      : `${n} deep dives waiting on you. You can answer or decline each one.`,
};

const styles: Record<string, CSSProperties> = {
  // Amber — the "something is waiting on you" family, next to
  // CaptureRequestBadge. Distinct label, same register.
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
