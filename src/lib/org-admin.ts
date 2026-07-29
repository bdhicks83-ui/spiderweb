// TIER 1 / BUILD 1 — the admin console's server-side spine.
//
// ⛔ SERVER-ONLY. This module reaches the service-role key and the Supabase
// auth admin API. A "use client" page that imports it will leak the key into
// the browser bundle — the same boundary that keeps @/lib/claude out of client
// pages. Everything /admin needs travels over /api/admin/*.
//
// The three things that live here rather than in six route handlers:
//   1. requireOrgAdmin()  — the gate, evaluated by Postgres as the caller
//   2. the invite mechanism — create the seat, hand back a link
//   3. computeChecklist() — the setup progress a new admin sees
import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

// ═════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═════════════════════════════════════════════════════════════════════════════

/** Personas an invited seat can be given. Mirrors profiles.persona (P-0.5). */
export const PERSONAS = ["exec", "technical_director", "sr_manager"] as const;
export type Persona = (typeof PERSONAS)[number];

/**
 * profiles.role — the ladder. 'admin' is deliberately NOT here (T1B1: admin is
 * an orthogonal boolean, not a rung — see supabase/t1b1-admin-console.sql).
 *
 * ⭐ FLOOR GUIDE PHASE A added 'contributor', BELOW member. It IS a rung, and
 * the opposite call from 'admin' for a concrete reason: contributor is strictly
 * less than member on the one axis role has ever meant — whose input becomes the
 * team's canonical judgment. Two sources of truth for that one question is how a
 * contributor's capture eventually becomes a framework by accident. See the
 * decision note in supabase/floorguide-a-contributor-tier.sql §1.
 *
 * Order is the ladder, low to high. Mirrored by profiles_role_check in SQL and
 * by ROLE_LADDER in src/lib/floor-guide.ts — change one, change all three.
 */
export const ROLES = ["contributor", "member", "manager"] as const;
export type MemberRole = (typeof ROLES)[number];

/** ⚠️ DRAFT CUSTOMER-FACING COPY — PENDING BRIAN (Floor Guide A). */
export const ROLE_LABELS: Record<MemberRole, string> = {
  contributor: "Contributor",
  member: "Member",
  manager: "Manager",
};

/**
 * The one question worth asking about a role: may this person's input become the
 * org's canonical judgment? DEFAULT-DENY — a future fourth value has to opt in
 * deliberately rather than inherit judgment rights by not being a contributor.
 */
export function roleCanCodify(role: unknown): boolean {
  return role === "member" || role === "manager";
}

/**
 * Platform owner(s) — the only accounts that may create an org for SOMEBODY
 * ELSE and hand its first admin the keys. This is Brian, and it exists so a
 * pilot can be stood up without a seed script. Everyone else creates an org
 * only for themselves, and only if they are not already in one.
 *
 * Overridable via PLATFORM_OWNER_USER_IDS (comma-separated) so this never
 * needs a code change to add a second operator.
 */
const DEFAULT_PLATFORM_OWNER = "a7d205f0-778c-44b9-9e13-4ebd5f47e964";

export function platformOwnerIds(): string[] {
  const raw = process.env.PLATFORM_OWNER_USER_IDS;
  if (!raw) return [DEFAULT_PLATFORM_OWNER];
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.length > 0 ? ids : [DEFAULT_PLATFORM_OWNER];
}

export function isPlatformOwner(userId: string): boolean {
  return platformOwnerIds().includes(userId);
}

/** How long we wait for handle_new_user() to land the profile row. */
const PROFILE_WAIT_TRIES = 12;
const PROFILE_WAIT_MS = 250;

/** listUsers() pages the WHOLE project. Bounded so a route can never hang. */
const AUTH_PAGE_SIZE = 200;
const AUTH_MAX_PAGES = 10;

