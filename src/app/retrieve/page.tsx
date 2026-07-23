"use client";
// P-3 (Build 3) — Contextual retrieval UI. An employee types a situation in
// plain language and the right org framework(s) surface, with attribution and
// (surface-with-warning) any ⚠️ Contested badge intact. When nothing clears the
// similarity threshold the page says so honestly instead of forcing a match.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

type Framework = {
  name: string;
  tagline: string;
  signals: string[];
  the_play: string;
  boundaries: string[];
};

type Result = {
  id: string;
  similarity: number;
  trigger_type: string | null;
  method: string | null;
  context_function: string | null;
  situation_type: string | null;
  framework: Framework | null;
  is_mine: boolean;
  author: { display_name: string | null; persona: string | null } | null;
  contested: { conflict_id: string; other_record_id: string }[];
};

const TRIGGER_EMOJI: Record<string, string> = {
  broke: "\u{1F4A5}",
  win: "\u{1F3C6}",
  concern: "\u{26A0}\u{FE0F}",
  friction: "\u{1F501}",
  judgment: "\u{1F9E0}",
};

const METHOD_LABEL: Record<string, string> = {
  "5whys_fishbone": "5 Whys + Fishbone",
  aar_success_case: "AAR + Success Case",
  premortem: "Pre-mortem",
  a3: "A3 Gap Analysis",
  cdm: "Critical Decision Method",
};

const PERSONA_LABEL: Record<string, string> = {
  exec: "Executive",
  technical_director: "Technical Director",
  sr_manager: "Sr. Manager",
};

function matchLabel(similarity: number): string {
  // Everything shown already clears the 0.75 retrieval floor; these grade
  // within the band voyage-large-2 actually produces for on-topic matches.
  if (similarity >= 0.82) return "Strong match";
  if (similarity >= 0.78) return "Good match";
  return "Possible match";
}

