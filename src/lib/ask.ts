// Phase 6 — Consultative Ask: shared pieces between the /api/ask routes.
// Lives here (not in a route.ts) because Next.js route files may only
// export HTTP handlers.

// Hard cap on follow-up questions — the model should stop earlier once it
// has enough context.
export const MAX_FOLLOWUPS = 4;

export type Match = { id: string; content: string; similarity: number };

// Shape stored in ask_sessions.matched_insights and returned to the UI.
export function toSources(matches: Match[]) {
  return matches.map((m) => ({
    id: m.id,
    excerpt:
      m.content.length > 160 ? `${m.content.slice(0, 157)}...` : m.content,
    similarity: Math.round(m.similarity * 100) / 100,
  }));
}