export function serviceClient(): SupabaseClient {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TYPES
// ═════════════════════════════════════════════════════════════════════════════

export type ProfileRow = {
  id: string;
  org_id: string | null;
  display_name: string | null;
  claimed_title: string | null;
  role: string | null;
  persona: string | null;
  manager_id: string | null;
  is_org_admin: boolean | null;
  deactivated_at: string | null;
  invited_at: string | null;
  created_at: string | null;
  // ─── Floor Guide Phase A ───
  // WHETHER somebody is onboarding is org-readable, and that is correct: an
  // admin turned it on and the console shows who is currently in it. What is
  // private is the QUESTIONS they ask inside it, and that privacy is enforced at
  // the point of write (src/lib/floor-guide.ts), not by hiding this column.
  floor_guide_active: boolean | null;
  floor_guide_started_at: string | null;
  floor_guide_activated_by: string | null;
};

export const PROFILE_COLUMNS =
  "id, org_id, display_name, claimed_title, role, persona, manager_id, is_org_admin, deactivated_at, invited_at, created_at, " +
  "floor_guide_active, floor_guide_started_at, floor_guide_activated_by";

export type OrgRow = {
  id: string;
  name: string;
  industry: string | null;
  default_persona: string | null;
  is_demo: boolean | null;
  created_at: string | null;
};

export const ORG_COLUMNS = "id, name, industry, default_persona, is_demo, created_at";

export type ChecklistItem = {
  key: string;
  label: string;
  detail: string;
  done: boolean;
  /** What the admin should click when it isn't done yet. */
  href: string | null;
};

// ═════════════════════════════════════════════════════════════════════════════
// THE GATE
// ═════════════════════════════════════════════════════════════════════════════

export type AdminContext = {
  user: User;
  orgId: string;
  profile: ProfileRow;
};

export type GateFailure = { ok: false; status: number; error: string; code?: string };
export type GateSuccess = { ok: true; ctx: AdminContext };

/**
 * Proves the caller is a live org admin, and returns their org.
 *
 * ⭐ The authority check is an RPC to public.is_org_admin(), not a column read.
 * Postgres evaluates it as the caller under SECURITY DEFINER, so the answer
 * cannot be widened by anything in the request — and the "a deactivated admin
 * is not an admin" rule lives in exactly one place (the SQL function) instead
 * of being re-remembered in every route.
 *
 * org_id ALWAYS comes off the caller's own profile. It is never read from the
 * request body: a client-supplied org_id is a forgeable tenant boundary.
 */
export async function requireOrgAdmin(
  session: SupabaseClient
): Promise<GateSuccess | GateFailure> {
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "Not logged in" };

  const { data: isAdmin, error: rpcError } = await session.rpc("is_org_admin");
  if (rpcError) {
    return {
      ok: false,
      status: 500,
      error: "Could not check admin access",
      code: "ADMIN_GATE_UNAVAILABLE",
    };
  }
  if (isAdmin !== true) {
    return {
      ok: false,
      status: 403,
      error: "You need admin access on this account to do that.",
      code: "NOT_ORG_ADMIN",
    };
  }

  const { data: profile } = await session
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", user.id)
    .maybeSingle();

  const row = (profile ?? null) as ProfileRow | null;
  if (!row?.org_id) {
    return {
      ok: false,
      status: 409,
      error: "You're not part of an organization yet.",
      code: "NO_ORG",
    };
  }

  return { ok: true, ctx: { user, orgId: row.org_id, profile: row } };
}

// ═════════════════════════════════════════════════════════════════════════════
// AUTH HELPERS
// ═════════════════════════════════════════════════════════════════════════════

export type AuthUserLite = {
  id: string;
  email: string | null;
  last_sign_in_at: string | null;
  banned_until?: string | null;
};

/**
 * There is no getUserByEmail in the admin API, so this pages listUsers().
 * Bounded (10 × 200) so a route can never hang on a large project; at pilot
 * scale the first page answers every call.
 */
export async function findAuthUserByEmail(
  service: SupabaseClient,
  email: string
): Promise<AuthUserLite | null> {
  const needle = email.trim().toLowerCase();
  for (let page = 1; page <= AUTH_MAX_PAGES; page++) {
    const { data, error } = await service.auth.admin.listUsers({
      page,
      perPage: AUTH_PAGE_SIZE,
    });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const users = data?.users ?? [];
    const hit = users.find((u) => (u.email ?? "").toLowerCase() === needle);
    if (hit) {
      return {
        id: hit.id,
        email: hit.email ?? null,
        last_sign_in_at: hit.last_sign_in_at ?? null,
        banned_until: (hit as unknown as { banned_until?: string | null }).banned_until ?? null,
      };
    }
    if (users.length < AUTH_PAGE_SIZE) return null;
  }
  return null;
}

/** Auth users for a known set of profile ids (sign-in state for the people list). */
export async function authUsersByIds(
  service: SupabaseClient,
  ids: string[]
): Promise<Record<string, AuthUserLite>> {
  const wanted = new Set(ids);
  const out: Record<string, AuthUserLite> = {};
  if (wanted.size === 0) return out;

  for (let page = 1; page <= AUTH_MAX_PAGES; page++) {
    const { data, error } = await service.auth.admin.listUsers({
      page,
      perPage: AUTH_PAGE_SIZE,
    });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const users = data?.users ?? [];
    for (const u of users) {
      if (wanted.has(u.id)) {
        out[u.id] = {
          id: u.id,
          email: u.email ?? null,
          last_sign_in_at: u.last_sign_in_at ?? null,
          banned_until: (u as unknown as { banned_until?: string | null }).banned_until ?? null,
        };
      }
    }
    if (Object.keys(out).length === wanted.size) break;
    if (users.length < AUTH_PAGE_SIZE) break;
  }
  return out;
}

