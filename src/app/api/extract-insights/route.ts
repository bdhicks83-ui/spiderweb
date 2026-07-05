import { NextRequest, NextResponse } from 'next/server';
import { inngest } from '@/inngest/client';

export async function POST(req: NextRequest) {
  try {
    const { source_id } = await req.json();

    if (!source_id) {
      return NextResponse.json({ error: 'source_id is required' }, { status: 400 });
    }

    await inngest.send({
      name: "source/extract-insights",
      data: { source_id },
    });

    return NextResponse.json({ success: true, message: 'Extraction queued' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}