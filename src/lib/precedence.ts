// EXPOSURE / BLOCK 2 — "Your own frameworks are warning you."
//
// ⛔ SERVER-ONLY.
//
// ═════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS
//
// The conflict engine (P-2) points sideways — two experts, same ground,
// opposite calls. This points the same machinery FORWARD. Somewhere in a
// captured framework an expert wrote down that one observable condition
// precedes another outcome. When that condition starts showing up again in
// recent captures and recent questions, the organization's OWN judgment warns
// it — with a name and a link on the warning.
//
// ═════════════════════════════════════════════════════════════════════════════
// ⭐⭐ THE RULES
//
// 1. EVERY WARNING NAMES AND LINKS ITS SOURCE. An unsourced warning is a guess.
//    A row whose source pattern cannot be resolved is DROPPED here, not
//    rendered with a vague attribution.
//
// 2. ONLY 'stated' LINKS FIRE. 'implied' rows are stored by the extractor and
//    never surface in this build. A warning built on an inference is a warning
//    that teaches people to ignore warnings.
//
// 3. A WARNING NEEDS ≥ 2 DISTINCT RECENT ITEMS. One mention is a coincidence.
//
// 4. NEVER A PERSON. Antecedents are conditions. The extractor refuses
//    person-shaped antecedents and nothing here reintroduces one.
//
// 5. UNAVAILABLE ≠ EMPTY. If the migration has not run or a read fails, this
//    reports `available: false` and the page says so. Rendering an empty list
//    would be claiming "nothing is warning you," which would be a lie.
//
// ═════════════════════════════════════════════════════════════════════════════
// ⭐ WHY MATCHING IS SEMANTIC **OR** LEXICAL, AND WHY NOTHING IS EMBEDDED AT
//   READ TIME
//
// The row copy says "three captures in the last month MENTION slurry
// temperature drift." Lexical containment is literally what "mention" means, so
// it is a first-class match here rather than a fallback — and it is free.
//
// The semantic half reuses vectors that already exist: the antecedent's stored
// query-type embedding against pattern_records' stored document-type
// embeddings. That is the exact geometry the 0.75 relevance bar was tuned
// against, so no new threshold is introduced (standing rule: fix the QUERY,
// never the bars).
//
// Recent RETRIEVAL QUERIES are matched lexically only. There is no stored
// vector for a query, and embedding thirty of them on every page load is a
// latency cost this surface has no reason to pay — an honest limitation, stated
// in the caveats block rather than hidden.
// ═════════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from "@supabase/supabase-js";
import { WALKED_RELEVANT_COSINE } from "@/lib/walked-check";
import { cosine, parsePgVector, DEMAND_WINDOW_DAYS } from "@/lib/exposure";

/** Reused, never re-tuned. See the header. */
export const PRECEDENCE_MATCH_COSINE = WALKED_RELEVANT_COSINE;

/** One mention is a coincidence. Two is a pattern worth a manager's attention. */
export const PRECEDENCE_MIN_MENTIONS = 2;

/** Recent captures pulled into the match pass. */
const MAX_RECENT_CAPTURES = 200;

/** Recent retrieval queries pulled into the match pass. */
const MAX_RECENT_QUERIES = 200;

/** Warnings rendered. Ordered by mention count. */
const MAX_WARNINGS = 8;

export type FrameworkWarning = {
  antecedent: string;
  consequent: string;
  recent_mentions: number;
  source_record_id: string;
  source_framework: string;
  source_author: string;
  source_captured_at: string | null;
};

export type FrameworkWarnings = {
  rows: FrameworkWarning[];
  /**
   * False when the precedence machinery cannot answer (migration not run, or a
   * read failed). The page must NOT render "nothing is warning you" on false.
   */
  available: boolean;
  /** 'stated' links available to fire against. 0 with available:true is a real, dignified state. */
  links_considered: number;
  /** Recent items the antecedents were matched against. */
  items_considered: number;
  window_days: number;
};

const UNAVAILABLE: FrameworkWarnings = {
  rows: [],
  available: false,
  links_considered: 0,
  items_considered: 0,
  window_days: DEMAND_WINDOW_DAYS,
};

type LinkRow = {
  id: string;
  antecedent_text: string;
  consequent_text: string;
  source_pattern_id: string;
  antecedent_embedding: unknown;
};

type CaptureRow = {
  id: string;
  created_at: string;
  embedding: unknown;
  context_summary: string | null;
  trigger_signal: string | null;
  signal_detail: string | null;
  judgment: string | null;
};

/** Lowercase, collapse whitespace, strip punctuation. Mirrors normalizeGapQuestion's spirit. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * "Mentions" in the plain-English sense the copy uses. Requires the whole
 * normalized antecedent phrase to appear — not word overlap, which would fire
 * on "temperature" alone and make every warning worthless.
 */
function mentions(haystack: string, antecedentNorm: string): boolean {
  if (antecedentNorm.length < 4) return false;
  return haystack.includes(antecedentNorm);
}

/**
 * ⭐ READS AS THE CALLER, like the rest of /exposure. `precedence_links` and
 * `pattern_records` are both org-scoped by RLS, so a warning can never cite a
 * framework the caller could not otherwise open.
 */
