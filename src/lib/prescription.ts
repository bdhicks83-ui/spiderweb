// P-4A — Prescription Engine, part 1: detection → triage → pairing → ROI.
//
// The payoff pipeline (ROADMAP v4 / ADDENDUM v2 §6): the brain doesn't just
// store judgment and flag problems — it prescribes the fix and knows exactly
// who needs it. P-4A builds the front half:
//
//   1. DETECTION — three inputs, all produced upstream, stored as
//      first-class prescription_detections rows:
//        • Conflict signals — framework_conflicts (P-2), open AND resolved
//          (resolution history is signal, not noise: settled guidance that
//          hasn't been pushed to the affected teams is still a gap).
//        • Coverage gaps — departments that keep appearing in OTHER experts'
//          entity maps but have authored nothing themselves; confirmed
//          semantically via pattern_records embeddings (P-3) so a close-but-
//          not-covering framework can't mask a real gap, and a genuinely
//          covering one suppresses it.
//        • Entity signals — repeat error classes across records; equipment/
//          process trouble clusters. All from the P-0.5 entity map.
//   2. TRIAGE — a model call sizes each detection onto the 4-rung
//      severity-matched intervention ladder, with a stored one-line
//      rationale. Conservative bias: torn between two rungs ⇒ the LOWER.
//      Code-level ceilings per source type back the prompt up.
//   3. AUTO-PAIRING — deterministic, from the entity map: WHO HAS IT
//      (framework author(s) covering the territory) ↔ WHO NEEDS IT (the
//      team/dept in the gap or error evidence). No expert exists ⇒ the
//      prescription is honestly "capture first" — a codify target, never an
//      invented facilitator.
//   4. ROI RANK — recurrence × severity (the Thread ROI recurrence-first
//      approach re-applied), stored with a plain-language rank rationale.
//
// False positives are the failure mode — worse than in P-2, because a bad
// prescription wastes real people's time. Everything here fails open: a
// model hiccup on triage or the coverage tiebreak means NO prescription
// (the detection stays open for the next run), never a guessed one.
//
// P-4B (this file's second half) consumes these rows: manager gate, expert
// fidelity check, training generation, teach-back, efficacy loop,
// regenerate. The P-4A engine above still only ever creates 'open'
// prescriptions; everything after 'open' is driven by the P-4B routes and
// the efficacy loop at the bottom of this module.
import type { SupabaseClient } from "@supabase/supabase-js";
import { triagePrescriptionGap, checkCoverageGap } from "@/lib/claude";
import { embedText } from "@/lib/voyage";
import type { EntityMapEntry, FrameworkArtifact } from "@/lib/elicitation";

// ─── The intervention ladder (shared by triage, queue UI, detail UI) ───────

export const RUNGS: Record<
  number,
  { label: string; effort: string; sizedFor: string }
> = {
  1: {
    label: "Clarification card",
    effort: "2-min read",
    sizedFor: "definition/understanding mismatch",
  },
  2: {
    label: "Micro-training",
    effort: "15-min session",
    sizedFor: "an error class one team solved, another keeps hitting",
  },
  3: {
    label: "Designed session",
    effort: "facilitated session",
    sizedFor: "a dept recurring in others' failure records",
  },
  4: {
    label: "Full curriculum",
    effort: "multi-session program",
    sizedFor: "systemic cross-functional blind spot",
  },
};

// Code-level ceilings per detection source — the prompt carries the same
// guardrails, but a model that overshoots gets clamped DOWN here (never up),
// with the clamp noted in the stored rationale. Conservative bias, enforced.
const RUNG_CEILING: Record<PrescriptionSourceType, number> = {
  conflict: 2,
  entity_signal: 3,
  coverage_gap: 4,
};

// P-3's tuned retrieval threshold, reused verbatim (do not re-derive): below
// this cosine similarity nothing in the org is even CLOSE to the territory,
// so a coverage gap is confirmed without a model call.
export const COVERAGE_SIMILARITY_THRESHOLD = 0.75;

// Backstop cap on triage model calls per run, same doctrine as P-2's
// MAX_PAIRS_PER_SCAN: demo-org detection counts sit well under this; when it
// trips, the run reports how many detections were left open, never silently.
export const MAX_TRIAGE_PER_RUN = 25;

export type PrescriptionSourceType = "conflict" | "coverage_gap" | "entity_signal";

export const SOURCE_LABEL: Record<PrescriptionSourceType, string> = {
  conflict: "Conflict X-ray",
  coverage_gap: "Coverage gap",
  entity_signal: "Entity signal",
};

// ─── Record + conflict slices detection needs ──────────────────────────────

export type PrescriptionSourceRecord = {
  id: string;
  user_id: string;
  org_id: string | null;
  created_at: string;
  trigger_type: string | null;
  context_summary: string | null;
  context_function: string | null;
  situation_type: string | null;
  intervention_type: string | null;
  trigger_signal: string | null;
  signal_detail: string | null;
  judgment: string | null;
  rationale: string | null;
  boundaries: string | null;
  entity_map: EntityMapEntry[];
  framework: FrameworkArtifact | null;
};

export const PRESCRIPTION_RECORD_COLUMNS =
  "id, user_id, org_id, created_at, trigger_type, context_summary, " +
  "context_function, situation_type, intervention_type, trigger_signal, " +
  "signal_detail, judgment, rationale, boundaries, entity_map, framework";

type ConflictSlice = {
  id: string;
  record_a_id: string;
  record_b_id: string;
  status: string;
  territory: string | null;
  rationale: string;
  resolution: string | null;
  resolution_note: string | null;
  resolution_depth_ok: boolean | null;
};

// ─── Normalization helpers ──────────────────────────────────────────────────

export function normalizeEntityName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function entityKey(e: EntityMapEntry): string {
  return `${e.type}|${normalizeEntityName(e.name)}`;
}

