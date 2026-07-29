// FLOOR GUIDE / PHASE A — the server-side spine for the contributor tier and
// Floor Guide mode.
//
// ⛔ SERVER-ONLY BY CONVENTION. It takes Supabase clients and is imported by
// API routes and route-side helpers only. It deliberately imports nothing but
// the Supabase types and @/lib/elicitation's artifact type, so it drags in
// neither @/lib/claude nor fs — but a "use client" page still must not import
// it. (Same boundary as @/lib/org-admin and @/lib/knowledge-gaps.)
//
// ═══════════════════════════════════════════════════════════════════════════
// THE TWO IDEAS IN THIS FILE
//
// 1. THE INTEGRITY RULE. Judgment lives with the experts. A contributor uses
//    the system fully — retrieve, ask, Floor Guide, flag a gap — but their
//    input never becomes canonical judgment. The REAL enforcement is a BEFORE
//    trigger on pattern_records (supabase/floorguide-a-contributor-tier.sql
//    §6), because service-role writers bypass RLS and a UI-only guard is
//    cosmetic. What lives here is the KIND refusal in front of it, so a person
//    gets a sentence that makes sense instead of a raised Postgres exception.
//
// 2. ⭐ THE PRIVACY RULE, AND IT IS A WRITE-PATH RULE. Floor Guide promises a
//    nervous new hire that nobody is grading them. That promise is only true if
//    a Floor-Guide retrieval performs NO person-level write. Suppressing at
//    READ time — writing the row and filtering it out of the manager's view —
//    leaves the row sitting in the table for the next reader, the next feature,
//    the next export. So every write is suppressed AT THE POINT OF WRITE.
//
//    THIS FAILURE MODE IS SILENT. Nothing errors. The page still works. The
//    promise just quietly becomes false. That is why resolveFloorGuideMode()
//    exists as one function every entry point must call, rather than each route
//    reading a boolean off the request and remembering to do the right thing.
// ═══════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The framework artifact AS IT ACTUALLY ARRIVES — which is not the same thing as
 * FrameworkArtifact, and the difference has already caused one production bug.
 *
 * pattern_records.framework is MODEL-AUTHORED and schema-enforced nowhere: not
 * at the DB layer, not on the write path, not on read. Typing this parameter as
 * Partial<FrameworkArtifact> asserted that `signals` is a string[], when in
 * practice it can arrive as a string, an object, or null. That is the P-7
 * blank-page bug in its original form — a `signals` that came back as a string
 * survives the `.length > 0` check, survives `.slice`, and then throws on
 * `.map`, taking the whole React tree down with it.
 *
 * beginnerFrame() already coerces every single field, so the loose type is the
 * HONEST signature. Widening it is not a concession to the callers; it is the
 * type finally telling the truth about the data. Anything that reads this shape
 * must coerce — that is the contract, stated in the type rather than remembered.
 */
export type LooseFramework =
  | {
      name?: unknown;
      tagline?: unknown;
      the_play?: unknown;
      signals?: unknown;
      when_to_apply?: unknown;
      why_it_works?: unknown;
      boundaries?: unknown;
    }
  | null
  | undefined;

// ─── The role ladder ────────────────────────────────────────────────────────
//
// contributor → member → manager, with admin as an orthogonal capability
// (T1B1). Mirrored by profiles_role_check in
// supabase/floorguide-a-contributor-tier.sql — change one, change both.
//
// `contributor` is strictly BELOW member on the one axis role has ever meant:
// whose input becomes the team's canonical judgment.
export const ROLE_LADDER = ["contributor", "member", "manager"] as const;
export type LadderRole = (typeof ROLE_LADDER)[number];

export const CONTRIBUTOR_ROLE: LadderRole = "contributor";

export function isLadderRole(value: unknown): value is LadderRole {
  return typeof value === "string" && (ROLE_LADDER as readonly string[]).includes(value);
}

/** Unknown / missing DB value normalizes to 'member' — the historical default. */
export function normalizeRole(value: unknown): LadderRole {
  return isLadderRole(value) ? value : "member";
}

/**
 * DEFAULT-DENY, and the only question worth asking about a role in Phase A:
 * may this person's input become canonical judgment?
 *
 * Written as an explicit deny-list of one rather than an allow-list of two, so
 * a future fourth role value has to be considered deliberately instead of
 * inheriting judgment rights by being "not a contributor."
 */
export function canCreateCanonicalJudgment(role: unknown): boolean {
  const r = normalizeRole(role);
  return r === "member" || r === "manager";
}

/** How many orientation cards the Floor Guide start screen shows. */
export const FLOOR_GUIDE_START_COUNT = 4;

// ─── The viewer ─────────────────────────────────────────────────────────────

export type ViewerContext = {
  userId: string;
  orgId: string | null;
  role: LadderRole;
  isContributor: boolean;
  /** profiles.floor_guide_active AND the seat is open. */
  floorGuideActive: boolean;
  floorGuideStartedAt: string | null;
  displayName: string | null;
  claimedTitle: string | null;
  persona: string | null;
  deactivated: boolean;
};

