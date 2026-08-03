// ⭐ THE "WHO ELSE NEEDS IT" BEAT — routing suggestions for a generated training.
//
// After the Studio generates a training, this names the SPECIFIC people (and
// the role) who share the same gap, WITH THE REASON each one is flagged. This
// is the money beat of the training demo: the system doesn't just make
// content — it knows the workforce well enough to say who the content is for.
//
// 🛡️ TRAINING-NOT-SURVEILLANCE GUARDRAIL (P-7 / Phase C doctrine, physical
// here, not verbal): every reason this module can emit is about EXPOSURE,
// RECENCY, or ROLE — "holds the same seat," "the fix never formally reached
// them," "the gap is seat-shaped." No reason is ever derived from a person's
// performance, mistakes, assessments, or coaching signals, because this module
// simply never reads those tables. Routing answers "who needs this training,"
// never "who is failing."
//
// Server-only (service-role reads across profiles + pattern_records). Reuses
// the existing org structures — profiles (claimed_title, role, manager_id) and
// pattern_records entity_map — rather than inventing a new targeting store.
import type { SupabaseClient } from "@supabase/supabase-js";

export type RoutingTarget = {
  kind: "person" | "role";
  /** Set for kind="person"; null for a role-level target. */
  user_id: string | null;
  /** Display name for a person, role label for a role. */
  label: string;
  /** The person's title, or the role's scope line. Nullable. */
  detail: string | null;
  /** WHY this target is flagged — exposure / recency / role, never performance. */
  reason: string;
};

export function isRoutingTargetArray(v: unknown): v is RoutingTarget[] {
  if (!Array.isArray(v)) return false;
  return v.every(
    (t) =>
      t &&
      typeof t === "object" &&
      ((t as RoutingTarget).kind === "person" || (t as RoutingTarget).kind === "role") &&
      typeof (t as RoutingTarget).label === "string" &&
      typeof (t as RoutingTarget).reason === "string"
  );
}

const STOP_TOKENS = new Set([
  "the", "a", "an", "of", "and", "or", "to", "for", "in", "on", "at",
  "new", "experienced", "mixed", "team", "line", "all", "any",
]);

function tokens(s: string | null | undefined): Set<string> {
  if (!s) return new Set();
  return new Set(
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, " ")
      .split(/[\s-]+/)
      .filter((t) => t.length > 2 && !STOP_TOKENS.has(t))
  );
}

function overlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  return n;
}

type ProfileRow = {
  id: string;
  display_name: string | null;
  claimed_title: string | null;
  role: string | null;
  deactivated_at: string | null;
};

export type ComputeRoutingInput = {
  orgId: string;
  /** The training's audience role (training_requests.audience_role). */
  audienceRole: string | null;
  /** Free-text audience line, used as a fallback matching surface. */
  audienceSummary: string;
  /** The training's subject entities — the territory the gap lives in. */
  subjectEntities: { type: string; name: string; detail: string | null }[];
  /** Never route the training back at its own sources or its requester. */
  excludeUserIds: string[];
};

/**
 * Compute routing suggestions from the org's real structure.
 *
 * Heuristics (all exposure/role-framed, in priority order):
 *   1. People whose claimed_title matches the audience role — they hold the
 *      seat the training addresses.
 *   2. Among those, people with NO complete framework touching the subject
 *      entities — the judgment has never formally reached their seat, which
 *      is the recency/exposure signal, not a judgment of the person.
 *   3. The role itself, always last — the gap is seat-shaped, and routing to
 *      the role is what makes this training, not surveillance.
 *
 * Fail-soft: any read error returns [] and the Studio works exactly as it
 * did before this feature existed.
 */
export async function computeRoutingTargets(
  service: SupabaseClient,
  input: ComputeRoutingInput
): Promise<RoutingTarget[]> {
  try {
    const { data: profRaw, error } = await service
      .from("profiles")
      .select("id, display_name, claimed_title, role, deactivated_at")
      .eq("org_id", input.orgId);
    if (error || !profRaw) return [];

    const excluded = new Set(input.excludeUserIds);
    const audienceTokens = tokens(input.audienceRole ?? input.audienceSummary);
    const candidates = (profRaw as ProfileRow[]).filter(
      (p) =>
        !excluded.has(p.id) &&
        !p.deactivated_at &&
        p.display_name &&
        p.claimed_title &&
        overlap(tokens(p.claimed_title), audienceTokens) >= 1
    );

    // Which candidates have a complete framework touching this territory?
    // (Their judgment already covers it — the fix has reached them.)
    const touched = new Set<string>();
    if (candidates.length > 0 && input.subjectEntities.length > 0) {
      const entityTokens = input.subjectEntities.map((e) => tokens(e.name));
      const { data: recRaw } = await service
        .from("pattern_records")
        .select("user_id, entity_map")
        .eq("org_id", input.orgId)
        .eq("status", "complete")
        .in(
          "user_id",
          candidates.map((c) => c.id)
        );
      for (const r of (recRaw || []) as {
        user_id: string;
        entity_map: { name: string }[] | null;
      }[]) {
        for (const e of r.entity_map || []) {
          const et = tokens(e.name);
          if (entityTokens.some((s) => overlap(s, et) >= 1)) {
            touched.add(r.user_id);
            break;
          }
        }
      }
    }

    const persons: RoutingTarget[] = candidates.slice(0, 6).map((p) => ({
      kind: "person",
      user_id: p.id,
      label: p.display_name!,
      detail: p.claimed_title,
      reason: touched.has(p.id)
        ? `Holds the seat this training addresses (${p.claimed_title}) — same exposure to the situation it covers.`
        : `Holds the seat this training addresses (${p.claimed_title}), and no captured framework on this territory has formally reached them yet.`,
    }));

    // Untouched-territory people first — highest exposure to the gap.
    persons.sort((a, b) => {
      const at = a.user_id && touched.has(a.user_id) ? 1 : 0;
      const bt = b.user_id && touched.has(b.user_id) ? 1 : 0;
      return at - bt;
    });

    const out = persons.slice(0, 3);
    if (input.audienceRole) {
      out.push({
        kind: "role",
        user_id: null,
        label: input.audienceRole,
        detail: "everyone in the seat",
        reason:
          "The gap is seat-shaped, not personal — routing to the whole role is what keeps this training, never a mark against any one person.",
      });
    }
    return out;
  } catch {
    return [];
  }
}