// Token-subset merge for DEPARTMENT names only: "Finance" and
// "Finance / Controller" are the same department mentioned two ways. A name
// whose token set is a subset of another's merges into it. Deliberately
// narrow — applied to no other entity type ("Press #3" vs "Press" must never
// merge).
function departmentGroupKeys(names: string[]): Map<string, string> {
  const tokenSets = names.map((n) => ({
    name: n,
    tokens: new Set(normalizeEntityName(n).split(" ").filter(Boolean)),
  }));
  const keyFor = new Map<string, string>();
  for (const a of tokenSets) {
    let canonical = a.name;
    for (const b of tokenSets) {
      if (a === b) continue;
      const aInB = [...a.tokens].every((t) => b.tokens.has(t));
      const bInA = [...b.tokens].every((t) => a.tokens.has(t));
      // Merge toward the SHORTER (more general) name so both spellings land
      // on one key; ties keep the lexicographically first for determinism.
      if (aInB || bInA) {
        const shorter =
          a.tokens.size === b.tokens.size
            ? [a.name, b.name].sort()[0]
            : a.tokens.size < b.tokens.size
              ? a.name
              : b.name;
        if (normalizeEntityName(shorter).length < normalizeEntityName(canonical).length) {
          canonical = shorter;
        }
      }
    }
    keyFor.set(a.name, normalizeEntityName(canonical));
  }
  return keyFor;
}

// Department → ontology function (deterministic keyword map). Used as the
// "has this department authored anything themselves?" proxy: a department
// whose mapped ontology function has ZERO complete records in the org has
// authored nothing on its own territory. Unmappable departments are skipped
// (reported, never guessed) — conservative by design.
const DEPT_FUNCTION_RULES: [RegExp, string][] = [
  [/procure|purchas|sourcing|supply|vendor/, "Supply chain"],
  [/financ|controller|account|budget/, "Finance"],
  [/quality|\bqc\b|\bqa\b|inspection/, "Quality"],
  [/\bhr\b|people|talent|recruit/, "HR/People"],
  [/leadership|executive|c.suite/, "Leadership"],
  [
    /production|shift|machining|maintenance|press|assembly|receiving|shipping|warehouse|ops|operations|engineering|tooling|plant/,
    "Ops",
  ],
];

export function functionForDepartment(name: string): string | null {
  const n = normalizeEntityName(name);
  for (const [re, fn] of DEPT_FUNCTION_RULES) {
    if (re.test(n)) return fn;
  }
  return null;
}

// ─── Detection candidates (in-memory, before upsert) ───────────────────────

type DetectionCandidate = {
  dedupeKey: string;
  sourceType: PrescriptionSourceType;
  summary: string;
  detail: string | null;
  subjectEntities: EntityMapEntry[];
  evidenceRecordIds: string[];
  conflictId: string | null;
  recurrence: number;
};

// Compact, model-facing evidence formatting for triage (mirrors the P-2
// formatRecordForConflict shape; names stay in — org-internal surface).
export function formatEvidenceForTriage(
  records: PrescriptionSourceRecord[],
  authorName: (userId: string) => string
): string {
  return records
    .map((r, i) => {
      const entities = (r.entity_map || [])
        .map((e) => `${e.type}: ${e.name}${e.detail ? ` (${e.detail})` : ""}`)
        .join("; ");
      return [
        `--- Record ${i + 1} · ${authorName(r.user_id)} · ${new Date(r.created_at).toLocaleDateString("en-US")} · trigger=${r.trigger_type ?? "?"} ---`,
        r.framework ? `Framework: ${r.framework.name} — ${r.framework.tagline}` : "Framework: (none rendered)",
        `Context: ${r.context_summary ?? "(none)"}`,
        `Signal: ${r.trigger_signal ?? "(none)"}`,
        `Judgment (the play): ${r.judgment ?? "(none)"}`,
        `Boundaries: ${r.boundaries ?? "(none)"}`,
        `Entities: ${entities || "(none)"}`,
      ].join("\n");
    })
    .join("\n\n");
}

// ─── Detector 1: conflict signals (P-2 rows, open AND resolved) ────────────

function detectConflictSignals(
  conflicts: ConflictSlice[],
  recordById: Map<string, PrescriptionSourceRecord>,
  authorName: (userId: string) => string
): DetectionCandidate[] {
  const out: DetectionCandidate[] = [];
  for (const c of conflicts) {
    const a = recordById.get(c.record_a_id);
    const b = recordById.get(c.record_b_id);
    if (!a || !b) continue; // a side was deleted — nothing actionable

    // Resolution history is signal, not noise — but only a resolution that
    // cleared the depth gate carries real settled guidance worth pushing.
    // A resolved row that never cleared the gate (or escalate, which has no
    // gate) stays out: prescribing "push this guidance" when the guidance is
    // shallow would be the exact over-prescription this phase avoids.
    if (c.status === "resolved" && c.resolution_depth_ok !== true) continue;

    // Subject entities: what both records claim (intersection by type+name).
    const bKeys = new Set((b.entity_map || []).map(entityKey));
    const shared = (a.entity_map || []).filter((e) => bKeys.has(entityKey(e)));

    const territory = c.territory ?? "the same territory";
    const summary =
      c.status === "open"
        ? `Two experts' live frameworks collide on ${territory}: "${a.framework?.name ?? "(framework)"}" (${authorName(a.user_id)}) vs "${b.framework?.name ?? "(framework)"}" (${authorName(b.user_id)}) — teams downstream may be operating on opposing understandings.`
        : `The conflict on ${territory} between ${authorName(a.user_id)} and ${authorName(b.user_id)} was resolved (${c.resolution}) — settled guidance exists but hasn't been pushed to the affected teams.`;

    out.push({
      dedupeKey: `conflict:${c.id}`,
      sourceType: "conflict",
      summary,
      detail: `Detector rationale (conflict-xray-v1): ${c.rationale}${c.status === "resolved" && c.resolution_note ? ` · Resolution note: ${c.resolution_note}` : ""}`,
      subjectEntities: shared,
      evidenceRecordIds: [a.id, b.id],
      conflictId: c.id,
      recurrence: 2,
    });
  }
  return out;
}

// ─── Detector 2: entity signals (repeat error classes, trouble clusters) ───

