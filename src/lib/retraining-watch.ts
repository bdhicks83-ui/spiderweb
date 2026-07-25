// Manager-only Retraining/Coaching Watch — detection core.
//
// Mirrors the Win Column's shape in the opposite direction: aggregate
// concern/friction pattern_records by named person. Unlike the Win Column,
// this can ONLY cover people who are registered accounts with a manager on
// file — entity_map stores free-text names, not account references, so an
// informally-mentioned person with no login has no account to gate access
// around and no manager relationship to check. See the p6 migration header
// for the full reasoning.
//
// Threshold: 2+ concern/friction records naming the same registered person
// before a signal is created — a single record doesn't surface (Brian's
// call, 2026-07-25 DECISION-LOG). This module only DETECTS candidates; the
// actual privacy guarantee is the retraining_signals RLS policy
// (is_manager_of()), not anything in this file.

import { normalizePersonKey } from "./win-column";

export type EntityMapEntry = { type: string; name: string; detail: string | null };

export const RETRAINING_WATCH_SOURCE_COLUMNS =
  "id, user_id, created_at, trigger_type, entity_map, signal_detail, judgment, context_summary";

export type RetrainingWatchSourceRow = {
  id: string;
  user_id: string;
  created_at: string;
  trigger_type: string | null;
  entity_map: EntityMapEntry[] | null;
  signal_detail: string | null;
  judgment: string | null;
  context_summary: string | null;
};

export type ProfileLite = {
  id: string;
  display_name: string | null;
  manager_id: string | null;
};

export const RETRAINING_SIGNAL_THRESHOLD = 2;

export type RetrainingCandidate = {
  personId: string;
  personName: string;
  managerId: string;
  evidenceRecordIds: string[];
  recurrence: number;
  summary: string;
};

function excerptFor(row: RetrainingWatchSourceRow): string | null {
  const text = row.signal_detail ?? row.judgment ?? row.context_summary;
  if (!text) return null;
  const trimmed = text.trim();
  return trimmed.length > 140 ? trimmed.slice(0, 140).trim() + "…" : trimmed;
}

// Blameless-doctrine summary: names the PATTERN and gives a concrete excerpt,
// never frames the person as "the problem" — same register as the
// Prescription Engine's "records, never people" escalation copy.
function buildSummary(personName: string, count: number, sampleExcerpt: string | null): string {
  const base = `${count} record${count === 1 ? "" : "s"} this period involve ${personName} in a concern or friction context`;
  return sampleExcerpt ? `${base} — most recent: "${sampleExcerpt}"` : `${base}.`;
}

export function detectRetrainingCandidates(
  allRecords: RetrainingWatchSourceRow[],
  profiles: ProfileLite[]
): RetrainingCandidate[] {
  const signalRecords = allRecords.filter(
    (r) => r.trigger_type === "concern" || r.trigger_type === "friction"
  );

  // Resolve entity_map names to accounts by exact-normalized-string match —
  // same conservative matcher the Win Column uses for people. Prefer
  // under-matching (miss a real hit) to over-matching (wrongly attach a
  // concern to the wrong account).
  const profileByKey = new Map<string, ProfileLite>();
  for (const p of profiles) {
    if (!p.display_name) continue;
    profileByKey.set(normalizePersonKey(p.display_name), p);
  }

  const byPerson = new Map<
    string,
    { row: RetrainingWatchSourceRow; excerpt: string | null }[]
  >();

  for (const record of signalRecords) {
    const entities = record.entity_map ?? [];
    const seenInThisRecord = new Set<string>();
    for (const entity of entities) {
      if (entity.type !== "role_person") continue;
      const key = normalizePersonKey(entity.name);
      if (!key || seenInThisRecord.has(key)) continue;

      const profile = profileByKey.get(key);
      // No account, or an account with no manager on file — can't be
      // surfaced anywhere, so it's not a candidate at all.
      if (!profile || !profile.manager_id) continue;
      seenInThisRecord.add(key);

      const list = byPerson.get(profile.id) ?? [];
      list.push({ row: record, excerpt: excerptFor(record) });
      byPerson.set(profile.id, list);
    }
  }

  const candidates: RetrainingCandidate[] = [];
  for (const [personId, entries] of byPerson) {
    if (entries.length < RETRAINING_SIGNAL_THRESHOLD) continue;
    const profile = profiles.find((p) => p.id === personId);
    if (!profile?.display_name || !profile.manager_id) continue;

    const sorted = [...entries].sort(
      (a, b) => new Date(a.row.created_at).getTime() - new Date(b.row.created_at).getTime()
    );
    const mostRecent = sorted[sorted.length - 1];

    candidates.push({
      personId,
      personName: profile.display_name,
      managerId: profile.manager_id,
      evidenceRecordIds: sorted.map((e) => e.row.id),
      recurrence: sorted.length,
      summary: buildSummary(profile.display_name, sorted.length, mostRecent.excerpt),
    });
  }

  return candidates;
}

// Guardrail verification, same shape as the Win Column's assertWinsOnly —
// prove every evidence_record_id backing a candidate really is a
// concern/friction row, never a win/broke/judgment row. Run this on every
// detection pass, not just in tests.
export function assertConcernFrictionOnly(
  allRecords: RetrainingWatchSourceRow[],
  candidates: RetrainingCandidate[]
): { ok: true } | { ok: false; leaks: string[] } {
  const validIds = new Set(
    allRecords
      .filter((r) => r.trigger_type === "concern" || r.trigger_type === "friction")
      .map((r) => r.id)
  );
  const leaks: string[] = [];
  for (const c of candidates) {
    for (const id of c.evidenceRecordIds) {
      if (!validIds.has(id)) leaks.push(`${c.personName} ← record ${id}`);
    }
  }
  return leaks.length ? { ok: false, leaks } : { ok: true };
}
