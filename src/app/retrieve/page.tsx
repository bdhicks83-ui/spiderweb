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
//
// ─────────────────────────────────────────────────────────────────────────────
// P-8 PHASE 1 (2026-07-26) — ⭐ SIGNAL 7: WHICH RESULT WAS ACTUALLY USEFUL.
//
// This is the ONLY user-visible change in the whole P-8 Phase 1 build, and it
// exists because /retrieve has been ranking frameworks by cosine similarity
// since P-3 without ever being told whether the top result was the one the
// person actually used. Similarity is a proxy for usefulness — it is the only
// proxy this path has ever had.
//
// Two grades of evidence, captured separately and never merged:
//   • IMPLICIT — which card was opened. Fires on the existing card link with
//     `keepalive: true` so the in-flight POST survives the navigation. Costs
//     the user nothing and asks nothing. Weak evidence: a promising title also
//     gets opened.
//   • EXPLICIT — a "this helped" control. Higher quality by a wide margin,
//     because it takes deliberate effort. Optional, one tap, never blocking.
//
// The control CANNOT fail in the user's face: the POST result is ignored, the
// button flips to its thanks state optimistically, and no error is ever shown.
// Telemetry that can interrupt someone's work is telemetry that trains people
// to ignore it.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import BrandHeader, { Daisy } from "@/components/BrandHeader";
// FLOOR GUIDE B — "I do it differently." Self-gating: renders only for a
// contributor, because an expert with a better way should codify it, not offer
// it. Unlike /floor-guide, this surface permits PASSIVE detection (it makes no
// privacy promise and its telemetry is already live), so a contributor
// describing their own practice can be noticed without clicking anything.
import ShareIdeaPanel from "@/components/ShareIdeaPanel";

const supabase = createClient();

// ═════════════════════════════════════════════════════════════════════════════
// ⚠️⚠️ DRAFT CUSTOMER-FACING COPY — PENDING BRIAN'S SIGN-OFF (P-8 Phase 1) ⚠️⚠️
//
// Everything a user reads on the new capture control lives in this one block so
// the wording can be changed without touching logic. It is deliberately framed
// as HELPING THE NEXT PERSON, not as "rate this result": the product's whole
// pitch is a team brain that gets better because colleagues feed it, and a
// thumbs-up widget reads like an AI product asking to be graded.
//
// Register check: Track B (enterprise operating brain), plain language, no Vine
// /Trellis plant metaphors, no "SOP", no AI-product framing. Lands the point
// once and stops.
// ═════════════════════════════════════════════════════════════════════════════
const HELPED_PROMPT = "Was this the one you needed?";
const HELPED_BUTTON = "Yes — this helped";
const HELPED_CONFIRMED = "Noted — thanks. That tells your team's brain which framework actually worked here.";

// ─── P-8 Phase 2 — the effectiveness signal (DRAFT, pending Brian) ───────────
// THE THIN-DATA GUARDRAIL LIVES IN THIS WORDING. "Proven" is reserved for
// records with a watch-verified resolution AND enough total evidence; below
// that bar the label is "Early signal" and says so plainly. The evidence count
// (N) is ALWAYS shown — a ranking influenced by data must display its sample
// size (P-8 guardrail 2), and an early signal must never dress up as learned
// intelligence.
const PROVEN_BADGE = "Proven effective";
const EARLY_BADGE = "Early signal";
const provenTitle = (n: number) =>
  `Proven effective — resolved a real recurrence, verified by the post-training watch (evidence: ${n}).`;
const earlyTitle = (n: number) =>
  `Early signal — some evidence this works (${n} data point${n === 1 ? "" : "s"}), not enough to call it proven yet.`;
const RANKED_HIGHER_PREFIX = "Why this ranks higher:";

