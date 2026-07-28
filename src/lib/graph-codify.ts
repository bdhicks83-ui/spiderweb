// P-7 Build 6 — TRAINING FEEDS THE GRAPH.
//
// When an on-demand Training Studio request reaches a RESOLVED state (the
// efficacy loop marks its attempt effective), the winning artifact codifies
// into the knowledge graph as a first-class pattern_records row — retrievable,
// embedded, conflict-checkable, exactly like an approved framework. This is
// the return arrow the product thesis promised: until this build, frameworks
// fed training and nothing ever flowed back.
//
// DOCTRINE, in order:
//   • HUMAN-APPROVES: codification fires only AFTER the training was (a)
//     approved by a leader and (b) verified effective by the efficacy watch on
//     live evidence. Nothing codifies speculatively.
//   • HONEST PROVENANCE: the record's method is 'training_derived' (a real
//     value in the closed method vocabulary, labeled "Codified from training"
//     in the UI) — it never pretends an elicitation session happened. The
//     codified_from column carries format · issue · outcome · attribution ·
//     the link back to the originating request.
//   • ATTRIBUTION SURVIVES: the experts whose frameworks grounded the winning
//     training are carried on codified_from.experts, read straight off the
//     prescription's experts pairing — the same attribution the leader saw.
//   • FLAG, NEVER BLOCK: the new record goes through the SAME contested check
//     as any framework (a targeted P-2 conflict scan for pairs involving this
//     record). A conflict annotates; it never blocks the codification.
//   • NEVER THROWS INTO THE CALLER'S HAPPY PATH: a codification failure must
//     not cost the leader their "it held" close-out. Every entry point warns
//     and returns an honest result object instead.
//
// Uses the columns RESERVED for this since the P-7 stub:
// training_format_outcomes.graph_node_id / graph_synced_at — graph_node_id is
// the new pattern_records id, and a non-null value is the idempotency guard
// (an attempt codifies once, ever).
//
// Server-only (pulls @/lib/claude → fs via the conflict check). NEVER import
// from a client page.
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkFrameworkConflict } from "@/lib/claude";
import {
  formatRecordForConflict,
  isCandidatePair,
  CONFLICT_RECORD_COLUMNS,
  type ConflictCandidateRecord,
} from "@/lib/conflict";
import { embedPatternRecord } from "@/lib/pattern-embedding";
import { TRAINING_FORMATS, isTrainingFormatKey } from "@/lib/training-formats";

// Backstop cap on conflict model calls per codification. The scan is targeted
// (only pairs involving the NEW record), and this route already spent model
// budget on the efficacy check — three pairs covers the realistic candidate
// count at pilot scale; anything past it is reported, never silently dropped.
// The org-wide X-ray (/api/conflicts/detect) remains the completeness net.
export const MAX_CODIFY_CONFLICT_CHECKS = 3;

type StudioEntity = { type: string; name: string; detail: string | null };

type CodifyRequestRow = {
  id: string;
  org_id: string;
  requested_by: string;
  issue_text: string;
  issue_type: string | null;
  issue_restated: string | null;
  subject_entities: StudioEntity[] | null;
  understanding_note: string | null;
  audience_summary: string;
  chosen_format: string | null;
  current_training_id: string | null;
  prescription_id: string | null;
  approved_by: string | null;
  recommendations: { ranked?: { format_key?: string; rationale?: string; citations?: unknown }[] } | null;
};

type OutcomeSlice = {
  id: string;
  attempt: number;
  training_id: string | null;
  graph_node_id: string | null;
  agent_rationale: { format_key?: string; rationale?: string }[] | null;
};

type TrainingSlice = {
  id: string;
  title: string;
  strategy: string;
  altitudes: { floor?: { title?: string; body?: string } } | null;
};

export type CodifyConflictSummary = {
  candidates: number;
  checked: number;
  flagged: number;
  skippedExisting: number;
  skippedCap: number;
};

export type CodifyResult = {
  codified: boolean;
  alreadyCodified: boolean;
  recordId: string | null;
  embedded: boolean;
  conflicts: CodifyConflictSummary | null;
  note: string;
};

const EMPTY_CONFLICTS: CodifyConflictSummary = {
  candidates: 0,
  checked: 0,
  flagged: 0,
  skippedExisting: 0,
  skippedCap: 0,
};

function warnResult(note: string): CodifyResult {
  console.warn(`[graph-codify] ${note}`);
  return {
    codified: false,
    alreadyCodified: false,
    recordId: null,
    embedded: false,
    conflicts: null,
    note,
  };
}

