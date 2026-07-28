"use client";
// P-4.5 — Win Column: ranked mention view.
// Experts author frameworks; everyone else named IN those frameworks gets
// seen without writing anything themselves. This page is read-only — there
// is no "nominate" action anywhere on it, on purpose.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import BrandHeader from "@/components/BrandHeader";

const supabase = createClient();

type Chip = { text: string; authorName: string; date: string };

type PersonCard = {
  personKey: string;
  displayName: string;
  role: string | null;
  mentionCount: number;
  distinctAuthorCount: number;
  authorNames: string[];
  departmentsTouched: string[];
  firstMentionDate: string;
  mostRecentMentionDate: string;
  crossDeptImpact: boolean;
  risingSignal: boolean;
  retentionWatch: boolean;
  chips: Chip[];
};

type Summary = {
  mostCited: { personKey: string; displayName: string; mentionCount: number } | null;
  risingSignal: { personKey: string; displayName: string } | null;
  retentionWatch: { personKey: string; displayName: string } | null;
};

export default function WinColumnPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [people, setPeople] = useState<PersonCard[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
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
        const res = await fetch("/api/win-column");
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Could not load the Win Column.");
        } else {
          setPeople(data.people || []);
          setSummary(data.summary || null);
        }
      } catch {
        setError("Could not load the Win Column.");
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
        <div style={{ marginBottom: 18 }}>
          <BrandHeader />
        </div>
        <div style={styles.headerRow}>
          <h1 style={styles.title}>🏆 Win Column</h1>
          <div style={styles.headerLinks}>
            <a href="/library" style={styles.newLink}>
              📚 Team Library
            </a>
            <a href="/prescriptions" style={styles.newLink}>
              💊 Prescriptions
            </a>
          </div>
        </div>
        <p style={styles.subtitle}>
          You can&apos;t nominate yourself — you get named. Everyone below was
          credited by someone else, in their own words, for a real win.
        </p>

        {error && <p style={styles.errorText}>{error}</p>}

        {!error && summary && (
          <div style={styles.tileRow}>
            <div style={styles.tile}>
              <div style={styles.tileLabel}>Most cited</div>
              <div style={styles.tileValue}>
                {summary.mostCited ? summary.mostCited.displayName : "—"}
              </div>
              {summary.mostCited && (
                <div style={styles.tileSub}>{summary.mostCited.mentionCount} mentions</div>
              )}
            </div>
            <div style={styles.tile}>
              <div style={styles.tileLabel}>📈 Rising signal</div>
              <div style={styles.tileValue}>
                {summary.risingSignal ? summary.risingSignal.displayName : "—"}
              </div>
              {summary.risingSignal && <div style={styles.tileSub}>Accelerating mentions</div>}
            </div>
            <div style={styles.tile}>
              <div style={styles.tileLabel}>🔎 Retention watch</div>
              <div style={styles.tileValue}>
                {summary.retentionWatch ? summary.retentionWatch.displayName : "—"}
              </div>
              {summary.retentionWatch && (
                <div style={styles.tileSub}>No recent recognition — worth a check-in</div>
              )}
            </div>
          </div>
        )}

        {!error && people.length === 0 && (
          <div style={styles.empty}>
            <p>Nobody&apos;s been named in a win record yet.</p>
          </div>
        )}

        <div style={styles.grid}>
          {people.map((p) => (
            <a key={p.personKey} href={`/win-column/${encodeURIComponent(p.personKey)}`} style={styles.card}>
              <div style={styles.cardTop}>
                <div>
                  <h2 style={styles.cardTitle}>{p.displayName}</h2>
                  {p.role && <p style={styles.cardRole}>{p.role}</p>}
                </div>
                <div style={styles.badgeStack}>
                  {p.risingSignal && <span style={styles.risingBadge}>📈 Rising</span>}
                  {p.retentionWatch && <span style={styles.retentionBadge}>🔎 Watch</span>}
                </div>
              </div>

              <div style={styles.corroborationRow}>
                <span style={styles.corroborationBadge}>
                  Cited by {p.distinctAuthorCount} {p.distinctAuthorCount === 1 ? "expert" : "experts"}
                </span>
                <span style={styles.mentionCount}>
                  {p.mentionCount} {p.mentionCount === 1 ? "mention" : "mentions"}
                </span>
                {p.crossDeptImpact && (
                  <span style={styles.crossDeptBadge} title="Named by experts from more than one department">
                    ↔ Cross-dept
                  </span>
                )}
              </div>

              <div style={styles.chips}>
                {p.chips.map((c, i) => (
                  <div key={i} style={styles.chip}>
                    <p style={styles.chipText}>&ldquo;{c.text}&rdquo;</p>
                    <p style={styles.chipMeta}>
                      — {c.authorName}, {new Date(c.date).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>

              <div style={styles.evidenceLink}>Open evidence packet →</div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { minHeight: "100vh", fontFamily: "var(--font-sans)" },
  container: { maxWidth: 960, margin: "0 auto", padding: "40px 24px 80px" },
  headerRow: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  title: { fontSize: "26px", margin: 0 },
  subtitle: { color: "var(--muted)", fontSize: "14px", margin: "6px 0 24px", maxWidth: 640, lineHeight: 1.5 },
  headerLinks: { display: "flex", alignItems: "center", gap: 16 },
  newLink: { fontSize: "14px", fontWeight: 600, color: "var(--growth)", textDecoration: "none" },
  tileRow: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 28 },
  tile: { background: "var(--white)", border: "1px solid var(--line)", borderRadius: 12, padding: "14px 16px" },
  tileLabel: { fontSize: "11px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.03em" },
  tileValue: { fontSize: "17px", fontWeight: 700, margin: "4px 0 2px" },
  tileSub: { fontSize: "12px", color: "var(--muted)" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 },
  card: { display: "block", background: "var(--white)", border: "1px solid var(--line)", borderRadius: 12, padding: "18px 18px 14px", textDecoration: "none", color: "inherit" },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
  cardTitle: { fontSize: "18px", margin: 0, fontWeight: 700 },
  cardRole: { fontSize: "13px", color: "var(--muted)", margin: "2px 0 0" },
  badgeStack: { display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" },
  risingBadge: { fontSize: "11px", fontWeight: 600, color: "var(--ok-text)", background: "var(--ok-bg)", border: "1px solid var(--ok-border)", borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap" },
  retentionBadge: { fontSize: "11px", fontWeight: 600, color: "var(--warn-strong)", background: "var(--warn-bg)", border: "1px solid var(--warn-border)", borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap" },
  corroborationRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 },
  corroborationBadge: { fontSize: "12px", fontWeight: 700, color: "var(--growth-deep)", background: "var(--growth-soft)", borderRadius: 999, padding: "3px 10px" },
  mentionCount: { fontSize: "12px", color: "var(--muted)" },
  crossDeptBadge: { fontSize: "11px", color: "var(--pine-soft)", background: "var(--growth-soft)", borderRadius: 999, padding: "2px 8px" },
  chips: { display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 },
  chip: { borderLeft: "3px solid var(--line)", padding: "6px 10px", background: "var(--paper-2)", borderRadius: "0 6px 6px 0" },
  chipText: { fontSize: "13px", color: "var(--pine-soft)", margin: 0, lineHeight: 1.4, fontStyle: "italic" },
  chipMeta: { fontSize: "11px", color: "var(--muted)", margin: "2px 0 0" },
  evidenceLink: { fontSize: "12px", fontWeight: 600, color: "var(--growth)", borderTop: "1px solid var(--line)", paddingTop: 10 },
  empty: { textAlign: "center", padding: "60px 0", color: "var(--muted)" },
  errorText: { color: "var(--danger)", fontSize: "14px" },
  center: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-sans)" },
};
