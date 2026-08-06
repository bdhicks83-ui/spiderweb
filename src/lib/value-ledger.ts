// THE VALUE LEDGER — append-only quantities, priced at read time.
//
// ⛔ SERVER-ONLY. Reaches the service-role client on the aggregate paths.
//
// ═════════════════════════════════════════════════════════════════════════════
// ⚠️⚠️ A STANDING DOCTRINE IS AMENDED HERE — READ BEFORE CHANGING ANYTHING
//
// T1B3 shipped under: "NO DOLLAR FIGURE, ANYWHERE, EVER."
// That rule is AMENDED, NOT DELETED. The amended rule is:
//
//   The system NEVER invents a rate. The customer supplies every rate and every
//   cost assumption. The system supplies only QUANTITIES it can observe, and
//   multiplies. Every figure shows its inputs, its basis and its confidence
//   tier, and every input is editable by the customer.
//
// The original ban existed because a COMPUTED SAVINGS CLAIM is a guess wearing a
// currency symbol. Nothing here claims a saving. This is an
// ASSET-ACQUISITION-COST claim — "here is what this cost to acquire, and what it
// would cost to acquire again" — the same logic an accountant applies to
// inventory. That distinction is load-bearing; do not blur it in code or copy.
//
// The /readout "years of judgment" anchor is UNCHANGED and stays the headline.
// The ledger is ADDITIVE to it.
// ═════════════════════════════════════════════════════════════════════════════
//
// ⭐⭐ THE CORE ARCHITECTURAL DECISION: EVENTS STORE QUANTITIES, NEVER DOLLARS.
// The ledger must be append-only and dated AND a CFO must be able to edit an
// assumption and watch the total move. Storing dollars makes those mutually
// exclusive. Storing quantities makes both true: history is immutable, the
// pricing of history is not.
//
// ⭐ IF A RATE IS MISSING, THE FIGURE IS NOT SHOWN. It is not estimated, not
// defaulted, not "industry averaged." The quantity is shown with its unit and
// the words "no rate entered." A pre-filled default IS an invented number.
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireLeadershipViewer, type LeadershipGate } from "@/lib/leadership-gate";

// ═════════════════════════════════════════════════════════════════════════════
// AUTHORITY
// ═════════════════════════════════════════════════════════════════════════════

export type LedgerGate = LeadershipGate;

/**
 * Same audience as /exposure and (since 2026-08-06) the readout — manager, org
 * admin, or an executive seat. The ledger has no page of its own: it renders
 * inside /readout, and /api/ledger is what feeds it.
 * ⚠️ DRAFT CUSTOMER-FACING COPY (the denial line) — pending Brian.
 */