// Rules (deterministic, no model):
//   • error_class named in ≥2 records, at least one of them broke/friction
//     (a lone "we solved X" win is history, not a live signal).
//   • equipment_asset / process named in ≥2 broke/friction records — a
//     trouble cluster. Suppressed when an error_class detection already owns
//     the same evidence (one problem, one prescription), and when the
//     evidence is exactly the two sides of a known conflict (the conflict
//     detection owns that territory).
function detectEntitySignals(
  records: PrescriptionSourceRecord[],
  conflicts: ConflictSlice[]
): { candidates: DetectionCandidate[]; suppressed: number } {
  const byEntity = new Map<
    string,
    { entity: EntityMapEntry; records: PrescriptionSourceRecord[] }
  >();
  for (const r of records) {
    for (const e of r.entity_map || []) {
      if (e.type !== "error_class" && e.type !== "equipment_asset" && e.type !== "process") continue;
      const key = entityKey(e);
      const cur = byEntity.get(key);
      if (cur) {
        if (!cur.records.some((x) => x.id === r.id)) cur.records.push(r);
      } else {
        byEntity.set(key, { entity: e, records: [r] });
      }
    }
  }

  const isTrouble = (r: PrescriptionSourceRecord) =>
    r.trigger_type === "broke" || r.trigger_type === "friction";

  const conflictPairs = new Set(
    conflicts.map((c) => [c.record_a_id, c.record_b_id].sort().join("|"))
  );

  const errorClassEvidence: Set<string>[] = [];
  const errorCandidates: DetectionCandidate[] = [];
  const clusterCandidates: DetectionCandidate[] = [];
  let suppressed = 0;

  for (const [key, { entity, records: recs }] of byEntity) {
    const sorted = [...recs].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    if (entity.type === "error_class") {
      if (recs.length < 2 || !recs.some(isTrouble)) continue;
      const evidence = new Set(sorted.map((r) => r.id));
      errorClassEvidence.push(evidence);
      const authors = new Set(sorted.map((r) => r.user_id));
      const solver = sorted.find(
        (r) => r.framework && (r.trigger_type === "broke" || r.trigger_type === "win")
      );
      errorCandidates.push({
        dedupeKey: `entity:error_class:${normalizeEntityName(entity.name)}`,
        sourceType: "entity_signal",
        summary: `Error class "${entity.name}" recurs across ${recs.length} records from ${authors.size} expert${authors.size === 1 ? "" : "s"}${solver ? ` — a codified fix already exists ("${solver.framework!.name}")` : " — no codified fix exists yet"}.`,
        detail: solver
          ? `Earliest codified record on this error class: ${solver.id} (${new Date(solver.created_at).toLocaleDateString("en-US")}). Later records still hitting it are the recurrence evidence.`
          : "No record carrying this error class has a framework that solves it — capture territory.",
        subjectEntities: [entity],
        evidenceRecordIds: sorted.map((r) => r.id),
        conflictId: null,
        recurrence: recs.length,
      });
    } else {
      // equipment_asset / process trouble cluster
      const trouble = sorted.filter(isTrouble);
      if (trouble.length < 2) continue;
      clusterCandidates.push({
        dedupeKey: `entity:${entity.type}:${normalizeEntityName(entity.name)}`,
        sourceType: "entity_signal",
        summary: `"${entity.name}" (${entity.type === "equipment_asset" ? "asset" : "process"}) appears in ${trouble.length} failure/friction records — a trouble cluster.`,
        detail: null,
        subjectEntities: [entity],
        evidenceRecordIds: trouble.map((r) => r.id),
        conflictId: null,
        recurrence: trouble.length,
      });
      void key;
    }
  }

  // Suppression pass — one problem, one prescription:
  const kept: DetectionCandidate[] = [...errorCandidates];
  for (const c of clusterCandidates) {
    const evidence = c.evidenceRecordIds;
    const pairKey = [...evidence].sort().join("|");
    // (a) the evidence is exactly a known conflict pair → the conflict owns it
    if (evidence.length === 2 && conflictPairs.has(pairKey)) {
      suppressed++;
      continue;
    }
    // (b) an error-class detection already covers this evidence
    const subsumed = errorClassEvidence.some((set) =>
      evidence.every((id) => set.has(id))
    );
    if (subsumed) {
      suppressed++;
      continue;
    }
    kept.push(c);
  }
  return { candidates: kept, suppressed };
}

// ─── Detector 3: coverage gaps (semantic, org-scoped) ───────────────────────

