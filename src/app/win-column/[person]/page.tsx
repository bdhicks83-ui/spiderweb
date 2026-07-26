"use client";
// P-4.5 — Win Column: one-click evidence packet.
// A promotion case assembled in 30 seconds — every win narrative this
// person appears in, quoted, dated, and attributed to the expert who said
// it. Printable (window.print) and copyable (navigator.clipboard) as-is.
// Wins only, by construction of /api/win-column/evidence.
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import BrandHeader from "@/components/BrandHeader";

const supabase = createClient();

type Entry = {
  recordId: string;
  authorName: string;
  date: string;
  quote: string;
  frameworkName: string | null;
  method: string | null;
  contextFunction: string | null;
};

type Packet = {
  personKey: string;
  displayName: string;
  role: string | null;
  mentionCount: number;
  distinctAuthorCount: number;
  generatedAt: string;
  entries: Entry[];
};

const METHOD_LABEL: Record<string, string> = {
  "5whys_fishbone": "5 Whys + Fishbone",
  aar_success_case: "AAR + Success Case",
  premortem: "Pre-mortem",
  a3: "A3 Gap Analysis",
  cdm: "Critical Decision Method",
};

export default function WinColumnEvidencePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [packet, setPacket] = useState<Packet | null>(null);
  const [copied, setCopied] = useState(false);
  const router = useRouter();
  const params = useParams<{ person: string }>();

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      try {
        // Next.js's app-router useParams can hand back the RAW (still
        // URL-encoded) path segment rather than a decoded one, depending on
        // how the link was constructed — decode defensively before
        // re-encoding for the fetch, or a name with a space ("marcus webb")
        // round-trips as "marcus%2520webb" (double-encoded) and 404s.
        let rawPerson = params.person;
        try {
          rawPerson = decodeURIComponent(rawPerson);
        } catch {
          // already decoded / not encoded — use as-is
        }
        const res = await fetch(`/api/win-column/evidence?person=${encodeURIComponent(rawPerson)}`);
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Could not load the evidence packet.");
        } else {
          setPacket(data);
        }
      } catch {
        setError("Could not load the evidence packet.");
      } finally {
        setLoading(false);
      }
    })();
  }, [router, params.person]);

  const copyText = () => {
    if (!packet) return;
    const lines = [
      `${packet.displayName}${packet.role ? " — " + packet.role : ""}`,
      `Cited by ${packet.distinctAuthorCount} expert${packet.distinctAuthorCount === 1 ? "" : "s"} across ${packet.mentionCount} win record${packet.mentionCount === 1 ? "" : "s"}`,
      "",
      ...packet.entries.flatMap((e) => [
        `"${e.quote}"`,
        `— ${e.authorName}, ${new Date(e.date).toLocaleDateString()}${e.frameworkName ? ` (from "${e.frameworkName}")` : ""}`,
        "",
      ]),
    ];
    navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div style={styles.center}>
        <p>Loading…</p>
      </div>
    );
  }

  if (error || !packet) {
    return (
      <div style={styles.center}>
        <p style={styles.errorText}>{error || "Not found."}</p>
      </div>
    );
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        <div style={{ marginBottom: 18 }}>
          <BrandHeader />
        </div>
        <div style={styles.actions} className="no-print">
          <a href="/win-column" style={styles.backLink}>
            ← Win Column
          </a>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={copyText} style={styles.actionButton}>
              {copied ? "Copied ✓" : "Copy"}
            </button>
            <button onClick={() => window.print()} style={styles.actionButton}>
              Print
            </button>
          </div>
        </div>

        <div style={styles.packetHeader}>
          <h1 style={styles.name}>{packet.displayName}</h1>
          {packet.role && <p style={styles.role}>{packet.role}</p>}
          <p style={styles.headline}>
            Cited by <strong>{packet.distinctAuthorCount}</strong>{" "}
            {packet.distinctAuthorCount === 1 ? "expert" : "experts"} across{" "}
            <strong>{packet.mentionCount}</strong>{" "}
            {packet.mentionCount === 1 ? "win record" : "win records"}
          </p>
        </div>

        <div style={styles.entries}>
          {packet.entries.map((e) => (
            <div key={e.recordId} style={styles.entry}>
              <p style={styles.quote}>&ldquo;{e.quote}&rdquo;</p>
              <p style={styles.entryMeta}>
                — <strong>{e.authorName}</strong>, {new Date(e.date).toLocaleDateString()}
                {e.contextFunction ? ` · ${e.contextFunction}` : ""}
              </p>
              {e.frameworkName && (
                <p style={styles.frameworkTag}>
                  From &ldquo;{e.frameworkName}&rdquo;
                  {e.method ? ` · ${METHOD_LABEL[e.method] ?? e.method}` : ""}
                </p>
              )}
            </div>
          ))}
        </div>

        <p style={styles.footnote}>
          Compiled from {packet.mentionCount} win record{packet.mentionCount === 1 ? "" : "s"} on{" "}
          {new Date(packet.generatedAt).toLocaleDateString()}. Every entry above is a win — no
          failure-record mention of this person ever contributes to this packet.
        </p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { minHeight: "100vh", fontFamily: "var(--font-sans)" },
  container: { maxWidth: 720, margin: "0 auto", padding: "40px 24px 80px" },
  actions: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 },
  backLink: { fontSize: "14px", fontWeight: 600, color: "var(--accent)", textDecoration: "none" },
  actionButton: { fontSize: "13px", fontWeight: 600, color: "var(--ink)", background: "var(--white)", border: "1px solid var(--line)", borderRadius: 8, padding: "6px 14px", cursor: "pointer" },
  packetHeader: { background: "var(--white)", border: "1px solid var(--line)", borderRadius: 12, padding: "22px 24px", marginBottom: 20 },
  name: { fontSize: "24px", margin: 0, fontWeight: 700 },
  role: { fontSize: "14px", color: "var(--muted)", margin: "4px 0 12px" },
  headline: { fontSize: "14px", color: "var(--ink)", margin: 0 },
  entries: { display: "flex", flexDirection: "column", gap: 14 },
  entry: { background: "var(--white)", border: "1px solid var(--line)", borderRadius: 12, padding: "16px 18px" },
  quote: { fontSize: "15px", color: "var(--ink)", margin: "0 0 8px", lineHeight: 1.5, fontStyle: "italic" },
  entryMeta: { fontSize: "13px", color: "var(--muted)", margin: 0 },
  frameworkTag: { fontSize: "12px", color: "var(--accent)", margin: "6px 0 0" },
  footnote: { fontSize: "12px", color: "var(--muted)", marginTop: 24, lineHeight: 1.5 },
  errorText: { color: "var(--danger)", fontSize: "14px" },
  center: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-sans)" },
};