export async function buildFrameworkWarnings(
  session: SupabaseClient,
  orgId: string
): Promise<FrameworkWarnings> {
  const windowStart = new Date(
    Date.now() - DEMAND_WINDOW_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  // ─── 1. The stated links ───
  const { data: linksRaw, error: linksError } = await session
    .from("precedence_links")
    .select("id, antecedent_text, consequent_text, source_pattern_id, antecedent_embedding")
    .eq("org_id", orgId)
    .eq("confidence", "stated");

  // Migration not run, table absent, permission problem — all mean the same
  // thing to the page: this section cannot answer. NOT "nothing is warning you."
  if (linksError) {
    console.warn(`precedence: links read failed (${linksError.message}) — reporting unavailable`);
    return UNAVAILABLE;
  }
  const links = (linksRaw ?? []) as unknown as LinkRow[];
  if (links.length === 0) {
    return {
      rows: [],
      available: true,
      links_considered: 0,
      items_considered: 0,
      window_days: DEMAND_WINDOW_DAYS,
    };
  }

  // ─── 2. Recent items ───
  const { data: capturesRaw } = await session
    .from("pattern_records")
    .select("id, created_at, embedding, context_summary, trigger_signal, signal_detail, judgment")
    .eq("org_id", orgId)
    .eq("status", "complete")
    .gte("created_at", windowStart)
    .order("created_at", { ascending: false })
    .limit(MAX_RECENT_CAPTURES);
  const captures = (capturesRaw ?? []) as unknown as CaptureRow[];

  const { data: signalsRaw } = await session
    .from("learning_signals")
    .select("id, payload, occurred_at")
    .eq("org_id", orgId)
    .in("signal_type", ["retrieval_result_opened", "retrieval_result_used", "knowledge_gap_opened"])
    .gte("occurred_at", windowStart)
    .order("occurred_at", { ascending: false })
    .limit(MAX_RECENT_QUERIES);
  const queries = ((signalsRaw ?? []) as { id: string; payload: { query?: unknown } | null }[])
    .map((s) => (typeof s.payload?.query === "string" ? s.payload.query : null))
    .filter((q): q is string => !!q && q.trim().length > 0);

  // Distinct QUESTIONS, not distinct clicks: the same person clicking twice is
  // one recent item, and counting it twice would inflate every warning.
  const distinctQueries = Array.from(new Set(queries.map((q) => normalize(q)))).filter(Boolean);

  const captureText = new Map<string, string>();
  const captureVec = new Map<string, number[] | null>();
  for (const c of captures) {
    captureText.set(
      c.id,
      normalize(
        [c.trigger_signal, c.signal_detail, c.context_summary, c.judgment]
          .filter(Boolean)
          .join(" ")
      )
    );
    captureVec.set(c.id, parsePgVector(c.embedding));
  }

  const itemsConsidered = captures.length + distinctQueries.length;

  // ─── 3. Fire ───
  const fired: { link: LinkRow; count: number }[] = [];
  for (const link of links) {
    const antecedentNorm = normalize(link.antecedent_text);
    const linkVec = parsePgVector(link.antecedent_embedding);
    const matched = new Set<string>();

    for (const c of captures) {
      const text = captureText.get(c.id) ?? "";
      if (mentions(text, antecedentNorm)) {
        matched.add(`capture:${c.id}`);
        continue;
      }
      const vec = captureVec.get(c.id);
      if (linkVec && vec && cosine(linkVec, vec) >= PRECEDENCE_MATCH_COSINE) {
        matched.add(`capture:${c.id}`);
      }
    }
    for (const q of distinctQueries) {
      if (mentions(q, antecedentNorm)) matched.add(`query:${q}`);
    }

    // The source pattern itself is not evidence that its own prediction is
    // coming true. Exclude it, always.
    matched.delete(`capture:${link.source_pattern_id}`);

    if (matched.size >= PRECEDENCE_MIN_MENTIONS) {
      fired.push({ link, count: matched.size });
    }
  }

  if (fired.length === 0) {
    return {
      rows: [],
      available: true,
      links_considered: links.length,
      items_considered: itemsConsidered,
      window_days: DEMAND_WINDOW_DAYS,
    };
  }

  // ─── 4. Attribution. NO SOURCE, NO ROW. ───
  const sourceIds = Array.from(new Set(fired.map((f) => f.link.source_pattern_id)));
  const { data: sourcesRaw } = await session
    .from("pattern_records")
    .select("id, user_id, framework, created_at")
    .in("id", sourceIds);
  const sources = new Map(
    ((sourcesRaw ?? []) as unknown as {
      id: string;
      user_id: string;
      framework: { name?: string | null } | null;
      created_at: string;
    }[]).map((r) => [r.id, r])
  );

  const authorIds = Array.from(new Set(Array.from(sources.values()).map((s) => s.user_id)));
  const { data: peopleRaw } = await session
    .from("profiles")
    .select("id, display_name")
    .in("id", authorIds.length > 0 ? authorIds : ["00000000-0000-0000-0000-000000000000"]);
  const people = new Map(
    ((peopleRaw ?? []) as { id: string; display_name: string | null }[]).map((p) => [
      p.id,
      p.display_name,
    ])
  );

  const rows: FrameworkWarning[] = [];
  for (const f of fired.sort((a, b) => b.count - a.count)) {
    const source = sources.get(f.link.source_pattern_id);
    const frameworkName = source?.framework?.name?.trim() || null;
    const author = source ? people.get(source.user_id)?.trim() || null : null;
    // ⭐ THE DROP. A warning that cannot name who said it and point at where
    // they said it is a guess, and this product does not render guesses.
    if (!source || !frameworkName || !author) {
      console.warn(
        `precedence: dropped an unsourceable warning (link ${f.link.id}, source ${f.link.source_pattern_id})`
      );
      continue;
    }
    rows.push({
      antecedent: f.link.antecedent_text,
      consequent: f.link.consequent_text,
      recent_mentions: f.count,
      source_record_id: source.id,
      source_framework: frameworkName,
      source_author: author,
      source_captured_at: source.created_at,
    });
    if (rows.length >= MAX_WARNINGS) break;
  }

  return {
    rows,
    available: true,
    links_considered: links.length,
    items_considered: itemsConsidered,
    window_days: DEMAND_WINDOW_DAYS,
  };
}
