'use client';

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

  useEffect(() => {
    loadInsights();
  }, []);

  async function loadInsights() {
    setLoading(true);
    setLoadError(null);
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
    } catch (err) {
      setLoadError('Something went wrong loading insights.');
      setInsights([]);
    }
    setLoading(false);
  }

  async function decide(status: 'approved' | 'rejected') {
    if (processing) return;
    setProcessing(true);
    setActionError(null);

    const current = insights[index];

    try {
      const { error } = await supabase
        .from('insights')
        .update({ status, decided_at: new Date().toISOString() })
        .eq('id', current.id);

      if (error) {
        setActionError("That didn't save. Try again.");
        setProcessing(false);
        return;
      }

      if (status === 'approved') {
        fetch('/api/embed-insights', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ insight_id: current.id }),
        }).catch(() => {});
      }

      setProcessing(false);
      setIndex((prev) => prev + 1);
    } catch (err) {
      setActionError('Something went wrong. Try again.');
      setProcessing(false);
    }
  }

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
        <h2>All done!</h2>
        <p>
          You reviewed {insights.length} insight{insights.length === 1 ? '' : 's'}.
        </p>
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

      <div style={styles.card}>
        <p style={styles.content}>{current.content}</p>
      </div>

      {actionError && <p style={styles.errorText}>{actionError}</p>}

      <div style={styles.buttonRow}>
        <button
          style={{ ...styles.bigButton, ...styles.reject }}
          onClick={() => decide('rejected')}
          disabled={processing}
        >
          Reject
        </button>
        <button
          style={{ ...styles.bigButton, ...styles.approve }}
          onClick={() => decide('approved')}
          disabled={processing}
        >
          Approve
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