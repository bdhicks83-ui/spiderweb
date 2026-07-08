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

type Contradiction = {
  pattern: string | null;
  contradictedInsightId: string | null;
  excerpt: string | null;
};

// reviewing → checking (consistency) → either back to reviewing (consistent,
// advances) or blocked (contradiction: revise / genuine-exception).
type Phase = 'reviewing' | 'checking' | 'blocked';
type BlockChoice = 'menu' | 'revise' | 'exception';

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
  // Consistency-check state
  const [phase, setPhase] = useState<Phase>('reviewing');
  const [contradiction, setContradiction] = useState<Contradiction | null>(null);
  const [blockChoice, setBlockChoice] = useState<BlockChoice>('menu');
  const [editText, setEditText] = useState('');
  const [justification, setJustification] = useState('');

  useEffect(() => {
    loadInsights();
  }, []);

  async function loadInsights() {
    setLoading(true);
    setLoadError(null);
    resetFlow();
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
    } catch (err) {
      setLoadError('Something went wrong loading insights.');
      setInsights([]);
    }
    setLoading(false);
  }

  function resetFlow() {
    setPhase('reviewing');
    setContradiction(null);
    setBlockChoice('menu');
    setEditText('');
    setJustification('');
    setActionError(null);
  }

  function fireEmbed(insightId: string) {
    fetch('/api/embed-insights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ insight_id: insightId }),
    }).catch(() => {});
  }

  // Shared post-approval: badge + advance to the next card.
  function afterApprove() {
    if (priorApprovedCount === 0) {
      setShowFirstBadge(true);
      setPriorApprovedCount(1);
    } else {
      setShowFirstBadge(false);
      if (priorApprovedCount !== null) setPriorApprovedCount(priorApprovedCount + 1);
    }
    setProcessing(false);
    resetFlow();
    setIndex((prev) => prev + 1);
  }

  // Approve click → run the consistency check first.
  async function onApprove() {
    if (processing || phase === 'checking') return;
    const current = insights[index];
    setActionError(null);
    setPhase('checking');
    try {
      const res = await fetch('/api/approve-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ insightId: current.id }),
      });
      const data = await res.json();
      if (res.status === 401) {
        setActionError('Please log in again.');
        setPhase('reviewing');
        return;
      }
      if (data.verdict === 'contradiction') {
        setContradiction({
          pattern: data.pattern ?? null,
          contradictedInsightId: data.contradictedInsightId ?? null,
          excerpt: data.contradictedExcerpt ?? null,
        });
        setBlockChoice('menu');
        setEditText(current.content);
        setJustification('');
        setPhase('blocked');
        return;
      }
      // 'consistent' (including fail-open) → approve normally.
      await finalizeConsistentApproval(current.id);
    } catch {
      setActionError("Couldn't run the consistency check. Try again.");
      setPhase('reviewing');
    }
  }

  async function finalizeConsistentApproval(insightId: string) {
    setProcessing(true);
    const { error } = await supabase
      .from('insights')
      .update({ status: 'approved', decided_at: new Date().toISOString() })
      .eq('id', insightId);
    if (error) {
      setActionError("That didn't save. Try again.");
      setProcessing(false);
      setPhase('reviewing');
      return;
    }
    fireEmbed(insightId);
    afterApprove();
  }

  async function reject() {
    if (processing || phase === 'checking') return;
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
    resetFlow();
    setIndex((prev) => prev + 1);
  }

  // Revise: save the edited content, then re-run the check on the new text.
  async function saveRevision() {
    const current = insights[index];
    const text = editText.trim();
    if (!text) {
      setActionError('Add some text to continue.');
      return;
    }
    setProcessing(true);
    setActionError(null);
    const { error } = await supabase
      .from('insights')
      .update({ content: text })
      .eq('id', current.id);
    if (error) {
      setActionError("Couldn't save your edit. Try again.");
      setProcessing(false);
      return;
    }
    setInsights((list) =>
      list.map((it, i) => (i === index ? { ...it, content: text } : it))
    );
    setProcessing(false);
    setContradiction(null);
    setBlockChoice('menu');
    setPhase('reviewing');
    // Re-check the revised insight (reads the freshly-saved content by id).
    await onApprove();
  }

  async function submitException() {
    const text = justification.trim();
    if (!text) {
      setActionError('Add a short justification to continue.');
      return;
    }
    setProcessing(true);
    setActionError(null);
    const current = insights[index];
    try {
      const res = await fetch('/api/approve-exception', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          insightId: current.id,
          contradictedInsightId: contradiction?.contradictedInsightId ?? null,
          justification: text,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error || "Couldn't save. Try again.");
        setProcessing(false);
        return;
      }
      fireEmbed(current.id);
      afterApprove();
    } catch {
      setActionError("Couldn't save. Try again.");
      setProcessing(false);
    }
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
        <button style={styles.secondaryButton} onClick={loadInsights}>
          Check for more
        </button>
      </div>
    );
  }

  const current = insights[index];
  const blocked = phase === 'blocked' && contradiction;

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

      {phase === 'checking' && (
        <p style={styles.checkingText}>Checking against your existing insights…</p>
      )}

      {blocked ? (
        <div style={styles.blockPanel}>
          <p style={styles.blockHeading}>
            This doesn&apos;t match your existing pattern
            {contradiction.pattern ? (
              <> of <em>“{contradiction.pattern}”</em></>
            ) : null}
            .
          </p>
          {contradiction.excerpt && (
            <p style={styles.blockExcerpt}>
              <span style={styles.blockExcerptLabel}>Your earlier insight:</span>{' '}
              {contradiction.excerpt}
            </p>
          )}

          {blockChoice === 'menu' && (
            <>
              <p style={styles.blockPrompt}>Revise it, or is this a genuine exception?</p>
              <div style={styles.blockButtonRow}>
                <button
                  style={styles.blockPrimary}
                  onClick={() => {
                    setActionError(null);
                    setBlockChoice('revise');
                  }}
                  disabled={processing}
                >
                  Let me revise this
                </button>
                <button
                  style={styles.blockSecondary}
                  onClick={() => {
                    setActionError(null);
                    setBlockChoice('exception');
                  }}
                  disabled={processing}
                >
                  It&apos;s a genuine exception
                </button>
              </div>
            </>
          )}

          {blockChoice === 'revise' && (
            <>
              <textarea
                style={styles.blockTextarea}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={4}
                disabled={processing}
              />
              <div style={styles.blockButtonRow}>
                <button style={styles.blockPrimary} onClick={saveRevision} disabled={processing}>
                  {processing ? 'Saving…' : 'Save & re-check'}
                </button>
                <button
                  style={styles.blockGhost}
                  onClick={() => {
                    setActionError(null);
                    setBlockChoice('menu');
                  }}
                  disabled={processing}
                >
                  Back
                </button>
              </div>
            </>
          )}

          {blockChoice === 'exception' && (
            <>
              <p style={styles.blockPrompt}>
                Why is this a genuine exception, not a contradiction?
              </p>
              <textarea
                style={styles.blockTextarea}
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                rows={3}
                placeholder="e.g. This applies only to enterprise deals, where the usual rule doesn't hold."
                disabled={processing}
              />
              <div style={styles.blockButtonRow}>
                <button style={styles.blockPrimary} onClick={submitException} disabled={processing}>
                  {processing ? 'Saving…' : 'Approve as exception'}
                </button>
                <button
                  style={styles.blockGhost}
                  onClick={() => {
                    setActionError(null);
                    setBlockChoice('menu');
                  }}
                  disabled={processing}
                >
                  Back
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div style={styles.buttonRow}>
          <button
            style={{ ...styles.bigButton, ...styles.reject }}
            onClick={reject}
            disabled={processing || phase === 'checking'}
          >
            Reject
          </button>
          <button
            style={{ ...styles.bigButton, ...styles.approve }}
            onClick={onApprove}
            disabled={processing || phase === 'checking'}
          >
            {phase === 'checking' ? 'Checking…' : 'Approve'}
          </button>
        </div>
      )}
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
  checkingText: {
    color: '#666',
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
  // ─── contradiction block ───
  blockPanel: {
    maxWidth: '600px',
    width: '100%',
    padding: '20px 24px',
    borderRadius: '14px',
    backgroundColor: '#fffbeb',
    border: '1px solid #fde68a',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  blockHeading: {
    margin: 0,
    fontSize: '16px',
    fontWeight: 600,
    color: '#92400e',
    lineHeight: 1.5,
  },
  blockExcerpt: {
    margin: 0,
    fontSize: '14px',
    color: '#78350f',
    lineHeight: 1.5,
    backgroundColor: '#fef3c7',
    borderRadius: '8px',
    padding: '10px 12px',
  },
  blockExcerptLabel: {
    fontWeight: 600,
  },
  blockPrompt: {
    margin: 0,
    fontSize: '14px',
    color: '#7c2d12',
  },
  blockButtonRow: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
  },
  blockPrimary: {
    padding: '10px 18px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#fff',
    backgroundColor: '#d97706',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  blockSecondary: {
    padding: '10px 18px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#92400e',
    backgroundColor: '#fff',
    border: '1px solid #d97706',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  blockGhost: {
    padding: '10px 14px',
    fontSize: '14px',
    color: '#92400e',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    textDecoration: 'underline',
  },
  blockTextarea: {
    width: '100%',
    fontSize: '15px',
    padding: 12,
    borderRadius: 8,
    border: '1px solid #fcd34d',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    background: '#fff',
  },
};
