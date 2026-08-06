// THE VALUE LEDGER — background jobs.
//
//   1. scorePatternValueJob  (event: ledger/score-pattern)
//      Scores ONE captured framework on four dimensions and emits its
//      `pattern_captured` value event, ONCE, with the score already in
//      quantity_json.
//
//   2. backfillValueLedgerJob (event: ledger/backfill)
//      Emits events for everything that already happened, using TRUE historical
//      dates.
//
// ⭐⭐ WHY THE SCORE AND THE EVENT ARE WRITTEN TOGETHER: value_events is
// APPEND-ONLY and the database enforces it with a trigger. There is no "insert
// now, update with the score later." The job scores first and emits once.
//
// ⭐ A PATTERN THE MODEL CANNOT CONFIDENTLY SCORE IS STILL EMITTED — with
// reproduction_hours null. That row is excluded from every total and counted in
// the excluded number shown on /ledger. Silence would be worse: an unscoreable
// framework that produces no row at all is invisible, and an invisible
// exclusion is an undercount nobody can audit.
import { inngest } from "./client";
import { createClient } from "@supabase/supabase-js";
import { scorePatternValue } from "@/lib/claude";
import { emitValueEvent, valueDedupeKey, type QuantityJson } from "@/lib/value-ledger";
import { finishedTrainingHours, isTrainingFormatKey } from "@/lib/training-formats";
import type { FrameworkArtifact } from "@/lib/elicitation";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SCORE_COLUMNS =
  "id, org_id, user_id, created_at, status, framework, context_summary, " +
  "context_industry, context_function, situation_type, intervention_type, " +
  "trigger_signal, signal_detail, judgment, rationale, boundaries";

type ScoreSourceRow = {
  id: string;
  org_id: string | null;
  user_id: string;
  created_at: string;
  status: string | null;
  framework: FrameworkArtifact | null;
  context_summary: string | null;
  context_industry: string | null;
  context_function: string | null;
  situation_type: string | null;
  intervention_type: string | null;
  trigger_signal: string | null;
  signal_detail: string | null;
  judgment: string | null;
  rationale: string | null;
  boundaries: string | null;
};

/** True when this record already has a pattern_captured event — never double-count. */
async function alreadyScored(recordId: string): Promise<boolean> {
  const { data } = await supabase
    .from("value_events")
    .select("id")
    .eq("event_type", "pattern_captured")
    .eq("subject_type", "pattern_record")
    .eq("subject_id", recordId)
    .limit(1);
  return ((data ?? []) as { id: string }[]).length > 0;
}

/**
 * Score one record and emit its event. Shared by the live job and the backfill
 * so there is exactly one definition of what a `pattern_captured` row looks
 * like. `occurredAt` is ALWAYS the record's real creation date — the ledger is
 * dated history, and a backfill that stamps today would rewrite it.
 */
