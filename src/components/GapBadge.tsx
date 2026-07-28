"use client";
// P-9 Part 4 — the nav badge. "Your question was answered."
//
// Deliberately tiny and deliberately silent: it renders NOTHING when there is
// nothing to say, never shows an error, and never blocks anything. A person who
// asked a question the org couldn't answer should find out it was answered
// without having to go looking — that is the entire job.
//
// No email, no push, no toast in v1: an unread indicator plus a persistent list
// is enough to close the loop, and anything louder would be a notification
// system nobody asked for.
import { useEffect, useState, type CSSProperties } from "react";

export default function GapBadge() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/gaps/mine?count=1");
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
    <a href="/gaps/mine" style={styles.badge} title={COPY.title(unread)}>
      <span style={styles.dot} />
      {COPY.label(unread)}
    </a>
  );
}

// ⚠️ DRAFT CUSTOMER-FACING COPY — PENDING BRIAN'S SIGN-OFF (P-9).
const COPY = {
  label: (n: number) => (n === 1 ? "1 answer for you" : `${n} answers for you`),
  title: (n: number) =>
    n === 1
      ? "A question you asked has been answered by someone on your team."
      : `${n} questions you asked have been answered by people on your team.`,
};

const styles: Record<string, CSSProperties> = {
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: "12px",
    fontWeight: 700,
    color: "var(--growth-deep)",
    background: "var(--growth-soft)",
    border: "1px solid var(--new-leaf-light)",
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