const VIEWER_COLUMNS =
  "id, org_id, role, display_name, claimed_title, persona, deactivated_at, " +
  "floor_guide_active, floor_guide_started_at";

type ViewerRow = {
  id: string;
  org_id: string | null;
  role: string | null;
  display_name: string | null;
  claimed_title: string | null;
  persona: string | null;
  deactivated_at: string | null;
  floor_guide_active: boolean | null;
  floor_guide_started_at: string | null;
};

/**
 * Read the caller's own profile through the SESSION client.
 *
 * Own-row read, so the existing profiles RLS is the gate and there is no
 * service-role client anywhere near this. Returns null when there is no
 * session — the caller turns that into its own 401 with its own wording.
 */
export async function readViewerContext(
  session: SupabaseClient
): Promise<ViewerContext | null> {
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) return null;

  const { data } = await session
    .from("profiles")
    .select(VIEWER_COLUMNS)
    .eq("id", user.id)
    .maybeSingle();
  const row = (data ?? null) as unknown as ViewerRow | null;

  const role = normalizeRole(row?.role);
  const deactivated = !!row?.deactivated_at;
  return {
    userId: user.id,
    orgId: row?.org_id ?? null,
    role,
    isContributor: role === CONTRIBUTOR_ROLE,
    // A closed seat is not onboarding. Mirrors is_floor_guide_active() in SQL.
    floorGuideActive: !!row?.floor_guide_active && !deactivated,
    floorGuideStartedAt: row?.floor_guide_started_at ?? null,
    displayName: row?.display_name ?? null,
    claimedTitle: row?.claimed_title ?? null,
    persona: row?.persona ?? null,
    deactivated,
  };
}

// ─── The codify gate ────────────────────────────────────────────────────────

export type CodifyGate =
  | { ok: true; viewer: ViewerContext }
  | { ok: false; status: number; error: string; code: string };

/**
 * ⚠️⚠️ DRAFT CUSTOMER-FACING COPY — PENDING BRIAN'S SIGN-OFF (Floor Guide A).
 *
 * A contributor hitting a codify path should never read as "you're not good
 * enough." The honest frame is that codified frameworks carry a name and get
 * treated as the team's official answer, which is a different job from the one
 * they're doing — and the thing they CAN do (ask, and flag what's missing) is
 * genuinely valuable, not a consolation prize.
 *
 * Track B register: plain, kind, lands once. No AI-product framing.
 */
export const CONTRIBUTOR_CODIFY_REFUSAL =
  "Capturing a framework is how your experts publish the team's official answer on something, so it's kept to them for now. What you write here would carry their weight without their sign-off. You can ask the team's brain anything, and flagging what it couldn't answer is the most useful thing anyone does here — that's what tells your experts where to look next.";

export const CONTRIBUTOR_CODIFY_CODE = "CONTRIBUTOR_CANNOT_CODIFY";

/**
 * Proves the caller may create canonical judgment.
 *
 * This is the FRIENDLY half of a two-layer guard. The load-bearing half is the
 * pattern_records trigger, which also covers the service-role paths this gate
 * never sees. If you are tempted to delete one of them, delete this one — but
 * then a contributor gets a raw Postgres exception, which is a worse product.
 */
export async function requireCanCodify(session: SupabaseClient): Promise<CodifyGate> {
  const viewer = await readViewerContext(session);
  if (!viewer) {
    return { ok: false, status: 401, error: "Not logged in", code: "NOT_LOGGED_IN" };
  }
  if (!canCreateCanonicalJudgment(viewer.role)) {
    return {
      ok: false,
      status: 403,
      error: CONTRIBUTOR_CODIFY_REFUSAL,
      code: CONTRIBUTOR_CODIFY_CODE,
    };
  }
  return { ok: true, viewer };
}

// ─── ⭐ THE PRIVACY DECISION, IN ONE PLACE ──────────────────────────────────

export type FloorGuideMode = {
  viewer: ViewerContext;
  /**
   * TRUE means: perform NO person-level write on this request. Not "write it
   * and hide it later" — do not write it.
   */
  floorGuide: boolean;
  /** The client asked for Floor Guide but it isn't turned on for them. */
  requestedButInactive: boolean;
};

