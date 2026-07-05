import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export async function POST(req: NextRequest) {
  try {
    const { source_id } = await req.json();

    if (!source_id) {
      return NextResponse.json({ error: 'source_id is required' }, { status: 400 });
    }

    // 1. Pull the source text
    const { data: source, error: sourceError } = await supabase
      .from('sources')
      .select('id, user_id, raw_text, extracted_text')
      .eq('id', source_id)
      .single();

    if (sourceError || !source) {
      return NextResponse.json({ error: 'Source not found' }, { status: 404 });
    }

    const textToProcess = source.extracted_text || source.raw_text;

    if (!textToProcess) {
      return NextResponse.json({ error: 'No text found on this source' }, { status: 400 });
    }

    // 2. Ask Claude to break it into discrete insights
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: `Break the following text into discrete, standalone insights. Each insight should be one clear idea, framework, or takeaway that could stand on its own — not a full paragraph summary.

Return ONLY a JSON array of strings, nothing else. No markdown, no preamble, no code fences.

Text:
"""
${textToProcess}
"""`,
        },
      ],
    });

    const responseText = message.content
      .filter((block) => block.type === 'text')
      .map((block) => ('text' in block ? block.text : ''))
      .join('');

    let insightTexts: string[];
    try {
      const cleaned = responseText.replace(/```json|```/g, '').trim();
      insightTexts = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { error: 'Failed to parse insights from Claude response', raw: responseText },
        { status: 500 }
      );
    }

    if (!Array.isArray(insightTexts) || insightTexts.length === 0) {
      return NextResponse.json({ error: 'No insights extracted' }, { status: 500 });
    }

    // 3. Insert as pending rows
    const rows = insightTexts.map((content) => ({
      user_id: source.user_id,
      source_id: source.id,
      content,
      status: 'pending',
    }));

    const { data: inserted, error: insertError } = await supabase
      .from('insights')
      .insert(rows)
      .select();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, count: inserted.length, insights: inserted });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}