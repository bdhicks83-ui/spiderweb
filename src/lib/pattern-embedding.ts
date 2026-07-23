// P-3 (Build 2) — Pattern Record embedding.
//
// One canonical place that answers "what text represents this framework for
// retrieval?" and "embed this record now." Both the auto-embed hook on the
// codify completion path AND the demo-org backfill go through the same text
// composition so the vector space stays consistent.
//
// (The standalone backfill script scripts/backfill-pattern-embeddings.mjs
// follows the repo's copy-don't-import convention for one-off data ops and
// mirrors buildPatternEmbeddingText verbatim — keep the two in sync if you
// change the composition.)
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EntityMapEntry, FrameworkArtifact } from "@/lib/elicitation";
import { embedText } from "@/lib/voyage";

// The columns buildPatternEmbeddingText reads. Exported so the (few) callers
// select exactly this set.
export const EMBED_SOURCE_COLUMNS =
  "context_summary, context_org_size, context_industry, context_function, " +
  "situation_type, intervention_type, trigger_signal, signal_detail, " +
  "judgment, rationale, boundaries, entity_map, framework";

export type EmbedSourceRow = {
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
  entity_map: EntityMapEntry[] | null;
  framework: FrameworkArtifact | null;
};

// Composition rationale (recorded in DECISION-LOG 2026-07-23):
// An employee queries with a SITUATION in natural language, so the embedding is
// weighted toward the situation-facing surfaces of the record — context, the
// signal that was read, when-to-apply, and the observable signals — and still
// carries the play, reasoning, boundaries, and the entity map (internal names
// like a specific press line or "changeover" help concrete queries land). The
// branded framework name/tagline lead because they're the densest summary.
export function buildPatternEmbeddingText(row: EmbedSourceRow): string {
  const parts: string[] = [];
  const push = (label: string, value: string | null | undefined) => {
    if (value && value.trim()) parts.push(`${label}: ${value.trim()}`);
  };
  const pushList = (label: string, values: string[] | null | undefined) => {
    if (values && values.length) parts.push(`${label}: ${values.join(" · ")}`);
  };

  const f = row.framework;
  if (f) {
    push("Framework", f.name);
    push("Summary", f.tagline);
    pushList("When to apply", f.when_to_apply);
  }

  // Situation / context — what the world looked like.
  push("Situation", row.context_summary);
  const ontology = [
    row.context_industry,
    row.context_function,
    row.situation_type,
    row.intervention_type,
    row.context_org_size ? `org size ${row.context_org_size}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  if (ontology) parts.push(`Context: ${ontology}`);

  // The signal — the tacit read (rung 4, highest-value field).
  push("Trigger", row.trigger_signal);
  push("Signal", row.signal_detail);
  if (f) pushList("Signals", f.signals);

  // The play + reasoning.
  push("Play", row.judgment);
  if (f) push("Play detail", f.the_play);
  push("Reasoning", row.rationale);
  if (f) push("Why it works", f.why_it_works);

  // Boundaries — when NOT to apply.
  push("Boundaries", row.boundaries);
  if (f) pushList("Boundaries detail", f.boundaries);

  // Entity map — internal names/roles that make concrete queries land.
  if (row.entity_map && row.entity_map.length) {
    const entities = row.entity_map
      .map((e) => (e.detail ? `${e.name} (${e.type}, ${e.detail})` : `${e.name} (${e.type})`))
      .join(", ");
    parts.push(`Entities: ${entities}`);
  }

  return parts.join("\n");
}

export type EmbedRecordResult =
  | { ok: true }
  | { ok: false; error: string; status: number | null; rateLimited: boolean };

/**
 * Embed one pattern_record by id using the supplied Supabase client. Reads the
 * source fields, composes the retrieval text, embeds it (as a "document"), and
 * writes the vector + embedded_at. The client governs visibility: on the
 * auto-embed path it's the author's RLS client (allowed to update its own row);
 * on backfill it's a service-role client.
 *
 * Best-effort by contract but HONEST: it never reports success on failure. The
 * caller decides whether a failure blocks (backfill: yes, report it) or is
 * tolerated (codify completion: log, leave embedding null for the verify/
 * backfill net to catch — the record is never *silently* claimed as embedded).
 */
export async function embedPatternRecord(
  client: SupabaseClient,
  recordId: string
): Promise<EmbedRecordResult> {
  const { data, error } = await client
    .from("pattern_records")
    .select(EMBED_SOURCE_COLUMNS)
    .eq("id", recordId)
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Record not found", status: null, rateLimited: false };
  }

  const text = buildPatternEmbeddingText(data as unknown as EmbedSourceRow);
  if (!text.trim()) {
    return { ok: false, error: "Record has no embeddable content", status: null, rateLimited: false };
  }

  const embed = await embedText(text, { inputType: "document" });
  if (!embed.ok) {
    return { ok: false, error: embed.error, status: embed.status, rateLimited: embed.rateLimited };
  }

  const { error: updateError } = await client
    .from("pattern_records")
    .update({ embedding: embed.vector, embedded_at: new Date().toISOString() })
    .eq("id", recordId);

  if (updateError) {
    return { ok: false, error: updateError.message, status: null, rateLimited: false };
  }

  return { ok: true };
}
