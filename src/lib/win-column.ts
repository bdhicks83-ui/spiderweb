// P-4.5 — Win Column: mention-based recognition, aggregation core.
//
// Principle (ELICITATION-ENGINE-SPEC-ADDENDUM-2026-07-22.md, section 3):
// experts author; everyone else gets SEEN. Aggregating who's named across
// multiple experts' WIN-type pattern_records is unsolicited third-party
// attribution — a recognition signal no self-nomination or review cycle can
// match. This module is the ONLY place that turns raw pattern_record rows
// into person-level rollups; every caller (API routes, the seed/verify
// harness) must go through aggregateWinColumn rather than re-deriving this
// itself, so this file is the single enforcement point for the wins-only
// guardrail below.
//
// No new tables, no new RLS. This reads off pattern_records.entity_map
// (P-0.5 field #8) exactly as already exposed by the existing "org library
// read" RLS policy (p1-org-foundation.sql) — a caller only ever sees their
// own records plus their org's COMPLETE records, so aggregation here is
// automatically org-scoped and RLS-respecting with zero new grants.

export type EntityMapEntry = {
  type: string;
  name: string;
  detail: string | null;
};

// The columns the Win Column needs from pattern_records. Callers should
// select exactly this set (mirrors the EMBED_SOURCE_COLUMNS convention in
// src/lib/pattern-embedding.ts).
export const WIN_COLUMN_SOURCE_COLUMNS =
  "id, user_id, created_at, trigger_type, context_function, " +
  "signal_detail, judgment, entity_map, framework, method";

export type WinColumnSourceRow = {
  id: string;
  user_id: string;
  created_at: string;
  trigger_type: string | null;
  context_function: string | null;
  signal_detail: string | null;
  judgment: string | null;
  entity_map: EntityMapEntry[] | null;
  framework: { name?: string; tagline?: string } | null;
  method: string | null;
};

export type PersonMention = {
  recordId: string;
  authorId: string;
  authorName: string;
  date: string; // ISO — mirrors pattern_records.created_at (backdated session start)
  contextFunction: string | null;
  chip: string; // extractive quote, verbatim substring of the expert's own words
  detail: string | null; // the role_person entity's own detail text, if any
  frameworkName: string | null;
  method: string | null;
};

export type PersonAggregate = {
  personKey: string; // normalized name — case/whitespace-insensitive identity
  displayName: string; // original casing from the earliest mention
  role: string | null; // most recent non-null entity detail text
  mentionCount: number;
  distinctAuthorCount: number;
  authorNames: string[];
  departmentsTouched: string[]; // distinct context_function values across mentions
  firstMentionDate: string;
  mostRecentMentionDate: string;
  mentions: PersonMention[]; // sorted oldest → newest
  crossDeptImpact: boolean;
  risingSignal: boolean;
  retentionWatch: boolean;
};

// ── Name matching ───────────────────────────────────────────────────────
// P-4A's department token-subset merge ("Manufacturing" folds into
// "Manufacturing Engineering") is a DELIBERATE non-pattern here. People are
// not departments: wrongly fusing two different people ("Marcus Webb" +
// "Marcus W." on Line 5) is worse than listing one person twice under
// slightly different spellings. So the matcher is exact-normalized-string
// equality only — case-insensitive, whitespace-collapsed — and nothing
// fuzzier. Prefer under-merging to over-merging, per the P-4.5 build spec.
export function normalizePersonKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

// ── Context chip extraction ─────────────────────────────────────────────
// Chips are EXTRACTIVE, never model-paraphrased: a verbatim substring of the
// expert's own signal_detail (falling back to judgment, then
// context_summary-less-empty), so "in the expert's own words" is literally
// true and there is no risk of a chip inventing a quote. Naive sentence
// split is good enough for demo-scale prose; it never needs to be perfect,
// only ever a real substring.
export function extractContextChip(
  text: string | null | undefined,
  personName: string,
  maxLen = 160
): string {
  if (!text || !text.trim()) return "";
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim());
  const nameLower = personName.toLowerCase();
  const hit =
    sentences.find((s) => s.toLowerCase().includes(nameLower)) ??
    sentences[0] ??
    text;
  let chip = hit.trim();
  if (chip.length > maxLen) {
    const cut = chip.slice(0, maxLen);
    const lastSpace = cut.lastIndexOf(" ");
    chip = (lastSpace > maxLen * 0.6 ? cut.slice(0, lastSpace) : cut).trim() + "…";
  }
  return chip;
}

// ── Tunable windows (documented in the P-4.5 DECISION-LOG entry) ────────
// Rising signal: a person's mention cadence is accelerating — each gap
// between consecutive mentions is smaller than the one before it. Needs at
// least 3 mentions (2 gaps) to say anything about acceleration at all; 2
// points can't show a trend, just a single interval.
// Retention watch: a named win-driver whose most recent mention is older
// than this many days, with nothing since — framed for a manager as "check
// in on this person," never as a performance judgment.
export const RETENTION_WATCH_STALE_DAYS = 45;

function daysBetween(aIso: string, bIso: string): number {
  return Math.abs(new Date(bIso).getTime() - new Date(aIso).getTime()) / 86_400_000;
}