export async function requireLedgerViewer(session: SupabaseClient): Promise<LedgerGate> {
  return requireLeadershipViewer(session, {
    denial: "The readout is for managers, executives, and account admins.",
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// EVENT VOCABULARY
// ═════════════════════════════════════════════════════════════════════════════

export const VALUE_EVENT_TYPES = [
  "pattern_captured",
  "answer_applied",
  "prescription_effective",
  "training_generated",
  "gap_closed",
  "ramp_compressed",
] as const;
export type ValueEventType = (typeof VALUE_EVENT_TYPES)[number];

export const CONFIDENCE_TIERS = ["realized", "substitution", "modeled"] as const;
export type ConfidenceTier = (typeof CONFIDENCE_TIERS)[number];

export type ValueSubjectType =
  | "pattern_record"
  | "prescription"
  | "training_request"
  | "knowledge_gap"
  | "retrieval"
  | "onboarding";

/**
 * ⚠️ DRAFT CUSTOMER-FACING COPY. The line label and the unit shown for each
 * event type — including in the no-rates-entered state, where the QUANTITY is
 * all there is to show.
 */
export const EVENT_META: Record<
  ValueEventType,
  { label: string; quantityKey: string | null; quantityUnit: string; countUnit: string }
> = {
  pattern_captured: {
    label: "Judgment written down",
    quantityKey: "reproduction_hours",
    quantityUnit: "senior hours to rediscover from scratch",
    countUnit: "frameworks",
  },
  answer_applied: {
    label: "Answers that landed",
    quantityKey: "retrievals",
    quantityUnit: "questions answered without interrupting an expert",
    countUnit: "answers",
  },
  prescription_effective: {
    label: "Problems that stopped",
    quantityKey: "incidents_avoided",
    quantityUnit: "recurrences stopped",
    countUnit: "interventions",
  },
  training_generated: {
    label: "Training built in-house",
    quantityKey: "finished_training_hours",
    quantityUnit: "finished training hours",
    countUnit: "modules",
  },
  gap_closed: {
    label: "Questions that now have answers",
    quantityKey: "reacquisition_hours",
    quantityUnit: "reacquisition hours no longer carried",
    countUnit: "gaps",
  },
  ramp_compressed: {
    label: "People up to speed faster",
    quantityKey: null,
    quantityUnit: "completed onboarding tracks",
    countUnit: "tracks",
  },
};

/**
 * Which customer inputs each event type's price is built from.
 *
 * ⚠️ MIRRORS THE `need(...)` CALLS IN priceEvent(). It is read by
 * toReadoutBlock() to decide which assumptions to print in the reproducibility
 * footnote — so a drift here shows up as a footnote that does not explain the
 * figure above it. Change one, change both.
 */
export const PRICING_INPUTS: Record<ValueEventType, AssumptionKey[]> = {
  pattern_captured: ["senior_loaded_rate"],
  answer_applied: ["expert_interruption_minutes", "expert_interruption_rate"],
  prescription_effective: ["rework_incident_cost"],
  training_generated: ["instructional_design_rate"],
  gap_closed: ["annual_departure_probability", "senior_loaded_rate"],
  ramp_compressed: ["ramp_weeks_credited_per_track", "loaded_salary_annual", "average_ramp_weeks"],
};

/** Mirrors the check constraint in supabase/value-ledger.sql. Change one, change both. */
export const EVENT_TIER: Record<ValueEventType, ConfidenceTier> = {
  pattern_captured: "substitution",
  answer_applied: "realized",
  prescription_effective: "realized",
  training_generated: "substitution",
  gap_closed: "modeled",
  ramp_compressed: "modeled",
};

/**
 * ⭐ QUANTITIES ONLY — NO CURRENCY, NO RATE, NO DOLLARS.
 * The single deliberate exception is `stated_problem_cost`: a number a HUMAN
 * typed about their own operation. Never one this system produced.
 */
export type QuantityJson = Record<string, number | string | boolean | null>;

export type ValueEventRow = {
  id: string;
  org_id: string;
  event_type: ValueEventType;
  occurred_at: string;
  subject_type: ValueSubjectType;
  subject_id: string;
  contributor_id: string | null;
  quantity_json: QuantityJson;
  confidence_tier: ConfidenceTier;
  basis_sentence: string;
  created_at: string;
};

export const VALUE_EVENT_COLUMNS =
  "id, org_id, event_type, occurred_at, subject_type, subject_id, contributor_id, " +
  "quantity_json, confidence_tier, basis_sentence, created_at";

// ═════════════════════════════════════════════════════════════════════════════
// ASSUMPTIONS — CUSTOMER-OWNED, NULL UNTIL THEY SAY OTHERWISE
// ═════════════════════════════════════════════════════════════════════════════

export type ValueAssumptions = {
  org_id: string;
  senior_loaded_rate: number | null;
  expert_interruption_rate: number | null;
  instructional_design_rate: number | null;
  average_ramp_weeks: number | null;
  loaded_salary_annual: number | null;
  rework_incident_cost: number | null;
  expert_interruption_minutes: number | null;
  annual_departure_probability: number | null;
  ramp_weeks_credited_per_track: number | null;
  updated_at: string | null;
  updated_by: string | null;
};

export const ASSUMPTION_COLUMNS =
  "org_id, senior_loaded_rate, expert_interruption_rate, instructional_design_rate, " +
  "average_ramp_weeks, loaded_salary_annual, rework_incident_cost, " +
  "expert_interruption_minutes, annual_departure_probability, " +
  "ramp_weeks_credited_per_track, updated_at, updated_by";

/** Every editable input, in display order, with its unit and plain-English label. */
export const ASSUMPTION_FIELDS = [
  {
    key: "senior_loaded_rate",
    label: "Senior loaded rate",
    unit: "$ / hour",
    help: "Fully loaded hourly cost of one of your senior people.",
  },
  {
    key: "expert_interruption_rate",
    label: "Expert interruption rate",
    unit: "$ / hour",
    help: "What an hour of an expert's time costs when somebody has to go ask them.",
  },
  {
    key: "expert_interruption_minutes",
    label: "Minutes per interruption",
    unit: "minutes",
    help: "How long one unanswered question actually costs — the ask plus getting back into the work.",
  },
  {
    key: "instructional_design_rate",
    label: "Instructional design rate",
    unit: "$ / finished training hour",
    help: "What you'd pay an outside designer to build one finished hour of training.",
  },
  {
    key: "rework_incident_cost",
    label: "Rework incident cost",
    unit: "$",
    help: "What one rework or quality incident costs this operation.",
  },
  {
    key: "loaded_salary_annual",
    label: "Loaded annual salary",
    unit: "$ / year",
    help: "Fully loaded annual cost of the role you're ramping.",
  },
  {
    key: "average_ramp_weeks",
    label: "Average ramp",
    unit: "weeks",
    help: "How long it takes someone in that role to get to full speed.",
  },
  {
    key: "ramp_weeks_credited_per_track",
    label: "Ramp weeks credited per track",
    unit: "weeks",
    help: "How many of those weeks you credit to finishing a structured onboarding track. Capped at the average ramp above.",
  },
  {
    key: "annual_departure_probability",
    label: "Annual departure probability",
    unit: "0–1",
    help: "Your own read on how likely a given person is to leave in a year. Drives every modeled figure.",
  },
] as const;

export type AssumptionKey = (typeof ASSUMPTION_FIELDS)[number]["key"];

export const ASSUMPTION_KEYS: AssumptionKey[] = ASSUMPTION_FIELDS.map((f) => f.key);

export function emptyAssumptions(orgId: string): ValueAssumptions {
  return {
    org_id: orgId,
    senior_loaded_rate: null,
    expert_interruption_rate: null,
    instructional_design_rate: null,
    average_ramp_weeks: null,
    loaded_salary_annual: null,
    rework_incident_cost: null,
    expert_interruption_minutes: null,
    annual_departure_probability: null,
    ramp_weeks_credited_per_track: null,
    updated_at: null,
    updated_by: null,
  };
}

/**
 * ⭐ THE GATE FOR EVERY DOLLAR ON EVERY SURFACE. False → no figure renders
 * anywhere, including the readout block and the PDF. There is no half-populated
 * state that leaves the building.
 */
export function hasAnyRate(a: ValueAssumptions | null): boolean {
  if (!a) return false;
  return ASSUMPTION_KEYS.some((k) => typeof a[k] === "number" && a[k] !== null);
}

export async function readAssumptions(
  client: SupabaseClient,
  orgId: string
): Promise<ValueAssumptions> {
  try {
    const { data } = await client
      .from("value_assumptions")
      .select(ASSUMPTION_COLUMNS)
      .eq("org_id", orgId)
      .maybeSingle();
    if (!data) return emptyAssumptions(orgId);
    return { ...emptyAssumptions(orgId), ...(data as Partial<ValueAssumptions>) };
  } catch {
    // Migration not run yet, or a transient read failure. An absent assumptions
    // row and an unreadable one mean the same thing to every caller: no rates,
    // therefore no figures.
    return emptyAssumptions(orgId);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// EMISSION
// ═════════════════════════════════════════════════════════════════════════════

export type EmitValueEventInput = {
  orgId: string;
  eventType: ValueEventType;
  occurredAt: string;
  subjectType: ValueSubjectType;
  subjectId: string;
  contributorId?: string | null;
  quantity: QuantityJson;
  basis: string;
  /**
   * ⭐ DETERMINISTIC AND REQUIRED. Live writers and the backfill derive the SAME
   * key for the same real-world occurrence — see valueDedupeKey(). That single
   * shared namespace is what makes "run the backfill after a month of live use"
   * safe: the rows already there win, and nothing doubles.
   */
  dedupeKey: string;
};

/**
 * ⭐⭐ THE IDEMPOTENCY CONTRACT. One real-world occurrence → one key, whether the
 * row is written live or laid down by the backfill months later.
 *
 * `answer_applied` is keyed per person per framework per DAY, deliberately: the
 * learning ledger is append-only including repeats (a second click really did
 * happen), but the REALIZED tier is the number a skeptic reads first, and it
 * must not be inflatable by clicking the same card twice. One person saying a
 * framework helped them today is one avoided interruption.
 */
export function valueDedupeKey(input: {
  eventType: ValueEventType;
  subjectId: string;
  actorId?: string | null;
  occurredAt?: string;
  track?: string;
}): string {
  switch (input.eventType) {
    case "answer_applied": {
      const day = (input.occurredAt ?? new Date().toISOString()).slice(0, 10);
      return `answer_applied:${input.subjectId}:${input.actorId ?? "anon"}:${day}`;
    }
    case "ramp_compressed":
      return `ramp_compressed:${input.subjectId}`;
    default:
      return `${input.eventType}:${input.subjectId}`;
  }
}

/**
 * ⭐⭐ EMISSION IS ADDITIVE AND CAN NEVER BLOCK THE UNDERLYING ACTION.
 *
 * Every call site hooks this in as a fire-and-forget side effect of an action
 * that has ALREADY succeeded. This function therefore CANNOT THROW: every path
 * is wrapped, failures are logged, and the return value says honestly whether a
 * row landed. A ledger failure must never cost somebody a capture.
 *
 * The tier is derived from the event type, never passed in — two call sites
 * disagreeing about whether something is realized or modeled is how a page
 * starts arguing with itself in front of a CFO.
 */
export async function emitValueEvent(
  service: SupabaseClient,
  input: EmitValueEventInput
): Promise<{ ok: boolean; error?: string }> {
  try {
    const row = {
      org_id: input.orgId,
      event_type: input.eventType,
      occurred_at: input.occurredAt,
      subject_type: input.subjectType,
      subject_id: input.subjectId,
      contributor_id: input.contributorId ?? null,
      quantity_json: scrubQuantity(input.quantity),
      confidence_tier: EVENT_TIER[input.eventType],
      basis_sentence: input.basis,
      dedupe_key: input.dedupeKey,
    };
    // ⭐ ignoreDuplicates → ON CONFLICT DO NOTHING, never DO UPDATE. An UPDATE
    // would fire the value_events_append_only trigger and raise — which would
    // make the documented-safe "press backfill twice" action fail every row and
    // report zeroes, implying nothing had ever been backfilled.
    const { error } = await service
      .from("value_events")
      .upsert(row, { onConflict: "dedupe_key", ignoreDuplicates: true });
    if (error) {
      console.error(`value-ledger: ${input.eventType} emission failed:`, error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    console.error(
      `value-ledger: ${input.eventType} emission threw:`,
      e instanceof Error ? e.message : String(e)
    );
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

/**
 * Guardrail with teeth, in the spirit of scrubFeatures(): a quantity key that
 * looks like money is dropped and warned about — EXCEPT the one deliberate
 * exception, stated_problem_cost, which is a figure a human typed about their
 * own operation. If this ever strips something, the doctrine was about to be
 * broken silently.
 */
const MONEY_KEY_RE = /(_rate|_cost|_dollars|_usd|_price|_salary)$/i;
const ALLOWED_MONEY_KEYS = new Set(["stated_problem_cost"]);

export function scrubQuantity(q: QuantityJson): QuantityJson {
  const clean: QuantityJson = {};
  const stripped: string[] = [];
  for (const [k, v] of Object.entries(q)) {
    if (MONEY_KEY_RE.test(k) && !ALLOWED_MONEY_KEYS.has(k)) {
      stripped.push(k);
      continue;
    }
    if (v === undefined) continue;
    clean[k] = v;
  }
  if (stripped.length > 0) {
    console.warn(
      `value-ledger: stripped currency-shaped quantity key(s) [${stripped.join(
        ", "
      )}] — value_events stores quantities, never dollars.`
    );
  }
  return clean;
}

/**
 * The AI-scored reproduction estimate for one pattern record, read back off the
 * `pattern_captured` event the scorer already wrote.
 *
 * ⭐ ONE SOURCE OF TRUTH. `gap_closed` needs "how many senior hours would it
 * take to rediscover this" — which is the exact question the scorer already
 * answered for the resolving framework. Re-scoring it would be a second opinion
 * the page could contradict itself with. Returns null when the scorer has not
 * run or declined to score, and null means EXCLUDED, never defaulted.
 */
export async function readReproductionHours(
  service: SupabaseClient,
  recordId: string
): Promise<number | null> {
  try {
    const { data } = await service
      .from("value_events")
      .select("quantity_json")
      .eq("event_type", "pattern_captured")
      .eq("subject_type", "pattern_record")
      .eq("subject_id", recordId)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const q = (data as { quantity_json?: QuantityJson } | null)?.quantity_json ?? null;
    const hours = q?.reproduction_hours;
    return typeof hours === "number" && Number.isFinite(hours) ? hours : null;
  } catch {
    return null;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// PRICING — THE ONLY PLACE A DOLLAR IS EVER PRODUCED
// ═════════════════════════════════════════════════════════════════════════════

/** ±35% band on every modeled figure. A modeled point estimate kills the page. */
export const MODELED_BAND = 0.35;

export type PricedEvent = {
  event: ValueEventRow;
  /** null = not priced. NEVER 0-as-unknown; the two mean different things. */
  amount: number | null;
  /** The rate keys this event needed and did not get. Empty when priced. */
  missing: AssumptionKey[];
  /** True when the QUANTITY itself is absent (e.g. the scorer declined). */
  unscoreable: boolean;
  /** Human-readable arithmetic, shown when a figure is opened. */
  workings: string;
};

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/**
 * Price ONE event against the org's current assumptions.
 *
 * Rules that hold for every branch:
 *   • A missing RATE  → amount null, `missing` names the rate. Never defaulted.
 *   • A missing QUANTITY → amount null, `unscoreable` true. Never defaulted.
 *   • Nothing here multiplies by a number the system invented. Scarcity, blast
 *     radius and half-life are DISPLAYED as the basis for a figure and are
 *     deliberately NOT multiplied into it — a model-guessed scalar silently
 *     inflating a total is the exact failure the doctrine forbids.
 */
export type PricingContext = {
  /**
   * recordId → AI-scored reproduction hours, built once from the
   * `pattern_captured` events already loaded.
   *
   * ⭐ WHY THIS EXISTS: gap_closed is emitted the moment a human points a
   * framework at a gap, which is often SECONDS after that framework was
   * captured — before the valuation job has run. Reading the hours at emission
   * time therefore lands null, and value_events is append-only, so that null
   * could never be corrected. Resolving it here is a join against a quantity the
   * ledger already holds, not an invention.
   */
  reproductionHoursByRecord: Map<string, number>;
};

export function priceEvent(
  event: ValueEventRow,
  a: ValueAssumptions,
  ctx?: PricingContext
): PricedEvent {
  const q = event.quantity_json ?? {};
  const missing: AssumptionKey[] = [];
  const need = (key: AssumptionKey): number | null => {
    const v = num(a[key]);
    if (v === null) missing.push(key);
    return v;
  };

  switch (event.event_type) {
    // ── 1. A framework exists that did not exist before. What it would cost to
    //       reproduce from scratch, at the customer's own senior rate. ──
    case "pattern_captured": {
      const hours = num(q.reproduction_hours);
      const rate = need("senior_loaded_rate");
      if (hours === null) {
        return unpriced(event, missing, true, "No reproduction estimate — excluded from every total.");
      }
      if (rate === null) return unpriced(event, missing, false, `${hours} senior hours × no rate entered`);
      return {
        event,
        amount: hours * rate,
        missing,
        unscoreable: false,
        workings: `${hours} senior hours to rediscover × ${money(rate)}/hr = ${money(hours * rate)}`,
      };
    }

    // ── 2. Somebody said a retrieved framework answered their question. The
    //       expert interruption that did not have to happen. ──
    case "answer_applied": {
      const asks = num(q.retrievals) ?? 1;
      const minutes = need("expert_interruption_minutes");
      const rate = need("expert_interruption_rate");
      if (minutes === null || rate === null) {
        return unpriced(
          event,
          missing,
          false,
          `${asks} answered ${asks === 1 ? "ask" : "asks"} × no rate entered`
        );
      }
      const amount = asks * (minutes / 60) * rate;
      return {
        event,
        amount,
        missing,
        unscoreable: false,
        // rework_probability rides along in quantity_json and is deliberately
        // NOT monetized here: it is probabilistic, and this is the REALIZED
        // tier. Mixing a probability into the honest number is how the honest
        // number stops being honest.
        workings: `${asks} answered ${
          asks === 1 ? "ask" : "asks"
        } × ${minutes} min × ${money(rate)}/hr = ${money(amount)}`,
      };
    }

    // ── 3. An intervention was delivered and the problem stopped coming back.
    //       Priced on the customer's own incident cost. ──
    case "prescription_effective": {
      const incidents = num(q.incidents_avoided);
      const stated = num(q.stated_problem_cost);
      const perIncident = stated ?? need("rework_incident_cost");
      if (incidents === null) {
        return unpriced(event, missing, true, "No recurrence count on the record — excluded.");
      }
      if (perIncident === null) {
        return unpriced(
          event,
          missing,
          false,
          `${incidents} recurrences stopped × no incident cost entered`
        );
      }
      const amount = incidents * perIncident;
      return {
        event,
        amount,
        missing,
        unscoreable: false,
        workings: `${incidents} recurrences stopped × ${money(perIncident)}${
          stated !== null ? " (your figure for this problem)" : ""
        } = ${money(amount)}`,
      };
    }

    // ── 4. A training module was built from your own experts instead of bought. ──
    case "training_generated": {
      const hours = num(q.finished_training_hours);
      const rate = need("instructional_design_rate");
      if (hours === null) {
        return unpriced(event, missing, true, "Finished length unknown for this format — excluded.");
      }
      if (rate === null) {
        return unpriced(event, missing, false, `${hours} finished training hours × no rate entered`);
      }
      const amount = hours * rate;
      return {
        event,
        amount,
        missing,
        unscoreable: false,
        workings: `${hours} finished training ${
          hours === 1 ? "hour" : "hours"
        } × ${money(rate)}/hr = ${money(amount)}`,
      };
    }

    // ── 5. A question nobody could answer now has an answer. Modeled: the
    //       reacquisition cost you no longer carry if the holder leaves. ──
    case "gap_closed": {
      const resolvedRecord =
        typeof q.resolved_record_id === "string" ? q.resolved_record_id : null;
      const hours =
        num(q.reacquisition_hours) ??
        (resolvedRecord ? ctx?.reproductionHoursByRecord.get(resolvedRecord) ?? null : null);
      const coverage = num(q.coverage_fraction) ?? 1;
      const p = need("annual_departure_probability");
      const rate = need("senior_loaded_rate");
      if (hours === null) {
        return unpriced(event, missing, true, "No reacquisition estimate on the resolving record — excluded.");
      }
      if (p === null || rate === null) {
        return unpriced(event, missing, false, `${hours} reacquisition hours × no rate entered`);
      }
      const amount = p * hours * coverage * rate;
      return {
        event,
        amount,
        missing,
        unscoreable: false,
        workings: `${(p * 100).toFixed(0)}% departure probability × ${hours} reacquisition hours × ${(
          coverage * 100
        ).toFixed(0)}% covered × ${money(rate)}/hr = ${money(amount)}`,
      };
    }

    // ── 6. Somebody finished a structured onboarding track. Modeled: ramp weeks
    //       the org itself credits to that, at the org's own loaded salary. ──
    case "ramp_compressed": {
      const completion = num(q.completion_fraction) ?? 1;
      const creditedRaw = need("ramp_weeks_credited_per_track");
      const salary = need("loaded_salary_annual");
      if (creditedRaw === null || salary === null) {
        return unpriced(event, missing, false, "Onboarding track completed × no rate entered");
      }
      // ⭐ Capped at the org's own average ramp. A credit larger than the whole
      // ramp is not a number this page will render, whatever was typed.
      const cap = num(a.average_ramp_weeks);
      const credited = cap === null ? creditedRaw : Math.min(creditedRaw, cap);
      const amount = credited * (salary / 52) * completion;
      return {
        event,
        amount,
        missing,
        unscoreable: false,
        workings: `${credited} ramp ${credited === 1 ? "week" : "weeks"} credited × ${money(
          salary / 52
        )}/week × ${(completion * 100).toFixed(0)}% of the track completed = ${money(amount)}${
          cap !== null && creditedRaw > cap ? ` (capped at your ${cap}-week average ramp)` : ""
        }`,
      };
    }
  }
}

function unpriced(
  event: ValueEventRow,
  missing: AssumptionKey[],
  unscoreable: boolean,
  workings: string
): PricedEvent {
  return { event, amount: null, missing, unscoreable, workings };
}

// ═════════════════════════════════════════════════════════════════════════════
// THE LEDGER
// ═════════════════════════════════════════════════════════════════════════════

export type TierSummary = {
  tier: ConfidenceTier;
  /** null when nothing in this tier could be priced. Never 0-as-unknown. */
  total: number | null;
  /** Modeled only. ±MODELED_BAND. NEVER a point estimate on screen. */
  low: number | null;
  high: number | null;
  events_total: number;
  events_priced: number;
  events_unpriced: number;
  events_unscoreable: number;
  /** Contributing lines, biggest first, for the drill-down. */
  lines: LedgerLine[];
};

export type LedgerLine = {
  event_type: ValueEventType;
  count: number;
  amount: number | null;
  unpriced: number;
  unscoreable: number;
  /**
   * ⭐ THE QUANTITY, WITH ITS UNIT — what the line shows when there is no rate
   * to price it with. The no-rates state is the state every new pilot is in on
   * day one, and it has to be readable and dignified rather than a row of
   * dashes.
   */
  quantity_total: number | null;
  quantity_unit: string;
  /** Rates this line needs and does not have. Drives the inline "enter it" CTA. */
  missing_inputs: AssumptionKey[];
};

export type Ledger = {
  org_id: string;
  generated_at: string;
  period: { since: string | null; until: string };
  assumptions: ValueAssumptions;
  has_rates: boolean;
  tiers: { realized: TierSummary; substitution: TierSummary; modeled: TierSummary };
  /** Every rate key that at least one event needed and did not get. */
  missing_rates: AssumptionKey[];
  /** Patterns the scorer could not confidently score. VISIBLE ON THE PAGE. */
  excluded_unscoreable: number;
  total_events: number;
  modeled_band: number;
};

const EMPTY_TIER = (tier: ConfidenceTier): TierSummary => ({
  tier,
  total: null,
  low: null,
  high: null,
  events_total: 0,
  events_priced: 0,
  events_unpriced: 0,
  events_unscoreable: 0,
  lines: [],
});

/**
 * ⭐ SERVICE-ROLE READ, deliberately — the same call /readout makes and for the
 * same reason: this reports TOTALS, and "the total as far as you can see" being
 * presented as the total is the exact T1B3 bug. The authority check lives in the
 * route. (Compare /exposure, which is person-attributed and reads as the caller.)
 */
export async function buildLedger(
  service: SupabaseClient,
  orgId: string,
  since: string | null
): Promise<Ledger> {
  const until = new Date().toISOString();
  const assumptions = await readAssumptions(service, orgId);

  let query = service
    .from("value_events")
    .select(VALUE_EVENT_COLUMNS)
    .eq("org_id", orgId)
    .order("occurred_at", { ascending: false });
  if (since) query = query.gte("occurred_at", since);

  const { data, error } = await query;
  if (error) {
    console.error("value-ledger: could not read value_events:", error.message);
  }
  const events = ((data ?? []) as unknown as ValueEventRow[]).filter((e) =>
    (VALUE_EVENT_TYPES as readonly string[]).includes(e.event_type)
  );

  // Built BEFORE pricing so gap_closed can resolve its reacquisition hours from
  // the framework that filled it, whatever order the two events were written in.
  const reproductionHoursByRecord = new Map<string, number>();
  for (const e of events) {
    if (e.event_type !== "pattern_captured") continue;
    const h = e.quantity_json?.reproduction_hours;
    if (typeof h === "number" && Number.isFinite(h)) {
      reproductionHoursByRecord.set(e.subject_id, h);
    }
  }
  const ctx: PricingContext = { reproductionHoursByRecord };

  const priced = events.map((e) => priceEvent(e, assumptions, ctx));

  const tiers = {
    realized: summarize("realized", priced),
    substitution: summarize("substitution", priced),
    modeled: summarize("modeled", priced),
  };

  const missing = new Set<AssumptionKey>();
  for (const p of priced) for (const m of p.missing) missing.add(m);

  return {
    org_id: orgId,
    generated_at: until,
    period: { since, until },
    assumptions,
    has_rates: hasAnyRate(assumptions),
    tiers,
    missing_rates: Array.from(missing),
    excluded_unscoreable: priced.filter((p) => p.unscoreable).length,
    total_events: events.length,
    modeled_band: MODELED_BAND,
  };
}

function summarize(tier: ConfidenceTier, priced: PricedEvent[]): TierSummary {
  // ⭐ EVENT_TIER, NOT event.confidence_tier. priceEvent() branches on
  // event_type, so bucketing on a stored column lets one hand-seeded row be
  // priced with the modeled formula and then summed into Realized — where it
  // would render as a hard point estimate with no ±35% band. One source of
  // truth for which tier a kind of event belongs to.
  const mine = priced.filter((p) => EVENT_TIER[p.event.event_type] === tier);
  if (mine.length === 0) return EMPTY_TIER(tier);

  const withAmount = mine.filter((p) => p.amount !== null);
  const total =
    withAmount.length > 0 ? withAmount.reduce((s, p) => s + (p.amount ?? 0), 0) : null;

  const byType = new Map<ValueEventType, PricedEvent[]>();
  for (const p of mine) {
    const list = byType.get(p.event.event_type) ?? [];
    list.push(p);
    byType.set(p.event.event_type, list);
  }

  const lines: LedgerLine[] = Array.from(byType.entries())
    .map(([event_type, list]) => {
      const paid = list.filter((p) => p.amount !== null);
      const meta = EVENT_META[event_type];
      // The observed quantity, summed. Null only when NOTHING in the line
      // carries the number — not zero, which would read as "we measured none."
      let quantityTotal: number | null = null;
      if (meta.quantityKey) {
        const values = list
          .map((p) => p.event.quantity_json?.[meta.quantityKey as string])
          .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
        quantityTotal =
          values.length > 0 ? Math.round(values.reduce((s, v) => s + v, 0) * 100) / 100 : null;
      } else {
        quantityTotal = list.length;
      }
      const missing = new Set<AssumptionKey>();
      for (const p of list) for (const m of p.missing) missing.add(m);
      return {
        event_type,
        count: list.length,
        amount: paid.length > 0 ? paid.reduce((s, p) => s + (p.amount ?? 0), 0) : null,
        unpriced: list.filter((p) => p.amount === null && !p.unscoreable).length,
        unscoreable: list.filter((p) => p.unscoreable).length,
        quantity_total: quantityTotal,
        quantity_unit: meta.quantityUnit,
        missing_inputs: Array.from(missing),
      };
    })
    .sort((a, b) => (b.amount ?? -1) - (a.amount ?? -1));

  return {
    tier,
    total,
    // ⭐⭐ MODELED IS ALWAYS A RANGE. A point estimate on a modeled figure is
    // the single thing that kills this page's credibility, and it only has to
    // be caught once. The band is computed HERE, next to the total, so no
    // renderer can accidentally show one without the other.
    low: tier === "modeled" && total !== null ? total * (1 - MODELED_BAND) : null,
    high: tier === "modeled" && total !== null ? total * (1 + MODELED_BAND) : null,
    events_total: mine.length,
    events_priced: withAmount.length,
    events_unpriced: mine.filter((p) => p.amount === null && !p.unscoreable).length,
    events_unscoreable: mine.filter((p) => p.unscoreable).length,
    lines,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// THE COMPACT BLOCK THE READOUT + PDF SHARE
// ═════════════════════════════════════════════════════════════════════════════

export type LedgerBlock = {
  realized: number | null;
  substitution: number | null;
  modeled_low: number | null;
  modeled_high: number | null;
  /** Dated, reproducible footnote for the PDF. */
  assumptions_line: string;
  excluded_unscoreable: number;
};

/**
 * ⭐ RETURNS null WHEN THE ORG HAS NO RATES. The readout then falls back to
 * EXACTLY its v2.59 behaviour and no half-populated dollar figure ever leaves
 * the building. Callers must render nothing on null — not a zero, not a dash.
 */
export function toReadoutBlock(ledger: Ledger): LedgerBlock | null {
  if (!ledger.has_rates) return null;

  const realized = ledger.tiers.realized.total;
  const substitution = ledger.tiers.substitution.total;
  const low = ledger.tiers.modeled.low;
  const high = ledger.tiers.modeled.high;

  // ⭐⭐ NO FIGURE, NO BLOCK. hasAnyRate() is true as soon as ONE of the nine
  // inputs is filled in — including the three that are not currency at all
  // (average ramp, interruption minutes, departure probability). On its own that
  // is not enough: an org that typed "average ramp: 12 weeks" and stopped would
  // otherwise print a heading with three blanks under it on the document a
  // champion forwards. That IS the half-populated state this build promises
  // never leaves the building.
  if (realized === null && substitution === null && low === null) return null;

  // Reproducibility, scoped. Only the assumptions that actually fed a figure on
  // this block are printed — an unused rate on a forwarded document is data the
  // reader did not need and the org did not choose to share.
  //
  // 🔔 OPEN CALL FOR BRIAN: this line still prints loaded salary and hourly
  // rates when the modeled/substitution figures render. That is what makes every
  // number on the page reproducible by the person who receives it, and it is
  // also internal compensation data on a forwardable artifact. Options in the
  // copy draft: itemize (today), summarize ("computed from rates supplied by
  // <org> on <date>"), or make it a per-export toggle.
  const used = new Set<AssumptionKey>();
  const collect = (t: TierSummary) => {
    for (const line of t.lines) {
      if (line.amount === null) continue;
      for (const p of PRICING_INPUTS[line.event_type]) used.add(p);
    }
  };
  collect(ledger.tiers.realized);
  collect(ledger.tiers.substitution);
  collect(ledger.tiers.modeled);

  const a = ledger.assumptions;
  const parts: string[] = [];
  for (const f of ASSUMPTION_FIELDS) {
    if (!used.has(f.key)) continue;
    const v = a[f.key];
    if (typeof v === "number") parts.push(`${f.label} ${v} ${f.unit}`);
  }
  const stamped = a.updated_at ? new Date(a.updated_at).toLocaleDateString("en-US") : "undated";
  return {
    realized,
    substitution,
    modeled_low: low,
    modeled_high: high,
    assumptions_line: `Figures use ${
      parts.length > 0 ? "your organization's own assumptions" : "no rates"
    } as of ${stamped}${parts.length > 0 ? `: ${parts.join(" · ")}` : ""}. Modeled figures carry a ±${Math.round(
      MODELED_BAND * 100
    )}% band. No saving is claimed anywhere on this page.`,
    excluded_unscoreable: ledger.excluded_unscoreable,
  };
}