function cleanEntities(entities: StudioEntity[] | null | undefined, issueType: string | null): StudioEntity[] {
  const cleaned = (entities || [])
    .filter(
      (e): e is StudioEntity =>
        !!e && typeof e.name === "string" && e.name.trim().length > 0 && typeof e.type === "string"
    )
    .map((e) => ({
      type: e.type,
      name: e.name.trim(),
      detail: typeof e.detail === "string" && e.detail.trim() ? e.detail.trim() : null,
    }));
  if (cleaned.length > 0) return cleaned;
  // The completion gate requires at least one entity. When the request carried
  // none, the honest fallback is the issue territory itself as a process.
  return [{ type: "process", name: issueType?.trim() || "on-demand training issue", detail: null }];
}

function trimTo(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max).trimEnd()}…`;
}

/**
 * Codify one RESOLVED training attempt into the knowledge graph.
 *
 * Idempotent: if the (request, attempt) outcome row already carries a
 * graph_node_id, this returns { alreadyCodified: true } without writing.
 *
 * `service` must be a service-role client (pattern_records is written behind
 * the API route that has already proven the caller's membership — the same
 * lockdown doctrine as every other engine write).
 */
export async function codifyTrainingToGraph(
  service: SupabaseClient,
  args: { requestId: string; attempt: number; outcomeNote: string }
): Promise<CodifyResult> {
  try {
    // ── Load the request in full (the caller's slimmer row is not enough) ──
    const { data: reqRaw, error: reqError } = await service
      .from("training_requests")
      .select(
        "id, org_id, requested_by, issue_text, issue_type, issue_restated, " +
          "subject_entities, understanding_note, audience_summary, chosen_format, " +
          "current_training_id, prescription_id, approved_by, recommendations"
      )
      .eq("id", args.requestId)
      .maybeSingle();
    if (reqError || !reqRaw) {
      return warnResult(`request load failed: ${reqError?.message ?? "not found"}`);
    }
    const request = reqRaw as unknown as CodifyRequestRow;

    if (!isTrainingFormatKey(request.chosen_format)) {
      return warnResult(`request ${request.id} has no valid chosen_format — nothing to codify`);
    }
    const formatKey = request.chosen_format;
    const formatName = TRAINING_FORMATS[formatKey].name;

    // ── Idempotency: the reserved graph column IS the guard ──
    const { data: outRaw, error: outError } = await service
      .from("training_format_outcomes")
      .select("id, attempt, training_id, graph_node_id, agent_rationale")
      .eq("training_request_id", request.id)
      .eq("attempt", args.attempt)
      .maybeSingle();
    if (outError) {
      return warnResult(`outcome load failed: ${outError.message}`);
    }
    const outcome = (outRaw as unknown as OutcomeSlice | null) ?? null;
    if (outcome?.graph_node_id) {
      return {
        codified: false,
        alreadyCodified: true,
        recordId: outcome.graph_node_id,
        embedded: true,
        conflicts: null,
        note: "This attempt already codified into the graph.",
      };
    }

    // ── The winning artifact ──
    const trainingId = outcome?.training_id ?? request.current_training_id;
    if (!trainingId) {
      return warnResult(`request ${request.id} has no training artifact to codify`);
    }
    const { data: trRaw, error: trError } = await service
      .from("prescription_trainings")
      .select("id, title, strategy, altitudes")
      .eq("id", trainingId)
      .maybeSingle();
    if (trError || !trRaw) {
      return warnResult(`training load failed: ${trError?.message ?? "not found"}`);
    }
    const training = trRaw as unknown as TrainingSlice;
    const floorBody = training.altitudes?.floor?.body ?? "";

    // ── Attribution: the experts whose frameworks grounded this training ──
    let expertPairs: { user_id: string; record_id: string }[] = [];
    if (request.prescription_id) {
      const { data: rxRaw } = await service
        .from("prescriptions")
        .select("experts")
        .eq("id", request.prescription_id)
        .maybeSingle();
      const raw = (rxRaw as { experts?: unknown } | null)?.experts;
      if (Array.isArray(raw)) {
        expertPairs = raw.filter(
          (e): e is { user_id: string; record_id: string } =>
            !!e && typeof e === "object" && typeof (e as { user_id?: unknown }).user_id === "string"
        );
      }
    }
    const expertUserIds = [...new Set(expertPairs.map((e) => e.user_id))];
    const nameById = new Map<string, string>();
    if (expertUserIds.length > 0) {
      const { data: profs } = await service
        .from("profiles")
        .select("id, display_name")
        .in("id", expertUserIds);
      for (const p of (profs || []) as { id: string; display_name: string | null }[]) {
        if (p.display_name) nameById.set(p.id, p.display_name);
      }
    }
    const sourceRecordIds = [...new Set(expertPairs.map((e) => e.record_id).filter(Boolean))];
    const frameworkNameById = new Map<string, string | null>();
    if (sourceRecordIds.length > 0) {
      const { data: srcRaw } = await service
        .from("pattern_records")
        .select("id, framework")
        .in("id", sourceRecordIds);
      for (const r of (srcRaw || []) as { id: string; framework: { name?: string } | null }[]) {
        frameworkNameById.set(r.id, r.framework?.name ?? null);
      }
    }
    const experts = expertPairs.map((e) => ({
      user_id: e.user_id,
      name: nameById.get(e.user_id) ?? "an org expert",
      record_id: e.record_id,
      framework_name: frameworkNameById.get(e.record_id) ?? null,
    }));
    const expertNames = [...new Set(experts.map((e) => e.name))];

    // ── The winning attempt's rationale (the Format Agent's cited reasoning) ──
    const rationaleFromLog = (outcome?.agent_rationale || []).find(
      (r) => r?.format_key === formatKey
    )?.rationale;
    const rationaleFromRec = (request.recommendations?.ranked || []).find(
      (r) => r?.format_key === formatKey
    )?.rationale;
    const chosenRationale =
      rationaleFromLog ??
      rationaleFromRec ??
      `Chosen by the leader as a ${formatName.toLowerCase()}.`;

    const issue = request.issue_restated ?? request.issue_text;
    const entityMap = cleanEntities(request.subject_entities, request.issue_type);
    const ownerId = request.approved_by ?? request.requested_by;
    const now = new Date().toISOString();

    // ── The graph node: a complete, retrievable pattern_records row ──
    // trigger_type 'judgment' deliberately: a training-derived record is
    // codified JUDGMENT. It is not a 'win' (which would leak into the Win
    // Column's mention rollup) and not 'concern'/'friction' (which would feed
    // Coaching Watch). Both person-level surfaces stay structurally untouched.
    const builtFrom =
      expertNames.length > 0
        ? `Built from codified frameworks by ${expertNames.join(", ")}.`
        : "Built from the org's codified frameworks.";
    const record = {
      user_id: ownerId,
      org_id: request.org_id,
      status: "complete",
      trigger_type: "judgment",
      method: "training_derived",
      intervention_type: "Re-skill",
      context_summary: `On-demand training request, resolved: ${issue} Audience: ${request.audience_summary}.`,
      trigger_signal: request.issue_text,
      signal_detail: request.understanding_note ?? issue,
      judgment: `Deploy a ${formatName} — "${training.title}" (${training.strategy}). ${builtFrom}`,
      rationale: `${chosenRationale} Verified in practice: ${args.outcomeNote}`,
      boundaries:
        `Proven for this audience (${request.audience_summary}) on this issue — re-check fit before reusing ` +
        `for a different audience or a different failure mode. Codified from a resolved training run, not a ` +
        `first-person elicitation session; the originating request carries the full artifact and history.`,
      outcome: args.outcomeNote,
      qa_pairs: [],
      entity_map: entityMap,
      framework: {
        name: training.title,
        tagline: `${formatName} that resolved: ${trimTo(issue, 140)}`,
        when_to_apply: [trimTo(issue, 200), `Audience: ${request.audience_summary}`],
        signals: [trimTo(request.issue_text, 200), ...entityMap.slice(0, 3).map((e) => e.name)],
        the_play: floorBody
          ? trimTo(floorBody, 900)
          : `Run the "${training.title}" ${formatName.toLowerCase()} (${training.strategy}) with the target audience.`,
        why_it_works: `${chosenRationale} Proven by the efficacy watch: ${args.outcomeNote}`,
        boundaries: [
          `Built for ${request.audience_summary} — re-check fit for a different audience or issue.`,
          "Codified from a resolved training run; open the originating request for the full artifact.",
        ],
      },
      codified_from: {
        kind: "training_studio",
        training_request_id: request.id,
        training_id: training.id,
        prescription_id: request.prescription_id,
        attempt: args.attempt,
        format_key: formatKey,
        format_name: formatName,
        issue_type: request.issue_type,
        issue_restated: request.issue_restated,
        audience_summary: request.audience_summary,
        outcome: "effective",
        outcome_note: args.outcomeNote,
        experts,
        codified_at: now,
      },
    };

    const { data: insRaw, error: insError } = await service
      .from("pattern_records")
      .insert(record)
      .select("id")
      .single();
    if (insError || !insRaw) {
      return warnResult(`graph node insert failed: ${insError?.message ?? "no row returned"}`);
    }
    const recordId = (insRaw as { id: string }).id;

    // ── Stamp the reserved graph columns (the other direction of the link) ──
    if (outcome) {
      const { error: linkError } = await service
        .from("training_format_outcomes")
        .update({ graph_node_id: recordId, graph_synced_at: now })
        .eq("id", outcome.id);
      if (linkError) {
        console.warn(`[graph-codify] graph link write skipped: ${linkError.message}`);
      }
    }

    // ── Same contested check as any framework (targeted, flag-never-block) ──
    const conflicts = await checkConflictsForNewRecord(service, request.org_id, recordId);

    // ── Embed so retrieval can find it. The reseed step is historically
    //    unreliable — verify-p3.mjs / backfill-pattern-embeddings.mjs remain
    //    the net, and `embedded` is reported honestly either way. ──
    const embed = await embedPatternRecord(service, recordId);
    if (!embed.ok) {
      console.warn(`[graph-codify] embed failed for ${recordId}: ${embed.error} — run backfill-pattern-embeddings.mjs`);
    }

    return {
      codified: true,
      alreadyCodified: false,
      recordId,
      embedded: embed.ok,
      conflicts,
      note: embed.ok
        ? "Codified into the library, embedded, retrievable."
        : "Codified into the library, but the embedding write failed — run backfill-pattern-embeddings.mjs, then verify-p3.mjs.",
    };
  } catch (err) {
    return warnResult(
      `codification threw and was swallowed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