/**
 * handle_new_user() (Phase 4) creates the profile row on an auth-users trigger,
 * so a freshly created user's profile is not guaranteed to exist on the very
 * next statement. Same wait the seed scripts use — without it the profile
 * UPDATE that carries org_id/role/title silently affects zero rows and the new
 * person lands in no org at all.
 */
export async function waitForProfile(
  service: SupabaseClient,
  userId: string
): Promise<boolean> {
  for (let i = 0; i < PROFILE_WAIT_TRIES; i++) {
    const { data } = await service
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    if (data) return true;
    await new Promise((r) => setTimeout(r, PROFILE_WAIT_MS));
  }
  // Last resort: create it ourselves. The trigger is 'on conflict do nothing',
  // so this races safely with it rather than against it.
  const { error } = await service.from("profiles").insert({ id: userId });
  if (!error) return true;
  const { data } = await service.from("profiles").select("id").eq("id", userId).maybeSingle();
  return !!data;
}

// ═════════════════════════════════════════════════════════════════════════════
// THE INVITE
// ═════════════════════════════════════════════════════════════════════════════
//
// ⭐ MECHANISM CHOSEN: COPY-A-LINK, NOT EMAIL. There is no transactional email
// path in this codebase (nothing sends mail today), and Supabase's built-in
// SMTP is rate-limited to a level that would fail a real onboarding session in
// front of a customer. So the console generates the link and the admin sends it
// however they already talk to their people. Wiring email later replaces ONE
// function call — the seat, the profile, and the token are all already correct.
//
// ⭐ AND: NO NEW AUTH FLOW. generateLink() is Supabase's own admin API. We never
// see, set, or store a password; we never store the token either. What we hand
// the admin is a URL pointing at THIS app's existing /auth/callback carrying
// Supabase's hashed_token — the documented shape for custom invite delivery.
//
// Why hashed_token and not the raw action_link: the app's browser magic-link
// path is PKCE (a code verifier in the browser's storage). A link generated
// server-side has no such verifier, so the ?code= exchange would fail for the
// invited person. token_hash + verifyOtp is the server-side path that works
// without one. /auth/callback handles both shapes.

/**
 * The origin to build invite links against. Behind Vercel's proxy the
 * request URL's own origin can be the internal one, so the forwarded headers
 * win when they are present. Getting this wrong produces a link that looks
 * fine in the console and 404s for the invited person.
 */
export function requestOrigin(headers: Headers, fallback: string): string {
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  const proto = headers.get("x-forwarded-proto") ?? "https";
  if (host) return `${proto}://${host}`;
  return fallback;
}

export type InviteLink = {
  url: string;
  /** 'invite' (fresh seat, 24h) or 'magiclink' (re-issued, 1h). */
  kind: "invite" | "magiclink";
  expires_hint: string;
};

function callbackUrl(origin: string, tokenHash: string, kind: "invite" | "magiclink"): string {
  const next = kind === "invite" ? "/settings" : "/dashboard";
  return `${origin}/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=${kind}&next=${encodeURIComponent(next)}`;
}

type GenerateLinkResult =
  | { ok: true; link: InviteLink; userId: string }
  | { ok: false; error: string };

/** Fresh seat: creates the auth user AND returns a 24h invite link. */
export async function generateInviteLink(
  service: SupabaseClient,
  email: string,
  origin: string
): Promise<GenerateLinkResult> {
  const { data, error } = await service.auth.admin.generateLink({
    type: "invite",
    email,
  });
  if (error || !data?.properties?.hashed_token || !data?.user?.id) {
    return { ok: false, error: error?.message ?? "Could not generate an invite link." };
  }
  return {
    ok: true,
    userId: data.user.id,
    link: {
      url: callbackUrl(origin, data.properties.hashed_token, "invite"),
      kind: "invite",
      expires_hint: "24 hours",
    },
  };
}

