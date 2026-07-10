'use client';

// Phase 8 (Block 4) — Org-Fit Matching, ORG-FACING page.
// A prospective organization fills a short intake and gets a plain-English fit
// summary BEFORE any commitment. This is shown to the org only — the expert
// never sees it. No login required (a buyer may not have an account yet).
import { useState } from 'react';

type FitResult = { summary: string; friction_points: string[] };

export default function OrgFitPage() {
  const [teamSize, setTeamSize] = useState('');
  const [decisionStyle, setDecisionStyle] = useState('fast');
  const [pace, setPace] = useState('fast');
  const [formality, setFormality] = useState('casual');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FitResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/org-fit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamSize, decisionStyle, pace, formality }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not generate a fit summary. Try again.');
      } else {
        setResult({ summary: data.summary, friction_points: data.friction_points || [] });
      }
    } catch {
      setError('Could not generate a fit summary. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        <h1 style={styles.title}>Will this expert fit your team?</h1>
        <p style={styles.sub}>
          Tell us how your organization works. We&apos;ll give you an honest read on where this
          expert&apos;s working style is likely to align — and where it might rub. This is a
          heads-up, not a score.
        </p>

        <div style={styles.card}>
          <label style={styles.label}>Team size</label>
          <input
            style={styles.input}
            placeholder="e.g. 12-person product org"
            value={teamSize}
            onChange={(e) => setTeamSize(e.target.value)}
            disabled={loading}
          />

          <label style={styles.label}>How does your team make decisions?</label>
          <select style={styles.input} value={decisionStyle} onChange={(e) => setDecisionStyle(e.target.value)} disabled={loading}>
            <option value="fast">Fast — a few people decide and move</option>
            <option value="consensus">Consensus-driven — we align broadly first</option>
          </select>

          <label style={styles.label}>Pace</label>
          <select style={styles.input} value={pace} onChange={(e) => setPace(e.target.value)} disabled={loading}>
            <option value="fast">Fast — we ship and iterate</option>
            <option value="deliberate">Deliberate — we plan and validate</option>
          </select>

          <label style={styles.label}>Culture</label>
          <select style={styles.input} value={formality} onChange={(e) => setFormality(e.target.value)} disabled={loading}>
            <option value="casual">Informal — light process</option>
            <option value="formal">Formal — structured and process-oriented</option>
          </select>

          <button style={styles.primary} onClick={submit} disabled={loading}>
            {loading ? 'Reading the fit…' : 'See the fit summary'}
          </button>
          {error && <p style={styles.error}>{error}</p>}
        </div>

        {result && (
          <div style={styles.resultCard}>
            <h2 style={styles.resultTitle}>Fit summary</h2>
            <p style={styles.resultSummary}>{result.summary}</p>
            {result.friction_points.length > 0 && (
              <>
                <h3 style={styles.frictionHeading}>Where to pay attention</h3>
                <ul style={styles.frictionList}>
                  {result.friction_points.map((f, i) => (
                    <li key={i} style={styles.frictionItem}>{f}</li>
                  ))}
                </ul>
              </>
            )}
            <p style={styles.disclaimer}>
              This is a working-style read to inform your decision — not a pass/fail and not a
              recommendation.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { minHeight: '100vh', display: 'flex', justifyContent: 'center', padding: '48px 24px', fontFamily: 'system-ui, sans-serif' },
  container: { width: '100%', maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '16px' },
  title: { fontSize: '28px', fontWeight: 700, margin: 0 },
  sub: { fontSize: '15px', color: '#555', lineHeight: 1.6, margin: 0 },
  card: { padding: '24px', backgroundColor: '#fff', border: '1px solid #e0e0e0', borderRadius: '14px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: '10px' },
  label: { fontSize: '13px', fontWeight: 600, color: '#555', marginTop: '6px' },
  input: { padding: '10px 12px', fontSize: '15px', border: '1px solid #ccc', borderRadius: '8px', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' },
  primary: { marginTop: '10px', padding: '12px 20px', fontSize: '15px', fontWeight: 600, color: '#fff', background: '#111', border: 'none', borderRadius: '8px', cursor: 'pointer' },
  error: { color: '#ef4444', fontSize: '14px', margin: '6px 0 0' },
  resultCard: { padding: '24px', backgroundColor: '#0f172a', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '10px', color: '#fff' },
  resultTitle: { fontSize: '17px', fontWeight: 700, margin: 0, color: '#fff' },
  resultSummary: { fontSize: '15px', lineHeight: 1.6, margin: 0, color: '#e2e8f0' },
  frictionHeading: { fontSize: '13px', fontWeight: 700, margin: '8px 0 0', color: '#fca5a5', textTransform: 'uppercase', letterSpacing: '0.04em' },
  frictionList: { margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px' },
  frictionItem: { fontSize: '14px', lineHeight: 1.5, color: '#e2e8f0' },
  disclaimer: { fontSize: '12px', color: '#94a3b8', margin: '8px 0 0', lineHeight: 1.5 },
};
