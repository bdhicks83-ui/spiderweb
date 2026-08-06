// THE EXPOSURE ENGINE — what judgment is about to walk out the door.
//
// ⛔ SERVER-ONLY. Everything the UI needs travels over /api/exposure.
//
// ═════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS FOR
//
// /readout answers "what did we get." Exposure answers the question the readout
// deliberately does not: "what happens if the person who knows this stops
// coming in." It is an INTERNAL management surface — it never leaves the
// building, it is never exported to PDF, and it never appears on the readout.
//
// ⭐ NO NEW SCHEMA FOR BLOCK 1. Every number in the walking-risk block is
// derived at read time from pattern_records, profiles and learning_signals —
// the same architectural stance as /readout and the P-9 gap resolution: a
// stored metric drifts from the thing it claims to describe. (Block 2, the
// framework warnings, DOES need one table — precedence_links — because an
// extracted causal claim is a durable fact about a captured framework, not a
// recomputable aggregate.)
//
// ═════════════════════════════════════════════════════════════════════════════
// ⭐⭐ THE RULES THIS FILE EXISTS TO OBEY
//
// 1. ⭐ NEVER NAME A PERSON AS A LIABILITY. Dana Whitfield appears here as the
//    HOLDER of scarce value, never as a risk. The gap is always framed as
//    "nobody else has captured on this" — a fact about COVERAGE — and never as
//    anything about the person. This is the Win Column's wins-only doctrine and
//    the T1B3 no-person-level-negative rule applied to a new surface.
//
// 2. 🛑 retraining_signals / Coaching Watch CONTRIBUTES NOTHING HERE. Not
//    aggregated, not anonymized, not counted, not hinted at. Note what is NOT
//    read below: there is no query against it, and there must never be one.
//
// 3. EVERY ROW ENDS IN AN ACTION. Exposure is a to-do list, not a wall of
//    anxiety. The route hands back everything the "Close this" button needs to
//    open a pre-filled targeted capture ask through the EXISTING capture_requests
//    flow — no parallel mechanism.
//
// 4. THE EMPTY STATE IS A REAL RESULT. "No concentration risk above threshold"
//    is good news, rendered as good news, never as a broken page.
// ═════════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from "@supabase/supabase-js";
// ⭐ THRESHOLD REUSE, NOT A NEW BAR. 0.75 is the measured relevance threshold
// (P-3, tuned live; reused verbatim by P-4A, Studio grounding and Already
// Walked). Clustering asks the same question retrieval asks — "are these two
// pieces of judgment about the same thing?" — so it reuses the same number.
// Standing rule: fix the QUERY, never the bars.
import { WALKED_RELEVANT_COSINE } from "@/lib/walked-check";
import { requireLeadershipViewer, type LeadershipGate } from "@/lib/leadership-gate";

// ═════════════════════════════════════════════════════════════════════════════
// TUNING CONSTANTS
//
// ⚠️ Read the distinction: WALKED_RELEVANT_COSINE above is a SIMILARITY BAR and
// is never re-tuned here. Everything below is a RANKING/DISPLAY parameter — it
// decides ordering and how much of a list is shown, and it can never change
// whether two pieces of judgment are "about the same thing."
// ═════════════════════════════════════════════════════════════════════════════

/** Cosine at or above which a record joins an existing topic cluster. */
export const CLUSTER_MIN_COSINE = WALKED_RELEVANT_COSINE;

/** Rows shown before "show all". The rest are computed, just not rendered. */
export const EXPOSURE_PAGE_ROWS = 12;

/**
 * Ranking floor. A row below this is computed and then not shown — the org has
 * coverage there. This is a DISPLAY floor, not a semantic threshold: moving it
 * changes how long the to-do list is, never what the product believes about
 * two frameworks being related.
 */
export const EXPOSURE_MIN_SCORE = 25;

/** Years of experience at which tenure weight saturates. */
const TENURE_FULL_YEARS = 25;

/**
 * Tenure weight when the top contributor has no years figure on file. Neutral
 * by construction and NEVER presented as their experience: the row copy simply
 * omits the years clause (`tenure_known: false`). An absent number is omitted,
 * never estimated — the T1B3 rule, applied to a ranking input.
 */
const TENURE_UNKNOWN_WEIGHT = 0.5;

/** Floor so a sole source with little tenure still surfaces. */
const TENURE_MIN_WEIGHT = 0.2;

/** Retrievals in the window at which demand weight saturates at 2×. */
const DEMAND_FULL_RETRIEVALS = 10;

