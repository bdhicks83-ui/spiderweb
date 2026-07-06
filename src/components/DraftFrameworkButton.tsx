"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DraftFrameworkButton({
  hubInsightId,
  redraft = false,
  approved = false,
}: {
  hubInsightId: string;
  redraft?: boolean;
  approved?: boolean; // framework is approved — redraft must be explicit
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    // Guard the approved version: never silently overwrite it.
    if (approved) {
      const ok = window.confirm(
        "This framework is APPROVED. Re-drafting replaces it with a new draft and resets its status to draft — you'll need to approve it again. Continue?"
      );
      if (!ok) return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/draft-framework", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hub_insight_id: hubInsightId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      router.refresh(); // server component re-renders with the new draft
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const label = busy
    ? "Drafting…"
    : approved
      ? "Replace approved version…"
      : redraft
        ? "Re-draft Framework"
        : "Draft Framework";

  return (
    <span style={{ display: "inline-block" }}>
      <button
        onClick={handleClick}
        disabled={busy}
        style={{
          padding: "0.4rem 0.9rem",
          borderRadius: 6,
          border: approved ? "1px solid #b91c1c" : "1px solid #333",
          background: busy ? "#eee" : approved ? "#fff" : "#111",
          color: busy ? "#888" : approved ? "#b91c1c" : "#fff",
          cursor: busy ? "wait" : "pointer",
          fontSize: "0.9rem",
        }}
      >
        {label}
      </button>
      {error && (
        <p style={{ color: "#b91c1c", marginTop: "0.5rem", fontSize: "0.85rem" }}>
          {error}
        </p>
      )}
    </span>
  );
}
