// TIER 1 / BUILD 3 — THE VALUE READOUT.
//
// ⛔ SERVER-ONLY. Reaches the service-role client. Everything the UI needs
// travels over /api/readout.
//
// ═════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS FOR
//
// A pilot ends with somebody having to justify the renewal to somebody who was
// never in the room. This is the artifact they forward. It answers "what did we
// actually get" from rows that already exist — and it is the last of the three
// Tier 1 builds because it needs the other two: Build 1 puts real people on the
// account, Build 2 gets real judgment captured, and only then is there anything
// honest to read out.
//
// ⭐ NO NEW SCHEMA. Every number here is derived at read time from
// pattern_records, knowledge_gaps, capture_requests, prescriptions,
// framework_conflicts, training_requests and learning_signals. A snapshot table
// was considered and rejected: a stored metric drifts from the thing it claims
// to describe (the same reasoning that keeps the T1B1 setup checklist and the
// P-9 gap resolution derived rather than pushed), and the exported PDF — a file
// with a date on it — already IS the snapshot.
//
// ═════════════════════════════════════════════════════════════════════════════
// ⭐⭐ THE THREE RULES THIS FILE EXISTS TO OBEY
//
// 1. NEVER INVENT A DOLLAR FIGURE. There is no "saved $240,000" here and there
//    never will be. Every savings number this product could compute would be a
//    guess wearing a currency symbol, and the first buyer who checks it stops
//    believing the rest of the page. The standing GTM position is to anchor on
//    REPLACEMENT COST, never savings claims — so the readout reports what is
//    now written down, whose judgment it is, and how long they have been doing
//    it, and lets the reader do their own arithmetic with their own numbers.
//
// 2. NEVER A PERSON-LEVEL NEGATIVE. Coaching Watch (P-6) contributes NOTHING to
//    this page — not aggregated, not anonymized, not counted. Capture requests
//    that went unanswered are reported as a COUNT, never as a roster (the P-9
//    rule: the org-wide row carries a count and never a name). People appear on
//    this page only for what they CONTRIBUTED. It is the Win Column's
//    wins-only doctrine applied to a management artifact.
//
// 3. SAY HOW THIN THE DATA IS. A pilot org with nine frameworks must not read
//    like a mature system. Every claim here carries an evidence level, and
//    below the threshold the language changes from proven to early — the same
//    guardrail P-7 Build 6 enforces in code for retrieval effectiveness. A
//    readout that oversells the first ninety days is a readout that gets
//    checked, and it only has to be caught once.
// ═════════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from "@supabase/supabase-js";

// ═════════════════════════════════════════════════════════════════════════════
// EVIDENCE LEVELS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Below this many observations a claim is described as an early signal, never
 * as proven. Mirrors PRIOR_MIN_RESOLVED (format-prior.ts) and
 * PROVEN_MIN_EVIDENCE deliberately — three separate numbers for "how much is
 * enough to say we know something" is how a codebase starts disagreeing with
 * itself in front of a customer.
 */
export const PROVEN_MIN_EVIDENCE = 3;

export type EvidenceLevel = "none" | "early" | "proven";

export function evidenceLevel(n: number): EvidenceLevel {
  if (n <= 0) return "none";
  return n >= PROVEN_MIN_EVIDENCE ? "proven" : "early";
}

// ═════════════════════════════════════════════════════════════════════════════
// SHAPES
// ═════════════════════════════════════════════════════════════════════════════

export type Contributor = {
  person_id: string;
  name: string;
  title: string | null;
  frameworks: number;
  years_experience: number | null;
};

export type ReadoutPeriod = { since: string | null; until: string };

