// Phase 4 — "It Pays" (access control only, no billing).
// Single source of truth for plans, departments, and which plan unlocks what.
// Server-side only by convention: import from server components / API routes.

export type Plan =
  | "free"
  | "professional"
  | "executive"
  | "legacy"
  | "enterprise";

export type DepartmentKey =
  | "knowledge"
  | "chief-of-staff"
  | "communication"
  | "research"
  | "project-acceleration"
  | "commercialization"
  | "career-intelligence"
  | "analytics"
  | "marketplace";

export interface Department {
  key: DepartmentKey;
  name: string;
  description: string;
  emoji: string;
  /** Route the card links to when unlocked; null = coming soon */
  href: string | null;
  /** Cheapest plan that unlocks this department */
  minPlan: Plan;
}

/** Display order + metadata for every department card on the dashboard. */
export const DEPARTMENTS: Department[] = [
  {
    key: "knowledge",
    name: "Knowledge",
    description: "Capture, approve, and connect your insights.",
    emoji: "🧠",
    href: "/upload",
    minPlan: "free",
  },
  {
    key: "chief-of-staff",
    name: "Chief of Staff",
    description: "Your operational right hand.",
    emoji: "🎯",
    href: null,
    minPlan: "professional",
  },
  {
    key: "communication",
    name: "Communication",
    description: "Messaging, writing, and outreach.",
    emoji: "✉️",
    href: null,
    minPlan: "professional",
  },
  {
    key: "research",
    name: "Research",
    description: "Deep dives and synthesis on demand.",
    emoji: "🔬",
    href: null,
    minPlan: "executive",
  },
  {
    key: "project-acceleration",
    name: "Project Acceleration",
    description: "Move initiatives from stuck to shipped.",
    emoji: "🚀",
    href: null,
    minPlan: "executive",
  },
  {
    key: "commercialization",
    name: "Commercialization",
    description: "Turn frameworks into products and revenue.",
    emoji: "💼",
    href: null,
    minPlan: "executive",
  },
  {
    key: "career-intelligence",
    name: "Career Intelligence",
    description: "Positioning, trajectory, and legacy.",
    emoji: "🧭",
    href: null,
    minPlan: "legacy",
  },
  {
    key: "analytics",
    name: "Analytics",
    description: "Metrics across everything you build.",
    emoji: "📊",
    href: null,
    minPlan: "enterprise",
  },
  {
    key: "marketplace",
    name: "Marketplace",
    description: "Distribute and license your IP.",
    emoji: "🏪",
    href: null,
    minPlan: "enterprise",
  },
];

/** Tier ladder — higher index unlocks everything below it. */
const PLAN_ORDER: Plan[] = [
  "free",
  "professional",
  "executive",
  "legacy",
  "enterprise",
];

export const PLAN_LABELS: Record<Plan, string> = {
  free: "Free",
  professional: "Professional — $49/mo",
  executive: "Executive — $149/mo",
  legacy: "Legacy — $299/mo",
  enterprise: "Enterprise — $499+/mo",
};

/** Normalize an unknown DB value to a valid plan (bad/missing → 'free'). */
export function normalizePlan(value: unknown): Plan {
  return PLAN_ORDER.includes(value as Plan) ? (value as Plan) : "free";
}

/** Plan → list of unlocked department keys. Tiers are cumulative. */
export function unlockedDepartments(plan: Plan): DepartmentKey[] {
  const rank = PLAN_ORDER.indexOf(plan);
  return DEPARTMENTS.filter(
    (d) => PLAN_ORDER.indexOf(d.minPlan) <= rank
  ).map((d) => d.key);
}

/** Convenience: is a single department unlocked for this plan? */
export function isUnlocked(plan: Plan, key: DepartmentKey): boolean {
  return unlockedDepartments(plan).includes(key);
}