// A department that keeps appearing in OTHER experts' records (≥2 records
// from ≥2 different authors) but has authored nothing itself:
//   1. Ontology proxy — the department's mapped function has zero complete
//      records in the org (nobody from that function has codified anything).
//   2. Semantic confirm (P-3 embeddings) — compose a query for the
//      department's OWN practice territory from the evidence; if the top
//      org-scoped similarity is below the tuned 0.75 threshold, the gap is
//      confirmed outright. At or above it, a model tiebreak decides whether
//      the near match actually covers the territory (close ≠ covering) —
//      doubt or model failure suppresses the detection.
async function detectCoverageGaps(
  service: SupabaseClient,
  orgId: string,
  records: PrescriptionSourceRecord[],
  authorName: (userId: string) => string,
  summaryOut: PrescribeSummary
): Promise<DetectionCandidate[]> {
  // Collect department mentions (token-subset merged).
  const rawNames: string[] = [];
  for (const r of records) {
    for (const e of r.entity_map || []) {
      if (e.type === "department") rawNames.push(e.name);
    }
  }
  const canonicalFor = departmentGroupKeys([...new Set(rawNames)]);

  const groups = new Map<
    string,
    { names: Map<string, number>; records: PrescriptionSourceRecord[] }
  >();
  for (const r of records) {
    for (const e of r.entity_map || []) {
      if (e.type !== "department") continue;
      const key = canonicalFor.get(e.name) ?? normalizeEntityName(e.name);
      const g =
        groups.get(key) ??
        { names: new Map<string, number>(), records: [] as PrescriptionSourceRecord[] };
      g.names.set(e.name, (g.names.get(e.name) ?? 0) + 1);
      if (!g.records.some((x) => x.id === r.id)) g.records.push(r);
      groups.set(key, g);
    }
  }

  const functionsPresent = new Set(
    records.map((r) => r.context_function).filter((f): f is string => !!f)
  );

  const out: DetectionCandidate[] = [];
  for (const [, g] of groups) {
    const authors = new Set(g.records.map((r) => r.user_id));
    if (g.records.length < 2 || authors.size < 2) continue;

    // Most-used original spelling = display name.
    const displayName = [...g.names.entries()].sort((a, b) => b[1] - a[1])[0][0];

    const fn = functionForDepartment(displayName);
    if (!fn) {
      summaryOut.coverageSkippedUnmapped++;
      continue; // can't say who they are — never guess a gap
    }
    if (functionsPresent.has(fn)) continue; // their function HAS authored — covered

    // Semantic confirm against the org's embedded frameworks.
    const evidenceSnippets = g.records
      .slice(0, 4)
      .map((r) => `${r.trigger_signal ?? r.context_summary ?? ""}`.slice(0, 240))
      .filter(Boolean)
      .join(" · ");
    const query =
      `How the ${displayName} team itself decides and runs its own work. ` +
      `Situations where ${displayName} keeps coming up: ${evidenceSnippets}`;

    const embed = await embedText(query, { inputType: "query" });
    if (!embed.ok) {
      // Embedding failure ⇒ can't confirm ⇒ no detection (fail open), but
      // never silently: the run summary carries it.
      summaryOut.coverageEmbedFailures++;
      continue;
    }
    const { data: matches, error } = await service.rpc(
      "search_pattern_records_by_query_for_org",
      { target_org: orgId, query_embedding: embed.vector, match_count: 3 }
    );
    if (error) {
      summaryOut.coverageEmbedFailures++;
      continue;
    }
    const top = ((matches as { id: string; similarity: number }[]) || [])[0] ?? null;
    let nearMissNote: string | null = null;

    if (top && top.similarity >= COVERAGE_SIMILARITY_THRESHOLD) {
      const near = records.find((r) => r.id === top.id);
      const nearText = near
        ? formatEvidenceForTriage([near], authorName)
        : "(record not in scope)";
      const evidenceText = formatEvidenceForTriage(g.records.slice(0, 4), authorName);
      const judgement = near
        ? await checkCoverageGap(displayName, evidenceText, nearText)
        : null;
      // covers, doubt, or model failure ⇒ suppress. Only an explicit
      // covers=false keeps the gap alive.
      if (!judgement || judgement.covers) {
        summaryOut.coverageSkippedCovered++;
        continue;
      }
      nearMissNote = `Closest framework "${near?.framework?.name ?? top.id}" (similarity ${Math.round(top.similarity * 1000) / 1000}) is adjacent but not covering: ${judgement.reason ?? "it belongs to a neighboring team's side of the territory"}`;
    } else if (top) {
      nearMissNote = `Nearest framework similarity ${Math.round(top.similarity * 1000) / 1000} — below the ${COVERAGE_SIMILARITY_THRESHOLD} threshold; nothing in the org is close to this territory.`;
    }

    const sorted = [...g.records].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    out.push({
      dedupeKey: `coverage:department:${normalizeEntityName(displayName)}`,
      sourceType: "coverage_gap",
      summary: `${displayName} appears in ${g.records.length} records from ${authors.size} different experts but has no codified frameworks of its own (no ${fn} records in the org).`,
      detail: nearMissNote,
      subjectEntities: [{ type: "department", name: displayName, detail: null }],
      evidenceRecordIds: sorted.map((r) => r.id),
      conflictId: null,
      recurrence: g.records.length,
    });
  }
  return out;
}

// ─── Pairing (deterministic — the entity map supplies both sides) ──────────

type Pairing = {
  experts: { user_id: string; record_id: string }[];
  captureFirst: boolean;
  audience: string;
  audienceEntities: EntityMapEntry[];
  pairingSummary: string;
};

function departmentsIn(records: PrescriptionSourceRecord[]): EntityMapEntry[] {
  const seen = new Map<string, EntityMapEntry>();
  for (const r of records) {
    for (const e of r.entity_map || []) {
      if (e.type !== "department") continue;
      const k = entityKey(e);
      if (!seen.has(k)) seen.set(k, e);
    }
  }
  return [...seen.values()];
}

function buildPairing(
  candidate: DetectionCandidate,
  evidence: PrescriptionSourceRecord[],
  rung: number,
  authorName: (userId: string) => string,
  conflict: ConflictSlice | null
): Pairing {
  const rungLabel = RUNGS[rung]?.label ?? `Rung ${rung}`;

  if (candidate.sourceType === "conflict" && conflict) {
    const a = evidence.find((r) => r.id === conflict.record_a_id);
    const b = evidence.find((r) => r.id === conflict.record_b_id);
    const audienceEntities = departmentsIn(evidence);
    const audience =
      audienceEntities.map((e) => e.name).join(" + ") || "both experts' teams";
    const nameA = a ? authorName(a.user_id) : "Expert A";
    const nameB = b ? authorName(b.user_id) : "Expert B";
    const pairingSummary =
      conflict.status === "open"
        ? `Pair ${nameA} with ${nameB} — ${rungLabel} for ${audience}: both sides of the contested "${conflict.territory ?? "shared"}" guidance, and exactly when each applies, until the conflict is resolved.`
        : `Pair ${nameA} with ${nameB} — ${rungLabel} for ${audience}: push the resolved "${conflict.territory ?? "shared"}" guidance (${conflict.resolution}) to both teams.`;
    return {
      experts: [
        ...(a ? [{ user_id: a.user_id, record_id: a.id }] : []),
        ...(b ? [{ user_id: b.user_id, record_id: b.id }] : []),
      ],
      captureFirst: false,
      audience,
      audienceEntities,
      pairingSummary,
    };
  }

  if (candidate.sourceType === "entity_signal") {
    const sorted = [...evidence].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    // WHO HAS IT: the earliest record that both carries a framework and reads
    // as a solved problem (broke → they fixed it, win → they proved it).
    const solver = sorted.find(
      (r) => r.framework && (r.trigger_type === "broke" || r.trigger_type === "win")
    );
    const others = sorted.filter((r) => r.id !== solver?.id);
    const audienceEntities = departmentsIn(others);
    const audience =
      audienceEntities.map((e) => e.name).join(" + ") ||
      "the team(s) in the recurrence records";
    const subject = candidate.subjectEntities[0]?.name ?? "this recurring issue";

    if (!solver) {
      return {
        experts: [],
        captureFirst: true,
        audience,
        audienceEntities,
        pairingSummary: `Capture first — "${subject}" keeps recurring but nobody has codified a fix. Codify target: run an elicitation session with whoever last beat it before designing any training.`,
      };
    }
    return {
      experts: [{ user_id: solver.user_id, record_id: solver.id }],
      captureFirst: false,
      audience,
      audienceEntities,
      pairingSummary: `Pair ${authorName(solver.user_id)} with ${audience} — ${rungLabel} built from "${solver.framework!.name}": they already solved "${subject}"; the recurrence evidence says ${audience} is still hitting it.`,
    };
  }

  // coverage_gap — the honest no-expert case: nobody has authored on this
  // territory, so the prescription is capture-first. Never invent a
  // facilitator.
  const dept = candidate.subjectEntities[0]?.name ?? "this department";
  const audienceEntities = candidate.subjectEntities;
  return {
    experts: [],
    captureFirst: true,
    audience: dept,
    audienceEntities,
    pairingSummary: `Capture first — no one has codified how ${dept} runs its own work, yet ${dept} keeps appearing in other experts' records. Codify target: run elicitation sessions with ${dept} before any ${rungLabel.toLowerCase()} can honestly be built.`,
  };
}

