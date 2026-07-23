// P-2 — Conflict X-ray: cross-user conflict detection, org-scoped.
//
// Extends the Phase 8 checkConsistency idea (single-user, insight-level) to
// run CROSS-USER over an org's completed pattern_records. Detection is
// always scoped to ONE org — the query below filters on org_id and nothing
// in this module ever compares records across orgs.
//
// ⭐ LOCKED (2026-07-23): conflict-fire behavior is SURFACE-WITH-WARNING.
// Detection here only ever WRITES ANNOTATION ROWS (framework_conflicts) —
// it never touches pattern_records, their status, or their visibility.
// Both frameworks stay live and retrievable while contested. There is no
// hold/quarantine path, deliberately, extending Phase 7 flag-never-block.
//
// Candidate pairs (cheap, deterministic — no model call, no new embedding
// infrastructure): two records are candidates when they were authored by
// DIFFERENT users in the SAME org and either
//   (a) share an entity from their entity maps (same type + same name,
//       case-insensitive) — the entity map is exactly the "who/what
//       territory does this record claim" signal, or
//   (b) sit in the same ontology cell (situation_type + context_function +
//       intervention_type all equal) — same territory by classification.
// The 0.82 semantic connections layer only covers `insights` today;
// pattern_records get embeddings in P-3 (blocked on the Voyage decision),
// at which point candidate generation can widen to semantic pairs WITHOUT
// changing anything downstream of this function's contract. Documented in
// DECISION-LOG 2026-07-23 (P-2 entry).
//
// Flag rule (the expensive model call, one per candidate pair): a pair is a
// conflict ONLY when checkFrameworkConflict returns overlappingBoundaries
// AND opposingJudgment both true. Similar-topic-but-compatible must not
// flag — false positives are the failure mode, so everything here fails
// open (model hiccup ⇒ no flag, never a spurious one).
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkFrameworkConflict } from "@/lib/claude";
import type { EntityMapEntry, FrameworkArtifact } from "@/lib/elicitation";

// Backstop cap on model calls per scan. At demo-org scale (~16 records) real
// candidate counts sit well under this; the cap only exists so a future
// large org can't turn one scan into hundreds of calls. When it trips, the
// scan reports how many pairs were skipped instead of silently truncating.
export const MAX_PAIRS_PER_SCAN = 40;

export const CONFLICT_RESOLUTIONS = [
  "sharpen_boundaries",
  "reconcile",
  "supersede",
  "escalate",
] as const;

export type ConflictResolution = (typeof CONFLICT_RESOLUTIONS)[number];

export function isConflictResolution(v: unknown): v is ConflictResolution {
  return typeof v === "string" && (CONFLICT_RESOLUTIONS as readonly string[]).includes(v);
}

// Human labels shared by the review UI and the library badge.
export const RESOLUTION_LABEL: Record<ConflictResolution, string> = {
  sharpen_boundaries: "Sharpen boundaries",
  reconcile: "Reconcile",
  supersede: "Supersede",
  escalate: "Escalate",
};

// The slice of a pattern_records row detection needs.
export type ConflictCandidateRecord = {
  id: string;
  user_id: string;
  org_id: string | null;
  created_at: string;
  context_summary: string | null;
  context_function: string | null;
  situation_type: string | null;
  intervention_type: string | null;
  trigger_signal: string | null;
  judgment: string | null;
  rationale: string | null;
  boundaries: string | null;
  entity_map: EntityMapEntry[];
  framework: FrameworkArtifact | null;
};

export const CONFLICT_RECORD_COLUMNS =
  "id, user_id, org_id, created_at, context_summary, context_function, " +
  "situation_type, intervention_type, trigger_signal, judgment, rationale, " +
  "boundaries, entity_map, framework";

// ─── Candidate pairing (deterministic, no model) ───────────────────────────

export function sharesEntity(
  a: ConflictCandidateRecord,
  b: ConflictCandidateRecord
): boolean {
  const bKeys = new Set(
    (b.entity_map || []).map((e) => `${e.type}|${e.name.trim().toLowerCase()}`)
  );
  return (a.entity_map || []).some((e) =>
    bKeys.has(`${e.type}|${e.name.trim().toLowerCase()}`)
  );
}

export function sameOntologyCell(
  a: ConflictCandidateRecord,
  b: ConflictCandidateRecord
): boolean {
  return (
    !!a.situation_type &&
    !!a.context_function &&
    !!a.intervention_type &&
    a.situation_type === b.situation_type &&
    a.context_function === b.context_function &&
    a.intervention_type === b.intervention_type
  );
}

export function isCandidatePair(
  a: ConflictCandidateRecord,
  b: ConflictCandidateRecord
): boolean {
  if (a.user_id === b.user_id) return false; // cross-USER only
  return sharesEntity(a, b) || sameOntologyCell(a, b);
}

