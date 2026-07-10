import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveGapsForInsight } from '@/lib/ask';
import { maybeRebuildVoiceProfile } from '@/lib/voice';
import { detectContradiction } from '@/lib/consistency';
import { scoreInsightAtApproval } from '@/lib/insight-score';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SIMILARITY_THRESHOLD = 0.82;

export async function POST(req: NextRequest) {
  try {
    const { insight_id } = await req.json();
    if (!insight_id) {
      return NextResponse.json({ error: 'insight_id is required' }, { status: 400 });
    }

    const { data: insight, error: fetchError } = await supabase
      .from('insights')
      .select('id, content, user_id')
      .eq('id', insight_id)
      .single();

    if (fetchError || !insight) {
      return NextResponse.json({ error: 'Insight not found' }, { status: 404 });
    }

    const voyageRes = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      },
      body: JSON.stringify({
        input: [insight.content],
        model: 'voyage-large-2',
      }),
    });

    if (!voyageRes.ok) {
      const errText = await voyageRes.text();
      return NextResponse.json({ error: `Voyage API failed: ${errText}` }, { status: 500 });
    }

    const voyageData = await voyageRes.json();
    const embedding = voyageData.data[0].embedding as number[];
    const embeddingString = `[${embedding.join(',')}]`;

    const { error: updateError } = await supabase
      .from('insights')
      .update({ embedding: embeddingString })
      .eq('id', insight_id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Step 6.5 — a newly-embedded insight may answer an open query gap.
    let gapsResolved = 0;
    try {
      gapsResolved = await resolveGapsForInsight(supabase, insight.user_id, embeddingString);
    } catch {
      // non-fatal: gap resolution is best-effort
    }

    // Phase 7 — the approved corpus just grew; refresh the user's voice
    // fingerprint if it has grown enough. Best-effort, never blocks approval.
    try {
      await maybeRebuildVoiceProfile(supabase, insight.user_id);
    } catch {
      // non-fatal: voice profile is a background risk signal
    }

    const { data: matches, error: matchError } = await supabase.rpc('match_insights', {
      query_embedding: embeddingString,
      match_user_id: insight.user_id,
      exclude_id: insight_id,
      match_threshold: SIMILARITY_THRESHOLD,
    });

    if (matchError) {
      return NextResponse.json({ success: true, embedded: true, matchError: matchError.message });
    }

    if (matches && matches.length > 0) {
      const rows = matches.map((m: { id: string; similarity: number }) => ({
        user_id: insight.user_id,
        insight_a_id: insight_id,
        insight_b_id: m.id,
        similarity: m.similarity,
      }));

      const { error: insertError } = await supabase.from('connections').insert(rows);
      if (insertError) {
        return NextResponse.json({ success: true, embedded: true, connectionError: insertError.message });
      }
    }

    // Phase 8 (Block 2) — NON-BLOCKING consistency check. Approval already
    // happened; if this insight contradicts an established pattern, flag it
    // needs_explanation. It then earns no credibility until the expert explains
    // the change (and clears the depth gate). Best-effort: fails open.
    let needsExplanation = false;
    try {
      const finding = await detectContradiction(
        supabase,
        insight.user_id,
        insight_id,
        insight.content,
        embeddingString
      );
      if (finding.contradicts) {
        needsExplanation = true;
        await supabase
          .from('insights')
          .update({
            needs_explanation: true,
            contradiction_note: finding.pattern,
            contradicts_insight_id: finding.contradictedInsightId,
          })
          .eq('id', insight_id);
      }
    } catch {
      // non-fatal: consistency flagging never disrupts approval
    }

    // Phase 8 (Block 1) — lock the per-insight quality score at verification.
    // scoreInsightAtApproval self-skips insights flagged needs_explanation, so
    // a contradiction stays unscored until it's explained.
    try {
      await scoreInsightAtApproval(supabase, insight_id);
    } catch {
      // non-fatal: scoring is additive metadata, never blocks approval
    }

    return NextResponse.json({ success: true, embedded: true, connectionsFound: matches?.length || 0, gapsResolved, needsExplanation });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
