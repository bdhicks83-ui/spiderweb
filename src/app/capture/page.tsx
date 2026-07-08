'use client';

// Phase 5 (Step 5) — lightweight Case Evidence capture. Enter a real example in
// Situation / Action / Outcome / Lesson form; optionally link it to a principle
// it illustrates. Saved as an approved, embedded evidence_type='case' insight.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const supabase = createClient();

type Principle = { id: string; content: string };

export default function CapturePage() {
  const [checking, setChecking] = useState(true);
  const [situation, setSituation] = useState('');
  const [action, setAction] = useState('');
  const [outcome, setOutcome] = useState('');
  const [lesson, setLesson] = useState('');
  const [relatedId, setRelatedId] = useState('');
  const [principles, setPrinciples] = useState<Principle[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      // Approved principles this case could illustrate (exclude cases).
      const { data } = await supabase
        .from('insights')
        .select('id, content, evidence_type')
        .eq('status', 'approved')
        .order('created_at', { ascending: false });
      const ps = (data || [])
        .filter((r) => r.evidence_type !== 'case')
        .map((r) => ({ id: r.id, content: r.content }));
      setPrinciples(ps);
      setChecking(false);
    })();
  }, [router]);

  async function save() {
    if (saving) return;
    if (!situation.trim() || !action.trim() || !outcome.trim() || !lesson.trim()) {
      setError('Fill in all four fields — that’s what makes it a usable example.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/capture-case', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          situation: situation.trim(),
          action: action.trim(),
          outcome: outcome.trim(),
          lesson: lesson.trim(),
          relatedInsightId: relatedId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not save. Try again.');
      } else {
        setSaved(true);
      }
    } catch {
      setError('Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setSituation(''); setAction(''); setOutcome(''); setLesson(''); setRelatedId('');
    setSaved(false); setError(null);
  }

  if (checking) {
    return <div style={styles.center}><p>Loading…</p></div>;
  }

  if (saved) {
    return (
      <div style={styles.center}>
        <p style={styles.savedBadge}>📌 Example added to your collection</p>
        <p style={styles.savedText}>
          It’ll show up as a “Real example” when someone asks about this topic.
        </p>
        <div style={styles.savedRow}>
          <button style={styles.primary} onClick={reset}>Add another</button>
          <button style={styles.ghost} onClick={() => router.push('/ask')}>Go to Ask</button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        <h1 style={styles.title}>Add a real example</h1>
        <p style={styles.subtitle}>
          A specific story from your experience — what happened, what you did, and what
          it taught you. These back up your principles with proof.
        </p>

        <Field label="Situation" placeholder="What was going on? The context or challenge." value={situation} onChange={setSituation} />
        <Field label="Action" placeholder="What did you actually do?" value={action} onChange={setAction} />
        <Field label="Outcome" placeholder="What happened as a result?" value={outcome} onChange={setOutcome} />
        <Field label="Lesson" placeholder="What’s the takeaway — the principle this proves?" value={lesson} onChange={setLesson} />

        {principles.length > 0 && (
          <div style={styles.field}>
            <label style={styles.label}>Which principle does this illustrate? (optional)</label>
            <select
              style={styles.select}
              value={relatedId}
              onChange={(e) => setRelatedId(e.target.value)}
              disabled={saving}
            >
              <option value="">— none / let it match automatically —</option>
              {principles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.content.length > 90 ? `${p.content.slice(0, 87)}…` : p.content}
                </option>
              ))}
            </select>
          </div>
        )}

        {error && <p style={styles.error}>{error}</p>}

        <button style={styles.primary} onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save example'}
        </button>
      </div>
    </div>
  );
}

function Field({ label, placeholder, value, onChange }: {
  label: string; placeholder: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div style={styles.field}>
      <label style={styles.label}>{label}</label>
      <textarea
        style={styles.textarea}
        rows={2}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { minHeight: '100vh', display: 'flex', justifyContent: 'center', padding: '48px 24px', fontFamily: 'system-ui, sans-serif' },
  container: { width: '100%', maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '14px' },
  center: { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', fontFamily: 'system-ui, sans-serif', textAlign: 'center', padding: '24px' },
  title: { fontSize: '26px', fontWeight: 700, margin: 0 },
  subtitle: { fontSize: '15px', color: '#666', margin: '0 0 8px', lineHeight: 1.5 },
  field: { display: 'flex', flexDirection: 'column', gap: '6px' },
  label: { fontSize: '13px', fontWeight: 600, color: '#444' },
  textarea: { width: '100%', fontSize: '15px', padding: '10px 12px', borderRadius: '8px', border: '1px solid #ccc', fontFamily: 'inherit', boxSizing: 'border-box' },
  select: { width: '100%', fontSize: '14px', padding: '10px 12px', borderRadius: '8px', border: '1px solid #ccc', fontFamily: 'inherit', background: '#fff' },
  primary: { padding: '12px 24px', fontSize: '16px', fontWeight: 600, color: '#fff', background: '#111', border: 'none', borderRadius: '10px', cursor: 'pointer', alignSelf: 'flex-start' },
  ghost: { padding: '10px 14px', fontSize: '14px', color: '#666', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' },
  error: { color: '#ef4444', fontSize: '14px', margin: 0 },
  savedBadge: { fontSize: '16px', fontWeight: 600, color: '#16a34a', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '9999px', padding: '8px 16px', margin: 0 },
  savedText: { fontSize: '15px', color: '#555', margin: 0 },
  savedRow: { display: 'flex', gap: '10px', marginTop: '8px' },
};