/** Existing seat: a fresh 1h sign-in link. Nothing about the account changes. */
export async function generateSignInLink(
  service: SupabaseClient,
  email: string,
  origin: string
): Promise<GenerateLinkResult> {
  const { data, error } = await service.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error || !data?.properties?.hashed_token || !data?.user?.id) {
    return { ok: false, error: error?.message ?? "Could not generate a sign-in link." };
  }
  return {
    ok: true,
    userId: data.user.id,
    link: {
      url: callbackUrl(origin, data.properties.hashed_token, "magiclink"),
      kind: "magiclink",
      expires_hint: "1 hour",
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// THE SETUP CHECKLIST
// ═════════════════════════════════════════════════════════════════════════════
//
// Reflects REAL state, computed from real rows — never a stored "progress"
// column that can drift away from the thing it claims to describe. It is also
// the on-ramp to Build 2 (Capture Campaign): the item that stays unticked
// longest is always "your experts have codified something," which is exactly
// the problem the next build exists to solve.

export type ChecklistInput = {
  org: OrgRow;
  activeMembers: ProfileRow[];
  /** profile_id → count of COMPLETE pattern_records in this org. */
  capturedByPerson: Record<string, number>;
};

/** Placeholder org names the grandfather/seed paths produce. */
function orgIsNamed(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.trim();
  if (n.length < 2) return false;
  return !/^default org\b/i.test(n) && !/^untitled\b/i.test(n);
}

export function computeChecklist(input: ChecklistInput): {
  items: ChecklistItem[];
  percent: number;
} {
  const { org, activeMembers, capturedByPerson } = input;

  const invitedCount = activeMembers.length;
  const codifiedCount = activeMembers.filter((m) => (capturedByPerson[m.id] ?? 0) > 0).length;
  const hasStructure = activeMembers.some((m) => !!m.manager_id);

  // ⚠️ DRAFT CUSTOMER-FACING COPY — PENDING BRIAN'S SIGN-OFF (T1B1).
  // Register: plain operating-brain (Track B). Opportunity framing, never a
  // scold — an unticked item is the next useful thing to do, not a failure.
  const items: ChecklistItem[] = [
    {
      key: "org_named",
      label: "Name your organization",
      detail: "So attribution and the shared library read as your team, not a placeholder.",
      done: orgIsNamed(org.name),
      href: "#org-settings",
    },
    {
      key: "people_invited",
      label: "Invite your experts",
      detail:
        invitedCount > 0
          ? `${invitedCount} ${invitedCount === 1 ? "person is" : "people are"} on the account.`
          : "The people whose judgment you'd lose if they left tomorrow.",
      done: invitedCount >= 3,
      href: "#people",
    },
    {
      key: "frameworks_codified",
      label: "Get the first frameworks captured",
      detail:
        codifiedCount > 0
          ? `${codifiedCount} of ${invitedCount} ${codifiedCount === 1 ? "person has" : "people have"} codified at least one.`
          : "Nothing is retrievable until somebody codifies something.",
      done: codifiedCount >= 3,
      // T1B2 — this is the one checklist item an admin cannot tick alone, so it
      // points at the surface that asks other people rather than at their own
      // capture session.
      href: "/campaigns",
    },
    {
      key: "reporting_structure",
      label: "Set who reports to whom",
      detail: "This is what makes coaching signals and prescriptions reach the right manager.",
      done: hasStructure,
      href: "#people",
    },
  ];

  const done = items.filter((i) => i.done).length;
  return { items, percent: Math.round((done / items.length) * 100) };
}

// ═════════════════════════════════════════════════════════════════════════════
// VALIDATION
// ═════════════════════════════════════════════════════════════════════════════

export function isValidEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function isRole(value: unknown): value is MemberRole {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function isPersonaValue(value: unknown): value is Persona {
  return typeof value === "string" && (PERSONAS as readonly string[]).includes(value);
}

/** Trim + cap a free-text field. Empty string → null (clears the field). */
export function cleanText(value: unknown, max: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  if (!t) return null;
  return t.slice(0, max);
}

/**
 * Walks manager_id upward from `candidateManagerId` to make sure making them
 * the manager of `personId` cannot create a cycle. A cycle in the reporting
 * chain is not a cosmetic problem: is_manager_of() and the coaching/
 * prescription routing walk this graph, and a loop would either recurse or
 * silently attach a person-level signal to the wrong manager.
 */
export function wouldCycle(
  personId: string,
  candidateManagerId: string,
  managerOf: Record<string, string | null>
): boolean {
  if (personId === candidateManagerId) return true;
  const seen = new Set<string>([personId]);
  let cursor: string | null = candidateManagerId;
  let hops = 0;
  while (cursor && hops < 100) {
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    cursor = managerOf[cursor] ?? null;
    hops++;
  }
  return false;
}