// ─── The run ─────────────────────────────────────────────────────────────────

export type PrescribeSummary = {
  records: number;
  conflictsConsidered: number;
  candidates: number;
  suppressed: number;
  coverageSkippedCovered: number;
  coverageSkippedUnmapped: number;
  coverageEmbedFailures: number;
  detectionsNew: number;
  detectionsExisting: number;
  triaged: number;
  triageFailed: number;
  triageSkippedCap: number;
  prescriptionsNew: number;
};

// Run the full P-4A pipeline for ONE org. `service` must be a service-role
// client (neither table has an insert policy — writes are service-only, same
// doctrine as framework_conflicts).
export async function runPrescriptionEngine(
  service: SupabaseClient,
  orgId: string
): Promise<PrescribeSummary> {
  const summary: PrescribeSummary = {
    records: 0,
    conflictsConsidered: 0,
    candidates: 0,
    suppressed: 0,
    coverageSkippedCovered: 0,
    coverageSkippedUnmapped: 0,
    coverageEmbedFailures: 0,
    detectionsNew: 0,
    detectionsExisting: 0,
    triaged: 0,
    triageFailed: 0,
    triageSkippedCap: 0,
    prescriptionsNew: 0,
  };

  // ── Load the org's complete records + conflicts + author names ──
  const { data: recordsRaw, error: recError } = await service
    .from("pattern_records")
    .select(PRESCRIPTION_RECORD_COLUMNS)
    .eq("org_id", orgId)
    .eq("status", "complete");
  if (recError) throw new Error(`Could not load org records: ${recError.message}`);
  const records = (recordsRaw || []) as unknown as PrescriptionSourceRecord[];
  summary.records = records.length;
  const recordById = new Map(records.map((r) => [r.id, r]));

  const { data: conflictsRaw, error: cError } = await service
    .from("framework_conflicts")
    .select(
      "id, record_a_id, record_b_id, status, territory, rationale, resolution, resolution_note, resolution_depth_ok"
    )
    .eq("org_id", orgId);
  if (cError) throw new Error(`Could not load conflicts: ${cError.message}`);
  const conflicts = (conflictsRaw || []) as unknown as ConflictSlice[];
  summary.conflictsConsidered = conflicts.length;

  const authorIds = [...new Set(records.map((r) => r.user_id))];
  const nameById = new Map<string, string>();
  if (authorIds.length > 0) {
    const { data: profiles } = await service
      .from("profiles")
      .select("id, display_name")
      .in("id", authorIds);
    for (const p of (profiles || []) as { id: string; display_name: string | null }[]) {
      if (p.display_name) nameById.set(p.id, p.display_name);
    }
  }
  const authorName = (userId: string) => nameById.get(userId) ?? "an org expert";

  // ── Detect ──
  const conflictCandidates = detectConflictSignals(conflicts, recordById, authorName);
  const { candidates: entityCandidates, suppressed } = detectEntitySignals(
    records,
    conflicts
  );
  summary.suppressed = suppressed;
  const coverageCandidates = await detectCoverageGaps(
    service,
    orgId,
    records,
    authorName,
    summary
  );

  const candidates = [...conflictCandidates, ...entityCandidates, ...coverageCandidates];
  summary.candidates = candidates.length;
  if (candidates.length === 0) return summary;

  // ── Upsert detections (idempotent on org_id + dedupe_key) ──
  const { error: upsertError } = await service.from("prescription_detections").upsert(
    candidates.map((c) => ({
      org_id: orgId,
      source_type: c.sourceType,
      dedupe_key: c.dedupeKey,
      subject_entities: c.subjectEntities,
      evidence_record_ids: c.evidenceRecordIds,
      conflict_id: c.conflictId,
      summary: c.summary,
      detail: c.detail,
      recurrence: c.recurrence,
    })),
    { onConflict: "org_id,dedupe_key", ignoreDuplicates: true }
  );
  if (upsertError) throw new Error(`Could not write detections: ${upsertError.message}`);

  const { data: detectionRowsRaw, error: readBackError } = await service
    .from("prescription_detections")
    .select("id, dedupe_key, source_type, summary, detail, evidence_record_ids, conflict_id, recurrence, status")
    .eq("org_id", orgId)
    .in("dedupe_key", candidates.map((c) => c.dedupeKey));
  if (readBackError) throw new Error(`Could not read detections back: ${readBackError.message}`);
  type DetectionRow = {
    id: string;
    dedupe_key: string;
    source_type: PrescriptionSourceType;
    summary: string;
    detail: string | null;
    evidence_record_ids: string[];
    conflict_id: string | null;
    recurrence: number;
    status: string;
  };
  const detectionRows = (detectionRowsRaw || []) as unknown as DetectionRow[];

  const { data: existingRxRaw } = await service
    .from("prescriptions")
    .select("detection_id")
    .eq("org_id", orgId);
  const alreadyPrescribed = new Set(
    ((existingRxRaw || []) as { detection_id: string }[]).map((r) => r.detection_id)
  );

  summary.detectionsExisting = detectionRows.filter(
    (d) => alreadyPrescribed.has(d.id) || d.status !== "open"
  ).length;
  summary.detectionsNew = detectionRows.length - summary.detectionsExisting;

  const candidateByKey = new Map(candidates.map((c) => [c.dedupeKey, c]));
  const conflictById = new Map(conflicts.map((c) => [c.id, c]));

  // ── Triage + pair each open, un-prescribed detection ──
  let triageBudget = MAX_TRIAGE_PER_RUN;
  for (const d of detectionRows) {
    if (alreadyPrescribed.has(d.id)) continue;
    if (d.status === "dismissed") continue;
    if (triageBudget <= 0) {
      summary.triageSkippedCap++;
      continue;
    }
    triageBudget--;

    const evidence = d.evidence_record_ids
      .map((id) => recordById.get(id))
      .filter((r): r is PrescriptionSourceRecord => !!r);
    if (evidence.length === 0) continue;

    const evidenceText = formatEvidenceForTriage(evidence, authorName);
    const triage = await triagePrescriptionGap(d.source_type, d.summary, evidenceText);
    // Fail open: no triage ⇒ no prescription. The detection stays open and
    // the next run retries — a guessed rung is worse than a delayed one.
    if (!triage) {
      summary.triageFailed++;
      continue;
    }
    summary.triaged++;

    // Conservative clamp: the model can never place a detection ABOVE its
    // source-type ceiling. Clamps go DOWN only, and are recorded.
    const ceiling = RUNG_CEILING[d.source_type];
    let rung: number = triage.rung;
    let rationale = triage.rationale;
    if (rung > ceiling) {
      rung = ceiling;
      rationale = `${rationale} [clamped from rung ${triage.rung} to ${ceiling} — ${d.source_type} detections cap at ${RUNGS[ceiling].label}]`;
    }

    const candidate = candidateByKey.get(d.dedupe_key);
    const pairing = buildPairing(
      candidate ?? {
        dedupeKey: d.dedupe_key,
        sourceType: d.source_type,
        summary: d.summary,
        detail: d.detail,
        subjectEntities: [],
        evidenceRecordIds: d.evidence_record_ids,
        conflictId: d.conflict_id,
        recurrence: d.recurrence,
      },
      evidence,
      rung,
      authorName,
      d.conflict_id ? (conflictById.get(d.conflict_id) ?? null) : null
    );

    // ── ROI rank: recurrence × severity (Thread ROI, recurrence-first) ──
    const recurrence = d.recurrence;
    const severity = rung;
    const roi = recurrence * severity;
    const rankRationale = `${recurrence} evidence record${recurrence === 1 ? "" : "s"} × severity ${severity} (${RUNGS[rung].label}) = ROI ${roi}`;

    const { error: rxError } = await service.from("prescriptions").upsert(
      {
        org_id: orgId,
        detection_id: d.id,
        rung,
        rung_rationale: rationale,
        gap_summary: d.summary,
        experts: pairing.experts,
        capture_first: pairing.captureFirst,
        audience: pairing.audience,
        audience_entities: pairing.audienceEntities,
        pairing_summary: pairing.pairingSummary,
        recurrence,
        severity,
        roi_score: roi,
        rank_rationale: rankRationale,
      },
      { onConflict: "detection_id", ignoreDuplicates: true }
    );
    if (rxError) {
      console.warn(`prescription insert skipped (${d.dedupe_key}): ${rxError.message}`);
      continue;
    }
    await service
      .from("prescription_detections")
      .update({ status: "prescribed" })
      .eq("id", d.id);
    summary.prescriptionsNew++;
  }

  return summary;
}