export default function RetrievePage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [situation, setSituation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);
  const [noMatch, setNoMatch] = useState<string | null>(null);
  const [askedFor, setAskedFor] = useState("");

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      setChecking(false);
    })();
  }, [router]);

  async function search() {
    if (loading || !situation.trim()) return;
    setLoading(true);
    setError(null);
    setResults(null);
    setNoMatch(null);
    setAskedFor(situation.trim());
    try {
      const res = await fetch("/api/retrieve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ situation: situation.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Search failed. Try again.");
      } else if (data.noMatch) {
        setNoMatch(data.message || "Nothing codified on this yet.");
      } else {
        setResults(data.results || []);
      }
    } catch {
      setError("Search failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter submits; Shift+Enter for a newline.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      search();
    }
  }

  if (checking) {
    return (
      <div style={styles.center}>
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        <div style={styles.headerRow}>
          <h1 style={styles.title}>🔍 Ask your team&apos;s brain</h1>
          <div style={styles.headerLinks}>
            <a href="/library" style={styles.headerLink}>
              📚 Library
            </a>
            <a href="/codify" style={styles.newLink}>
              + Codify a pattern
            </a>
          </div>
        </div>
        <p style={styles.subtitle}>
          Describe a situation you&apos;re facing. If someone on your team has codified
          judgment for it, the framework surfaces here — in their words, with their name on it.
        </p>

        <div style={styles.searchBox}>
          <textarea
            style={styles.textarea}
            rows={3}
            placeholder="e.g. We had a quality escape right after a die changeover on the press line — should we release the next run before first-piece inspection clears?"
            value={situation}
            onChange={(e) => setSituation(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={loading}
          />
          <button style={styles.searchButton} onClick={search} disabled={loading || !situation.trim()}>
            {loading ? "Searching…" : "Find frameworks"}
          </button>
        </div>

        {error && <p style={styles.errorText}>{error}</p>}

        {noMatch && (
          <div style={styles.empty}>
            <div style={styles.emptyEmoji}>🕸️</div>
            <p style={styles.emptyTitle}>{noMatch}</p>
            <a href="/codify" style={styles.newLink}>
              Codify a framework for this →
            </a>
          </div>
        )}

        {results && results.length > 0 && (
          <>
            <p style={styles.resultsHeading}>
              {results.length} framework{results.length === 1 ? "" : "s"} for “{askedFor}”
            </p>
            <div style={styles.list}>
              {results.map((r) => {
                const f = r.framework;
                return (
                  <a key={r.id} href={`/library/${r.id}`} style={styles.card}>
                    <div style={styles.cardTop}>
                      <span style={styles.emoji}>
                        {r.trigger_type ? TRIGGER_EMOJI[r.trigger_type] ?? "" : ""}
                      </span>
                      <span style={styles.badgeRow}>
                        {r.contested && r.contested.length > 0 && (
                          <span
                            style={styles.contestedBadge}
                            title="Another expert sees this differently — open the framework for both sides."
                          >
                            ⚠️ Contested
                          </span>
                        )}
                        {r.is_mine && <span style={styles.mineBadge}>Yours</span>}
                        <span style={styles.matchBadge}>
                          {matchLabel(r.similarity)} · {Math.round(r.similarity * 100)}%
                        </span>
                      </span>
                    </div>

                    <h2 style={styles.cardTitle}>{f?.name ?? "(framework pending)"}</h2>
                    <p style={styles.cardTagline}>{f?.tagline ?? ""}</p>

                    {f && f.signals && f.signals.length > 0 && (
                      <div style={styles.field}>
                        <div style={styles.fieldLabel}>Signals</div>
                        <ul style={styles.list2}>
                          {f.signals.slice(0, 3).map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {f && f.the_play && (
                      <div style={styles.field}>
                        <div style={styles.fieldLabel}>The play</div>
                        <p style={styles.fieldBody}>{f.the_play}</p>
                      </div>
                    )}

                    {f && f.boundaries && f.boundaries.length > 0 && (
                      <div style={styles.field}>
                        <div style={styles.fieldLabel}>Boundaries — when NOT to use this</div>
                        <ul style={styles.list2}>
                          {f.boundaries.slice(0, 3).map((b, i) => (
                            <li key={i}>{b}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div style={styles.metaRow}>
                      <span style={styles.methodTag}>
                        {r.method ? METHOD_LABEL[r.method] ?? r.method : ""}
                      </span>
                      {r.context_function && <span style={styles.metaTag}>{r.context_function}</span>}
                    </div>

                    <div style={styles.authorRow}>
                      <span style={styles.authorName}>{r.author?.display_name || "Org member"}</span>
                      {r.author?.persona && (
                        <span style={styles.personaTag}>
                          {PERSONA_LABEL[r.author.persona] ?? r.author.persona}
                        </span>
                      )}
                      <span style={styles.openLink}>Open framework →</span>
                    </div>
                  </a>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { minHeight: "100vh", background: "#fafafa", fontFamily: "system-ui, sans-serif" },
  container: { maxWidth: 760, margin: "0 auto", padding: "40px 24px 80px" },
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
    flexWrap: "wrap",
    gap: 10,
  },
  title: { fontSize: "26px", margin: 0 },
  headerLinks: { display: "flex", alignItems: "center", gap: 16 },
  headerLink: { fontSize: "14px", fontWeight: 600, color: "#333", textDecoration: "none" },
  newLink: { fontSize: "14px", fontWeight: 600, color: "#4338ca", textDecoration: "none" },
  subtitle: { color: "#666", fontSize: "14px", margin: "6px 0 22px", lineHeight: 1.5 },
  searchBox: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    background: "#fff",
    border: "1px solid #e5e5e5",
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
  },
  textarea: {
    fontSize: "15px",
    fontFamily: "inherit",
    border: "1px solid #ddd",
    borderRadius: 10,
    padding: "12px 14px",
    resize: "vertical",
    boxSizing: "border-box",
    width: "100%",
    lineHeight: 1.5,
  },
  searchButton: {
    alignSelf: "flex-end",
    padding: "10px 22px",
    fontSize: "15px",
    fontWeight: 600,
    color: "#fff",
    background: "#111",
    border: "none",
    borderRadius: 10,
    cursor: "pointer",
  },
  errorText: { color: "#ef4444", fontSize: "14px" },
  empty: {
    textAlign: "center",
    padding: "48px 24px",
    background: "#fff",
    border: "1px dashed #d4d4d4",
    borderRadius: 14,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    alignItems: "center",
  },
  emptyEmoji: { fontSize: "34px" },
  emptyTitle: { fontSize: "15px", color: "#444", margin: 0, lineHeight: 1.5, maxWidth: 460 },
  resultsHeading: { fontSize: "14px", color: "#666", margin: "0 0 14px", fontWeight: 600 },
  list: { display: "flex", flexDirection: "column", gap: 16 },
  card: {
    display: "block",
    background: "#fff",
    border: "1px solid #e5e5e5",
    borderRadius: 14,
    padding: "18px 20px 14px",
    textDecoration: "none",
    color: "inherit",
  },
  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
    gap: 8,
  },
  emoji: { fontSize: "20px" },
  badgeRow: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" },
  contestedBadge: {
    fontSize: "11px",
    fontWeight: 600,
    color: "#b45309",
    background: "#fffbeb",
    border: "1px solid #fde68a",
    borderRadius: 999,
    padding: "2px 8px",
  },
  mineBadge: {
    fontSize: "11px",
    fontWeight: 600,
    color: "#166534",
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
    borderRadius: 999,
    padding: "2px 8px",
  },
  matchBadge: {
    fontSize: "11px",
    fontWeight: 600,
    color: "#3730a3",
    background: "#eef2ff",
    border: "1px solid #c7d2fe",
    borderRadius: 999,
    padding: "2px 8px",
  },
  cardTitle: { fontSize: "18px", margin: "0 0 4px", fontWeight: 700 },
  cardTagline: { fontSize: "13px", color: "#555", margin: "0 0 12px", lineHeight: 1.4 },
  field: { marginBottom: 10 },
  fieldLabel: {
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "#999",
    marginBottom: 3,
  },
  fieldBody: { margin: 0, fontSize: "14px", lineHeight: 1.5, color: "#222" },
  list2: { margin: 0, paddingLeft: 18, fontSize: "14px", lineHeight: 1.5, color: "#222" },
  metaRow: { display: "flex", gap: 6, flexWrap: "wrap", margin: "12px 0 10px" },
  methodTag: {
    fontSize: "11px",
    background: "#eef2ff",
    color: "#4338ca",
    borderRadius: 999,
    padding: "2px 8px",
    fontWeight: 600,
  },
  metaTag: {
    fontSize: "11px",
    background: "#f5f5f5",
    color: "#555",
    borderRadius: 999,
    padding: "2px 8px",
  },
  authorRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    borderTop: "1px solid #f0f0f0",
    paddingTop: 10,
    fontSize: "12px",
    color: "#888",
  },
  authorName: { fontWeight: 600, color: "#333" },
  personaTag: { background: "#f5f5f5", borderRadius: 999, padding: "1px 7px", fontSize: "11px" },
  openLink: { marginLeft: "auto", color: "#4338ca", fontWeight: 600 },
  center: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "system-ui, sans-serif",
  },
};
