// Phase 7 — Voice profile: a running writing-style fingerprint per user, built
// from their OWN (self_reported) approved insights. Used by the per-upload
// voice-mismatch risk signal to notice when a new "own" upload doesn't read
// like the same person wrote it.
//
// Everything here is best-effort. A failure never blocks approval or
// extraction — the signal simply doesn't fire.
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildVoiceFingerprint, checkVoiceMatch, type MatchJudgement } from "@/lib/claude";

// A profile only exists once the author has enough of their own approved
// writing to fingerprint. Below this, the voice check is skipped entirely.
export const MIN_VOICE_SAMPLES = 5;
// Rebuild the fingerprint each time the approved-own corpus grows by this many
// insights past the last time it was built (keeps it cheap, not per-approval).
const VOICE_REBUILD_EVERY = 5;
// Cap how many samples feed the fingerprint call, newest first, to bound tokens.
const MAX_FINGERPRINT_SAMPLES = 40;

// Contents of the user's approved, self_reported ("own") insights, newest
// first. Two cheap queries (no FK embed): the "own" source ids, then the
// approved insights that hang off them.
async function ownApprovedContents(
  service: SupabaseClient,
  userId: string
): Promise<string[]> {
  const { data: sources } = await service
    .from("sources")
    .select("id")
    .eq("user_id", userId)
    .eq("origin", "self_reported");
  const ownSourceIds = new Set(
    ((sources as { id: string }[] | null) || []).map((s) => s.id)
  );
  if (ownSourceIds.size === 0) return [];

  const { data: insights } = await service
    .from("insights")
    .select("content, source_id")
    .eq("user_id", userId)
    .eq("status", "approved")
    .order("created_at", { ascending: false });

  return ((insights as { content: string; source_id: string }[] | null) || [])
    .filter((i) => ownSourceIds.has(i.source_id) && i.content?.trim())
    .map((i) => i.content);
}

// Rebuild the fingerprint if the own-corpus has grown enough since the last
// build (or there is no profile yet and we've crossed the minimum). Called
// after an insight is approved. Fully best-effort.
export async function maybeRebuildVoiceProfile(
  service: SupabaseClient,
  userId: string
): Promise<{ rebuilt: boolean; sampleCount: number }> {
  try {
    const contents = await ownApprovedContents(service, userId);
    const count = contents.length;
    if (count < MIN_VOICE_SAMPLES) return { rebuilt: false, sampleCount: count };

    const { data: existing } = await service
      .from("voice_profiles")
      .select("sample_count")
      .eq("user_id", userId)
      .maybeSingle();
    const lastCount = (existing as { sample_count: number } | null)?.sample_count ?? 0;

    // First build once past the minimum, then only every VOICE_REBUILD_EVERY.
    const isFirstBuild = !existing;
    if (!isFirstBuild && count - lastCount < VOICE_REBUILD_EVERY) {
      return { rebuilt: false, sampleCount: count };
    }

    const fingerprint = await buildVoiceFingerprint(
      contents.slice(0, MAX_FINGERPRINT_SAMPLES)
    );
    if (!fingerprint) return { rebuilt: false, sampleCount: count };

    await service.from("voice_profiles").upsert({
      user_id: userId,
      fingerprint,
      sample_count: count,
      updated_at: new Date().toISOString(),
    });
    return { rebuilt: true, sampleCount: count };
  } catch {
    return { rebuilt: false, sampleCount: 0 };
  }
}

// Compare a new upload's text against the user's established voice fingerprint.
// Returns the model's judgement, or null when there's no profile yet or the
// call fails (fail-open — caller fires nothing on null).
export async function checkVoiceMismatch(
  service: SupabaseClient,
  userId: string,
  text: string
): Promise<MatchJudgement | null> {
  try {
    const { data: profile } = await service
      .from("voice_profiles")
      .select("fingerprint, sample_count")
      .eq("user_id", userId)
      .maybeSingle();
    const row = profile as { fingerprint: string; sample_count: number } | null;
    if (!row || row.sample_count < MIN_VOICE_SAMPLES || !row.fingerprint) {
      return null;
    }
    return await checkVoiceMatch(row.fingerprint, text.slice(0, 8000));
  } catch {
    return null;
  }
}