// A TARGETED P-2 scan: only pairs involving the newly codified record, capped.
// Reuses the X-ray's own candidate rule + model check + two-condition AND, so
// a training-derived record is contested by exactly the same standard as a
// framework. Fails open (a model hiccup means no flag, never a spurious one).
async function checkConflictsForNewRecord(
  service: SupabaseClient,
  orgId: string,
  newRecordId: string
): Promise<CodifyConflictSummary> {
  const summary: CodifyConflictSummary = { ...EMPTY_CONFLICTS };
  try {
    const { data: recordsRaw, error } = await service
      .from("pattern_records")
      .select(CONFLICT_RECORD_COLUMNS)
      .eq("org_id", orgId)
      .eq("status", "complete");
    if (error) {
      console.warn(`[graph-codify] conflict scan skipped: ${error.message}`);
      return summary;
    }
    const records = (recordsRaw || []) as unknown as ConflictCandidateRecord[];
    const fresh = records.find((r) => r.id === newRecordId);
    if (!fresh) return summary;

    const { data: existingRaw } = await service
      .from("framework_conflicts")
      .select("record_a_id, record_b_id")
      .eq("org_id", orgId);
    const existing = new Set(
      ((existingRaw || []) as { record_a_id: string; record_b_id: string }[]).map(
        (c) => `${c.record_a_id}|${c.record_b_id}`
      )
    );

    const candidates = records.filter((r) => r.id !== newRecordId && isCandidatePair(fresh, r));
    summary.candidates = candidates.length;

    let budget = MAX_CODIFY_CONFLICT_CHECKS;
    for (const other of candidates) {
      const [a, b] = fresh.id < other.id ? [fresh, other] : [other, fresh];
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
      if (!judgement) continue; // fail open
      if (!judgement.overlappingBoundaries || !judgement.opposingJudgment) continue;

      const { error: insertError } = await service.from("framework_conflicts").insert({
        org_id: orgId,
        record_a_id: a.id,
        record_b_id: b.id,
        territory: judgement.territory,
        rationale:
          judgement.rationale ??
          `Both claim ${judgement.territory ?? "the same territory"} and prescribe opposing plays.`,
        detected_by: "graph-codify-v1",
      });
      if (insertError) {
        console.warn(`[graph-codify] conflict insert skipped (${a.id}, ${b.id}): ${insertError.message}`);
        continue;
      }
      summary.flagged++;
    }
    if (summary.skippedCap > 0) {
      console.warn(
        `[graph-codify] conflict scan capped: ${summary.skippedCap} candidate pair(s) unchecked — the org-wide X-ray covers them on its next run.`
      );
    }
  } catch (err) {
    console.warn(
      `[graph-codify] conflict scan threw and was swallowed: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
  return summary;
}