async function scoreAndEmit(
  record: ScoreSourceRow,
  opts: { backfilled: boolean }
): Promise<{ ok: boolean; scored: boolean; note: string }> {
  if (!record.org_id) return { ok: false, scored: false, note: "record has no org" };
  if (record.status !== "complete") {
    return { ok: false, scored: false, note: "record is not complete" };
  }

  // Years of experience shades HOW hard something was to learn; it is context
  // for the model, never a multiplier. Absent → the prompt says so plainly.
  const { data: prof } = await supabase
    .from("profiles")
    .select("claimed_years_experience")
    .eq("id", record.user_id)
    .maybeSingle();
  const years = (prof as { claimed_years_experience: number | null } | null)
    ?.claimed_years_experience;

  const ontology = [
    record.context_industry,
    record.context_function,
    record.situation_type,
    record.intervention_type,
  ]
    .filter(Boolean)
    .join(" · ");

  const result = await scorePatternValue({
    frameworkName: record.framework?.name ?? "",
    frameworkTagline: record.framework?.tagline ?? "",
    contextSummary: record.context_summary ?? "",
    contextOntology: ontology,
    triggerSignal: record.trigger_signal ?? "",
    signalDetail: record.signal_detail ?? "",
    judgment: record.judgment ?? "",
    rationale: record.rationale ?? "",
    boundaries: record.boundaries ?? "",
    yearsExperience: typeof years === "number" ? String(years) : "",
  });

  const label = record.framework?.name || "This framework";
  const prefix = opts.backfilled ? "[Backfilled from existing records] " : "";

  // Model or parse failure. Still emit, still excluded, and SAY SO in the basis
  // — the excluded count on /ledger must be explainable, not mysterious.
  if (!result.ok) {
    const diag = result.diagnostic;
    await emitValueEvent(supabase, {
      orgId: record.org_id,
      eventType: "pattern_captured",
      occurredAt: record.created_at,
      subjectType: "pattern_record",
      subjectId: record.id,
      contributorId: record.user_id,
      quantity: {
        reproduction_hours: null,
        scarcity: null,
        blast_radius: null,
        half_life_years: null,
      },
      basis:
        `${prefix}${label} could not be valued — the scorer did not return a usable answer` +
        `${diag ? ` (${diag})` : ""}. Excluded from every total rather than given a number.`,
      dedupeKey: valueDedupeKey({ eventType: "pattern_captured", subjectId: record.id }),
    });
    return { ok: true, scored: false, note: "emitted unscored" };
  }
  const score = result.score;

  const quantity: QuantityJson = {
    reproduction_hours: score.reproductionHours,
    scarcity: score.scarcity,
    blast_radius: score.blastRadius,
    half_life_years: score.halfLifeYears,
  };

  // The basis a skeptic reads. The model's own sentence when it gave one, plus
  // the arithmetic inputs stated in plain English — never a currency figure.
  const parts: string[] = [];
  if (score.basis) parts.push(score.basis);
  if (score.reproductionHours !== null) {
    parts.push(
      `Scored at ${score.reproductionHours} senior ${
        score.reproductionHours === 1 ? "hour" : "hours"
      } to rediscover from scratch` +
        (score.scarcity !== null
          ? `, and roughly ${Math.round((1 - score.scarcity) * 100)}% of people in this role could have produced it`
          : "") +
        "."
    );
  } else {
    parts.push(
      "Not confident enough to put an hours figure on this one, so it is excluded from every total."
    );
  }
  if (score.blastRadius) {
    parts.push(`Getting it wrong is a ${score.blastRadius}-consequence event.`);
  }
  if (score.halfLifeYears !== null) {
    parts.push(`Expected to stay true for about ${score.halfLifeYears} years.`);
  }
  // The scorer is forbidden to output currency. If it tried, say so here rather
  // than silently shipping a basis sentence with a hole in it.
  if (score.note) parts.push(`(Note: ${score.note}.)`);

  await emitValueEvent(supabase, {
    orgId: record.org_id,
    eventType: "pattern_captured",
    occurredAt: record.created_at,
    subjectType: "pattern_record",
    subjectId: record.id,
    contributorId: record.user_id,
    quantity,
    basis: `${prefix}${parts.join(" ")}`,
    dedupeKey: valueDedupeKey({ eventType: "pattern_captured", subjectId: record.id }),
  });

  return {
    ok: true,
    scored: score.reproductionHours !== null,
    note: score.reproductionHours !== null ? "scored" : "emitted unscoreable",
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. LIVE SCORER
// ═════════════════════════════════════════════════════════════════════════════

export const scorePatternValueJob = inngest.createFunction(
  { id: "ledger-score-pattern", retries: 2 },
  { event: "ledger/score-pattern" },
  async ({ event, step }) => {
    const recordId = event.data?.record_id as string | undefined;
    if (!recordId) return { skipped: "no record_id" };

    // Idempotent: a retry, a re-send, or a backfill that already covered this
    // record must not produce a second event on an append-only table.
    const done = await step.run("check-already-scored", async () => alreadyScored(recordId));
    if (done) return { skipped: "already scored", recordId };

    const record = await step.run("load-record", async () => {
      const { data } = await supabase
        .from("pattern_records")
        .select(SCORE_COLUMNS)
        .eq("id", recordId)
        .maybeSingle();
      return (data ?? null) as ScoreSourceRow | null;
    });
    if (!record) return { skipped: "record not found", recordId };

    const result = await step.run("score-and-emit", async () =>
      scoreAndEmit(record, { backfilled: false })
    );
    return { recordId, ...result };
  }
);

// ═════════════════════════════════════════════════════════════════════════════
// 2. BACKFILL
//
// ⭐ TRUE HISTORICAL DATES, ALWAYS. Every event below stamps occurred_at from
// the row it describes, never from the moment the backfill ran. A ledger whose
// history all happened on the day somebody pressed a button is not a ledger.
//
// ⭐ EVERY BACKFILLED ROW SAYS SO IN ITS BASIS SENTENCE and carries a
// dedupe_key, so the pass is auditable AND re-runnable without doubling.
// ═════════════════════════════════════════════════════════════════════════════

export const backfillValueLedgerJob = inngest.createFunction(
  { id: "ledger-backfill", retries: 1 },
  { event: "ledger/backfill" },
  async ({ event, step }) => {
    const orgId = event.data?.org_id as string | undefined;
    if (!orgId) return { skipped: "org_id is required" };
    // Scoring is the expensive half. Off by default so the cheap events can be
    // laid down in seconds and the model pass run deliberately.
    const withScoring = event.data?.with_scoring === true;
    const summary: Record<string, number> = {
      pattern_captured: 0,
      answer_applied: 0,
      prescription_effective: 0,
      training_generated: 0,
      gap_closed: 0,
      ramp_compressed: 0,
    };

    // ── 2. answer_applied — every explicit "this helped" already in the ledger ──
    summary.answer_applied = await step.run("backfill-answer-applied", async () => {
      const { data } = await supabase
        .from("learning_signals")
        .select("id, subject_id, occurred_at, actor_id")
        .eq("org_id", orgId)
        .eq("signal_type", "retrieval_result_used")
        .eq("subject_type", "pattern_record");
      const rows = (data ?? []) as {
        id: string;
        subject_id: string;
        occurred_at: string;
        actor_id: string | null;
      }[];
      let n = 0;
      for (const r of rows) {
        const res = await emitValueEvent(supabase, {
          orgId,
          eventType: "answer_applied",
          occurredAt: r.occurred_at,
          subjectType: "retrieval",
          subjectId: r.subject_id,
          contributorId: null,
          quantity: { retrievals: 1, interruption_minutes_avoided: null, rework_probability: null },
          basis:
            "[Backfilled from existing records] Somebody searched the library, opened this " +
            "framework and said it answered their question. One expert interruption that did " +
            "not have to happen.",
          // ⭐ THE SAME KEY THE LIVE WRITER USES — person + framework + day. A
          // backfill run after a month of live use re-derives the identical key
          // for every event already there and adds nothing.
          dedupeKey: valueDedupeKey({
            eventType: "answer_applied",
            subjectId: r.subject_id,
            actorId: r.actor_id,
            occurredAt: r.occurred_at,
          }),
        });
        if (res.ok) n++;
      }
      return n;
    });

    // ── 3. prescription_effective ──
    summary.prescription_effective = await step.run("backfill-prescription-effective", async () => {
      const { data } = await supabase
        .from("prescriptions")
        .select("id, recurrence, efficacy_checked_at, delivered_at, created_at")
        .eq("org_id", orgId)
        .eq("efficacy_status", "effective");
      const rows = (data ?? []) as {
        id: string;
        recurrence: number | null;
        efficacy_checked_at: string | null;
        delivered_at: string | null;
        created_at: string;
      }[];
      let n = 0;
      for (const r of rows) {
        const res = await emitValueEvent(supabase, {
          orgId,
          eventType: "prescription_effective",
          occurredAt: r.efficacy_checked_at ?? r.delivered_at ?? r.created_at,
          subjectType: "prescription",
          subjectId: r.id,
          contributorId: null,
          quantity: {
            incidents_avoided: typeof r.recurrence === "number" ? r.recurrence : null,
            stated_problem_cost: null,
          },
          basis:
            "[Backfilled from existing records] An intervention was delivered and the problem " +
            "stopped recurring across the watch window, on live evidence. Counted at the org's " +
            "own incident cost.",
          dedupeKey: valueDedupeKey({ eventType: "prescription_effective", subjectId: r.id }),
        });
        if (res.ok) n++;
      }
      return n;
    });

    // ── 4. training_generated ──
    summary.training_generated = await step.run("backfill-training-generated", async () => {
      const { data } = await supabase
        .from("training_requests")
        .select("id, status, chosen_format, requested_by, created_at, updated_at")
        .eq("org_id", orgId)
        .in("status", ["generated", "deployed", "closed"]);
      const rows = (data ?? []) as {
        id: string;
        chosen_format: string | null;
        requested_by: string | null;
        created_at: string;
        updated_at: string | null;
      }[];
      let n = 0;
      for (const r of rows) {
        const key = r.chosen_format && isTrainingFormatKey(r.chosen_format) ? r.chosen_format : null;
        const res = await emitValueEvent(supabase, {
          orgId,
          eventType: "training_generated",
          occurredAt: r.updated_at ?? r.created_at,
          subjectType: "training_request",
          subjectId: r.id,
          contributorId: r.requested_by,
          quantity: {
            finished_training_hours: key ? finishedTrainingHours(key) : null,
            format: key,
            altitudes: 3,
          },
          basis:
            "[Backfilled from existing records] A training piece built from your own experts' " +
            "captured judgment. Counted at the finished length of the chosen format, low end" +
            (key ? "." : " — this one has no recorded format, so it is excluded from totals."),
          dedupeKey: valueDedupeKey({ eventType: "training_generated", subjectId: r.id }),
        });
        if (res.ok) n++;
      }
      return n;
    });

    // ── 5. gap_closed ──
    summary.gap_closed = await step.run("backfill-gap-closed", async () => {
      const { data } = await supabase
        .from("knowledge_gaps")
        .select(
          "id, question_text, asked_count, resolved_at, resolved_by, resolved_record_id, first_asked_at"
        )
        .eq("org_id", orgId)
        .eq("status", "resolved");
      const rows = (data ?? []) as {
        id: string;
        question_text: string;
        asked_count: number | null;
        resolved_at: string | null;
        resolved_by: string | null;
        resolved_record_id: string | null;
        first_asked_at: string;
      }[];
      let n = 0;
      for (const r of rows) {
        // ⭐ STORE THE POINTER, NOT THE NUMBER. The scorer may not have run yet
        // (this step deliberately precedes the expensive scoring pass), and
        // value_events is append-only so a null written here could never be
        // corrected. buildLedger() resolves the hours from the pattern_captured
        // event at read time. One source of truth, whatever order they land in.
        const res = await emitValueEvent(supabase, {
          orgId,
          eventType: "gap_closed",
          occurredAt: r.resolved_at ?? r.first_asked_at,
          subjectType: "knowledge_gap",
          subjectId: r.id,
          contributorId: r.resolved_by,
          quantity: {
            reacquisition_hours: null,
            resolved_record_id: r.resolved_record_id,
            coverage_fraction: 1,
            departure_probability: null,
            asked_count: r.asked_count ?? 1,
          },
          basis:
            `[Backfilled from existing records] "${r.question_text}" was asked with nothing to ` +
            `answer it. A captured framework now covers it. Modeled against your own departure ` +
            `probability — no saving is claimed.`,
          dedupeKey: valueDedupeKey({ eventType: "gap_closed", subjectId: r.id }),
        });
        if (res.ok) n++;
      }
      return n;
    });

    // ── 6. ramp_compressed ──
    summary.ramp_compressed = await step.run("backfill-ramp-compressed", async () => {
      const { data: peopleRaw } = await supabase
        .from("profiles")
        .select("id")
        .eq("org_id", orgId);
      const ids = ((peopleRaw ?? []) as { id: string }[]).map((p) => p.id);
      if (ids.length === 0) return 0;
      const { data } = await supabase
        .from("onboarding_progress")
        .select("user_id, track, completed_at")
        .in("user_id", ids)
        .not("completed_at", "is", null);
      const rows = (data ?? []) as {
        user_id: string;
        track: string;
        completed_at: string;
      }[];
      let n = 0;
      for (const r of rows) {
        const res = await emitValueEvent(supabase, {
          orgId,
          eventType: "ramp_compressed",
          occurredAt: r.completed_at,
          subjectType: "onboarding",
          subjectId: `${r.user_id}:${r.track}`,
          contributorId: r.user_id,
          quantity: {
            completion_fraction: 1,
            track: r.track,
            ramp_weeks_saved: null,
            productivity_delta: null,
          },
          basis:
            "[Backfilled from existing records] Somebody finished a structured onboarding track. " +
            "Priced against the ramp weeks your organization credits to a completed track, " +
            "capped at your own average ramp.",
          dedupeKey: valueDedupeKey({ eventType: "ramp_compressed", subjectId: `${r.user_id}:${r.track}` }),
        });
        if (res.ok) n++;
      }
      return n;
    });

    // ── 1. pattern_captured — the expensive one, opt-in ──
    if (withScoring) {
      const records = await step.run("load-unscored-records", async () => {
        const { data } = await supabase
          .from("pattern_records")
          .select(SCORE_COLUMNS)
          .eq("org_id", orgId)
          .eq("status", "complete")
          .order("created_at", { ascending: true });
        return (data ?? []) as unknown as ScoreSourceRow[];
      });

      for (const record of records) {
        // One step per record: each is independently retryable, and a single
        // model hiccup never re-runs the whole pass.
        const done = await step.run(`score-${record.id}`, async () => {
          if (await alreadyScored(record.id)) return { skipped: true };
          const r = await scoreAndEmit(record, { backfilled: true });
          return { skipped: false, ...r };
        });
        if (!("skipped" in done) || done.skipped !== true) summary.pattern_captured++;
      }
    }

    return { orgId, withScoring, summary };
  }
);

export const ledgerFunctions = [scorePatternValueJob, backfillValueLedgerJob];
