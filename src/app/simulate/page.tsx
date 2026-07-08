'use client';

// Phase 6 Slice 2 (Step 9) — Decision Simulation Mode. Pose a novel scenario;
// the Spiderweb reasons through it using your captured heuristics, shows a
// visible confidence flag, and applies the Confidence Heatmap to the reasoning.
import { useState } from 'react';

type Source = { id: string; excerpt: string; similarity: number };
type GroundedSentence = { text: string; score: number };
type CaseExample = {
  id: string; situation: string | null; action: string | null;
  outcome: string | null; lesson: string | null; illustrates: string | null;
};
type Confidence = 'high' | 'medium' | 'low';

type Result = {
  analysis: string | null;
  confidence: Confidence;
  confidenceStatement: string;
  sources: Source[];
  examples: CaseExample[];
  grounded: GroundedSentence[];
};

type State =
  | { phase: 'idle' }
  | { phase: 'running' }
  | { phase: 'error'; message: string }
  | { phase: 'done'; result: Result };

const CONFIDENCE_STYLE: Record<Confidence, { bg: string; fg: string; border: string }> = {
  high: { bg: '#f0fdf4', fg: '#166534', border: '#bbf7d0' },
  medium: { bg: '#fffbeb', fg: '#92400e', border: '#fde68a' },
  low: { bg: '#fef2f2', fg: '#991b1b', border: '#fecaca' },
};

// Same heatmap mapping as /ask: 0..1 grounding → colour + underline.
function shadeStyle(score: number): React.CSSProperties {
  const s = Math.max(0, Math.min(1, score));
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * s);
  const color = `rgb(${lerp(0x94, 0x0f)}, ${lerp(0xa3, 0x17)}, ${lerp(0xb8, 0x2a)})`;
  return { color, borderBottom: `2px solid rgba(37, 99, 235, ${0.12 + s * 0.5})`, paddingBottom: '1px' };
}