/** Score deducted per pattern in the cluster that is NOT the top contributor's. */
const SECOND_SOURCE_PENALTY = 8;

/** Trailing window for retrieval demand. */
export const DEMAND_WINDOW_DAYS = 90;

/** Hard ceiling on records pulled into the in-memory clustering pass. */
export const MAX_CLUSTER_RECORDS = 400;

// ═════════════════════════════════════════════════════════════════════════════
// SHAPES
// ═════════════════════════════════════════════════════════════════════════════

export type ExposureHolder = {
  person_id: string;
  /** The HOLDER of scarce value. Never rendered as a risk. See rule 1. */
  name: string;
  title: string | null;
  patterns: number;
  /** null when they have no years figure on file — the copy omits the clause. */
  years_experience: number | null;
};

export type WalkingRiskRow = {
  /** Stable across reads for the same data: the centroid-nearest record's id. */
  cluster_key: string;
  /** Never null. Falls back to the centroid-nearest pattern's own subject. */
  label: string;
  /** True when the label came from a framework artifact rather than a fallback. */
  label_from_framework: boolean;
  pattern_count: number;
  contributor_count: number;
  top_contributor: ExposureHolder;
  /** Patterns in this cluster NOT authored by the top contributor. */
  second_source_depth: number;
  /** 0–1. top_contributor.patterns / pattern_count. */
  concentration: number;
  retrievals_90d: number;
  retrievals_useful_90d: number;
  score: number;
  /** Record ids in the cluster, most-central first. For the library deep link. */
  record_ids: string[];
};

export type WalkingRisk = {
  rows: WalkingRiskRow[];
  /** Rows above EXPOSURE_MIN_SCORE, including those behind "show all". */
  total_rows: number;
  /** Complete records considered (embedded only — see `unembedded`). */
  records_considered: number;
  /**
   * ⭐ TRUE when the org has more complete records than the clustering pass
   * looks at. SURFACED, never swallowed: an empty page that means "we only
   * looked at some of it" reading as "no concentration risk" is the exact class
   * of silent undercount `unembedded` exists to prevent.
   */
  truncated: boolean;
  max_records: number;
  /**
   * Complete records with no embedding yet, therefore invisible to clustering.
   * ⭐ Surfaced, never swallowed: a silent exclusion is a silent undercount.
   */
  unembedded: number;
  window_days: number;
};

// ═════════════════════════════════════════════════════════════════════════════
// AUTHORITY
// ═════════════════════════════════════════════════════════════════════════════

export type ExposureGate = LeadershipGate;

/**
 * Manager, org admin, or an executive seat. ONE implementation, shared with
 * /ledger — see src/lib/leadership-gate.ts for why this is one rung wider than
 * requireReadoutViewer.
 *
 * ⚠️ DRAFT CUSTOMER-FACING COPY (the denial line) — pending Brian.
 */
