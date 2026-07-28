// P-7 Build 5 — FORMAT SELF-LEARNING: the org's own track record informs the
// Format Agent.
//
// Since P-7 Builds 1-4, every training attempt has written one row to
// training_format_outcomes (format used · issue type · audience · outcome ·
// leader enhancements), and since P-8 Phase 1 every format choice has written
// a format_choice signal to the learning ledger. Build 5 is the READER over
// that corpus: when the Format Agent ranks formats for a new request (or
// re-recommends after a miss), it now sees WHAT ACTUALLY WORKED IN THIS ORG —
// and the leader sees the same track record on the recommendation cards.
//
// ═══════════════════════════════════════════════════════════════════════════
// THE P-8 GUARDRAILS, HONORED HERE (same doctrine as retrieval-effectiveness):
//
//   1. NO PERSON-KEYED PRIORS. The prior keys on format_key × issue_type ×
//      outcome — populations and shapes, never people. Actor identity is
//      never read, let alone keyed on.
//   2. MINIMUM-N GATE, N ALWAYS SHOWN. Below PRIOR_MIN_RESOLVED resolved
//      outcomes the track record is labeled EARLY, the model prompt is told
//      in so many words not to let it override the learning-science fit
//      rules, and the UI line says "too few to lean on." Counts ship with
//      every surface — the prior can never influence silently.
//   3. EXPLAINABILITY SURVIVES LEARNING. The prompt instructs the agent to
//      SAY when the track record informed its pick ("a job aid has landed
//      here twice on this kind of issue"), and the stored track_record block
//      renders on the format cards. Nothing is hidden scoring.
//
// THE ENHANCEMENT CONFOUND (from the P-7 stub, honored): an effective outcome
// whose row carries leader enhancements is credited to the format CAUTIOUSLY —
// the human's change is part of why it landed. Those counts are reported
// separately everywhere (prompt, storage, UI).
//
// FLAG, NEVER BLOCK: the prior informs the recommendation; it never forces
// one, never reorders the agent's output mechanically, and the leader still
// chooses any format. A prior-read failure degrades to "no track record" —
// it can never take the recommendation down.
//
// CONSUMPTION: format_choice ledger signals this reader uses get
// 'format_prior_v1' appended to consumed_by (best-effort), same doctrine as
// retrieval_effectiveness_v1.
//
// Server-only by client type (takes a service-role SupabaseClient); imports
// nothing that drags in @/lib/claude or fs.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  TRAINING_FORMATS,
  TRAINING_FORMAT_KEYS,
  isTrainingFormatKey,
  type TrainingFormatKey,
} from "@/lib/training-formats";

export const FORMAT_PRIOR_READER = "format_prior_v1";

// A format's track record on an issue type is ESTABLISHED at this many
// resolved outcomes (effective + did_not_land); below it the record is EARLY.
// Deliberately mirrors PROVEN_MIN_EVIDENCE's conservatism (P-8 Phase 2).
export const PRIOR_MIN_RESOLVED = 3;

export type FormatTrackRecord = {
  format_key: TrainingFormatKey;
  attempts: number;
  effective: number;
  did_not_land: number;
  inconclusive: number;
  pending: number;
  /** Effective outcomes whose rows carried leader enhancements — the confound,
   *  reported separately and credited cautiously. */
  enhanced_effective: number;
  /** format_choice ledger evidence: times a leader took this format when
   *  recommended / times a leader overrode AWAY from it when recommended. */
  taken_when_recommended: number;
  overridden_away: number;
};

export type OrgFormatPrior = {
  /** The issue type the slice was computed for (null = unclassified). */
  issue_type: string | null;
  /** True when the applied slice is issue-type-specific; false = org-wide
   *  fallback because this issue type has no resolved outcomes yet. */
  issue_type_matched: boolean;
  /** Resolved outcomes (effective + did_not_land) in the applied slice. */
  resolved_total: number;
  /** 'established' at >= PRIOR_MIN_RESOLVED resolved outcomes, else 'early'. */
  maturity: "early" | "established";
  /** The applied slice, only formats with any evidence. */
  by_format: Partial<Record<TrainingFormatKey, FormatTrackRecord>>;
};

function emptyRecord(key: TrainingFormatKey): FormatTrackRecord {
  return {
    format_key: key,
    attempts: 0,
    effective: 0,
    did_not_land: 0,
    inconclusive: 0,
    pending: 0,
    enhanced_effective: 0,
    taken_when_recommended: 0,
    overridden_away: 0,
  };
}

