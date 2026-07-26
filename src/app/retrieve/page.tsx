"use client";
// P-3 (Build 3) — Contextual retrieval UI. An employee types a situation in
// plain language and the right org framework(s) surface, with attribution and
// (surface-with-warning) any ⚠️ Contested badge intact. When nothing clears the
// similarity threshold the page says so honestly instead of forcing a match.
//
// ─────────────────────────────────────────────────────────────────────────────
// P-7 HARDENING (2026-07-25) — "renders nothing on a successful response."
//
// The route was hardened first (src/app/api/retrieve/route.ts) so it can never
// emit the contradictory { noMatch:false, results:[] }. This file closes the
// other half: the CLIENT could still paint blank on a perfectly good 200.
//
// THE THREE WAYS THIS PAGE COULD GO BLANK, all now closed:
//
//   1. NO ERROR BOUNDARY. Any throw inside the results map unmounted the whole
//      React tree — in production that is a silent blank page with the form
//      back at its initial state, indistinguishable from "nothing happened."
//      The live throw paths were real: `f.signals.slice(0,3).map(...)` and
//      `f.boundaries.slice(0,3).map(...)` assume arrays. `framework` is a
//      MODEL-AUTHORED artifact with no schema enforcement at the DB layer, so
//      a `signals` that came back as a string passes the `.length > 0` check,
//      survives `.slice`, and then throws on `.map`. One malformed record in a
//      result set took down the entire page. Now: <ResultBoundary> isolates
//      each card, so a bad artifact degrades to one visible "couldn't render"
//      card and every other result still shows.
//
//   2. NO ARRAY COERCION. Every list field is now run through asArray() before
//      it is mapped, so a string/object/null in signals or boundaries renders
//      as nothing-in-that-section instead of throwing.
//
//   3. NO UNREACHABLE-STATE HANDLING. The old page rendered results only on
//      `results.length > 0` and the empty state only on `noMatch === true`.
//      Any response satisfying neither branch — an unexpected shape, a
//      `results` key that is not an array, a 200 with a body the page did not
//      anticipate — fell into a dead zone that rendered NOTHING and reported
//      NOTHING. Now the page runs an explicit state machine with exactly one
//      source of truth (`view`), and its default branch is a visible
//      diagnostic panel, never blank.
//
// ALSO: every fetch logs a `[retrieve-page]` breadcrumb with the parsed
// response, so the next time this misbehaves the browser console already has
// the evidence — no need to re-instrument to reproduce.
//
// NOTE ON SHAPE (verified, do not "fix" this): the API returns
// { noMatch, query, results } — the key is `results`, NOT `frameworks`. This
// page reads `data.results`. `contested` is an ARRAY of
// {conflict_id, other_record_id}, never a boolean — the badge tests
// array-non-empty, never truthiness.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import BrandHeader, { Daisy } from "@/components/BrandHeader";

const supabase = createClient();

type Framework = {
  name?: string | null;
  tagline?: string | null;
  signals?: unknown;
  the_play?: string | null;
  boundaries?: unknown;
};

type Contested = { conflict_id: string; other_record_id: string };

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
  contested: Contested[];
};

// The page is in exactly one of these at any moment. `view` is the SINGLE
// source of truth for what paints — there is no combination of state that
// renders nothing.
type View =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "results"; results: Result[]; askedFor: string }
  | { kind: "noMatch"; message: string }
  | { kind: "error"; message: string; code?: string }
  | { kind: "unexpected"; detail: string };

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

// P-5 punch list item 7 — a single hardcoded placeholder made every demo
// search look pre-loaded/scripted. Rotate through a small pool so the
// textarea reads differently each time the page loads.
const SITUATION_PLACEHOLDERS = [
  "e.g. We had a quality escape right after a die changeover on the press line — should we release the next run before first-piece inspection clears?",
  "e.g. The second-shift crew keeps missing the same setup step on CNC Line 2 — is this a training gap or an equipment issue?",
  "e.g. Maintenance and Quality disagree on when a fixture needs recalibration — who's right, and what's the actual trigger?",
  "e.g. A new hire on the receiving dock flagged a part as out-of-spec that later shipped fine — was that the right call?",
  "e.g. Scrap is climbing on the same line where we had a thermal drift issue months ago — is this the same root cause coming back?",
];

function matchLabel(similarity: number): string {
  // Everything shown already clears the 0.75 retrieval floor; these grade
  // within the band voyage-large-2 actually produces for on-topic matches.
  if (similarity >= 0.82) return "Strong match";
  if (similarity >= 0.78) return "Good match";
  return "Possible match";
}

// Coerce anything into a safe array of strings. `framework` is model-authored
// and not schema-enforced, so a list field can legitimately arrive as a string,
// null, or an object. None of those may throw.
function asArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string" && x.trim().length > 0);
  if (typeof v === "string" && v.trim().length > 0) return [v];
  return [];
}

