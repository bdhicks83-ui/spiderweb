// P-8 Phase 2 — THE FIRST READER: retrieval learns from training outcomes.
//
// /retrieve has ranked by cosine similarity alone since P-3. This module
// computes an EFFECTIVENESS signal per retrievable record from what the org
// actually experienced:
//
//   • DIRECT — the record IS a codified training whose attempt the efficacy
//     watch verified effective (training_format_outcomes.outcome='effective'
//     with graph_node_id = this record). The strongest evidence in the system:
//     the problem stopped recurring, on live records.
//   • GROUNDED — the record's framework grounded a training run whose
//     prescription the efficacy loop closed as effective (prescriptions.experts
//     carries {record_id}). The expert's judgment, proven one step removed.
//   • HELPED — a person explicitly said "this helped" after retrieving it
//     (learning_signals.retrieval_result_used, verdict positive — the P-8
//     signal 7 capture, finally read). Distinct actors, so one enthusiastic
//     clicker is one unit of evidence, not five.
//
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ THE THIN-DATA GUARDRAIL (mandatory — the reader tells the truth about how
// much it actually knows).
//
// Brian chose to activate this reader BEFORE pilot data exists, eyes open.
// The price of going live thin is honesty in the label:
//
//   'proven'  requires BOTH an efficacy-verified resolution (direct or
//             grounded — a watch verdict, not an opinion) AND total evidence
//             ≥ PROVEN_MIN_EVIDENCE. Below that bar the signal is
//   'early'   — shown, used for a smaller re-rank, and labeled as early. A
//             handful of records must never be dressed up as learned
//             intelligence.
//
// P-8 GUARDRAIL 2 (minimum-N, N ALWAYS SHOWN) is honored: `n` ships with the
// signal and the UI prints it. GUARDRAIL 3 (explainability): `evidence` is
// human-readable sentences the card shows — why this ranked higher, in words.
// GUARDRAIL 1 (no person-keyed priors): everything here keys on record ids
// and outcome rows; actor_id is only ever COUNTED (distinct), never keyed on.
// ═══════════════════════════════════════════════════════════════════════════
//
// RANKING CONTRACT: the 0.75 semantic threshold stays the retrieval GATE.
// Effectiveness re-ranks WITHIN matches via a small additive boost — it can
// reorder results that already cleared the bar; it can never admit one that
// didn't, and it never changes the displayed similarity.
//
// CONSUMPTION: every learning_signals row this reader uses gets
// 'retrieval_effectiveness_v1' appended to consumed_by (best-effort, never
// blocking) — the P-8 audit query now returns real numbers instead of
// 100%-unconsumed.
//
// Server-only by client type (takes a service-role SupabaseClient); imports
// nothing that drags in @/lib/claude or fs.
import type { SupabaseClient } from "@supabase/supabase-js";
import { TRAINING_FORMATS, isTrainingFormatKey } from "@/lib/training-formats";

export const RETRIEVAL_EFFECTIVENESS_READER = "retrieval_effectiveness_v1";

// 'proven' needs at least this much total evidence (resolutions + distinct
// helpers), INCLUDING at least one watch-verified resolution. Three is
// deliberately conservative for a thin-data launch: one resolution plus two
// independent "this helped" judgments, or two resolutions and one helper.
export const PROVEN_MIN_EVIDENCE = 3;

// Additive re-rank boosts, applied to the sort key only (never the displayed
// similarity). Sized against the live similarity band: on-topic matches spread
// roughly 0.75-0.88, so 0.04 lets a proven record pass a near-peer (a few
// points of cosine) but never lets a marginal 0.76 leapfrog a bullseye 0.85.
// The early boost is a nudge within ties, deliberately smaller.
export const PROVEN_BOOST = 0.04;
export const EARLY_BOOST = 0.015;

export type EffectivenessLevel = "proven" | "early";

export type RecordEffectiveness = {
  level: EffectivenessLevel;
  /** Total evidence count — GUARDRAIL 2 says this ships and gets displayed. */
  n: number;
  /** Watch-verified resolutions (direct + grounded). */
  resolved_count: number;
  /** Distinct people who said "this helped". */
  helped_count: number;
  /** Human-readable why — the explainability surface. */
  evidence: string[];
  /** The boost applied to the sort key, for the log and the API payload. */
  boost: number;
};

export function effectivenessBoost(level: EffectivenessLevel): number {
  return level === "proven" ? PROVEN_BOOST : EARLY_BOOST;
}

type OutcomeRow = {
  graph_node_id: string | null;
  chosen_format: string;
  outcome_note: string | null;
};

type PrescriptionRow = {
  id: string;
  experts: { user_id?: string; record_id?: string }[] | null;
  efficacy_note: string | null;
};

type SignalRow = {
  id: string;
  subject_id: string;
  actor_id: string | null;
};

/**
 * Compute the effectiveness signal for a set of retrieved records, org-scoped.
 * Returns a map keyed by record id; records with zero evidence are absent.
 *
 * Read failures degrade to "no signal" with a warn — an effectiveness outage
 * must never take down retrieval (flag-never-block applies to plumbing too).
 */
export async function computeRetrievalEffectiveness(
  service: SupabaseClient,
  orgId: string,
  recordIds: string[]
): Promise<Record<string, RecordEffectiveness>> {
  const out: Record<string, RecordEffectiveness> = {};
  if (!orgId || recordIds.length === 0) return out;

  try {
    // ── The three evidence reads, in parallel ──
    const [outcomesRes, prescriptionsRes, signalsRes] = await Promise.all([
      service
        .from("training_format_outcomes")
        .select("graph_node_id, chosen_format, outcome_note")
        .eq("org_id", orgId)
        .eq("outcome", "effective")
        .in("graph_node_id", recordIds),
      service
        .from("prescriptions")
        .select("id, experts, efficacy_note")
        .eq("org_id", orgId)
        .eq("efficacy_status", "effective"),
      service
        .from("learning_signals")
        .select("id, subject_id, actor_id")
        .eq("org_id", orgId)
        .eq("subject_type", "pattern_record")
        .eq("signal_type", "retrieval_result_used")
        .eq("verdict", "positive")
        .in("subject_id", recordIds),
    ]);

    if (outcomesRes.error) console.warn(`[retrieval-effectiveness] outcomes read failed: ${outcomesRes.error.message}`);
    if (prescriptionsRes.error) console.warn(`[retrieval-effectiveness] prescriptions read failed: ${prescriptionsRes.error.message}`);
    if (signalsRes.error) console.warn(`[retrieval-effectiveness] signals read failed: ${signalsRes.error.message}`);

    const outcomes = (outcomesRes.data || []) as unknown as OutcomeRow[];
    const prescriptions = (prescriptionsRes.data || []) as unknown as PrescriptionRow[];
    const signals = (signalsRes.data || []) as unknown as SignalRow[];

    const idSet = new Set(recordIds);

    // DIRECT: this record IS the codified, watch-verified training.
    const direct = new Map<string, OutcomeRow[]>();
    for (const o of outcomes) {
      if (!o.graph_node_id || !idSet.has(o.graph_node_id)) continue;
      const list = direct.get(o.graph_node_id) ?? [];
      list.push(o);
      direct.set(o.graph_node_id, list);
    }

    // GROUNDED: this record's framework grounded an effective training run.
    const grounded = new Map<string, number>();
    for (const rx of prescriptions) {
      const seen = new Set<string>();
      for (const e of rx.experts || []) {
        const rid = e?.record_id;
        if (typeof rid !== "string" || !idSet.has(rid) || seen.has(rid)) continue;
        seen.add(rid);
        grounded.set(rid, (grounded.get(rid) ?? 0) + 1);
      }
    }

    // HELPED: distinct people who said "this helped".
    const helpers = new Map<string, Set<string>>();
    const consumedSignalIds: string[] = [];
    for (const s of signals) {
      if (!idSet.has(s.subject_id)) continue;
      const set = helpers.get(s.subject_id) ?? new Set<string>();
      set.add(s.actor_id ?? s.id); // null actor: each row counts once, honestly
      helpers.set(s.subject_id, set);
      consumedSignalIds.push(s.id);
    }

    for (const id of recordIds) {
      const directRows = direct.get(id) ?? [];
      const groundedCount = grounded.get(id) ?? 0;
      const helpedCount = helpers.get(id)?.size ?? 0;
      const resolvedCount = directRows.length + groundedCount;
      const n = resolvedCount + helpedCount;
      if (n === 0) continue;

      const evidence: string[] = [];
      for (const d of directRows) {
        const fmt = isTrainingFormatKey(d.chosen_format)
          ? TRAINING_FORMATS[d.chosen_format].name.toLowerCase()
          : "training";
        evidence.push(
          `Deployed as a ${fmt} and the problem did not come back — verified by the efficacy watch on live records.`
        );
      }
      if (groundedCount > 0) {
        evidence.push(
          `Grounded ${groundedCount} training run${groundedCount === 1 ? "" : "s"} that resolved a real recurrence.`
        );
      }
      if (helpedCount > 0) {
        evidence.push(
          `${helpedCount} ${helpedCount === 1 ? "person" : "people"} said this helped after retrieving it.`
        );
      }

      // THE THIN-DATA GUARDRAIL: 'proven' needs a watch-verified resolution
      // AND enough total evidence. Everything else is honestly 'early'.
      const level: EffectivenessLevel =
        resolvedCount >= 1 && n >= PROVEN_MIN_EVIDENCE ? "proven" : "early";

      out[id] = {
        level,
        n,
        resolved_count: resolvedCount,
        helped_count: helpedCount,
        evidence,
        boost: effectivenessBoost(level),
      };
    }

    // ── Stamp consumption (P-8 doctrine: the audit must see real reads).
    //    Best-effort: a stamp failure never touches the retrieval response. ──
    if (consumedSignalIds.length > 0) {
      const { error: consumeError } = await service.rpc("mark_learning_signals_consumed", {
        signal_ids: consumedSignalIds,
        reader: RETRIEVAL_EFFECTIVENESS_READER,
      });
      if (consumeError) {
        console.warn(`[retrieval-effectiveness] consumption stamp skipped: ${consumeError.message}`);
      }
    }
  } catch (err) {
    console.warn(
      `[retrieval-effectiveness] computation threw and was swallowed: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  return out;
}
