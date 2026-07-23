'use client';

// Phase 8 (Block 2) — NON-BLOCKING approval. Approving an insight no longer
// runs a pre-check that can block it. It approves immediately; the consistency
// check now runs server-side on the embed path (/api/embed-insights) and, if
// the insight contradicts an established pattern, flags it needs_explanation.
// The expert resolves that later from the dashboard "Needs your context" card.
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const supabase = createClient();

type Insight = {
  id: string;
  content: string;
  source_id: string;
  status: string;
};

export default function ApprovePage() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // First-ever-approval badge state
  const [priorApprovedCount, setPriorApprovedCount] = useState<number | null>(null);
  const [showFirstBadge, setShowFirstBadge] = useState(false);
  // P-3 (Build 1) — embedding failures used to be swallowed here (fire-and-
  // forget). Approval still succeeds immediately, but if the follow-on embed
  // fails we now SAY so instead of pretending it worked.
  const [embedWarning, setEmbedWarning] = useState<string | null>(null);

  useEffect(() => {
    loadInsights();
  }, []);

  async function loadInsights() {
    setLoading(true);
    setLoadError(null);
    setActionError(null);
    try {
      const { data, error } = await supabase
        .from('insights')
        .select('id, content, source_id, status')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

      if (error) {
        setLoadError('Could not load insights. Try refreshing.');
        setInsights([]);
      } else {
        setInsights(data || []);
        setIndex(0);
      }

      const { count, error: countError } = await supabase
        .from('insights')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'approved');

      setPriorApprovedCount(countError ? 1 : (count ?? 0));
    } catch {
      setLoadError('Something went wrong loading insights.');
      setInsights([]);
    }
    setLoading(false);
  }

  async function fireEmbed(insightId: string) {
    // This kicks off embedding, connection-building, the non-blocking
    // consistency flag, and the quality score lock — all server-side. Approval
    // has already been saved; this runs after. It is no longer fire-and-forget:
    // if the embed fails (e.g. a Voyage rate limit the server couldn't retry
    // past), we surface a non-blocking notice so the insight can be re-embedded
    // instead of silently never getting a vector.
    try {
      const res = await fetch('/api/embed-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ insight_id: insightId }),
      });
      if (!res.ok) {
        setEmbedWarning(
          "Approved and saved — but search indexing for the last insight didn't complete. It'll be picked up on the next re-embed; nothing was lost."
        );
      }
    } catch {
      setEmbedWarning(
        "Approved and saved — but search indexing for the last insight didn't complete (network hiccup). Nothing was lost."
      );
    }
  }

  // Shared post-approval: first-insight badge + advance to the next card.
  function afterApprove() {
    if (priorApprovedCount === 0) {
      setShowFirstBadge(true);
      setPriorApprovedCount(1);
    } else {
      setShowFirstBadge(false);
      if (priorApprovedCount !== null) setPriorApprovedCount(priorApprovedCount + 1);
    }
    setProcessing(false);
    setActionError(null);
    setIndex((prev) => prev + 1);
  }

  async function approve() {
    if (processing) return;
    setProcessing(true);
    setActionError(null);
    setEmbedWarning(null);
    const current = insights[index];
    const { error } = await supabase
      .from('insights')
      .update({ status: 'approved', decided_at: new Date().toISOString() })
      .eq('id', current.id);
    if (error) {
      setActionError("That didn't save. Try again.");
      setProcessing(false);
      return;
    }
    fireEmbed(current.id);
    afterApprove();
  }

  async function reject() {
    if (processing) return;
    setProcessing(true);
    setActionError(null);
    const current = insights[index];
    const { error } = await supabase
      .from('insights')
      .update({ status: 'rejected', decided_at: new Date().toISOString() })
      .eq('id', current.id);
    if (error) {
      setActionError("That didn't save. Try again.");
      setProcessing(false);
      return;
    }
    setShowFirstBadge(false);
    setProcessing(false);
    setIndex((prev) => prev + 1);
  }

  const firstBadge = showFirstBadge ? (
    <p style={styles.firstBadge}>🌱 First insight captured</p>
  ) : null;

  if (loading) {
    return (
      <div style={styles.center}>
        <p>Loading insights...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={styles.center}>
        <h2>Error: {loadError}</h2>
        <button style={styles.secondaryButton} onClick={loadInsights}>
          Try again
        </button>
      </div>
    );
  }

  if (insights.length === 0) {
    return (
      <div style={styles.center}>
        <h2>No pending insights.</h2>
        <p>Upload something and extract insights first.</p>
      </div>
    );
  }

  if (index >= insights.length) {
    return (
      <div style={styles.center}>
        {firstBadge}
        <h2>All done!</h2>
        <p>
          You reviewed {insights.length} insight{insights.length === 1 ? '' : 's'}.
        </p>
        {embedWarning && <p style={styles.embedWarning}>{embedWarning}</p>}
        <button style={styles.secondaryButton} onClick={loadInsights}>
          Check for more
        </button>
      </div>
    );
  }

  const current = insights[index];

  return (
    <div style={styles.wrapper}>
      <div style={styles.progress}>
        {index + 1} of {insights.length}
      </div>

      {firstBadge}

      <div style={styles.card}>
        <p style={styles.content}>{current.content}</p>
      </div>

      {actionError && <p style={styles.errorText}>{actionError}</p>}
      {embedWarning && <p style={styles.embedWarning}>{embedWarning}</p>}

      <div style={styles.buttonRow}>
        <button
          style={{ ...styles.bigButton, ...styles.reject }}
          onClick={reject}
          disabled={processing}
        >
          Reject
        </button>
        <button
          style={{ ...styles.bigButton, ...styles.approve }}
          onClick={approve}
          disabled={processing}
        >
          {processing ? 'Saving…' : 'Approve'}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    gap: '24px',
    fontFamily: 'system-ui, sans-serif',
  },
  center: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    fontFamily: 'system-ui, sans-serif',
    textAlign: 'center',
  },
  progress: {
    fontSize: '14px',
    color: '#888',
    fontWeight: 500,
  },
  firstBadge: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#16a34a',
    backgroundColor: '#f0fdf4',
    border: '1px solid #bbf7d0',
    borderRadius: '9999px',
    padding: '6px 14px',
    margin: 0,
  },
  card: {
    maxWidth: '600px',
    width: '100%',
    minHeight: '200px',
    padding: '32px',
    borderRadius: '16px',
    backgroundColor: '#f5f5f5',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
  },
  content: {
    fontSize: '20px',
    lineHeight: 1.5,
    textAlign: 'center',
    margin: 0,
  },
  errorText: {
    color: '#ef4444',
    fontSize: '14px',
    margin: 0,
  },
  embedWarning: {
    color: '#92400e',
    background: '#fffbeb',
    border: '1px solid #fde68a',
    borderRadius: '8px',
    padding: '8px 12px',
    fontSize: '13px',
    margin: 0,
    maxWidth: '600px',
    textAlign: 'center',
    lineHeight: 1.4,
  },
  buttonRow: {
    display: 'flex',
    gap: '16px',
    width: '100%',
    maxWidth: '600px',
  },
  bigButton: {
    flex: 1,
    padding: '20px',
    fontSize: '18px',
    fontWeight: 600,
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    color: '#fff',
  },
  approve: {
    backgroundColor: '#22c55e',
  },
  reject: {
    backgroundColor: '#ef4444',
  },
  secondaryButton: {
    padding: '10px 20px',
    borderRadius: '8px',
    border: '1px solid #ccc',
    backgroundColor: '#fff',
    cursor: 'pointer',
  },
};