// ── Core aggregation ─────────────────────────────────────────────────────
// ⭐⭐⭐ WINS-ONLY ROLLUP — BLAMELESS DOCTRINE, ENFORCED HERE, NOT INCIDENTAL.
// This is the one line in the whole feature that decides which trigger
// types may ever reach a person-level surface. A failure-record ("broke")
// mentioning someone by name must never contribute a count, a chip, a
// corroboration badge, or an evidence-packet entry. Same family as
// flag-never-block and P-4B's "records, never people" escalation copy: the
// moment an expert fears that naming someone might hurt them, honest
// naming stops and the whole signal dies.
export function aggregateWinColumn(
  allRecords: WinColumnSourceRow[],
  authorNamesById: Record<string, string>,
  nowIso: string
): PersonAggregate[] {
  const winRecords = allRecords.filter((r) => r.trigger_type === "win");

  const byKey = new Map<
    string,
    { displayName: string; mentions: PersonMention[] }
  >();

  for (const record of winRecords) {
    const entities = record.entity_map ?? [];
    for (const entity of entities) {
      if (entity.type !== "role_person") continue;
      const key = normalizePersonKey(entity.name);
      if (!key) continue;

      const mention: PersonMention = {
        recordId: record.id,
        authorId: record.user_id,
        authorName: authorNamesById[record.user_id] ?? "Org member",
        date: record.created_at,
        contextFunction: record.context_function,
        chip: extractContextChip(record.signal_detail ?? record.judgment, entity.name),
        detail: entity.detail,
        frameworkName: record.framework?.name ?? null,
        method: record.method,
      };

      const existing = byKey.get(key);
      if (existing) {
        existing.mentions.push(mention);
      } else {
        byKey.set(key, { displayName: entity.name.trim(), mentions: [mention] });
      }
    }
  }

  const people: PersonAggregate[] = [];
  for (const [personKey, { displayName, mentions }] of byKey) {
    const sorted = [...mentions].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    const authorIds = new Set(sorted.map((m) => m.authorId));
    const departments = Array.from(
      new Set(sorted.map((m) => m.contextFunction).filter((d): d is string => !!d))
    );
    const role = [...sorted].reverse().find((m) => m.detail)?.detail ?? null;

    // Rising signal: gaps (in days) between consecutive mentions, oldest to
    // newest; accelerating means the most recent gap is strictly smaller
    // than the one before it, and there are at least 2 gaps to compare.
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(daysBetween(sorted[i - 1].date, sorted[i].date));
    }
    const risingSignal =
      gaps.length >= 2 && gaps[gaps.length - 1] < gaps[gaps.length - 2];

    const mostRecentMentionDate = sorted[sorted.length - 1].date;
    const retentionWatch =
      daysBetween(mostRecentMentionDate, nowIso) > RETENTION_WATCH_STALE_DAYS;

    people.push({
      personKey,
      displayName,
      role,
      mentionCount: sorted.length,
      distinctAuthorCount: authorIds.size,
      authorNames: Array.from(new Set(sorted.map((m) => m.authorName))),
      departmentsTouched: departments,
      firstMentionDate: sorted[0].date,
      mostRecentMentionDate,
      mentions: sorted,
      // Cross-dept impact: the person's mentions were authored under more
      // than one distinct department/function tag. We don't try to infer a
      // single "home department" for the person (the entity map doesn't
      // reliably carry one) — the honest, defensible signal is simply that
      // recognition wasn't confined to one department's records.
      crossDeptImpact: departments.length >= 2,
      risingSignal,
      retentionWatch,
    });
  }

  // Rank: corroboration (distinct authors) first — it's the headline signal
  // per spec, not raw mention count — then mention count, then most recent.
  people.sort((a, b) => {
    if (b.distinctAuthorCount !== a.distinctAuthorCount) {
      return b.distinctAuthorCount - a.distinctAuthorCount;
    }
    if (b.mentionCount !== a.mentionCount) return b.mentionCount - a.mentionCount;
    return (
      new Date(b.mostRecentMentionDate).getTime() -
      new Date(a.mostRecentMentionDate).getTime()
    );
  });

  return people;
}

// ── Guardrail verification helper ───────────────────────────────────────
// Given the FULL set of records (including non-win) and the rollup this
// module produced, prove no evidence_record_id in the rollup traces back to
// a non-win record. Used by scripts/seed-p4-5.mjs's DONE-test assertion —
// not just an absence-of-symptom check, an always-run anti-leak proof, same
// pattern P-4B's efficacy-loop fix added for founding-record exclusion.
export function assertWinsOnly(
  allRecords: WinColumnSourceRow[],
  people: PersonAggregate[]
): { ok: true } | { ok: false; leaks: string[] } {
  const nonWinIds = new Set(
    allRecords.filter((r) => r.trigger_type !== "win").map((r) => r.id)
  );
  const leaks: string[] = [];
  for (const person of people) {
    for (const mention of person.mentions) {
      if (nonWinIds.has(mention.recordId)) {
        leaks.push(`${person.displayName} ← record ${mention.recordId}`);
      }
    }
  }
  return leaks.length ? { ok: false, leaks } : { ok: true };
}

export type WinColumnSummary = {
  mostCited: { personKey: string; displayName: string; mentionCount: number } | null;
  risingSignal: { personKey: string; displayName: string } | null;
  retentionWatch: { personKey: string; displayName: string } | null;
};

export function buildSummaryTiles(people: PersonAggregate[]): WinColumnSummary {
  const mostCited = people[0]
    ? { personKey: people[0].personKey, displayName: people[0].displayName, mentionCount: people[0].mentionCount }
    : null;
  const risingPerson = people.find((p) => p.risingSignal) ?? null;
  const retentionPerson = people.find((p) => p.retentionWatch) ?? null;
  return {
    mostCited,
    risingSignal: risingPerson
      ? { personKey: risingPerson.personKey, displayName: risingPerson.displayName }
      : null,
    retentionWatch: retentionPerson
      ? { personKey: retentionPerson.personKey, displayName: retentionPerson.displayName }
      : null,
  };
}