// ═════════════════════════════════════════════════════════════════════════════
// ⚠️⚠️ P-9 KNOWLEDGE-GAP ALERT — DRAFT CUSTOMER-FACING COPY, PENDING BRIAN ⚠️⚠️
//
// This replaces the old honest-but-dead-end empty state. THE FRAME IS THE WHOLE
// POINT: a search with no match is not a failure of the product and must never
// read like one. It means somebody with a live problem went to the team's brain
// and the answer is sitting in a colleague's head, uncaptured. That is the most
// precise demand signal this system can produce, and the person staring at it is
// the one best placed to say "actually, I know this."
//
// Tone: amber (attention), NOT red (error) — the same treatment as contested
// frameworks and Coaching Watch. Track B register: plain language, no
// Vine/Trellis plant metaphors, no "SOP", no AI-product framing. Land the point
// ONCE and stop.
// ═════════════════════════════════════════════════════════════════════════════
const GAP_COPY = {
  title: "No one's codified this yet — that's worth fixing.",
  body:
    "Nothing in your team's brain covers this. That's not a dead end: it means this piece of judgment lives in someone's head and nowhere else. Flag it so your team can see what's missing — or answer it now, if the answer is yours.",
  flag: "Flag this as a gap",
  answer: "Answer it now",
  flagging: "Flagging…",
  flagged: "Flagged. Your team can see it now — and you'll be told when someone fills it in.",
  flaggedRepeat: (n: number) =>
    `Flagged. This has been asked ${n} times now — it's near the top of the queue.`,
  seeQueue: "See the gaps queue →",
  myQuestions: "Track it in your questions →",
  flagFailed: "Couldn't flag that just now. Try again — your search is still here.",
  nearMiss: (sim: number) =>
    `Closest thing your team has codified came in at ${Math.round(sim * 100)}% — below the bar for a confident match.`,
};
// Training-derived provenance (Part A records surfacing in retrieval):
const PROVENANCE_LABEL = "Codified from training";
const provenanceLine = (formatName: string, names: string[]) =>
  names.length > 0
    ? `${formatName} that solved a real issue — built from frameworks by ${names.join(", ")}.`
    : `${formatName} that solved a real issue, built from your team's codified frameworks.`;
// ═════════════════════════════════════════════════════════════════════════════

type Framework = {
  name?: string | null;
  tagline?: string | null;
  signals?: unknown;
  the_play?: string | null;
  boundaries?: unknown;
};

type Contested = { conflict_id: string; other_record_id: string };

// P-8 Phase 2 — the effectiveness signal, exactly as the API ships it.
// `level` is 'proven' only past the thin-data confidence bar; `n` is the
// evidence count and is ALWAYS displayed; `evidence` is the human-readable why.
type Effectiveness = {
  level: "proven" | "early";
  n: number;
  resolved_count: number;
  helped_count: number;
  evidence: unknown;
  boost: number;
};

// P-7 Build 6 — training-derived provenance (safe display shape only).
type Provenance = {
  format_name: string;
  expert_names: unknown;
  training_request_id: string | null;
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
  author: {
    display_name: string | null;
    persona: string | null;
    claimed_title: string | null;
  } | null;
  contested: Contested[];
  effectiveness?: Effectiveness | null;
  codified_from?: Provenance | null;
};

// P-9 — the gap-flag control's state, kept OUT of `view` on purpose: flagging a
// gap must never be able to change which of the six view branches is painting.
type GapState =
  | { kind: "idle" }
  | { kind: "flagging" }
  | { kind: "flagged"; gapId: string; askedCount: number }
  | { kind: "error"; message: string };

// The page is in exactly one of these at any moment. `view` is the SINGLE
// source of truth for what paints — there is no combination of state that
// renders nothing.
type View =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "results"; results: Result[]; askedFor: string }
  // P-9: the empty state now carries the QUESTION and the near-miss score, so
  // the gap alert can flag the exact words the person typed. Losing the query
  // here would mean asking them to retype it to report the gap.
  | { kind: "noMatch"; message: string; askedFor: string; topSimilarity: number | null }
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
  // P-7 Build 6 — a record codified from a resolved training run says what it
  // is; it never pretends an elicitation session happened.
  training_derived: "Codified from training",
};

// FALLBACK ONLY — the card shows the author's real profiles.claimed_title
// (e.g. "Panel Technical Expert, R&D"); this generic role label paints only
// when a profile has no claimed_title set.
const PERSONA_LABEL: Record<string, string> = {
  exec: "Executive",
  technical_director: "Technical Expert",
  sr_manager: "Sr. Manager",
};

