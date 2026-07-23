"use client";
// P-1 Build 2 — shared org library: detail view for one framework.
// Author attribution shown up top; the full Pattern Record context is
// visible to whoever RLS let this request through for (own record, or a
// COMPLETE org-peer record) — /api/library/[id] returns a clean 404
// otherwise, which we render as "not found" rather than an error.
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

type EntityMapEntry = { type: string; name: string; detail: string | null };

type DetailRecord = {
  id: string;
  user_id: string;
  created_at: string;
  trigger_type: string | null;
  method: string | null;
  context_summary: string | null;
  context_org_size: string | null;
  context_industry: string | null;
  context_function: string | null;
  situation_type: string | null;
  intervention_type: string | null;
  trigger_signal: string | null;
  signal_detail: string | null;
  judgment: string | null;
  rationale: string | null;
  boundaries: string | null;
  entity_map: EntityMapEntry[];
  framework: {
    name: string;
    tagline: string;
    when_to_apply: string[];
    signals: string[];
    the_play: string;
    why_it_works: string;
    boundaries: string[];
  } | null;
  is_mine: boolean;
  author: { display_name: string | null; persona: string | null } | null;
  // P-2: open conflicts on this record. Surface-with-warning: the framework
  // below renders fully and stays usable — the banner only adds the warning
  // and the two links (other side + resolution thread).
  contested: {
    conflict_id: string;
    other_record_id: string;
    other_name: string | null;
    other_author: string | null;
  }[];
};

const METHOD_LABEL: Record<string, string> = {
  "5whys_fishbone": "5 Whys + Fishbone (Toyota)",
  aar_success_case: "AAR + Success Case (Army / Brinkerhoff)",
  premortem: "Pre-mortem (Klein)",
  a3: "A3 Gap Analysis (Lean)",
  cdm: "Critical Decision Method (Klein / NDM)",
};

const ENTITY_EMOJI: Record<string, string> = {
  equipment_asset: "\u{1F3ED}",
  process: "\u{2699}\u{FE0F}",
  error_class: "\u{274C}",
  role_person: "\u{1F464}",
  department: "\u{1F3E2}",
};