/**
 * ⭐⭐ THE LOAD-BEARING FUNCTION OF THIS BUILD.
 *
 * Decides whether this request is a Floor Guide request, and therefore whether
 * every person-level write downstream is suppressed.
 *
 * IT IS AN `AND`, AND THE ORDER OF THE TWO OPERANDS IS THE WHOLE POINT:
 *
 *   floorGuide = (the client asked for Floor Guide) AND (the SERVER says this
 *                person actually has Floor Guide turned on)
 *
 * WHY THE CLIENT GETS A VOTE AT ALL: the same human uses both surfaces. On
 * /retrieve their "this helped" judgment is exactly the telemetry the product
 * is built to learn from; on /floor-guide the identical click must leave no
 * trace. Nothing server-side can tell those apart, so the surface has to say
 * which one it is.
 *
 * WHY THE CLIENT CANNOT DECIDE ALONE: a forged `floor_guide: true` only ever
 * SUPPRESSES a write — worst case somebody opts out of our telemetry, which is
 * not a security event. But the reverse — trusting a client that says false
 * while the person is sitting in Floor Guide — would break the promise on
 * screen. So the server's `floor_guide_active` is a required conjunct, and the
 * page REFUSES TO RENDER at all when it is false (see /api/floor-guide). There
 * is no state in which the "nobody's grading you" copy is on screen while the
 * writes are live.
 *
 * WHY IT RETURNS `requestedButInactive` RATHER THAN QUIETLY DEGRADING: a
 * request that asked for privacy and didn't get it is the exact silent failure
 * this build is most afraid of. The caller surfaces it instead of guessing.
 */
export async function resolveFloorGuideMode(
  session: SupabaseClient,
  requested: unknown
): Promise<FloorGuideMode | null> {
  const viewer = await readViewerContext(session);
  if (!viewer) return null;
  const asked = requested === true;
  const floorGuide = asked && viewer.floorGuideActive;
  return { viewer, floorGuide, requestedButInactive: asked && !viewer.floorGuideActive };
}

/**
 * The one-line breadcrumb every suppressed write leaves in the server log.
 *
 * A suppression that logs nothing is indistinguishable from a write path that
 * quietly broke — and "the privacy is working" and "the writer is dead" must
 * never look the same in a log. Deliberately carries NO person identifier: a
 * log line naming who asked what in Floor Guide would recreate the exact record
 * the suppression exists to prevent.
 */
export function logSuppressed(surface: string, what: string): void {
  console.log(
    `[floor-guide] suppressed ${what} on ${surface} — Floor Guide is private by design ` +
      `(no person-level write). Not an error.`
  );
}

// ─── Beginner framing ───────────────────────────────────────────────────────

function asArray(v: unknown, max: number): string[] {
  const list = Array.isArray(v)
    ? v.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    : typeof v === "string" && v.trim().length > 0
      ? [v]
      : [];
  return list.slice(0, max);
}

function asText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export type BeginnerFrame = {
  /** "Here's what to do." Lead with this, always. */
  the_call: string;
  /** "Who to grab." The expert whose judgment this is. */
  who_to_grab: string | null;
  /** What to look/listen for, in their words. */
  watch_for: string[];
  /** When this applies at all. */
  when_it_applies: string[];
  /** The expert's reasoning. Real, and deliberately BELOW the call. */
  why: string;
  /** Where it stops applying. */
  careful_when: string[];
};

/**
 * Re-present a framework for somebody on day three.
 *
 * SAME FRAMEWORK, SAME WORDS, DIFFERENT ORDER. This function invents nothing,
 * simplifies nothing, and paraphrases nothing — it only decides what a beginner
 * reads FIRST. The expert-facing card leads with the situation and the
 * reasoning, because an expert is deciding whether they agree. A new hire is
 * not deciding anything yet; they need the call and the name of the person who
 * owns it, and the reasoning matters to them the second time they read it.
 *
 * ⚠️ `framework` is a MODEL-AUTHORED artifact with no schema enforcement at the
 * DB layer, so every list field is coerced (the P-7 blank-page lesson: a
 * `signals` that arrived as a string survives `.length` and throws on `.map`).
 */
export function beginnerFrame(
  framework: LooseFramework,
  author: { display_name?: string | null; claimed_title?: string | null } | null
): BeginnerFrame {
  const name = asText(author?.display_name);
  const title = asText(author?.claimed_title);
  const who = name ? (title ? `${name} — ${title}` : name) : null;
  return {
    the_call: asText(framework?.the_play),
    who_to_grab: who,
    watch_for: asArray(framework?.signals, 3),
    when_it_applies: asArray(framework?.when_to_apply, 2),
    why: asText(framework?.why_it_works),
    careful_when: asArray(framework?.boundaries, 2),
  };
}

/**
 * The scoping text for the oriented start.
 *
 * Role-scoped means "operator sees operator judgment first; a new PM sees PM
 * stuff," and the honest material for that is what the admin already typed into
 * their profile — their title. Embedding that title and taking the nearest
 * frameworks reuses the retrieval engine exactly as it is, with no new scoring
 * model and no taxonomy to maintain.
 *
 * Returns null when there is nothing to scope BY, which is a real case and not
 * an error: the caller falls back to the org's most-recent frameworks rather
 * than showing a beginner an empty screen on their first morning.
 */
export function floorGuideScopeQuery(viewer: ViewerContext): string | null {
  const title = asText(viewer.claimedTitle);
  if (!title) return null;
  // Phrased as a situation rather than a job title, because pattern_records are
  // embedded as documents about situations — "what matters in this job" matches
  // that shape far better than the bare noun phrase does.
  return `What a ${title} needs to get right day to day, and the calls that go wrong when they don't.`;
}
