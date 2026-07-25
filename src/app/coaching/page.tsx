'use client';

// Manager-only Retraining/Coaching Watch. RLS (is_manager_of()) is the real
// access boundary here, not this page — a caller who isn't anyone's manager
// simply gets an empty result set back from Supabase, which renders as the
// empty state below. The named person themselves has no read policy on this
// table at all and never sees this page's data under any circumstance.
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const supabase = createClient();

type Signal = {
  id: string;
  person_id: string;
  summary: string;
  recurrence: number;
  status: 'open' | 'acknowledged' | 'dismissed';
  detected_at: string;
  person_name?: string;
};

export default function CoachingPage() {
  const [loading, setLoading] = useState(true);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('retraining_signals')
      .select('id, person_id, summary, recurrence, status, detected_at')
      .order('detected_at', { ascending: false });

    const rows = (data as Signal[]) || [];
    if (rows.length > 0) {
      const personIds = Array.from(new Set(rows.map((r) => r.person_id)));
      const { data: people } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', personIds);
      const nameById = Object.fromEntries(
        (people || []).map((p) => [p.id, p.display_name || 'Team member'])
      );
      rows.forEach((r) => (r.person_name = nameById[r.person_id] || 'Team member'));
    }
    setSignals(rows);
    setLoading(false);
  }

  async function runDetection() {
    if (detecting) return;
    setDetecting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/coaching/detect', { method: 'POST' });
      const data = await res.json();
      setMessage(data.message || (data.error ?? null));
      await load();
    } catch {
      setMessage('Detection failed. Try again.');
    } finally {
      setDetecting(false);
    }
  }

  async function setStatus(id: string, status: 'acknowledged' | 'dismissed') {
    // RLS (is_manager_of) already scopes this update to the caller's own
    // direct reports' rows — no API route needed for a same-privilege write.
    const { error } = await supabase
      .from('retraining_signals')
      .update({
        status,
        acknowledged_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (!error) {
      setSignals((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
    }
  }

  if (loading) {
    return <div style={styles.center}><p>Loading…</p></div>;
  }

  const open = signals.filter((s) => s.status === 'open');
  const handled = signals.filter((s) => s.status !== 'open');

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        <div style={styles.titleRow}>
          <h1 style={styles.title}>🧭 Coaching Watch</h1>
          <div style={styles.headerLinks}>
            <a href="/dashboard" style={styles.backLink}>← Dashboard</a>
            <button style={styles.detectButton} onClick={runDetection} disabled={detecting}>
              {detecting ? 'Checking…' : 'Run detection'}
            </button>
          </div>
        </div>

        <p style={styles.subtitle}>
          Private to you, for your direct reports only. Nothing here is visible to peers or to the
          person named — this surfaces early, from a pattern of concern or friction records, so you
          can check in before it becomes a documented failure. Two or more records name someone
          before they show up here; one record on its own never does.
        </p>

        {message && <p style={styles.message}>{message}</p>}

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>OPEN ({open.length})</h2>
          {open.length === 0 && (
            <p style={styles.empty}>Nothing open right now — either no direct reports have crossed the threshold, or you have no direct reports on file.</p>
          )}
          {open.map((s) => (
            <div key={s.id} style={styles.card}>
              <div style={styles.cardTop}>
                <span style={styles.personName}>{s.person_name}</span>
                <span style={styles.recurrenceChip}>{s.recurrence} records</span>
              </div>
              <p style={styles.summary}>{s.summary}</p>
              <div style={styles.actions}>
                <button style={styles.ackButton} onClick={() => setStatus(s.id, 'acknowledged')}>
                  ✓ Seen it
                </button>
                <button style={styles.dismissButton} onClick={() => setStatus(s.id, 'dismissed')}>
                  Not worth acting on
                </button>
              </div>
            </div>
          ))}
        </div>

        {handled.length > 0 && (
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>HANDLED ({handled.length})</h2>
            {handled.map((s) => (
              <div key={s.id} style={styles.cardHandled}>
                <div style={styles.cardTop}>
                  <span style={styles.personName}>{s.person_name}</span>
                  <span style={styles.statusChip}>
                    {s.status === 'acknowledged' ? '✓ acknowledged' : 'dismissed'}
                  </span>
                </div>
                <p style={styles.summarySmall}>{s.summary}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { minHeight: '100vh', display: 'flex', justifyContent: 'center', padding: '48px 24px', fontFamily: 'system-ui, sans-serif' },
  container: { width: '100%', maxWidth: '680px', display: 'flex', flexDirection: 'column', gap: '20px' },
  center: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' },
  titleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' },
  title: { fontSize: '26px', fontWeight: 700, margin: 0 },
  headerLinks: { display: 'flex', alignItems: 'center', gap: '14px' },
  backLink: { fontSize: '13px', fontWeight: 600, color: '#666', textDecoration: 'none' },
  detectButton: { padding: '8px 16px', fontSize: '13px', fontWeight: 600, color: '#fff', background: '#111', border: 'none', borderRadius: '8px', cursor: 'pointer' },
  subtitle: { fontSize: '14px', color: '#666', lineHeight: 1.6, margin: 0 },
  message: { fontSize: '13px', color: '#555', margin: 0, background: '#f5f5f5', padding: '8px 12px', borderRadius: '8px' },
  section: { display: 'flex', flexDirection: 'column', gap: '10px' },
  sectionTitle: { fontSize: '13px', fontWeight: 700, letterSpacing: '0.04em', color: '#888', margin: 0 },
  empty: { fontSize: '14px', color: '#999', fontStyle: 'italic', margin: 0 },
  card: { padding: '18px 20px', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '10px' },
  cardHandled: { padding: '14px 18px', backgroundColor: '#fafafa', border: '1px solid #e5e5e5', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '6px' },
  cardTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' },
  personName: { fontSize: '15px', fontWeight: 700, color: '#111' },
  recurrenceChip: { fontSize: '12px', fontWeight: 600, color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '9999px', padding: '3px 10px' },
  statusChip: { fontSize: '12px', fontWeight: 600, color: '#666' },
  summary: { fontSize: '14px', color: '#444', lineHeight: 1.5, margin: 0 },
  summarySmall: { fontSize: '13px', color: '#888', lineHeight: 1.4, margin: 0 },
  actions: { display: 'flex', gap: '10px' },
  ackButton: { padding: '7px 14px', fontSize: '13px', fontWeight: 600, color: '#111', background: '#fff', border: '1px solid #ccc', borderRadius: '8px', cursor: 'pointer' },
  dismissButton: { padding: '7px 14px', fontSize: '13px', fontWeight: 600, color: '#888', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer' },
};
