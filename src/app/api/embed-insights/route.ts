import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

    return NextResponse.json({ success: true, embedded: true, connectionsFound: matches?.length || 0 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