export async function requireExposureViewer(session: SupabaseClient): Promise<ExposureGate> {
  return requireLeadershipViewer(session, {
    denial: "This is for managers, executives, and account admins.",
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// VECTOR HELPERS
//
// pgvector comes back over PostgREST as a bracketed string ("[0.1,0.2,…]").
// Parsed here rather than in SQL so the clustering pass stays one round trip.
// ═════════════════════════════════════════════════════════════════════════════

export function parsePgVector(value: unknown): number[] | null {
  if (Array.isArray(value)) {
    return value.every((n) => typeof n === "number") ? (value as number[]) : null;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) return null;
    return parsed.every((n) => typeof n === "number") ? (parsed as number[]) : null;
  } catch {
    return null;
  }
}

/** Cosine similarity. Returns 0 for degenerate input rather than NaN. */
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// ═════════════════════════════════════════════════════════════════════════════
// SCORING
// ═════════════════════════════════════════════════════════════════════════════

export function tenureWeight(years: number | null): number {
  if (years === null || !Number.isFinite(years) || years <= 0) return TENURE_UNKNOWN_WEIGHT;
  return Math.max(TENURE_MIN_WEIGHT, Math.min(1, years / TENURE_FULL_YEARS));
}

export function demandWeight(retrievals: number): number {
  // 1× with no demand (concentration is risk whether or not anyone has asked
  // yet), rising to 2× at DEMAND_FULL_RETRIEVALS. Demand AMPLIFIES exposure; it
  // never creates or erases it.
  return 1 + Math.min(1, Math.max(0, retrievals) / DEMAND_FULL_RETRIEVALS);
}

/**
 * concentration × tenure weight × demand weight, minus second-source depth.
 * Scaled ×100 so the raw number reads like a rank, and floored at 0 so a
 * well-covered cluster never renders as negative exposure.
 */
export function exposureScore(input: {
  concentration: number;
  years: number | null;
  retrievals: number;
  secondSourceDepth: number;
}): number {
  const raw =
    input.concentration * tenureWeight(input.years) * demandWeight(input.retrievals) * 100 -
    input.secondSourceDepth * SECOND_SOURCE_PENALTY;
  return Math.max(0, Math.round(raw * 10) / 10);
}

// ═════════════════════════════════════════════════════════════════════════════
// THE COMPUTATION
// ═════════════════════════════════════════════════════════════════════════════

type RecordRow = {
  id: string;
  user_id: string;
  created_at: string;
  embedding: unknown;
  framework: { name?: string | null } | null;
  context_summary: string | null;
  trigger_signal: string | null;
  situation_type: string | null;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  claimed_title: string | null;
  claimed_years_experience: number | null;
};

type Cluster = {
  /** Running mean of member embeddings — the "topic centroid". */
  centroid: number[];
  members: { record: RecordRow; vector: number[] }[];
};

/**
 * ⭐ READ WITH THE SESSION CLIENT, NOT SERVICE ROLE — and that is the opposite
 * of the /readout choice, deliberately.
 *
 * /readout reports AGGREGATES that must be true totals, so a partial number
 * presented as a whole one is the bug; it reads service-role and gates in the
 * route. Exposure is ROW-LEVEL and PERSON-ATTRIBUTED — every row names a
 * holder — so it reads as the caller and lets "org library read" and "org
 * members read profiles" do the scoping. A surface that names people must never
 * be able to name a person the caller could not otherwise see.
 *
 * 🛑 NOTE WHAT IS NOT READ: retraining_signals. Coaching Watch contributes
 * nothing to this file — not aggregated, not anonymized, not counted.
 */
export async function buildWalkingRisk(
  session: SupabaseClient,
  orgId: string
): Promise<WalkingRisk> {
  const windowStart = new Date(
    Date.now() - DEMAND_WINDOW_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  // ─── Records ───
  const { data: recordsRaw } = await session
    .from("pattern_records")
    .select(
      "id, user_id, created_at, embedding, framework, context_summary, trigger_signal, situation_type"
    )
    .eq("org_id", orgId)
    .eq("status", "complete")
    // ⭐ MOST RECENT FIRST. Ascending would pin the pass to the org's OLDEST 400
    // records, so on a growing account every new concentration — the ones that
    // actually matter — would be invisible while the page reported good news.
    .order("created_at", { ascending: false })
    .limit(MAX_CLUSTER_RECORDS);
  const records = (recordsRaw ?? []) as unknown as RecordRow[];

  const vectors: { record: RecordRow; vector: number[] }[] = [];
  let unembedded = 0;
  // Clustering walks records in CREATION order so the result is deterministic
  // for the same data; the query above reads newest-first only to decide WHICH
  // records make the cut.
  const ordered = [...records].sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const r of ordered) {
    const v = parsePgVector(r.embedding);
    if (!v) {
      unembedded++;
      continue;
    }
    vectors.push({ record: r, vector: v });
  }

  const truncated = records.length >= MAX_CLUSTER_RECORDS;

  if (vectors.length === 0) {
    return {
      rows: [],
      total_rows: 0,
      records_considered: 0,
      unembedded,
      truncated,
      max_records: MAX_CLUSTER_RECORDS,
      window_days: DEMAND_WINDOW_DAYS,
    };
  }

  // ─── Clustering: cosine against existing centroids, greedy and in creation
  // order so the result is deterministic for the same data. No new taxonomy and
  // no second embedding model — the vectors are the ones P-3 already wrote. ───
  const clusters: Cluster[] = [];
  for (const item of vectors) {
    let best: { cluster: Cluster; sim: number } | null = null;
    for (const c of clusters) {
      const sim = cosine(item.vector, c.centroid);
      if (!best || sim > best.sim) best = { cluster: c, sim };
    }
    if (best && best.sim >= CLUSTER_MIN_COSINE) {
      const c = best.cluster;
      const n = c.members.length;
      // Running mean — the centroid is the topic, not any one record.
      for (let i = 0; i < c.centroid.length; i++) {
        c.centroid[i] = (c.centroid[i] * n + item.vector[i]) / (n + 1);
      }
      c.members.push(item);
    } else {
      clusters.push({ centroid: [...item.vector], members: [item] });
    }
  }

  // ─── People ───
  const authorIds = Array.from(new Set(records.map((r) => r.user_id)));
  const { data: peopleRaw } = await session
    .from("profiles")
    .select("id, display_name, claimed_title, claimed_years_experience")
    .in("id", authorIds.length > 0 ? authorIds : ["00000000-0000-0000-0000-000000000000"]);
  const people = new Map(
    ((peopleRaw ?? []) as ProfileRow[]).map((p) => [p.id, p])
  );

  // ─── Retrieval demand (trailing window) ───
  // learning_signals is org-readable; only the two retrieval signal types are
  // read, keyed by the pattern_record they were about. No actor is read: this
  // asks how often a TOPIC was needed, never who needed it.
  const { data: signalsRaw } = await session
    .from("learning_signals")
    .select("signal_type, subject_id")
    .eq("org_id", orgId)
    .eq("subject_type", "pattern_record")
    .in("signal_type", ["retrieval_result_opened", "retrieval_result_used"])
    .gte("occurred_at", windowStart);
  const signals = (signalsRaw ?? []) as { signal_type: string; subject_id: string }[];

  const demandTotal = new Map<string, number>();
  const demandUseful = new Map<string, number>();
  for (const s of signals) {
    demandTotal.set(s.subject_id, (demandTotal.get(s.subject_id) ?? 0) + 1);
    if (s.signal_type === "retrieval_result_used") {
      demandUseful.set(s.subject_id, (demandUseful.get(s.subject_id) ?? 0) + 1);
    }
  }

  // ─── Rows ───
  const rows: WalkingRiskRow[] = [];
  for (const c of clusters) {
    // Most-central member first: it names the cluster and anchors the deep link.
    const ranked = [...c.members]
      .map((m) => ({ ...m, central: cosine(m.vector, c.centroid) }))
      .sort((a, b) => b.central - a.central || a.record.id.localeCompare(b.record.id));
    const head = ranked[0].record;

    const byAuthor = new Map<string, number>();
    for (const m of c.members) {
      byAuthor.set(m.record.user_id, (byAuthor.get(m.record.user_id) ?? 0) + 1);
    }
    const authorRanked = Array.from(byAuthor.entries()).sort(
      (a, b) =>
        b[1] - a[1] ||
        (people.get(a[0])?.display_name ?? "").localeCompare(
          people.get(b[0])?.display_name ?? ""
        )
    );
    const [topId, topCount] = authorRanked[0];
    const topProfile = people.get(topId) ?? null;

    const patternCount = c.members.length;
    const secondSourceDepth = patternCount - topCount;
    const concentration = topCount / patternCount;

    const recordIds = ranked.map((m) => m.record.id);
    let retrievals = 0;
    let retrievalsUseful = 0;
    for (const id of recordIds) {
      retrievals += demandTotal.get(id) ?? 0;
      retrievalsUseful += demandUseful.get(id) ?? 0;
    }

    const years = topProfile?.claimed_years_experience ?? null;
    const score = exposureScore({
      concentration,
      years,
      retrievals,
      secondSourceDepth,
    });

    // ⭐ Never an unlabeled row. Framework name first (the densest summary the
    // product has), then the centroid-nearest pattern's own subject.
    const frameworkName =
      typeof head.framework?.name === "string" && head.framework.name.trim()
        ? head.framework.name.trim()
        : null;
    const fallback =
      firstNonEmpty([head.trigger_signal, head.context_summary, head.situation_type]) ??
      "A captured framework";

    rows.push({
      cluster_key: head.id,
      label: frameworkName ?? truncate(fallback, 80),
      label_from_framework: frameworkName !== null,
      pattern_count: patternCount,
      contributor_count: byAuthor.size,
      top_contributor: {
        person_id: topId,
        name: topProfile?.display_name || "A teammate",
        title: topProfile?.claimed_title ?? null,
        patterns: topCount,
        years_experience: typeof years === "number" ? years : null,
      },
      second_source_depth: secondSourceDepth,
      concentration: Math.round(concentration * 1000) / 1000,
      retrievals_90d: retrievals,
      retrievals_useful_90d: retrievalsUseful,
      score,
      record_ids: recordIds,
    });
  }

  const ranked = rows
    .filter((r) => r.score >= EXPOSURE_MIN_SCORE)
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));

  return {
    rows: ranked,
    total_rows: ranked.length,
    records_considered: vectors.length,
    unembedded,
    truncated,
    max_records: MAX_CLUSTER_RECORDS,
    window_days: DEMAND_WINDOW_DAYS,
  };
}

function firstNonEmpty(values: (string | null | undefined)[]): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}