// P-5 punch list item 7 — a single hardcoded placeholder made every demo
// search look pre-loaded/scripted. Rotate through a small pool so the
// textarea reads differently each time the page loads.
const SITUATION_PLACEHOLDERS = [
  "e.g. We had a quality escape right after a die changeover on the press line — should we release the next run before first-piece inspection clears?",
  "e.g. We had a delamination escape after a profile changeover on the Little Rock line — release the next run before bond-strength clears?",
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
  // P-8 signal 7: which cards this person has already said "helped" on, so the
  // control flips to its thanks state. Per-search state; cleared on a new
  // search alongside `view`.
  const [helped, setHelped] = useState<Record<string, boolean>>({});
  const [placeholder] = useState(
    () => SITUATION_PLACEHOLDERS[Math.floor(Math.random() * SITUATION_PLACEHOLDERS.length)]
  );
  // P-9 — the gap alert's own state for the CURRENT empty search. Reset on
  // every new search alongside `view`, so a flag never carries over onto a
  // different question.
  const [gapState, setGapState] = useState<GapState>({ kind: "idle" });
  // ─── FLOOR GUIDE PHASE A ───
  // Contributors reach this page fully — retrieval is theirs, and flagging a gap
  // is the single most useful thing they do here. What they cannot do is CODIFY,
  // so the two codify doorways on this page are hidden for them.
  //
  // ⚠️ This deviates from the app-wide "show the link, let the gate decide"
  // default, and the deviation is deliberate. That default is right when the gate
  // is about DATA — /coaching renders empty for someone with no reports, which is
  // informative. It is wrong when the gate is about the PERSON: offering "Answer
  // it now," walking them into a multi-turn interview, and refusing at the end is
  // a bait-and-switch, and the refusal would land at the worst possible moment.
  // Own-row read; the real gate is the pattern_records trigger.
  const [isContributor, setIsContributor] = useState(false);

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
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      setIsContributor((profile as { role: string | null } | null)?.role === "contributor");
      setChecking(false);
    })();
  }, [router]);

  // ── P-8 SIGNAL 7 capture ───────────────────────────────────────────────────
  // Fire-and-forget, always. The response is never read, no error is ever
  // surfaced, and nothing about this call can change what the user sees. The
  // ledger write on the server side is equally non-throwing, so a failure at
  // either end costs the user nothing.
  function sendRetrievalSignal(
    kind: "opened" | "helped",
    r: Result,
    rank: number,
    askedFor: string,
    resultCount: number
  ) {
    try {
      void fetch("/api/retrieve/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // keepalive matters for 'opened': the click navigates away, and a
        // normal fetch would be cancelled mid-flight by the unload.
        keepalive: true,
        body: JSON.stringify({
          record_id: r.id,
          kind,
          query: askedFor,
          similarity: asNumber(r.similarity),
          rank,
          result_count: resultCount,
        }),
      }).catch(() => {});
    } catch {
      // Never surfaces. See above.
    }
  }

  // ── P-9 — FLAG THE GAP ─────────────────────────────────────────────────────
  // Turns the dead end into a row the whole org can see. Two exits from the
  // same call, because the person staring at an unanswered question is either
  // the wrong person to answer it (flag it, move on) or exactly the right one
  // (answer it now) — and making them guess which button means what would cost
  // us the second case entirely.
  //
  // `andAnswer` claims the gap and hands off to /codify with the question
  // carried in the URL, so the interview starts with the colleague's actual
  // words on screen rather than a blank page.
  async function flagGap(question: string, topSimilarity: number | null, andAnswer: boolean) {
    if (gapState.kind === "flagging") return;
    setGapState({ kind: "flagging" });
    try {
      const res = await fetch("/api/gaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, top_similarity: topSimilarity }),
      });
      const data = (await res.json()) as Record<string, unknown>;
      log(`POST /api/gaps → HTTP ${res.status}`, data);
      if (!res.ok) {
        setGapState({ kind: "error", message: asText(data?.error) || GAP_COPY.flagFailed });
        return;
      }
      const gapId = asText(data?.gap_id);
      if (andAnswer && gapId) {
        // The claim is advisory — if it fails the gap simply stays open and the
        // capture still happens. Never block the handoff on it.
        try {
          await fetch(`/api/gaps/${gapId}/claim`, { method: "POST" });
        } catch {
          // intentionally silent
        }
        router.push(`/codify?gap=${gapId}`);
        return;
      }
      setGapState({
        kind: "flagged",
        gapId,
        askedCount: asNumber(data?.asked_count) || 1,
      });
    } catch {
      setGapState({ kind: "error", message: GAP_COPY.flagFailed });
    }
  }

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
    setHelped({});
    setGapState({ kind: "idle" });

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
        const near = (data as { topSimilarity?: unknown }).topSimilarity;
        setView({
          kind: "noMatch",
          message: asText(data.message) || "Nothing codified on this yet.",
          // P-9: carry the question through so the gap can be flagged in the
          // person's own words, and the near-miss so the alert can be honest
          // about how close the library got.
          askedFor,
          topSimilarity: typeof near === "number" && Number.isFinite(near) ? near : null,
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
            <a href="/gaps" style={styles.headerLink}>
              🧩 Gaps
            </a>
            <a href="/library" style={styles.headerLink}>
              📚 Library
            </a>
            {!isContributor && (
              <a href="/codify" style={styles.newLink}>
                + Codify a pattern
              </a>
            )}
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

        {/* ── P-9 — THE KNOWLEDGE-GAP ALERT ──────────────────────────────────
            Was: a quiet "nothing codified on this yet" card with a generic
            link to /codify. That was honest and it was a dead end — the most
            valuable trigger in the system rendered as a shrug.

            Now: a highlighted amber panel (attention, never error-red) that
            names what just happened as a discovered gap, and gives the person
            two real exits — flag it for the team, or answer it themselves with
            their question carried into the capture session.

            ⭐ THE SYSTEM DOES NOT ANSWER ITS OWN GAP. There is no "generate a
            framework" button here and there never will be: fabricating the
            missing expertise is the one thing this product exists not to do. A
            human fills it, and their name goes on it. ── */}
        {view.kind === "noMatch" && (
          <div style={styles.gapAlert}>
            <div style={styles.gapTop}>
              <Daisy size={28} />
              <span style={styles.gapLabel}>A gap worth filling</span>
            </div>
            <p style={styles.gapTitle}>{GAP_COPY.title}</p>
            <p style={styles.gapBody}>{GAP_COPY.body}</p>
            <p style={styles.gapQuestion}>&ldquo;{view.askedFor}&rdquo;</p>
            {view.topSimilarity !== null && (
              <p style={styles.gapNearMiss}>{GAP_COPY.nearMiss(view.topSimilarity)}</p>
            )}

            {gapState.kind === "flagged" ? (
              <div style={styles.gapDone}>
                <p style={styles.gapDoneText}>
                  {gapState.askedCount > 1
                    ? GAP_COPY.flaggedRepeat(gapState.askedCount)
                    : GAP_COPY.flagged}
                </p>
                <div style={styles.gapDoneLinks}>
                  <a href="/gaps" style={styles.newLink}>
                    {GAP_COPY.seeQueue}
                  </a>
                  <a href="/gaps/mine" style={styles.newLink}>
                    {GAP_COPY.myQuestions}
                  </a>
                </div>
              </div>
            ) : (
              <>
                <div style={styles.gapActions}>
                  <button
                    type="button"
                    style={styles.gapPrimary}
                    disabled={gapState.kind === "flagging"}
                    onClick={() => flagGap(view.askedFor, view.topSimilarity, false)}
                  >
                    {gapState.kind === "flagging" ? GAP_COPY.flagging : GAP_COPY.flag}
                  </button>
                  {!isContributor && (
                    <button
                      type="button"
                      style={styles.gapSecondary}
                      disabled={gapState.kind === "flagging"}
                      onClick={() => flagGap(view.askedFor, view.topSimilarity, true)}
                    >
                      {GAP_COPY.answer}
                    </button>
                  )}
                </div>
                {gapState.kind === "error" && (
                  <p style={styles.gapError}>{gapState.message}</p>
                )}
              </>
            )}
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
                const wasHelpful = !!helped[key];
                const results = view.results;
                const askedFor = view.askedFor;
                // P-8 Phase 2 — the effectiveness signal, defensively coerced
                // (same discipline as `framework`: never let a shape throw).
                const eff =
                  r.effectiveness && typeof r.effectiveness === "object" ? r.effectiveness : null;
                const effLevel = eff?.level === "proven" ? "proven" : eff?.level === "early" ? "early" : null;
                const effN = eff ? asNumber(eff.n) : 0;
                const effEvidence = eff ? asArray(eff.evidence) : [];
                // P-7 Build 6 — training-derived provenance.
                const prov =
                  r.codified_from && typeof r.codified_from === "object" ? r.codified_from : null;
                const provNames = prov ? asArray(prov.expert_names) : [];
                // The expert's real title from their profile; generic persona
                // role only when no claimed_title is set.
                const authorTitle =
                  asText(r.author?.claimed_title) ||
                  (r.author?.persona ? PERSONA_LABEL[r.author.persona] ?? r.author.persona : "");

                return (
                  <ResultBoundary key={key} recordId={typeof r.id === "string" ? r.id : ""}>
                    <div style={styles.cardShell}>
                      <a
                        href={`/library/${r.id}`}
                        style={styles.card}
                        // P-8 signal 7 (implicit): which result was opened.
                        // Fire-and-forget with keepalive; navigation is never
                        // delayed or blocked by it.
                        onClick={() =>
                          sendRetrievalSignal("opened", r, idx + 1, askedFor, results.length)
                        }
                      >
                        <div style={styles.cardTop}>
                          <span style={styles.emoji}>
                            {r.trigger_type ? TRIGGER_EMOJI[r.trigger_type] ?? "" : ""}
                          </span>
                          <span style={styles.badgeRow}>
                            {/* P-8 Phase 2 — effectiveness, honestly graded.
                                Fill = proven (watch-verified + enough evidence);
                                outline = early signal. N always shown. */}
                            {effLevel === "proven" && (
                              <span style={styles.provenBadge} title={provenTitle(effN)}>
                                ✓ {PROVEN_BADGE}
                              </span>
                            )}
                            {effLevel === "early" && (
                              <span style={styles.earlyBadge} title={earlyTitle(effN)}>
                                {EARLY_BADGE}
                              </span>
                            )}
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

                        {/* P-7 Build 6 — training-derived provenance: what this
                            was codified from and whose judgment built it. */}
                        {prov && (
                          <div style={styles.provenanceRow}>
                            <span style={styles.provenanceLabel}>{PROVENANCE_LABEL}</span>
                            <span style={styles.provenanceText}>
                              {provenanceLine(asText(prov.format_name) || "Training", provNames)}
                            </span>
                          </div>
                        )}

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

                        {/* P-8 Phase 2 — explainability: WHY this ranks higher,
                            in words, with the evidence count. Never shown
                            without evidence; never hides the N. */}
                        {effLevel && effEvidence.length > 0 && (
                          <div style={styles.effectivenessBox}>
                            <div style={styles.effectivenessHeading}>
                              {RANKED_HIGHER_PREFIX}
                            </div>
                            <ul style={styles.effectivenessList}>
                              {effEvidence.slice(0, 3).map((e, i) => (
                                <li key={i}>{e}</li>
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
                          {authorTitle && (
                            <span style={styles.personaTag}>{authorTitle}</span>
                          )}
                          <span style={styles.openLink}>Open framework →</span>
                        </div>
                      </a>

                      {/* ── P-8 SIGNAL 7 (explicit) — the capture control ──
                          Outside the <a> on purpose: a button nested inside an
                          anchor is invalid HTML and its click would race the
                          navigation. Copy is DRAFT, pending Brian's sign-off —
                          see the block at the top of this file. */}
                      <div style={styles.helpRow}>
                        {wasHelpful ? (
                          <span style={styles.helpThanks}>{HELPED_CONFIRMED}</span>
                        ) : (
                          <>
                            <span style={styles.helpPrompt}>{HELPED_PROMPT}</span>
                            <button
                              type="button"
                              style={styles.helpButton}
                              onClick={() => {
                                // Optimistic, always. The control must never
                                // be able to show the user an error — see the
                                // P-8 note at the top of this file.
                                setHelped((prev) => ({ ...prev, [key]: true }));
                                sendRetrievalSignal("helped", r, idx + 1, askedFor, results.length);
                              }}
                            >
                              {HELPED_BUTTON}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </ResultBoundary>
                );
              })}
            </div>
          </>
        )}

        {/* ── THE OTHER DIRECTION. Below the answers, because somebody who came
            here with a problem needs it solved before they have anything to
            offer. topSimilarity is passed through so a question the library
            already answers well never becomes a candidate — a confident match
            means this is covered, and re-surfacing it would be noise in the
            admin's queue. ── */}
        <ShareIdeaPanel
          surface="retrieve"
          observation={
            view.kind === "results" || view.kind === "noMatch" ? view.askedFor : null
          }
          contextNote={
            view.kind === "results" && view.results.length > 0
              ? view.results[0].framework?.name ?? null
              : null
          }
          topSimilarity={
            view.kind === "results" && view.results.length > 0
              ? view.results[0].similarity
              : view.kind === "noMatch"
                ? view.topSimilarity
                : null
          }
        />
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
  headerLink: { fontSize: "14px", fontWeight: 600, color: "var(--pine)", textDecoration: "none" },
  newLink: { fontSize: "14px", fontWeight: 600, color: "var(--growth)", textDecoration: "none" },
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
    background: "var(--growth)",
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
  brokenBody: { fontSize: "13px", color: "var(--pine-soft)", margin: 0, lineHeight: 1.5 },
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
  // ── P-9 gap alert. AMBER, not red: this is attention, not an error. Same
  // token family as the contested badge and Coaching Watch, deliberately.
  gapAlert: {
    background: "var(--warn-bg)",
    border: "1px solid var(--warn-border)",
    borderRadius: 14,
    padding: "20px 22px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  gapTop: { display: "flex", alignItems: "center", gap: 8, marginBottom: 2 },
  gapLabel: {
    fontSize: "11px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--warn-strong)",
  },
  gapTitle: { fontSize: "17px", fontWeight: 700, color: "var(--pine)", margin: 0, lineHeight: 1.4 },
  gapBody: { fontSize: "14px", color: "var(--warn-text)", margin: "2px 0 0", lineHeight: 1.6 },
  gapQuestion: {
    fontSize: "14px",
    fontWeight: 600,
    color: "var(--pine)",
    background: "var(--warn-chip-bg)",
    border: "1px solid var(--warn-border)",
    borderRadius: 10,
    padding: "10px 12px",
    margin: "10px 0 0",
    lineHeight: 1.5,
  },
  gapNearMiss: { fontSize: "12px", color: "var(--warn-text)", margin: "8px 0 0" },
  gapActions: { display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 },
  gapPrimary: {
    fontSize: "14px",
    fontWeight: 600,
    color: "var(--white)",
    background: "var(--growth)",
    border: "none",
    borderRadius: 8,
    padding: "10px 18px",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  gapSecondary: {
    fontSize: "14px",
    fontWeight: 600,
    color: "var(--warn-strong)",
    background: "var(--white)",
    border: "1px solid var(--warn-border)",
    borderRadius: 8,
    padding: "10px 18px",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  gapError: { fontSize: "13px", color: "var(--danger)", margin: "10px 0 0" },
  gapDone: { marginTop: 14 },
  gapDoneText: { fontSize: "14px", fontWeight: 600, color: "var(--warn-strong)", margin: "0 0 10px", lineHeight: 1.55 },
  gapDoneLinks: { display: "flex", gap: 18, flexWrap: "wrap" },
  emptyTitle: { fontSize: "15px", color: "var(--pine-soft)", margin: 0, lineHeight: 1.5, maxWidth: 460 },
  resultsHeading: { fontSize: "14px", color: "var(--muted)", margin: "0 0 14px", fontWeight: 600 },
  list: { display: "flex", flexDirection: "column", gap: 16 },
  // P-8: the card and its capture control travel together as one unit.
  cardShell: { display: "flex", flexDirection: "column", gap: 6 },
  card: {
    display: "block",
    background: "var(--white)",
    border: "1px solid var(--line)",
    borderRadius: 14,
    padding: "18px 20px 14px",
    textDecoration: "none",
    color: "inherit",
  },
  // P-8 capture control — deliberately quiet. It sits under the card, in
  // muted type, and never competes with the framework itself.
  helpRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "0 4px",
    minHeight: 26,
    flexWrap: "wrap",
  },
  helpPrompt: { fontSize: "12px", color: "var(--muted)" },
  helpButton: {
    fontSize: "12px",
    fontWeight: 600,
    color: "var(--growth-deep)",
    background: "var(--growth-soft)",
    border: "1px solid var(--new-leaf-light)",
    borderRadius: 999,
    padding: "3px 12px",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  helpThanks: { fontSize: "12px", color: "var(--growth-deep)", lineHeight: 1.4 },
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
    color: "var(--growth-deep)",
    background: "var(--growth-soft)",
    border: "1px solid var(--new-leaf-light)",
    borderRadius: 999,
    padding: "2px 8px",
  },
  // P-8 Phase 2 — fill vs outline IS the semantic distinction (same doctrine
  // as the prescription states): proven = green fill, early = green outline.
  provenBadge: {
    fontSize: "11px",
    fontWeight: 600,
    color: "var(--white)",
    background: "var(--growth)",
    border: "1px solid var(--growth)",
    borderRadius: 999,
    padding: "2px 8px",
  },
  earlyBadge: {
    fontSize: "11px",
    fontWeight: 600,
    color: "var(--growth-deep)",
    background: "transparent",
    border: "1px solid var(--growth)",
    borderRadius: 999,
    padding: "2px 8px",
  },
  provenanceRow: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
    flexWrap: "wrap",
    margin: "0 0 12px",
  },
  provenanceLabel: {
    fontSize: "10px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "var(--growth-deep)",
    background: "var(--growth-soft)",
    border: "1px solid var(--new-leaf-light)",
    borderRadius: 999,
    padding: "2px 8px",
    whiteSpace: "nowrap",
  },
  provenanceText: { fontSize: "12px", color: "var(--pine-soft)", lineHeight: 1.4 },
  effectivenessBox: {
    background: "var(--growth-soft)",
    border: "1px solid var(--new-leaf-light)",
    borderRadius: 10,
    padding: "8px 12px",
    margin: "2px 0 10px",
  },
  effectivenessHeading: {
    fontSize: "11px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "var(--growth-deep)",
    marginBottom: 3,
  },
  effectivenessList: {
    margin: 0,
    paddingLeft: 16,
    fontSize: "12px",
    lineHeight: 1.5,
    color: "var(--pine)",
  },
  cardTitle: { fontSize: "18px", margin: "0 0 4px", fontWeight: 700 },
  cardTagline: { fontSize: "13px", color: "var(--pine-soft)", margin: "0 0 12px", lineHeight: 1.4 },
  field: { marginBottom: 10 },
  fieldLabel: {
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "var(--muted)",
    marginBottom: 3,
  },
  fieldBody: { margin: 0, fontSize: "14px", lineHeight: 1.5, color: "var(--pine)" },
  list2: { margin: 0, paddingLeft: 18, fontSize: "14px", lineHeight: 1.5, color: "var(--pine)" },
  metaRow: { display: "flex", gap: 6, flexWrap: "wrap", margin: "12px 0 10px" },
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
  personaTag: { background: "var(--paper-2)", borderRadius: 999, padding: "1px 7px", fontSize: "11px" },
  openLink: { marginLeft: "auto", color: "var(--growth)", fontWeight: 600 },
  center: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "var(--font-sans)",
  },
};
