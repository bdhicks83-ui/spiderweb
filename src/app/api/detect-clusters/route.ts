import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Service role client — this route needs to read across the board for the
// logged-in user's own data, called server-side, no browser session involved
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('user_id')

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing user_id parameter' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase.rpc('detect_clusters', {
      p_user_id: userId,
      p_min_similarity: 0.82,
      p_min_members: 3,
    })

    if (error) {
      console.error('detect_clusters RPC error:', error)
      return NextResponse.json(
        { error: 'Failed to detect clusters', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      clusters: data ?? [],
      count: data?.length ?? 0,
    })
  } catch (err) {
    console.error('Unexpected error in detect-clusters route:', err)
    return NextResponse.json(
      { error: 'Unexpected server error' },
      { status: 500 }
    )
  }
}