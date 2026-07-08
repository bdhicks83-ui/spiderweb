// Phase 6 — Consultative Ask: shared pieces between the /api/ask routes.
// Lives here (not in a route.ts) because Next.js route files may only
// export HTTP handlers.
import type { SupabaseClient } from "@supabase/supabase-js";

// Hard cap on follow-up questions — the model should stop earlier once it
// has enough context.
export const MAX_FOLLOWUPS = 4;

export type Match = { id: string; content: string; similarity: number };

// Shape stored in ask_sessions.matched_insights and returned to the UI.
export function toSources(matches: Match[]) {
  return matches.map((m) => ({
    id: m.id,
    excerpt:
      m.content.length > 160 ? `${m.content.slice(0, 157)}...` : m.content,
    similarity: Math.round(m.similarity * 100) / 100,
  }));
}

// Phase 5 (Step 5) — Case Evidence: a real-world example that illustrates a
// principle, surfaced alongside the answer.
export type CaseExample = {
  id: string;
  situation: string | null;
  action: string | null;
  outcome: string | null;
  lesson: string | null;
  illustrates: string | null; // excerpt of the principle it backs up, if known
};

type CaseRow = {
  id: string;
  content: string;
  evidence_type: string | null;
  situation: string | null;
  action: string | null;
  outcome: string | null;
  lesson: string | null;
  related_insight_id: string | null;
};

function excerpt(s: string): string {
  return s.length > 160 ? `${s.slice(0, 157)}...` : s;
}

// Given the insights that matched a query, find case-type evidence to show as
// "Real example" callouts. A case counts if it either (a) matched the query
// directly, or (b) is explicitly linked (related_insight_id) to a matched
// principle. RLS scopes every read to the owner.
export async function gatherCaseExamples(
  supabase: SupabaseClient,
  matches: Match[]
): Promise<CaseExample[]> {
  const ids = matches.map((m) => m.id);
  if (ids.length === 0) return [];

  const { data: rows } = await supabase
    .from("insights")
    .select(
      "id, content, evidence_type, situation, action, outcome, lesson, related_insight_id"
    )
    .in("id", ids);

  const matched = (rows as CaseRow[] | null) || [];
  const byId = new Map(matched.map((r) => [r.id, r]));

  // Principles among the matches — candidates to attach linked cases to.
  const principleIds = matched
    .filter((r) => r.evidence_type !== "case")
    .map((r) => r.id);

  // Cases that matched the query directly.
  const caseRows: CaseRow[] = matched.filter((r) => r.evidence_type === "case");

  // Cases explicitly linked to a matched principle (may not have matched
  // the query text themselves).
  if (principleIds.length > 0) {
    const { data: linked } = await supabase
      .from("insights")
      .select(
        "id, content, evidence_type, situation, action, outcome, lesson, related_insight_id"
      )
      .eq("evidence_type", "case")
      .in("related_insight_id", principleIds);
    for (const r of (linked as CaseRow[] | null) || []) caseRows.push(r);
  }

  // Dedupe and shape.
  const seen = new Set<string>();
  const examples: CaseExample[] = [];
  for (const c of caseRows) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    const principle =
      c.related_insight_id && byId.get(c.related_insight_id)
        ? excerpt(byId.get(c.related_insight_id)!.content)
        : null;
    examples.push({
      id: c.id,
      situation: c.situation,
      action: c.action,
      outcome: c.outcome,
      lesson: c.lesson,
      illustrates: principle,
    });
  }
  return examples;
}

// ─── Phase 5 (Step 8) — Confidence Heatmap ───
//
// The app has per-SOURCE similarity scores, not per-claim ones. To shade the
// answer without any new model/embedding call, we distribute those existing
// scores across the answer's sentences by lexical overlap: a sentence that
// shares more vocabulary with a high-similarity source is better grounded.
// Scores are normalised relative to the best-grounded sentence so the heatmap
// always shows visible contrast.
export type GroundedSentence = { text: string; score: number }; // score 0..1

const STOPWORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "your", "with", "that", "this",
  "have", "from", "they", "will", "would", "there", "their", "what", "when", "which",
  "them", "then", "than", "into", "more", "some", "such", "only", "also", "been",
  "were", "about", "should", "could", "because", "these", "those", "over", "very",
  "just", "like", "make", "made", "much", "many", "most", "your", "yours", "here",
]);

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
  );
}

function splitSentences(text: string): string[] {
  const parts = text.match(/[^.!?]+[.!?]*\s*/g);
  return (parts || [text]).map((s) => s.trim()).filter(Boolean);
}