// ═══════════════════════════════════════════════════════════════════════════
// P-4B — Prescription Engine, part 2: the lifecycle after 'open'.
//
//   MANAGER GATE   approve (who + when recorded) / snooze (wake date —
//                  defers, never deletes; flag-never-block family).
//   FIDELITY       the authoring expert(s) confirm "yes, that's how I
//                  think" before anything ships in their name. Capture-
//                  first prescriptions SKIP fidelity entirely — nothing
//                  authored yet to confirm. Doctrine: fidelity enforced at
//                  the transfer layer.
//   TRAINING       generated at the prescribed rung in three audience
//                  altitudes, grounded ONLY in the paired expert's
//                  framework(s). Versioned: regenerate inserts, never
//                  overwrites.
//   TEACH-BACK     fresh scenario + scored answer (retrieval practice).
//   EFFICACY LOOP  detection never stops watching. Post-delivery recurrence
//                  of the same signal ⇒ auto-escalate one rung + flag.
//                  Quiet across the window ⇒ effective, logged as proof —
//                  Kirkpatrick Level 4, measured automatically.
// ═══════════════════════════════════════════════════════════════════════════

// Teach-back pass line: signal read (40) + play applied (40) + boundaries
// (20); 70 means the play and most of the signal transferred.
export const TEACHBACK_PASS_SCORE = 70;

// The efficacy quiet window: a delivered prescription whose subject stays
// out of new failure/friction records for this many days is marked
// EFFECTIVE and closed. Chosen to match the demo's evidence cadence (the
// P-4A signals recur weekly); tune only on real-world misses, same
// discipline as the 0.75 retrieval threshold.
export const EFFICACY_QUIET_WINDOW_DAYS = 14;