export default function SimulatePage() {
  const [input, setInput] = useState('');
  const [scenario, setScenario] = useState('');
  const [state, setState] = useState<State>({ phase: 'idle' });
  const [showSources, setShowSources] = useState(false);

  async function run() {
    const q = input.trim();
    if (!q || state.phase === 'running') return;
    setScenario(q);
    setShowSources(false);
    setState({ phase: 'running' });
    try {
      const res = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario: q }),
      });
      const data = await res.json();
      if (res.status === 401) return setState({ phase: 'error', message: 'Please log in to run a simulation.' });
      if (!res.ok) return setState({ phase: 'error', message: data.error || 'Something went wrong. Try again.' });
      setState({ phase: 'done', result: data as Result });
    } catch {
      setState({ phase: 'error', message: 'Something went wrong. Try again.' });
    }
  }

  const busy = state.phase === 'running';

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        <h1 style={styles.title}>Decision Simulation</h1>
        <p style={styles.subtitle}>
          Pose a scenario you’ve never written down. Your Spiderweb reasons through it
          using the heuristics you’ve captured — and tells you how far it’s stretching.
          <a href="/ask" style={styles.modeLink}> Ask a factual question instead →</a>
        </p>

        <div style={styles.inputRow}>
          <input
            style={styles.input}
            type="text"
            value={input}
            placeholder="e.g. Should we promote a strong IC into a manager role during a reorg?"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') run(); }}
            disabled={busy}
          />
          <button
            style={{ ...styles.runButton, ...(busy || !input.trim() ? styles.runButtonDisabled : {}) }}
            onClick={run}
            disabled={busy || !input.trim()}
          >
            {busy ? 'Reasoning…' : 'Simulate'}
          </button>
        </div>

        {scenario && state.phase !== 'idle' && (
          <div style={styles.scenarioEcho}>
            <span style={styles.scenarioLabel}>Scenario</span>
            <span>{scenario}</span>
          </div>
        )}

        {busy && <p style={styles.loadingText}>Reasoning through your captured heuristics…</p>}
        {state.phase === 'error' && <p style={styles.errorText}>{state.message}</p>}

        {state.phase === 'done' && (
          <>
            <div style={{
              ...styles.confidenceBanner,
              background: CONFIDENCE_STYLE[state.result.confidence].bg,
              color: CONFIDENCE_STYLE[state.result.confidence].fg,
              borderColor: CONFIDENCE_STYLE[state.result.confidence].border,
            }}>
              {state.result.confidenceStatement}
            </div>

            {state.result.analysis ? (
              <div style={styles.answerCard}>
                {state.result.grounded.length > 0 ? (
                  <>
                    <p style={styles.answerText}>
                      {state.result.grounded.map((g, i) => (
                        <span key={i} style={shadeStyle(g.score)}>{g.text}{' '}</span>
                      ))}
                    </p>
                    <p style={styles.heatmapLegend}>
                      <span style={styles.legendStrong}>Darker</span> = grounded in your heuristics;{' '}
                      <span style={styles.legendWeak}>lighter</span> = inferred.
                    </p>
                  </>
                ) : (
                  <p style={styles.answerText}>{state.result.analysis}</p>
                )}

                {state.result.examples.length > 0 && (
                  <div style={styles.examplesBlock}>
                    {state.result.examples.map((ex) => (
                      <div key={ex.id} style={styles.exampleCard}>
                        <span style={styles.exampleLabel}>📌 Real example</span>
                        {ex.illustrates && <p style={styles.exampleIllustrates}>Backs up: {ex.illustrates}</p>}
                        {ex.situation && <p style={styles.exampleRow}><b>Situation:</b> {ex.situation}</p>}
                        {ex.action && <p style={styles.exampleRow}><b>Action:</b> {ex.action}</p>}
                        {ex.outcome && <p style={styles.exampleRow}><b>Outcome:</b> {ex.outcome}</p>}
                        {ex.lesson && <p style={styles.exampleRow}><b>Lesson:</b> {ex.lesson}</p>}
                      </div>
                    ))}
                  </div>
                )}

                <p style={styles.basedOn}>
                  Reasoned from {state.result.sources.length} of your insight
                  {state.result.sources.length === 1 ? '' : 's'}
                </p>
                <button style={styles.sourcesToggle} onClick={() => setShowSources((v) => !v)}>
                  {showSources ? 'Hide sources' : 'Show sources'}
                </button>
                {showSources && (
                  <ul style={styles.sourceList}>
                    {state.result.sources.map((src) => (
                      <li key={src.id} style={styles.sourceItem}>
                        <span style={styles.sourceExcerpt}>{src.excerpt}</span>
                        <span style={styles.sourceSimilarity}>{Math.round(src.similarity * 100)}% match</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <div style={styles.noMatchCard}>
                <p style={styles.noMatchText}>
                  Capture more heuristics on this kind of decision, then simulate again —
                  right now there’s nothing in your Spiderweb to reason from.
                </p>
                <a href="/upload" style={styles.modeLink}>Add expertise →</a>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { minHeight: '100vh', display: 'flex', justifyContent: 'center', padding: '48px 24px', fontFamily: 'system-ui, sans-serif' },
  container: { width: '100%', maxWidth: '640px', display: 'flex', flexDirection: 'column', gap: '16px' },
  title: { fontSize: '28px', fontWeight: 700, margin: 0 },
  subtitle: { fontSize: '15px', color: '#666', margin: 0, lineHeight: 1.6 },
  modeLink: { color: '#2563eb', textDecoration: 'none', fontWeight: 600 },
  inputRow: { display: 'flex', gap: '8px', marginTop: '4px' },
  input: { flex: 1, padding: '12px 16px', fontSize: '16px', border: '1px solid #ccc', borderRadius: '8px', outline: 'none' },
  runButton: { padding: '12px 24px', fontSize: '16px', fontWeight: 600, color: '#fff', backgroundColor: '#111', border: 'none', borderRadius: '8px', cursor: 'pointer' },
  runButtonDisabled: { backgroundColor: '#999', cursor: 'default' },
  scenarioEcho: { display: 'flex', flexDirection: 'column', gap: '4px', padding: '12px 16px', backgroundColor: '#111', color: '#fff', borderRadius: '12px', fontSize: '15px', lineHeight: 1.5 },
  scenarioLabel: { fontSize: '11px', fontWeight: 600, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.04em' },
  loadingText: { color: '#666', fontSize: '15px' },
  errorText: { color: '#c0392b', fontSize: '15px', margin: 0 },
  confidenceBanner: { padding: '14px 18px', border: '1px solid', borderRadius: '12px', fontSize: '15px', fontWeight: 600, lineHeight: 1.5 },
  answerCard: { padding: '24px', backgroundColor: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  answerText: { margin: 0, fontSize: '16px', lineHeight: 1.7, whiteSpace: 'pre-wrap' },
  heatmapLegend: { margin: '12px 0 0', fontSize: '12px', color: '#94a3b8', lineHeight: 1.5 },
  legendStrong: { color: '#0f172a', fontWeight: 700 },
  legendWeak: { color: '#94a3b8', fontWeight: 600 },
  examplesBlock: { display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' },
  exampleCard: { padding: '14px 16px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '4px' },
  exampleLabel: { fontSize: '12px', fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.04em' },
  exampleIllustrates: { margin: '2px 0 6px', fontSize: '13px', color: '#1e3a8a', fontStyle: 'italic' },
  exampleRow: { margin: 0, fontSize: '14px', lineHeight: 1.5, color: '#1e293b' },
  basedOn: { marginTop: '16px', marginBottom: 0, fontSize: '13px', color: '#888' },
  sourcesToggle: { marginTop: '8px', padding: 0, fontSize: '13px', color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' },
  sourceList: { margin: '12px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px' },
  sourceItem: { padding: '12px', backgroundColor: '#fafafa', border: '1px solid #eee', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '4px' },
  sourceExcerpt: { fontSize: '14px', color: '#333', lineHeight: 1.5 },
  sourceSimilarity: { fontSize: '12px', color: '#999' },
  noMatchCard: { padding: '20px', backgroundColor: '#f7f7f7', border: '1px solid #e0e0e0', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '10px' },
  noMatchText: { margin: 0, color: '#555', fontSize: '15px', lineHeight: 1.6 },
};