type OutcomeRow = {
  chosen_format: string;
  outcome: string;
  issue_type: string | null;
  enhancements: unknown[] | null;
};

type ChoiceSignalRow = {
  id: string;
  subject_id: string;
  features: { recommended_format?: unknown; was_override?: unknown } | null;
};

/**
 * Compute the org's format track record for one issue type.
 *
 * Slice rule: if the issue type has at least one RESOLVED outcome, the prior
 * is that slice (the honest, specific evidence). Otherwise it falls back to
 * the org-wide record and says so — cross-issue evidence is weaker and the
 * label carries that.
 *
 * Never throws: any read failure returns null (no track record), because a
 * learning outage must never take the recommendation path down.
 */
export async function computeFormatPrior(
  service: SupabaseClient,
  orgId: string,
  issueType: string | null
): Promise<OrgFormatPrior | null> {
  try {
    const [outcomesRes, signalsRes] = await Promise.all([
      service
        .from("training_format_outcomes")
        .select("chosen_format, outcome, issue_type, enhancements")
        .eq("org_id", orgId),
      service
        .from("learning_signals")
        .select("id, subject_id, features")
        .eq("org_id", orgId)
        .eq("signal_type", "format_choice"),
    ]);
    if (outcomesRes.error) {
      console.warn(`[format-prior] outcomes read failed: ${outcomesRes.error.message}`);
      return null;
    }
    if (signalsRes.error) {
      // Choice evidence is supplementary — outcomes alone still make a prior.
      console.warn(`[format-prior] choice signals read failed: ${signalsRes.error.message}`);
    }
    const outcomes = (outcomesRes.data || []) as unknown as OutcomeRow[];
    const signals = (signalsRes.data || []) as unknown as ChoiceSignalRow[];

    const aggregate = (rows: OutcomeRow[]): Partial<Record<TrainingFormatKey, FormatTrackRecord>> => {
      const out: Partial<Record<TrainingFormatKey, FormatTrackRecord>> = {};
      for (const row of rows) {
        if (!isTrainingFormatKey(row.chosen_format)) continue;
        const rec = out[row.chosen_format] ?? (out[row.chosen_format] = emptyRecord(row.chosen_format));
        rec.attempts++;
        const enhanced = Array.isArray(row.enhancements) && row.enhancements.length > 0;
        if (row.outcome === "effective") {
          rec.effective++;
          if (enhanced) rec.enhanced_effective++;
        } else if (row.outcome === "did_not_land") rec.did_not_land++;
        else if (row.outcome === "inconclusive") rec.inconclusive++;
        else rec.pending++;
      }
      return out;
    };

    const typed = issueType ? outcomes.filter((o) => o.issue_type === issueType) : [];
    const typedAgg = aggregate(typed);
    const typedResolved = Object.values(typedAgg).reduce(
      (n, r) => n + (r ? r.effective + r.did_not_land : 0),
      0
    );

    const useTyped = typedResolved > 0;
    const by_format = useTyped ? typedAgg : aggregate(outcomes);
    const resolved_total = useTyped
      ? typedResolved
      : Object.values(by_format).reduce((n, r) => n + (r ? r.effective + r.did_not_land : 0), 0);

    // ── The choice evidence (ledger): takes and overrides, per format ──
    const consumedIds: string[] = [];
    for (const s of signals) {
      const wasOverride = s.features?.was_override === true;
      const recommended = s.features?.recommended_format;
      if (wasOverride && isTrainingFormatKey(recommended)) {
        // The leader was recommended `recommended` and walked away from it.
        const rec = by_format[recommended] ?? (by_format[recommended] = emptyRecord(recommended));
        rec.overridden_away++;
        consumedIds.push(s.id);
      } else if (!wasOverride && isTrainingFormatKey(s.subject_id)) {
        const rec = by_format[s.subject_id] ?? (by_format[s.subject_id] = emptyRecord(s.subject_id));
        rec.taken_when_recommended++;
        consumedIds.push(s.id);
      }
    }

    if (resolved_total === 0 && consumedIds.length === 0) {
      // Nothing to learn from at all — the honest prior is no prior.
      return null;
    }

    // ── Stamp consumption (best-effort, never blocking) ──
    if (consumedIds.length > 0) {
      const { error: consumeError } = await service.rpc("mark_learning_signals_consumed", {
        signal_ids: consumedIds,
        reader: FORMAT_PRIOR_READER,
      });
      if (consumeError) {
        console.warn(`[format-prior] consumption stamp skipped: ${consumeError.message}`);
      }
    }

    return {
      issue_type: issueType,
      issue_type_matched: useTyped,
      resolved_total,
      maturity: resolved_total >= PRIOR_MIN_RESOLVED ? "established" : "early",
      by_format,
    };
  } catch (err) {
    console.warn(
      `[format-prior] computation threw and was swallowed: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return null;
  }
}

/**
 * The model-facing rendering of the prior, for the {{track_record}} prompt
 * variable. Includes the minimum-N instruction INSIDE the block so the
 * evidence and its weight limit travel together — a prompt can never receive
 * the counts without the caution.
 */
export function formatPriorForPrompt(prior: OrgFormatPrior | null): string {
  if (!prior || Object.keys(prior.by_format).length === 0) {
    return "(no format outcomes recorded in this organization yet — recommend purely from the fit rules above)";
  }
  const scope = prior.issue_type_matched
    ? `on this issue type (${prior.issue_type})`
    : "across ALL issue types (this issue type has no resolved outcomes yet — cross-issue evidence, weigh it less)";
  const lines: string[] = [`Scope: ${scope}. Resolved outcomes: ${prior.resolved_total}.`];
  for (const key of TRAINING_FORMAT_KEYS) {
    const r = prior.by_format[key];
    if (!r || (r.attempts === 0 && r.taken_when_recommended === 0 && r.overridden_away === 0)) continue;
    const parts: string[] = [];
    if (r.effective > 0) {
      parts.push(
        `landed ${r.effective}/${r.effective + r.did_not_land} resolved` +
          (r.enhanced_effective > 0
            ? ` (${r.enhanced_effective} of those leader-enhanced — credit the format cautiously)`
            : "")
      );
    }
    if (r.did_not_land > 0 && r.effective === 0) parts.push(`did not land ${r.did_not_land}×`);
    if (r.pending > 0) parts.push(`${r.pending} still under watch`);
    if (r.inconclusive > 0) parts.push(`${r.inconclusive} inconclusive`);
    if (r.overridden_away > 0) parts.push(`leaders overrode away from it ${r.overridden_away}× when recommended`);
    if (r.taken_when_recommended > 0) parts.push(`taken as recommended ${r.taken_when_recommended}×`);
    lines.push(`- ${TRAINING_FORMATS[key].name} (${key}): ${parts.join(" · ")}`);
  }
  lines.push(
    prior.maturity === "established"
      ? `WEIGHT: ${prior.resolved_total} resolved outcomes — enough to break ties between otherwise-fitting formats. If the record informs your pick, SAY SO in the rationale in plain language (e.g. "and it has landed here ${prior.resolved_total >= 2 ? "repeatedly" : "before"} on this kind of issue").`
      : `WEIGHT: only ${prior.resolved_total} resolved outcome${prior.resolved_total === 1 ? "" : "s"} — EARLY evidence. It must NOT override the fit rules above; at most mention it as a footnote in the rationale. Never present it as a proven pattern.`
  );
  return lines.join("\n");
}

/**
 * The storage/UI shape kept on training_requests.recommendations.track_record.
 * Compact, display-ready, N always present.
 */
export type StoredTrackRecord = {
  scope: "issue_type" | "org_wide";
  issue_type: string | null;
  resolved_total: number;
  maturity: "early" | "established";
  by_format: {
    format_key: TrainingFormatKey;
    attempts: number;
    effective: number;
    did_not_land: number;
    pending: number;
    enhanced_effective: number;
    overridden_away: number;
  }[];
};

export function storedTrackRecord(prior: OrgFormatPrior | null): StoredTrackRecord | null {
  if (!prior) return null;
  const by_format = TRAINING_FORMAT_KEYS.filter((k) => prior.by_format[k]).map((k) => {
    const r = prior.by_format[k]!;
    return {
      format_key: k,
      attempts: r.attempts,
      effective: r.effective,
      did_not_land: r.did_not_land,
      pending: r.pending,
      enhanced_effective: r.enhanced_effective,
      overridden_away: r.overridden_away,
    };
  });
  if (by_format.length === 0) return null;
  return {
    scope: prior.issue_type_matched ? "issue_type" : "org_wide",
    issue_type: prior.issue_type,
    resolved_total: prior.resolved_total,
    maturity: prior.maturity,
    by_format,
  };
}