export default function LibraryDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [record, setRecord] = useState<DetailRecord | null>(null);
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
        const res = await fetch(`/api/library/${id}`);
        const data = await res.json();
        if (!res.ok) {
          setError(res.status === 404 ? "Not found — you may not have access to this record." : data.error);
        } else {
          setRecord(data.record);
        }
      } catch {
        setError("Could not load this record.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, router]);

  if (loading) {
    return (
      <div style={styles.center}>
        <p>Loading…</p>
      </div>
    );
  }

  if (error || !record) {
    return (
      <div style={styles.center}>
        <p style={styles.errorText}>{error || "Not found."}</p>
        <a href="/library" style={styles.backLink}>← Back to library</a>
      </div>
    );
  }

  const f = record.framework;

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        <a href="/library" style={styles.backLink}>← Back to library</a>

        <div style={styles.authorBar}>
          <span style={styles.authorName}>
            {record.author?.display_name || "Org member"}
          </span>
          {record.author?.persona && (
            <span style={styles.personaTag}>{record.author.persona.replace("_", " ")}</span>
          )}
          {record.is_mine && <span style={styles.mineBadge}>Yours</span>}
          <span style={styles.date}>{new Date(record.created_at).toLocaleDateString()}</span>
        </div>

        {record.contested && record.contested.length > 0 &&
          record.contested.map((c) => (
            <div key={c.conflict_id} style={styles.contestedBanner}>
              <div style={styles.contestedTitle}>
                ⚠️ Contested — another expert sees this differently
              </div>
              <div style={styles.contestedBody}>
                {c.other_author || "An org peer"}&apos;s framework
                {c.other_name ? ` “${c.other_name}”` : ""} claims the same territory with an
                opposing play. This framework stays fully usable while contested.
              </div>
              <div style={styles.contestedLinks}>
                <a href={`/library/${c.other_record_id}`} style={styles.contestedLink}>
                  See the other side →
                </a>
                <a href={`/conflicts/${c.conflict_id}`} style={styles.contestedLink}>
                  Open the resolution thread →
                </a>
              </div>
            </div>
          ))}

        {f ? (
          <>
            <h1 style={styles.title}>{f.name}</h1>
            <p style={styles.tagline}>{f.tagline}</p>

            <Section title="When to apply">
              <ul style={styles.list}>
                {f.when_to_apply.map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            </Section>

            <Section title="Signals">
              <ul style={styles.list}>
                {f.signals.map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            </Section>

            <Section title="The play">
              <p style={styles.paragraph}>{f.the_play}</p>
            </Section>

            <Section title="Why it works">
              <p style={styles.paragraph}>{f.why_it_works}</p>
            </Section>

            <Section title="Boundaries — when NOT to use this">
              <ul style={styles.list}>
                {f.boundaries.map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            </Section>
          </>
        ) : (
          <p style={styles.paragraph}>Framework artifact not yet generated for this record.</p>
        )}

        {record.entity_map && record.entity_map.length > 0 && (
          <Section title="Entities involved">
            <div style={styles.entityGrid}>
              {record.entity_map.map((e, i) => (
                <div key={i} style={styles.entityChip}>
                  <span>{ENTITY_EMOJI[e.type] ?? ""}</span>
                  <span style={styles.entityName}>{e.name}</span>
                  {e.detail && <span style={styles.entityDetail}>— {e.detail}</span>}
                </div>
              ))}
            </div>
          </Section>
        )}

        <Section title="Captured context">
          <div style={styles.metaGrid}>
            <Meta label="Method" value={record.method ? METHOD_LABEL[record.method] ?? record.method : "—"} />
            <Meta label="Org size" value={record.context_org_size ?? "—"} />
            <Meta label="Industry" value={record.context_industry ?? "—"} />
            <Meta label="Function" value={record.context_function ?? "—"} />
            <Meta label="Situation" value={record.situation_type ?? "—"} />
            <Meta label="Intervention" value={record.intervention_type ?? "—"} />
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={styles.section}>
      <h2 style={styles.sectionTitle}>{title}</h2>
      {children}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={styles.metaLabel}>{label}</div>
      <div style={styles.metaValue}>{value}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { minHeight: "100vh", background: "#fafafa", fontFamily: "system-ui, sans-serif" },
  container: { maxWidth: 720, margin: "0 auto", padding: "32px 24px 80px" },
  backLink: { fontSize: "13px", color: "#666", textDecoration: "none" },
  authorBar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    margin: "18px 0 8px",
    fontSize: "13px",
    color: "#666",
  },
  authorName: { fontWeight: 700, color: "#111" },
  personaTag: {
    background: "#f5f5f5",
    borderRadius: 999,
    padding: "2px 8px",
    fontSize: "11px",
    textTransform: "capitalize",
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
  date: { marginLeft: "auto" },
  contestedBanner: {
    background: "#fffbeb",
    border: "1px solid #fde68a",
    borderRadius: 12,
    padding: "14px 16px",
    margin: "12px 0 20px",
  },
  contestedTitle: {
    fontSize: "14px",
    fontWeight: 700,
    color: "#b45309",
    marginBottom: 6,
  },
  contestedBody: {
    fontSize: "13px",
    color: "#78350f",
    lineHeight: 1.5,
    marginBottom: 10,
  },
  contestedLinks: { display: "flex", gap: 18, flexWrap: "wrap" },
  contestedLink: {
    fontSize: "13px",
    fontWeight: 600,
    color: "#b45309",
    textDecoration: "none",
  },
  title: { fontSize: "30px", margin: "4px 0 4px" },
  tagline: { fontSize: "16px", color: "#555", margin: "0 0 28px" },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: "13px",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "#888",
    marginBottom: 8,
  },
  list: { margin: 0, paddingLeft: 20, lineHeight: 1.6, fontSize: "15px" },
  paragraph: { margin: 0, lineHeight: 1.6, fontSize: "15px" },
  entityGrid: { display: "flex", flexWrap: "wrap", gap: 8 },
  entityChip: {
    background: "#fff",
    border: "1px solid #e5e5e5",
    borderRadius: 8,
    padding: "6px 10px",
    fontSize: "13px",
    display: "flex",
    gap: 6,
    alignItems: "center",
  },
  entityName: { fontWeight: 600 },
  entityDetail: { color: "#777" },
  metaGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
    gap: 12,
  },
  metaLabel: { fontSize: "11px", color: "#888", textTransform: "uppercase" },
  metaValue: { fontSize: "14px", fontWeight: 600 },
  errorText: { color: "#ef4444" },
  center: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "system-ui, sans-serif",
  },
};