// All candidate pairs, normalized so pair.a.id < pair.b.id (matches the
// framework_conflict_pair_order constraint — one pair, one possible row).
export function findCandidatePairs(
  records: ConflictCandidateRecord[]
): { a: ConflictCandidateRecord; b: ConflictCandidateRecord }[] {
  const pairs: { a: ConflictCandidateRecord; b: ConflictCandidateRecord }[] = [];
  for (let i = 0; i < records.length; i++) {
    for (let j = i + 1; j < records.length; j++) {
      const x = records[i];
      const y = records[j];
      if (!isCandidatePair(x, y)) continue;
      const [a, b] = x.id < y.id ? [x, y] : [y, x];
      pairs.push({ a, b });
    }
  }
  return pairs;
}

// ─── Prompt formatting ─────────────────────────────────────────────────────

// Compact, model-facing summary of one record. Names stay in (org-internal
// surface — the P-0.5 PII split applies at export, not here).
export function formatRecordForConflict(r: ConflictCandidateRecord): string {
  const f = r.framework;
  const entities = (r.entity_map || [])
    .map((e) => `${e.type}: ${e.name}${e.detail ? ` (${e.detail})` : ""}`)
    .join("; ");
  const lines = [
    f ? `Framework name: ${f.name}` : "Framework name: (not yet rendered)",
    f ? `Tagline: ${f.tagline}` : null,
    `Context: ${r.context_summary ?? "(none)"}`,
    `Classification: situation=${r.situation_type ?? "?"} · function=${r.context_function ?? "?"} · intervention=${r.intervention_type ?? "?"}`,
    `Trigger/Signal: ${r.trigger_signal ?? "(none)"}`,
    `Judgment (the play): ${r.judgment ?? "(none)"}`,
    `Rationale: ${r.rationale ?? "(none)"}`,
    `Boundaries (when NOT to apply): ${r.boundaries ?? "(none)"}`,
    `Entities: ${entities || "(none)"}`,
  ];
  return lines.filter((l): l is string => l !== null).join("\n");
}

// ─── Detection ─────────────────────────────────────────────────────────────

export type DetectionSummary = {
  scanned: number; // complete records considered
  candidates: number; // cross-user pairs that passed the cheap filter
  checked: number; // pairs actually sent to the model
  skippedExisting: number; // pairs that already have a conflict row (any status)
  skippedCap: number; // pairs dropped by MAX_PAIRS_PER_SCAN (reported, never silent)
  flagged: number; // new conflict rows written
};

// Run detection for ONE org. `service` must be a service-role client
// (framework_conflicts has no insert policy — writes are service-only).
// Existing conflict rows of ANY status suppress re-flagging their pair: a
// resolved conflict is settled history, and re-detection after resolution
// is P-4 efficacy-loop territory, not P-2's.
export async function detectOrgConflicts(
  service: SupabaseClient,
  orgId: string
): Promise<DetectionSummary> {
  const summary: DetectionSummary = {
    scanned: 0,
    candidates: 0,
    checked: 0,
    skippedExisting: 0,
    skippedCap: 0,
    flagged: 0,
  };

  const { data: recordsRaw, error } = await service
    .from("pattern_records")
    .select(CONFLICT_RECORD_COLUMNS)
    .eq("org_id", orgId)
    .eq("status", "complete");
  if (error) throw new Error(`Could not load org records: ${error.message}`);

  const records = (recordsRaw || []) as unknown as ConflictCandidateRecord[];
  summary.scanned = records.length;
  if (records.length < 2) return summary;

  const { data: existingRaw, error: existingError } = await service
    .from("framework_conflicts")
    .select("record_a_id, record_b_id")
    .eq("org_id", orgId);
  if (existingError) {
    throw new Error(`Could not load existing conflicts: ${existingError.message}`);
  }
  const existing = new Set(
    ((existingRaw || []) as { record_a_id: string; record_b_id: string }[]).map(
      (c) => `${c.record_a_id}|${c.record_b_id}`
    )
  );

  const pairs = findCandidatePairs(records);
  summary.candidates = pairs.length;

  let budget = MAX_PAIRS_PER_SCAN;
  for (const { a, b } of pairs) {
    if (existing.has(`${a.id}|${b.id}`)) {
      summary.skippedExisting++;
      continue;
    }
    if (budget <= 0) {
      summary.skippedCap++;
      continue;
    }
    budget--;
    summary.checked++;

    const judgement = await checkFrameworkConflict(
      formatRecordForConflict(a),
      formatRecordForConflict(b)
    );
    // Fail open: a model hiccup means NO flag — never a spurious one.
    if (!judgement) continue;
    // The locked two-condition AND. Both must hold or the pair is compatible.
    if (!judgement.overlappingBoundaries || !judgement.opposingJudgment) continue;

    const { error: insertError } = await service.from("framework_conflicts").insert({
      org_id: orgId,
      record_a_id: a.id,
      record_b_id: b.id,
      territory: judgement.territory,
      rationale:
        judgement.rationale ??
        `Both frameworks claim ${judgement.territory ?? "the same territory"} and prescribe opposing plays.`,
      detected_by: "conflict-xray-v1",
    });
    if (insertError) {
      // A unique-index race (same pair flagged concurrently) is fine to drop.
      console.warn(`conflict insert skipped (${a.id}, ${b.id}): ${insertError.message}`);
      continue;
    }
    summary.flagged++;
  }

  return summary;
}