// How the rung shapes the generated artifact. The `instructions` text goes
// verbatim into the training prompts.
export const RUNG_FORMAT: Record<number, { name: string; instructions: string }> = {
  1: {
    name: "Clarification card",
    instructions:
      "A clarification card: a 2-minute read that fixes a definition/understanding mismatch. Each altitude is ONE card, at most ~300 words: name the two readings that are colliding (or the settled guidance), state the aligned rule, and say exactly when each side applies. No exercises, no sessions — this is a read, not a meeting.",
  },
  2: {
    name: "Micro-training",
    instructions:
      "A micro-training: a focused 15-minute session transferring a fix that already exists. Include: the objective in one line; the signal to recognize; the play, step by step; the boundaries (where this fix does NOT apply); and 2-3 quick practice checks a facilitator can run in the room. Keep it runnable in 15 minutes.",
  },
  3: {
    name: "Designed session",
    instructions:
      "A designed session: a facilitator guide for a working session on a real capability gap. Include: session objectives; an agenda with rough timings; 2-3 concrete scenarios drawn from the framework material for the room to work; discussion questions; and what the facilitator should watch for to know it landed. The floor altitude is the participant-facing version; supervisor is the facilitator guide proper; exec is the sponsor briefing.",
  },
  4: {
    name: "Full curriculum",
    instructions:
      "A curriculum outline: a sequenced multi-session program for a systemic blind spot. Include: the arc (what order and why); for each session an objective, a content outline grounded in the framework material, who facilitates, and how completion is assessed; and how the program verifies transfer at the end. Outline depth — this is the design, not every worksheet.",
  },
};

// ─── Training grounding text ────────────────────────────────────────────────

export type TrainingSourceRecord = PrescriptionSourceRecord;

// The FULL framework surface for training generation — richer than the
// triage formatter on purpose: the artifact fields (when_to_apply, signals,
// the_play, why_it_works, boundaries) plus the record's own reasoning are
// the entire permitted substance of the training. Names stay in
// (org-internal surface; attribution to the author is a feature).
export function formatFrameworksForTraining(
  records: PrescriptionSourceRecord[],
  authorName: (userId: string) => string
): string {
  return records
    .map((r, i) => {
      const f = r.framework;
      const entities = (r.entity_map || [])
        .map((e) => `${e.type}: ${e.name}${e.detail ? ` (${e.detail})` : ""}`)
        .join("; ");
      const lines = [
        `═══ Framework ${i + 1} — authored by ${authorName(r.user_id)} (${new Date(
          r.created_at
        ).toLocaleDateString("en-US")}) ═══`,
      ];
      if (f) {
        lines.push(
          `Name: ${f.name}`,
          `Tagline: ${f.tagline}`,
          `When to apply: ${f.when_to_apply.join(" · ")}`,
          `Signals: ${f.signals.join(" · ")}`,
          `The play: ${f.the_play}`,
          `Why it works: ${f.why_it_works}`,
          `Boundaries: ${f.boundaries.join(" · ")}`
        );
      } else {
        lines.push("(no rendered framework artifact — record fields only)");
      }
      lines.push(
        `Situation it came from: ${r.context_summary ?? "(none)"}`,
        `The signal read: ${r.trigger_signal ?? "(none)"}`,
        `Signal detail: ${r.signal_detail ?? "(none)"}`,
        `The judgment: ${r.judgment ?? "(none)"}`,
        `The reasoning: ${r.rationale ?? "(none)"}`,
        `Boundaries (in the expert's words): ${r.boundaries ?? "(none)"}`,
        `Entities: ${entities || "(none)"}`
      );
      return lines.join("\n");
    })
    .join("\n\n");
}

// ─── The efficacy loop ──────────────────────────────────────────────────────

type EfficacyPrescriptionRow = {
  id: string;
  detection_id: string;
  rung: number;
  status: string;
  delivered_at: string | null;
  efficacy_status: string | null;
  gap_summary: string;
};

type EfficacyDetectionRow = {
  id: string;
  source_type: PrescriptionSourceType;
  subject_entities: EntityMapEntry[];
  evidence_record_ids: string[] | null;
};

export type EfficacyOutcome = {
  prescriptionId: string;
  outcome: "escalated" | "effective" | "watching";
  note: string;
};

export type EfficacySummary = {
  checked: number;
  escalated: number;
  effective: number;
  watching: number;
  outcomes: EfficacyOutcome[];
};

function efficacyEntityKeys(entities: EntityMapEntry[]): Set<string> {
  return new Set(
    (entities || []).map((e) => `${e.type}|${normalizeEntityName(e.name)}`)
  );
}

