"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ApproveFrameworkButton({
  frameworkId,
}: {
  frameworkId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/approve-framework", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ framework_id: frameworkId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      router.refresh(); // server component re-renders with status = approved
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span style={{ display: "inline-block" }}>
      <button
        onClick={handleClick}
        disabled={busy}
        style={{
          padding: "0.4rem 0.9rem",
          borderRadius: 6,
          border: "1px solid #15803d",
          background: busy ? "#eee" : "#15803d",
          color: busy ? "#888" : "#fff",
          cursor: busy ? "wait" : "pointer",
          fontSize: "0.9rem",
        }}
      >
        {busy ? "Approving…" : "Approve"}
      </button>
      {error && (
        <p style={{ color: "#b91c1c", marginTop: "0.5rem", fontSize: "0.85rem" }}>
          {error}
        </p>
      )}
    </span>
  );
}