export function groundClaims(text: string, matches: Match[]): GroundedSentence[] {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return [];

  const sourceTokens = matches.map((m) => ({
    toks: tokens(m.content),
    similarity: m.similarity,
  }));

  const raw = sentences.map((s) => {
    const st = tokens(s);
    if (st.size === 0) return 0;
    let best = 0;
    for (const src of sourceTokens) {
      if (src.toks.size === 0) continue;
      let shared = 0;
      for (const w of st) if (src.toks.has(w)) shared++;
      const overlap = shared / st.size;
      const support = overlap * src.similarity;
      if (support > best) best = support;
    }
    return best;
  });

  const maxRaw = Math.max(...raw);
  return sentences.map((text, i) => ({
    text,
    // Normalise to the strongest sentence; neutral 0.5 when nothing grounds.
    score: maxRaw > 0 ? Math.round((raw[i] / maxRaw) * 100) / 100 : 0.5,
  }));
}

// ─── Phase 6 Slice 2 (Step 6) — Query-gap detection ───

// A "strong" match clears this similarity; fewer than MIN_STRONG of them means
// the topic is thinly covered.
const STRONG_SIMILARITY = 0.7;
const MIN_STRONG = 3;
// Don't log a new coverage gap if an open one this semantically close exists.
const GAP_DEDUP_THRESHOLD = 0.9;

export type GapType = "coverage" | "case_evidence_missing";
export type GapResult = { detected: boolean; type: GapType | null };

// Voyage embedding for an arbitrary string → pgvector literal.
export async function embedText(text: string): Promise<string | null> {
  try {
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      },
      body: JSON.stringify({ input: [text], model: "voyage-large-2" }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return `[${(data.data[0].embedding as number[]).join(",")}]`;
  } catch {
    return null;
  }
}

// Log query gaps after an Ask/Simulate answer. `service` must be a service-role
// client (query_gaps is service-role-write). Returns what to surface inline.
export async function logQueryGaps(
  service: SupabaseClient,
  opts: {
    userId: string;
    question: string;
    questionEmbedding: string | null; // reused from the search when available
    strongMatches: Match[];
    recommendationGaps: string | null; // the model's own "not covered" statement
    examples: CaseExample[];
  }
): Promise<GapResult> {
  const { userId, question, strongMatches, recommendationGaps, examples } = opts;

  const strongCount = strongMatches.filter((m) => m.similarity >= STRONG_SIMILARITY).length;
  const coverageGap = strongCount < MIN_STRONG;
  const modelGap = !!(recommendationGaps && recommendationGaps.trim());

  // Case-evidence gap: the answer leans on well-covered principles but has no
  // real example to back them up.
  const hasStrongPrinciple = strongCount >= 1;
  const caseGap = hasStrongPrinciple && examples.length === 0;

  let embedding = opts.questionEmbedding;
  if ((coverageGap || modelGap || caseGap) && !embedding) {
    embedding = await embedText(question);
  }

  // Dedupe against existing open gaps on the same topic.
  let hasNearOpenGap = false;
  if (embedding) {
    const { data: near } = await service.rpc("match_open_gaps", {
      query_embedding: embedding,
      p_user_id: userId,
      match_threshold: GAP_DEDUP_THRESHOLD,
    });
    hasNearOpenGap = Array.isArray(near) && near.length > 0;
  }

  let detected: GapType | null = null;

  if (coverageGap || modelGap) {
    detected = "coverage";
    if (!hasNearOpenGap) {
      await service.from("query_gaps").insert({
        user_id: userId,
        question_text: question,
        matched_insight_count: strongCount,
        gap_description: modelGap
          ? recommendationGaps!.trim()
          : `Thin coverage — fewer than ${MIN_STRONG} strong matches for this question.`,
        gap_type: "coverage",
        question_embedding: embedding,
      });
    }
  } else if (caseGap) {
    detected = "case_evidence_missing";
    if (!hasNearOpenGap) {
      await service.from("query_gaps").insert({
        user_id: userId,
        question_text: question,
        matched_insight_count: strongCount,
        gap_description:
          "You have principles on this, but no real example to back them up.",
        gap_type: "case_evidence_missing",
        question_embedding: embedding,
      });
    }
  }

  return { detected: detected !== null, type: detected };
}

// Step 6.5 — when a new insight is embedded, resolve any open gaps it answers.
export async function resolveGapsForInsight(
  service: SupabaseClient,
  userId: string,
  insightEmbedding: string,
  threshold = 0.75
): Promise<number> {
  const { data: gaps } = await service.rpc("match_open_gaps", {
    query_embedding: insightEmbedding,
    p_user_id: userId,
    match_threshold: threshold,
  });
  const ids = (gaps as { id: string }[] | null)?.map((g) => g.id) ?? [];
  if (ids.length === 0) return 0;
  await service.from("query_gaps").update({ resolved: true }).in("id", ids);
  return ids.length;
}