// Run the efficacy loop for ONE org. Reuses P-4A's detection logic — the
// recurrence check is the same entity-key/trouble-trigger matching the
// detectors use, scoped to records dated AFTER delivered_at. `service` must
// be a service-role client (same write lockdown as the P-4A engine).
//
// Transitions (only prescriptions in status 'delivered', watching):
//   • subject entities recur in ≥1 post-delivery broke/friction record ⇒
//     ESCALATED: rung bumps one (capped at 4 — a failed rung-4 curriculum
//     stays 4 and flags), evidence stored, flagged for a redesigned attempt.
//   • no recurrence and the quiet window has fully elapsed ⇒ EFFECTIVE:
//     logged as proof, status → 'closed'.
//   • no recurrence, window still open ⇒ stays WATCHING (checked_at moves).
//
// A prescription already 'escalated' is NOT re-escalated on re-runs — the
// escalation is a one-way flag that a redesigned delivery (which resets the
// watch) must clear. False escalation wastes trust: only an explicit
// trouble-trigger record carrying the SAME subject entity can escalate,
// never a win, never an adjacent entity (same conservative bias as P-4A's
// non-gaps).
//
// Wins-only doctrine: the stored note names entities and counts, NEVER a
// person. No failure attribution ever rolls up to an individual.
export async function runEfficacyLoop(
  service: SupabaseClient,
  orgId: string
): Promise<EfficacySummary> {
  const summary: EfficacySummary = {
    checked: 0,
    escalated: 0,
    effective: 0,
    watching: 0,
    outcomes: [],
  };

  const { data: rxRaw, error: rxError } = await service
    .from("prescriptions")
    .select("id, detection_id, rung, status, delivered_at, efficacy_status, gap_summary")
    .eq("org_id", orgId)
    .eq("status", "delivered");
  if (rxError) throw new Error(`Could not load delivered prescriptions: ${rxError.message}`);
  const delivered = ((rxRaw || []) as unknown as EfficacyPrescriptionRow[]).filter(
    (r) => r.delivered_at && (r.efficacy_status === "watching" || r.efficacy_status === null)
  );
  if (delivered.length === 0) return summary;

  const { data: detRaw, error: detError } = await service
    .from("prescription_detections")
    .select("id, source_type, subject_entities, evidence_record_ids")
    .in("id", delivered.map((r) => r.detection_id));
  if (detError) throw new Error(`Could not load detections: ${detError.message}`);
  const detById = new Map(
    ((detRaw || []) as unknown as EfficacyDetectionRow[]).map((d) => [d.id, d])
  );

  // One record load covers every prescription: everything complete in the
  // org after the EARLIEST delivery; per-prescription filtering below.
  const earliest = delivered
    .map((r) => r.delivered_at!)
    .sort()[0];
  const { data: recRaw, error: recError } = await service
    .from("pattern_records")
    .select("id, created_at, trigger_type, entity_map")
    .eq("org_id", orgId)
    .eq("status", "complete")
    .gt("created_at", earliest);
  if (recError) throw new Error(`Could not load post-delivery records: ${recError.message}`);
  const newRecords = (recRaw || []) as unknown as {
    id: string;
    created_at: string;
    trigger_type: string | null;
    entity_map: EntityMapEntry[];
  }[];

  const now = Date.now();
  const windowMs = EFFICACY_QUIET_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  for (const rx of delivered) {
    const detection = detById.get(rx.detection_id);
    if (!detection) continue;
    summary.checked++;

    const subjectKeys = efficacyEntityKeys(detection.subject_entities);
    const deliveredMs = new Date(rx.delivered_at!).getTime();
    // The prescription's own founding records are NOT recurrences — a record
    // that triggered the detection is the reason the prescription exists, not
    // evidence the intervention failed. In production these always predate
    // delivery, so created_at > delivered_at already excludes them; but demo
    // data seeded "now" with a backdated delivered_at would otherwise let a
    // founding record masquerade as a post-delivery recurrence. Guard here.
    const foundingIds = new Set(detection.evidence_record_ids || []);

    // Same trouble-trigger + entity-key matching the P-4A detectors use,
    // scoped post-delivery. Wins never escalate (a win record mentioning
    // the subject is the opposite of recurrence).
    const recurrences = newRecords.filter((r) => {
      if (foundingIds.has(r.id)) return false;
      if (new Date(r.created_at).getTime() <= deliveredMs) return false;
      if (r.trigger_type !== "broke" && r.trigger_type !== "friction") return false;
      return (r.entity_map || []).some((e) =>
        subjectKeys.has(`${e.type}|${normalizeEntityName(e.name)}`)
      );
    });

    const subjectNames =
      (detection.subject_entities || []).map((e) => e.name).join(" · ") ||
      "the detected subject";
    const checkedAt = new Date().toISOString();

    if (recurrences.length > 0) {
      // ── ESCALATE: the intervention didn't transfer. One rung up, capped. ──
      const fromRung = rx.rung;
      let toRung: number = Math.min(4, fromRung + 1);
      const capped = fromRung >= 4;
      if (capped) toRung = 4;
      const note =
        `Recurred after delivery: ${recurrences.length} new failure/friction record` +
        `${recurrences.length === 1 ? "" : "s"} carrying "${subjectNames}" dated after ` +
        `${new Date(rx.delivered_at!).toLocaleDateString("en-US")}. ` +
        (capped
          ? `Already at rung 4 — flagged for redesign at the same rung.`
          : `Auto-escalated rung ${fromRung} → ${toRung} (${RUNGS[toRung].label}) — the intervention didn't transfer; regenerate at the bigger rung and redeliver.`);
      const { error } = await service
        .from("prescriptions")
        .update({
          rung: toRung,
          severity: toRung,
          escalated_from_rung: fromRung,
          efficacy_status: "escalated",
          efficacy_note: note,
          efficacy_evidence_record_ids: recurrences.map((r) => r.id),
          efficacy_checked_at: checkedAt,
        })
        .eq("id", rx.id);
      if (error) throw new Error(`Could not escalate prescription ${rx.id}: ${error.message}`);
      summary.escalated++;
      summary.outcomes.push({ prescriptionId: rx.id, outcome: "escalated", note });
    } else if (now - deliveredMs >= windowMs) {
      // ── EFFECTIVE: quiet across the whole window. Proof, logged. ──
      const quietDays = Math.floor((now - deliveredMs) / (24 * 60 * 60 * 1000));
      const note =
        `Quiet for ${quietDays} days post-delivery (window: ${EFFICACY_QUIET_WINDOW_DAYS}) — ` +
        `no new failure/friction records carrying "${subjectNames}". ` +
        `Marked effective: the intervention held on live evidence (Kirkpatrick Level 4, measured automatically).`;
      const { error } = await service
        .from("prescriptions")
        .update({
          status: "closed",
          efficacy_status: "effective",
          efficacy_note: note,
          efficacy_checked_at: checkedAt,
        })
        .eq("id", rx.id);
      if (error) throw new Error(`Could not close prescription ${rx.id}: ${error.message}`);
      summary.effective++;
      summary.outcomes.push({ prescriptionId: rx.id, outcome: "effective", note });
    } else {
      // ── Still WATCHING — quiet, but the window hasn't elapsed. ──
      const daysIn = Math.floor((now - deliveredMs) / (24 * 60 * 60 * 1000));
      const note = `Watching — quiet ${daysIn}/${EFFICACY_QUIET_WINDOW_DAYS} days since delivery, no recurrence of "${subjectNames}".`;
      const { error } = await service
        .from("prescriptions")
        .update({
          efficacy_status: "watching",
          efficacy_note: note,
          efficacy_checked_at: checkedAt,
        })
        .eq("id", rx.id);
      if (error) throw new Error(`Could not update prescription ${rx.id}: ${error.message}`);
      summary.watching++;
      summary.outcomes.push({ prescriptionId: rx.id, outcome: "watching", note });
    }
  }

  return summary;
}
