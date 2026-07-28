"use client";
// P-1 Build 2 — shared org library: list view.
// Every member of an org sees the whole org's approved (complete) framework
// library here, with author attribution on every card. A solo user with no
// org yet sees exactly their own completed frameworks — same as before P-1 —
// because /api/library's RLS-backed query already scopes it that way.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import BrandHeader from "@/components/BrandHeader";

const supabase = createClient();

type EntityMapEntry = { type: string; name: string; detail: string | null };

type LibraryRecord = {
  id: string;
  user_id: string;
  org_id: string | null;
  created_at: string;
  trigger_type: string | null;
  method: string | null;
  context_industry: string | null;
  context_function: string | null;
  situation_type: string | null;
  entity_map: EntityMapEntry[];
  framework: {
    name: string;
    tagline: string;
  } | null;
  is_mine: boolean;
  author: { display_name: string | null; persona: string | null } | null;
  // P-2: open conflicts annotating this record (surface-with-warning — the
  // record renders normally either way, it just wears the badge).
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

export default function LibraryPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [records, setRecords] = useState<LibraryRecord[]>([]);
  const router = useRouter();

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
        const res = await fetch("/api/library");
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Could not load the library.");
        } else {
          setRecords(data.records || []);
        }
      } catch {
        setError("Could not load the library.");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  if (loading) {
    return (
      <div style={styles.center}>
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        <div style={{ marginBottom: 18 }}><BrandHeader /></div>
        <div style={styles.headerRow}>
          <h1 style={styles.title}>📚 Team Library</h1>
          <div style={styles.headerLinks}>
            <a href="/retrieve" style={styles.newLink}>
              🔍 Ask the brain
            </a>
            <a href="/conflicts" style={styles.conflictsLink}>
              ⚠️ Conflict X-ray
            </a>
            <a href="/prescriptions" style={styles.newLink}>
              💊 Prescriptions
            </a>
            <a href="/win-column" style={styles.newLink}>
              🏆 Win Column
            </a>
            <a href="/codify" style={styles.newLink}>
              + Codify a pattern
            </a>
          </div>
        </div>
        <p style={styles.subtitle}>
          Every completed framework your org has captured, with attribution.
        </p>

        {error && <p style={styles.errorText}>{error}</p>}

        {!error && records.length === 0 && (
          <div style={styles.empty}>
            <p>No frameworks yet.</p>
            <a href="/codify" style={styles.newLink}>
              Codify your first pattern →
            </a>
          </div>
        )}

        <div style={styles.grid}>
          {records.map((r) => (
            <a key={r.id} href={`/library/${r.id}`} style={styles.card}>
              <div style={styles.cardTop}>
                <span style={styles.emoji}>
                  {r.trigger_type ? TRIGGER_EMOJI[r.trigger_type] ?? "" : ""}
                </span>
                <span style={styles.badgeRow}>
                  {r.contested && r.contested.length > 0 && (
                    <span style={styles.contestedBadge} title="Another expert sees this differently — open the framework for both sides.">
                      ⚠️ Contested
                    </span>
                  )}
                  {r.is_mine && <span style={styles.mineBadge}>Yours</span>}
                </span>
              </div>
              <h2 style={styles.cardTitle}>
                {r.framework?.name ?? "(framework pending)"}
              </h2>
              <p style={styles.cardTagline}>{r.framework?.tagline ?? ""}</p>
              <div style={styles.metaRow}>
                <span style={styles.methodTag}>
                  {r.method ? METHOD_LABEL[r.method] ?? r.method : ""}
                </span>
                {r.context_function && (
                  <span style={styles.metaTag}>{r.context_function}</span>
                )}
              </div>
              <div style={styles.authorRow}>
                <span style={styles.authorName}>
                  {r.author?.display_name || "Org member"}
                </span>
                {r.author?.persona && (
                  <span style={styles.personaTag}>
                    {PERSONA_LABEL[r.author.persona] ?? r.author.persona}
                  </span>
                )}
                <span style={styles.date}>
                  {new Date(r.created_at).toLocaleDateString()}
                </span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    minHeight: "100vh",
    fontFamily: "var(--font-sans)",
  },
  container: {
    maxWidth: 920,
    margin: "0 auto",
    padding: "40px 24px 80px",
  },
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  title: { fontSize: "26px", margin: 0 },
  subtitle: { color: "var(--muted)", fontSize: "14px", margin: "6px 0 28px" },
  headerLinks: { display: "flex", alignItems: "center", gap: 16 },
  conflictsLink: {
    fontSize: "14px",
    fontWeight: 600,
    color: "var(--warn-strong)",
    textDecoration: "none",
  },
  newLink: {
    fontSize: "14px",
    fontWeight: 600,
    color: "var(--growth)",
    textDecoration: "none",
  },
  badgeRow: { display: "flex", alignItems: "center", gap: 6 },
  contestedBadge: {
    fontSize: "11px",
    fontWeight: 600,
    color: "var(--warn-strong)",
    background: "var(--warn-bg)",
    border: "1px solid var(--warn-border)",
    borderRadius: 999,
    padding: "2px 8px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: 16,
  },
  card: {
    display: "block",
    background: "var(--white)",
    border: "1px solid var(--line)",
    borderRadius: 12,
    padding: "18px 18px 14px",
    textDecoration: "none",
    color: "inherit",
  },
  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  emoji: { fontSize: "20px" },
  mineBadge: {
    fontSize: "11px",
    fontWeight: 600,
    color: "var(--growth-deep)",
    background: "var(--growth-soft)",
    border: "1px solid var(--new-leaf-light)",
    borderRadius: 999,
    padding: "2px 8px",
  },
  cardTitle: { fontSize: "17px", margin: "0 0 6px", fontWeight: 700 },
  cardTagline: {
    fontSize: "13px",
    color: "var(--pine-soft)",
    margin: "0 0 12px",
    lineHeight: 1.4,
  },
  metaRow: { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 },
  methodTag: {
    fontSize: "11px",
    background: "var(--growth-soft)",
    color: "var(--growth-deep)",
    borderRadius: 999,
    padding: "2px 8px",
    fontWeight: 600,
  },
  metaTag: {
    fontSize: "11px",
    background: "var(--paper-2)",
    color: "var(--pine-soft)",
    borderRadius: 999,
    padding: "2px 8px",
  },
  authorRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    borderTop: "1px solid var(--line)",
    paddingTop: 10,
    fontSize: "12px",
    color: "var(--muted)",
  },
  authorName: { fontWeight: 600, color: "var(--pine)" },
  personaTag: {
    background: "var(--paper-2)",
    borderRadius: 999,
    padding: "1px 7px",
    fontSize: "11px",
  },
  date: { marginLeft: "auto" },
  empty: {
    textAlign: "center",
    padding: "60px 0",
    color: "var(--muted)",
  },
  errorText: { color: "var(--danger)", fontSize: "14px" },
  center: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "var(--font-sans)",
  },
};
