"use client";
// FLOOR GUIDE / PHASE B — the nav badge. "Something you shared is moving."
//
// Third in the family, and it obeys the same discipline as GapBadge (P-9) and
// CaptureRequestBadge (T1B2) for the same reasons: renders NOTHING when there is
// nothing to say, never shows an error, never blocks a page, and costs one count
// query with no joins.
//
// ⭐ IT CAN ONLY EVER CARRY GOOD NEWS. /api/insights/mine reads through RLS, and
// the read policy on candidate_insights excludes dismissed rows from the person
// who surfaced them. So there is no version of this badge that tells somebody
// their idea was turned down — not because this file is careful, but because the
// data will not give it to them.
//
// Colour: new-leaf, distinct from GapBadge's growth-soft ("an answer arrived for
// you") and from CaptureRequestBadge's amber ("something is waiting on you").
// This one means "something you gave is going somewhere."
import { useEffect, useState, type CSSProperties } from "react";

export default function InsightBadge() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/insights/mine?count=1");
        if (!res.ok) return; // 401 on a logged-out page is expected and silent
        const data = await res.json();
        if (!cancelled && typeof data?.unread === "number") setUnread(data.unread);
      } catch {
        // Never surfaces. A badge that can show an error is worse than no badge.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (unread < 1) return null;

  return (
    <a href="/insights/mine" style={styles.badge} title={COPY.title(unread)}>
      <span style={styles.dot} />
      {COPY.label(unread)}
    </a>
  );
}

// ⚠️ DRAFT CUSTOMER-FACING COPY — PENDING BRIAN'S SIGN-OFF (Floor Guide B).
// "Moving" covers both moments this badge lights for — noticed, and promoted —
// without promising the second one when it is only the first.
const COPY = {
  label: (n: number) => (n === 1 ? "1 idea moving" : `${n} ideas moving`),
  title: (n: number) =>
    n === 1
      ? "Something you shared is with your leadership team."
      : `${n} things you shared are with your leadership team.`,
};

const styles: Record<string, CSSProperties> = {
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: "12px",
    fontWeight: 700,
    color: "var(--growth-deep)",
    background: "var(--new-leaf-light)",
    border: "1px solid var(--new-leaf)",
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
    background: "var(--growth)",
    display: "inline-block",
  },
};