export type Readout = {
  org_name: string;
  period: ReadoutPeriod;
  generated_at: string;

  /** 1 — WHAT IS NOW WRITTEN DOWN. */
  captured: {
    frameworks: number;
    contributors: Contributor[];
    people_on_account: number;
    /**
     * ⭐ THE REPLACEMENT-COST ANCHOR, and the only "big number" on this page.
     * Summed self-reported years of experience across the people who actually
     * captured something. It is NOT a valuation and is never rendered with a
     * currency symbol — it is the sentence "this many years of judgment used to
     * exist only in people's heads," which the reader prices themselves.
     * null when nobody has filled in years of experience: an absent number is
     * omitted, never estimated.
     */
    years_of_judgment: number | null;
    years_is_partial: boolean;
    methods_used: number;
  };

  /** 2 — WHAT PEOPLE ASKED FOR, AND WHETHER IT WAS THERE. */
  demand: {
    questions_asked: number;
    gaps_opened: number;
    gaps_filled: number;
    gaps_open_now: number;
    /** Total times an unanswered question was asked (demand, not gap count). */
    unanswered_asks: number;
    top_open: { question: string; asked_count: number }[];
    evidence: EvidenceLevel;
  };

  /** 3 — WHERE IT CHANGED WHAT SOMEBODY DID. The hardest claim, so the most guarded. */
  applied: {
    retrieval_marked_useful: number;
    prescriptions_delivered: number;
    prescriptions_effective: number;
    prescriptions_escalated: number;
    training_generated: number;
    evidence: EvidenceLevel;
    /** True when we are describing a handful of events, not a track record. */
    thin: boolean;
  };

  /** 4 — DISAGREEMENTS THE ORG DID NOT KNOW IT HAD. */
  contested: {
    surfaced: number;
    resolved: number;
    open: number;
    examples: { a: string; b: string; status: string }[];
  };

  /** 5 — CAPTURE CAMPAIGNS (T1B2). Counts only — never a roster. */
  campaigns: {
    run: number;
    asks_sent: number;
    asks_captured: number;
    asks_declined: number;
    /** Asks neither captured nor declined. A COUNT. Never names. */
    asks_outstanding: number;
  };

  /** 6 — WHAT IS STILL DARK. Reported, not hidden. */
  still_dark: {
    people_yet_to_capture: number;
    gaps_unfilled: number;
    notes: string[];
  };
};

// ═════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═════════════════════════════════════════════════════════════════════════════

function sinceFilter<T>(q: T, column: string, since: string | null): T {
  if (!since) return q;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (q as any).gte(column, since) as T;
}

type ProfileLite = {
  id: string;
  display_name: string | null;
  claimed_title: string | null;
  claimed_years_experience: number | null;
  deactivated_at: string | null;
};

// ═════════════════════════════════════════════════════════════════════════════
// THE COMPUTATION
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Everything is read with the SERVICE-ROLE client and scoped by org_id in every
 * single query. That is deliberate and it is the opposite of the choice made on
 * the campaign roster (T1B2), for a reason worth stating: this page reports
 * AGGREGATES and CONTRIBUTIONS, both of which are safe org-wide, and it must
 * report the true totals rather than "the totals as far as you can see" —
 * a partial number presented as a whole one is the exact bug the T1B2 boundary
 * walk caught. The authority check lives in the route (manager or admin); the
 * safety property lives in WHAT is selected, not in who selects it.
 *
 * 🛑 Note what is NOT read here: retraining_signals. Coaching Watch is a
 * manager-only, direct-report-only surface and contributes nothing to this
 * artifact — not aggregated, not counted, not hinted at.
 */