function asText(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asNumber(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function log(msg: string, extra?: unknown) {
  // eslint-disable-next-line no-console
  console.log(`[retrieve-page] ${msg}`, extra ?? "");
}

// ── Per-card error boundary ──────────────────────────────────────────────────
// One malformed framework artifact must degrade to ONE broken card, never to a
// blank page. React only offers this as a class component.
class ResultBoundary extends React.Component<
  { children: React.ReactNode; recordId: string },
  { failed: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode; recordId: string }) {
    super(props);
    this.state = { failed: false, message: "" };
  }
  static getDerivedStateFromError(err: unknown) {
    return { failed: true, message: err instanceof Error ? err.message : String(err) };
  }
  componentDidCatch(err: unknown) {
    // eslint-disable-next-line no-console
    console.error(`[retrieve-page] card ${this.props.recordId} failed to render:`, err);
  }
  render() {
    if (this.state.failed) {
      return (
        <div style={styles.brokenCard}>
          <div style={styles.brokenTitle}>⚠️ This framework couldn&apos;t be displayed</div>
          <p style={styles.brokenBody}>
            The record came back from the search but its content is malformed, so it was skipped
            rather than blanking the page. Other results below are unaffected.
          </p>
          <a href={`/library/${this.props.recordId}`} style={styles.newLink}>
            Open it in the library →
          </a>
          <div style={styles.brokenDetail}>{this.state.message}</div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function RetrievePage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [situation, setSituation] = useState("");
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<View>({ kind: "idle" });
  const [placeholder] = useState(
    () => SITUATION_PLACEHOLDERS[Math.floor(Math.random() * SITUATION_PLACEHOLDERS.length)]
  );

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        // NOTE: this redirect is the other thing that looks like "the page
        // rendered nothing and reset" — an expired session bounces to /login.
        log("no session — redirecting to /login");
        router.replace("/login");
        return;
      }
      setChecking(false);
    })();
  }, [router]);

  async function search() {
    // Breadcrumbs on the SUBMIT path itself — a "dead button" report is only
    // diagnosable if the console shows exactly how far the click got.
    log("search() entered", { loading, situationLength: situation.length });
    if (loading || !situation.trim()) {
      log("search() bailed on guard", { loading, situationEmpty: !situation.trim() });
      return;
    }
    const askedFor = situation.trim();
    setLoading(true);
    setView({ kind: "loading" });

    try {
      log("POSTing /api/retrieve");
      const res = await fetch("/api/retrieve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ situation: askedFor }),
      });

      let data: Record<string, unknown> | null = null;
      let rawBody = "";
      try {
        rawBody = await res.text();
        data = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : null;
      } catch (parseErr) {
        log("response was not valid JSON", { status: res.status, rawBody: rawBody.slice(0, 400) });
        setView({
          kind: "unexpected",
          detail: `HTTP ${res.status} — the server did not return JSON. First 200 chars: ${rawBody.slice(
            0,
            200
          )}`,
        });
        return;
      }

      log(`HTTP ${res.status}`, data);

      if (!res.ok) {
        setView({
          kind: "error",
          message: asText(data?.error) || "Search failed. Try again.",
          code: asText(data?.code) || undefined,
        });
        return;
      }
      if (!data || typeof data !== "object") {
        setView({ kind: "unexpected", detail: `HTTP ${res.status} with an empty body.` });
        return;
      }

      // The route derives noMatch from the array it returns, so these agree by
      // construction — but the client re-derives from the ARRAY rather than
      // trusting the flag, so a stale/odd payload still cannot blank the page.
      const rawResults = (data as { results?: unknown }).results;

      if (data.noMatch === true) {
        setView({
          kind: "noMatch",
          message: asText(data.message) || "Nothing codified on this yet.",
        });
        return;
      }

      if (!Array.isArray(rawResults)) {
        // THE OLD DEAD ZONE. A 200 whose `results` is missing or not an array
        // used to render absolutely nothing. Now it says so, out loud.
        setView({
          kind: "unexpected",
          detail:
            `HTTP ${res.status} with noMatch=${String(data.noMatch)} but no usable "results" array. ` +
            `Keys received: ${Object.keys(data).join(", ") || "(none)"}. ` +
            `The API contract is { noMatch, query, results }.`,
        });
        return;
      }

      const results = (rawResults as Result[]).filter((r) => r && typeof r === "object");
      if (results.length === 0) {
        // Belt and braces: an empty array with noMatch not true is the exact
        // contradiction the route now prevents. If it ever reappears, it is
        // reported rather than painted blank.
        setView({
          kind: "unexpected",
          detail:
            `HTTP ${res.status} returned an EMPTY results array with noMatch=${String(
              data.noMatch
            )}. That combination is a server-side fault, not an empty library.`,
        });
        return;
      }

      setView({ kind: "results", results, askedFor });
    } catch {
      setView({ kind: "error", message: "Search failed. Try again." });
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
        <div style={{ marginBottom: 18 }}>
          <BrandHeader />
        </div>
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
            placeholder={placeholder}
            value={situation}
            onChange={(e) => setSituation(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={loading}
          />
          <button
            type="button"
            style={styles.searchButton}
            onClick={search}
            disabled={loading || !situation.trim()}
          >
            {loading ? "Searching…" : "Find frameworks"}
          </button>
        </div>

        {view.kind === "loading" && <p style={styles.loadingText}>Searching your team&apos;s brain…</p>}

        {view.kind === "error" && (
          <p style={styles.errorText}>
            {view.message}
            {view.code ? ` (${view.code})` : ""}
          </p>
        )}

        {view.kind === "unexpected" && (
          <div style={styles.unexpected}>
            <div style={styles.unexpectedTitle}>⚠️ The search came back in a shape this page didn&apos;t expect</div>
            <p style={styles.unexpectedBody}>
              Rather than showing you a blank screen, here is exactly what happened. The full
              response is in the browser console under <code>[retrieve-page]</code>.
            </p>
            <div style={styles.unexpectedDetail}>{view.detail}</div>
          </div>
        )}

        {view.kind === "noMatch" && (
          <div style={styles.empty}>
            <div style={styles.emptyEmoji}>
              <Daisy size={40} />
            </div>
            <p style={styles.emptyTitle}>{view.message}</p>
            <a href="/codify" style={styles.newLink}>
              Codify a framework for this →
            </a>
          </div>
        )}

        {view.kind === "results" && (
          <>
            <p style={styles.resultsHeading}>
              {view.results.length} framework{view.results.length === 1 ? "" : "s"} for “
              {view.askedFor}”
            </p>
            <div style={styles.list}>
              {view.results.map((r, idx) => {
                const f: Framework = r.framework && typeof r.framework === "object" ? r.framework : {};
                const signals = asArray(f.signals);
                const boundaries = asArray(f.boundaries);
                const thePlay = asText(f.the_play);
                // `contested` is an ARRAY of {conflict_id, other_record_id} —
                // test array-non-empty, never truthiness of an object.
                const contested = Array.isArray(r.contested) ? r.contested : [];
                const similarity = asNumber(r.similarity);
                const key = typeof r.id === "string" && r.id ? r.id : `row-${idx}`;

                return (
                  <ResultBoundary key={key} recordId={typeof r.id === "string" ? r.id : ""}>
                    <a href={`/library/${r.id}`} style={styles.card}>
                      <div style={styles.cardTop}>
                        <span style={styles.emoji}>
                          {r.trigger_type ? TRIGGER_EMOJI[r.trigger_type] ?? "" : ""}
                        </span>
                        <span style={styles.badgeRow}>
                          {contested.length > 0 && (
                            <span
                              style={styles.contestedBadge}
                              title="Another expert sees this differently — open the framework for both sides."
                            >
                              ⚠️ Contested
                            </span>
                          )}
                          {r.is_mine && <span style={styles.mineBadge}>Yours</span>}
                          <span style={styles.matchBadge}>
                            {matchLabel(similarity)} · {Math.round(similarity * 100)}%
                          </span>
                        </span>
                      </div>

                      <h2 style={styles.cardTitle}>{asText(f.name) || "(framework pending)"}</h2>
                      <p style={styles.cardTagline}>{asText(f.tagline)}</p>

                      {signals.length > 0 && (
                        <div style={styles.field}>
                          <div style={styles.fieldLabel}>Signals</div>
                          <ul style={styles.list2}>
                            {signals.slice(0, 3).map((s, i) => (
                              <li key={i}>{s}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {thePlay && (
                        <div style={styles.field}>
                          <div style={styles.fieldLabel}>The play</div>
                          <p style={styles.fieldBody}>{thePlay}</p>
                        </div>
                      )}

                      {boundaries.length > 0 && (
                        <div style={styles.field}>
                          <div style={styles.fieldLabel}>Boundaries — when NOT to use this</div>
                          <ul style={styles.list2}>
                            {boundaries.slice(0, 3).map((b, i) => (
                              <li key={i}>{b}</li>
                            ))}
                          </ul>
                        </div>
                      )}

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
                        <span style={styles.openLink}>Open framework →</span>
                      </div>
                    </a>
                  </ResultBoundary>
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
  wrapper: { minHeight: "100vh", fontFamily: "var(--font-sans)" },
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
  headerLink: { fontSize: "14px", fontWeight: 600, color: "var(--ink)", textDecoration: "none" },
  newLink: { fontSize: "14px", fontWeight: 600, color: "var(--accent)", textDecoration: "none" },
  subtitle: { color: "var(--muted)", fontSize: "14px", margin: "6px 0 22px", lineHeight: 1.5 },
  searchBox: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    background: "var(--white)",
    border: "1px solid var(--line)",
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
  },
  textarea: {
    fontSize: "15px",
    fontFamily: "inherit",
    border: "1px solid var(--line)",
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
    color: "var(--white)",
    background: "var(--accent)",
    border: "none",
    borderRadius: 10,
    cursor: "pointer",
  },
  loadingText: { color: "var(--muted)", fontSize: "14px" },
  errorText: { color: "var(--danger)", fontSize: "14px" },
  unexpected: {
    background: "var(--warn-bg)",
    border: "1px solid var(--warn-border)",
    borderRadius: 14,
    padding: "16px 18px",
    marginBottom: 16,
  },
  unexpectedTitle: { fontSize: "15px", fontWeight: 700, color: "var(--warn-text)", marginBottom: 6 },
  unexpectedBody: { fontSize: "13px", color: "var(--warn-text)", margin: "0 0 10px", lineHeight: 1.5 },
  unexpectedDetail: {
    fontSize: "12px",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    color: "var(--warn-text)",
    background: "var(--warn-chip-bg)",
    border: "1px solid var(--warn-border)",
    borderRadius: 8,
    padding: "10px 12px",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  brokenCard: {
    background: "var(--white)",
    border: "1px dashed var(--danger-border)",
    borderRadius: 14,
    padding: "18px 20px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  brokenTitle: { fontSize: "15px", fontWeight: 700, color: "var(--danger)" },
  brokenBody: { fontSize: "13px", color: "var(--ink-soft)", margin: 0, lineHeight: 1.5 },
  brokenDetail: {
    fontSize: "11px",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    color: "var(--danger)",
    wordBreak: "break-word",
  },
  empty: {
    textAlign: "center",
    padding: "48px 24px",
    background: "var(--white)",
    border: "1px dashed var(--line)",
    borderRadius: 14,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    alignItems: "center",
  },
  emptyEmoji: { fontSize: "34px" },
  emptyTitle: { fontSize: "15px", color: "var(--ink-soft)", margin: 0, lineHeight: 1.5, maxWidth: 460 },
  resultsHeading: { fontSize: "14px", color: "var(--muted)", margin: "0 0 14px", fontWeight: 600 },
  list: { display: "flex", flexDirection: "column", gap: 16 },
  card: {
    display: "block",
    background: "var(--white)",
    border: "1px solid var(--line)",
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
    color: "var(--warn-strong)",
    background: "var(--warn-bg)",
    border: "1px solid var(--warn-border)",
    borderRadius: 999,
    padding: "2px 8px",
  },
  mineBadge: {
    fontSize: "11px",
    fontWeight: 600,
    color: "var(--ok-text)",
    background: "var(--ok-bg)",
    border: "1px solid var(--ok-border)",
    borderRadius: 999,
    padding: "2px 8px",
  },
  matchBadge: {
    fontSize: "11px",
    fontWeight: 600,
    color: "var(--accent-deep)",
    background: "var(--accent-soft)",
    border: "1px solid var(--leaf-light)",
    borderRadius: 999,
    padding: "2px 8px",
  },
  cardTitle: { fontSize: "18px", margin: "0 0 4px", fontWeight: 700 },
  cardTagline: { fontSize: "13px", color: "var(--ink-soft)", margin: "0 0 12px", lineHeight: 1.4 },
  field: { marginBottom: 10 },
  fieldLabel: {
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "var(--muted)",
    marginBottom: 3,
  },
  fieldBody: { margin: 0, fontSize: "14px", lineHeight: 1.5, color: "var(--ink)" },
  list2: { margin: 0, paddingLeft: 18, fontSize: "14px", lineHeight: 1.5, color: "var(--ink)" },
  metaRow: { display: "flex", gap: 6, flexWrap: "wrap", margin: "12px 0 10px" },
  methodTag: {
    fontSize: "11px",
    background: "var(--accent-soft)",
    color: "var(--accent-deep)",
    borderRadius: 999,
    padding: "2px 8px",
    fontWeight: 600,
  },
  metaTag: {
    fontSize: "11px",
    background: "var(--paper-2)",
    color: "var(--ink-soft)",
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
  authorName: { fontWeight: 600, color: "var(--ink)" },
  personaTag: { background: "var(--paper-2)", borderRadius: 999, padding: "1px 7px", fontSize: "11px" },
  openLink: { marginLeft: "auto", color: "var(--accent)", fontWeight: 600 },
  center: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "var(--font-sans)",
  },
};