export async function buildReadout(
  service: SupabaseClient,
  orgId: string,
  since: string | null
): Promise<Readout> {
  const until = new Date().toISOString();

  // ─── The org ───
  const { data: orgRaw } = await service
    .from("orgs")
    .select("id, name")
    .eq("id", orgId)
    .maybeSingle();
  const orgName = (orgRaw as { name: string } | null)?.name ?? "Your organization";

  // ─── People ───
  const { data: peopleRaw } = await service
    .from("profiles")
    .select("id, display_name, claimed_title, claimed_years_experience, deactivated_at")
    .eq("org_id", orgId);
  const people = (peopleRaw ?? []) as ProfileLite[];
  const activePeople = people.filter((p) => !p.deactivated_at);
  const personById = new Map(people.map((p) => [p.id, p]));

  // ─── 1. CAPTURED ───
  let recordsQuery = service
    .from("pattern_records")
    .select("id, user_id, method, created_at")
    .eq("org_id", orgId)
    .eq("status", "complete");
  recordsQuery = sinceFilter(recordsQuery, "created_at", since);
  const { data: recordsRaw } = await recordsQuery;
  const records = (recordsRaw ?? []) as {
    id: string;
    user_id: string;
    method: string | null;
    created_at: string;
  }[];

  const byPerson = new Map<string, number>();
  const methods = new Set<string>();
  for (const r of records) {
    byPerson.set(r.user_id, (byPerson.get(r.user_id) ?? 0) + 1);
    if (r.method) methods.add(r.method);
  }

  const contributors: Contributor[] = Array.from(byPerson.entries())
    .map(([person_id, frameworks]) => {
      const p = personById.get(person_id);
      return {
        person_id,
        name: p?.display_name || "A teammate",
        title: p?.claimed_title ?? null,
        frameworks,
        years_experience: p?.claimed_years_experience ?? null,
      };
    })
    .sort((a, b) => b.frameworks - a.frameworks || a.name.localeCompare(b.name));

  // ⭐ Years of judgment: summed ONLY over people who actually captured
  // something, and only where the number exists. `years_is_partial` is true
  // when at least one contributor has no figure on file — so the page can say
  // "at least N years" instead of implying the total is complete. An absent
  // number is omitted, never estimated.
  const withYears = contributors.filter((c) => typeof c.years_experience === "number");
  const yearsOfJudgment =
    withYears.length > 0 ? withYears.reduce((sum, c) => sum + (c.years_experience ?? 0), 0) : null;

  // ─── 2. DEMAND ───
  let gapsQuery = service
    .from("knowledge_gaps")
    .select("id, question_text, status, asked_count, created_at, resolved_at")
    .eq("org_id", orgId);
  gapsQuery = sinceFilter(gapsQuery, "created_at", since);
  const { data: gapsRaw } = await gapsQuery;
  const gaps = (gapsRaw ?? []) as {
    id: string;
    question_text: string;
    status: string;
    asked_count: number;
    resolved_at: string | null;
  }[];

  const gapsFilled = gaps.filter((g) => g.status === "resolved").length;
  const gapsOpenNow = gaps.filter((g) => g.status !== "resolved").length;
  const unansweredAsks = gaps
    .filter((g) => g.status !== "resolved")
    .reduce((s, g) => s + (g.asked_count ?? 0), 0);
  const topOpen = gaps
    .filter((g) => g.status !== "resolved")
    .sort((a, b) => (b.asked_count ?? 0) - (a.asked_count ?? 0))
    .slice(0, 5)
    .map((g) => ({ question: g.question_text, asked_count: g.asked_count ?? 0 }));

  // "Questions asked" = every retrieval the ledger saw, plus every ask that
  // opened a gap. Both are undercounts and the page says so: retrieval capture
  // is opt-in (P-8 signal 7 fires on a click), so this number can only ever be
  // a floor. A floor stated as a floor is honest; a floor stated as a total is
  // not.
  let signalsQuery = service
    .from("learning_signals")
    .select("id, signal_type, occurred_at")
    .eq("org_id", orgId);
  signalsQuery = sinceFilter(signalsQuery, "occurred_at", since);
  const { data: signalsRaw } = await signalsQuery;
  const signals = (signalsRaw ?? []) as { signal_type: string }[];
  const countSignal = (t: string) => signals.filter((s) => s.signal_type === t).length;

  const retrievalOpened = countSignal("retrieval_result_opened");
  const retrievalUseful = countSignal("retrieval_result_used");
  const gapsOpenedSignal = countSignal("knowledge_gap_opened");
  const questionsAsked = retrievalOpened + gapsOpenedSignal;

  // ─── 3. APPLIED ───
  let rxQuery = service
    .from("prescriptions")
    .select("id, status, efficacy_status, delivered_at, created_at")
    .eq("org_id", orgId);
  rxQuery = sinceFilter(rxQuery, "created_at", since);
  const { data: rxRaw } = await rxQuery;
  const rx = (rxRaw ?? []) as {
    status: string;
    efficacy_status: string | null;
    delivered_at: string | null;
  }[];
  const delivered = rx.filter((r) => !!r.delivered_at).length;
  const effective = rx.filter((r) => r.efficacy_status === "effective").length;
  const escalated = rx.filter((r) => r.efficacy_status === "escalated").length;

  let trainingQuery = service
    .from("training_requests")
    .select("id, status, created_at")
    .eq("org_id", orgId);
  trainingQuery = sinceFilter(trainingQuery, "created_at", since);
  const { data: trainingRaw } = await trainingQuery;
  const training = (trainingRaw ?? []) as { status: string }[];
  const trainingGenerated = training.filter(
    (t) => t.status === "generated" || t.status === "deployed" || t.status === "closed"
  ).length;

  // ⚠️ The applied section is the one a skeptical reader attacks first, because
  // "it changed what somebody did" is the hardest claim in the product. So its
  // evidence level is computed from the number of CONFIRMED outcomes only —
  // effective prescriptions plus explicitly-marked-useful retrievals — and
  // never from volume of activity.
  const appliedEvidenceCount = effective + retrievalUseful;

  // ─── 4. CONTESTED ───
  let conflictQuery = service
    .from("framework_conflicts")
    .select("id, status, record_a_id, record_b_id, detected_at")
    .eq("org_id", orgId);
  conflictQuery = sinceFilter(conflictQuery, "detected_at", since);
  const { data: conflictsRaw } = await conflictQuery;
  const conflicts = (conflictsRaw ?? []) as {
    id: string;
    status: string;
    record_a_id: string;
    record_b_id: string;
  }[];

  const conflictRecordIds = Array.from(
    new Set(conflicts.flatMap((c) => [c.record_a_id, c.record_b_id]).filter(Boolean))
  );
  let frameworkNames: Record<string, string> = {};
  if (conflictRecordIds.length > 0) {
    const { data: cRecords } = await service
      .from("pattern_records")
      .select("id, framework")
      .in("id", conflictRecordIds);
    frameworkNames = Object.fromEntries(
      ((cRecords || []) as { id: string; framework: { name?: string } | null }[]).map((r) => [
        r.id,
        r.framework?.name || "an uncaptured framework",
      ])
    );
  }
  const conflictExamples = conflicts.slice(0, 4).map((c) => ({
    a: frameworkNames[c.record_a_id] ?? "a framework",
    b: frameworkNames[c.record_b_id] ?? "a framework",
    status: c.status,
  }));

  // ─── 5. CAMPAIGNS (T1B2) ───
  let campaignQuery = service
    .from("capture_campaigns")
    .select("id, created_at")
    .eq("org_id", orgId);
  campaignQuery = sinceFilter(campaignQuery, "created_at", since);
  const { data: campaignsRaw } = await campaignQuery;
  const campaigns = (campaignsRaw ?? []) as { id: string }[];

  let askQuery = service
    .from("capture_requests")
    .select("id, status, created_at")
    .eq("org_id", orgId);
  askQuery = sinceFilter(askQuery, "created_at", since);
  const { data: asksRaw } = await askQuery;
  const asks = (asksRaw ?? []) as { status: string }[];
  const asksCaptured = asks.filter((a) => a.status === "captured").length;
  const asksDeclined = asks.filter((a) => a.status === "declined").length;

  // ─── 6. STILL DARK ───
  // ⚠️ COUNTS ONLY. "4 people haven't captured anything yet" is a coverage
  // fact about the org. "Tyler, Klaudia, John and Ben haven't" is a
  // performance list about four people, on a document that goes to somebody
  // who was never in the room. This product does not produce the second one.
  const peopleYetToCapture = activePeople.filter((p) => !byPerson.has(p.id)).length;

  const notes: string[] = [];
  if (records.length < PROVEN_MIN_EVIDENCE) {
    notes.push(
      "This is an early picture — there aren't enough captured frameworks yet to describe patterns, only to count what exists."
    );
  }
  if (retrievalOpened === 0 && retrievalUseful === 0) {
    notes.push(
      "Nobody has searched the library yet, so there's no evidence here about whether what's captured is reaching people."
    );
  } else {
    notes.push(
      "Search counts are a floor, not a total: marking a result useful is optional, so real usage is at least this high and probably higher."
    );
  }
  if (gapsOpenNow > 0) {
    notes.push(
      `${gapsOpenNow} question${gapsOpenNow === 1 ? "" : "s"} the team asked still ${
        gapsOpenNow === 1 ? "has" : "have"
      } no captured answer.`
    );
  }
  if (withYears.length < contributors.length) {
    notes.push(
      "Years of experience is self-reported and not everyone has filled it in, so the total below is a minimum."
    );
  }

  return {
    org_name: orgName,
    period: { since, until },
    generated_at: until,
    captured: {
      frameworks: records.length,
      contributors,
      people_on_account: activePeople.length,
      years_of_judgment: yearsOfJudgment,
      years_is_partial: withYears.length < contributors.length,
      methods_used: methods.size,
    },
    demand: {
      questions_asked: questionsAsked,
      gaps_opened: gaps.length,
      gaps_filled: gapsFilled,
      gaps_open_now: gapsOpenNow,
      unanswered_asks: unansweredAsks,
      top_open: topOpen,
      evidence: evidenceLevel(gaps.length),
    },
    applied: {
      retrieval_marked_useful: retrievalUseful,
      prescriptions_delivered: delivered,
      prescriptions_effective: effective,
      prescriptions_escalated: escalated,
      training_generated: trainingGenerated,
      evidence: evidenceLevel(appliedEvidenceCount),
      thin: appliedEvidenceCount < PROVEN_MIN_EVIDENCE,
    },
    contested: {
      surfaced: conflicts.length,
      resolved: conflicts.filter((c) => c.status === "resolved").length,
      open: conflicts.filter((c) => c.status !== "resolved").length,
      examples: conflictExamples,
    },
    campaigns: {
      run: campaigns.length,
      asks_sent: asks.length,
      asks_captured: asksCaptured,
      asks_declined: asksDeclined,
      asks_outstanding: asks.length - asksCaptured - asksDeclined,
    },
    still_dark: {
      people_yet_to_capture: peopleYetToCapture,
      gaps_unfilled: gapsOpenNow,
      notes,
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// AUTHORITY
// ═════════════════════════════════════════════════════════════════════════════

export type ReadoutGate =
  | { ok: true; userId: string; orgId: string }
  | { ok: false; status: number; error: string; code?: string };

/**
 * Manager or org admin — the same bar as running a capture campaign, and for
 * the same reason: this is a management artifact. It carries no person-level
 * negative, so a wider audience would be safe; it is gated because a readout
 * circulating before its owner has read it is how a half-finished number ends
 * up in front of a VP.
 */
export async function requireReadoutViewer(session: SupabaseClient): Promise<ReadoutGate> {
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "Not logged in" };

  const { data: profile } = await session
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  const orgId = (profile as { org_id: string | null } | null)?.org_id ?? null;
  if (!orgId) {
    return { ok: false, status: 409, error: "You're not part of an organization yet.", code: "NO_ORG" };
  }

  const [{ data: isManager }, { data: isAdmin }] = await Promise.all([
    session.rpc("is_manager"),
    session.rpc("is_org_admin"),
  ]);
  if (isManager !== true && isAdmin !== true) {
    return {
      ok: false,
      status: 403,
      error: "The readout is for managers and account admins.",
      code: "NOT_VIEWER",
    };
  }
  return { ok: true, userId: user.id, orgId };
}
