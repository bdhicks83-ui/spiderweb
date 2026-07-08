'use client';

// Phase 6 — Consultative Ask: ask a question, answer Claude's follow-ups one
// at a time, then get a recommendation with pros/cons grounded only in your
// approved insights. Exports (report/podcast/deck) reuse the existing routes
// by flattening the recommendation into answer text.
// Auth is enforced by the API routes (401 → friendly message).

import { useState } from 'react';

type Source = {
  id: string;
  excerpt: string;
  similarity: number;
};

type Recommendation = {
  recommendation: string;
  pros: string[];
  cons: string[];
  gaps: string | null;
};

type CaseExample = {
  id: string;
  situation: string | null;
  action: string | null;
  outcome: string | null;
  lesson: string | null;
  illustrates: string | null;
};

type Gap = { detected: boolean; type: 'coverage' | 'case_evidence_missing' | null };

type GroundedSentence = { text: string; score: number };

type Turn = { role: 'you' | 'spiderweb'; text: string };

type AskState =
  | { phase: 'idle' }
  | { phase: 'starting' }
  | { phase: 'interview'; sessionId: string; followUp: string; sending: boolean }
  | { phase: 'error'; message: string }
  | { phase: 'noMatch'; message: string }
  | { phase: 'done'; rec: Recommendation; sources: Source[]; examples: CaseExample[]; gap: Gap | null; grounded: GroundedSentence[] };

type Format = 'report' | 'podcast' | 'deck';

const FORMATS: { key: Format; label: string; loadingLabel: string }[] = [
  { key: 'report', label: 'Report (.docx)', loadingLabel: 'Building report...' },
  { key: 'podcast', label: 'Podcast (.mp3)', loadingLabel: 'Recording podcast...' },
  { key: 'deck', label: 'Deck (.pptx)', loadingLabel: 'Building deck...' },
];

// Flatten the structured recommendation for the export routes, which expect
// a plain answer string.
function recToText(rec: Recommendation): string {
  const parts = [rec.recommendation];
  if (rec.pros.length) parts.push(`Pros:\n${rec.pros.map((p) => `- ${p}`).join('\n')}`);
  if (rec.cons.length) parts.push(`Cons:\n${rec.cons.map((c) => `- ${c}`).join('\n')}`);
  if (rec.gaps) parts.push(`Not covered by my insights: ${rec.gaps}`);
  return parts.join('\n\n');
}

export default function AskPage() {
  const [input, setInput] = useState('');
  const [askedQuestion, setAskedQuestion] = useState('');
  const [transcript, setTranscript] = useState<Turn[]>([]);
  const [state, setState] = useState<AskState>({ phase: 'idle' });
  const [showSources, setShowSources] = useState(false);
  const [formatLoading, setFormatLoading] = useState<Format | null>(null);
  const [formatError, setFormatError] = useState<string | null>(null);

  const busy =
    state.phase === 'starting' ||
    (state.phase === 'interview' && state.sending);

  function fail(message: string) {
    setState({ phase: 'error', message });
  }

  // First submit: start a session. May come back with a follow-up question
  // or, if Claude already has enough, the final recommendation.
  async function ask() {
    const q = input.trim();
    if (!q || busy) return;

    setAskedQuestion(q);
    setTranscript([{ role: 'you', text: q }]);
    setInput('');
    setShowSources(false);
    setFormatError(null);
    setState({ phase: 'starting' });

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();

      if (res.status === 401) return fail('Please log in to ask your Spiderweb.');
      if (!res.ok) return fail(data.error || 'Something went wrong. Try again.');
      if (data.noMatch) return setState({ phase: 'noMatch', message: data.message });

      handleStep(data);
    } catch {
      fail('Something went wrong. Try again.');
    }
  }

  // Subsequent submits: answer the pending follow-up.
  async function answer() {
    if (state.phase !== 'interview' || state.sending) return;
    const a = input.trim();
    if (!a) return;

    setTranscript((t) => [...t, { role: 'you', text: a }]);
    setInput('');
    setState({ ...state, sending: true });

    try {
      const res = await fetch('/api/ask/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: state.sessionId, answer: a }),
      });
      const data = await res.json();

      if (res.status === 401) return fail('Please log in to ask your Spiderweb.');
      if (!res.ok) return fail(data.error || 'Something went wrong. Try again.');

      handleStep(data);
    } catch {
      fail('Something went wrong. Try again.');
    }
  }

  // Shared: both routes answer with either another follow-up or the final
  // recommendation.
  function handleStep(data: {
    done: boolean;
    sessionId: string;
    followUp?: string;
    recommendation?: string;
    pros?: string[];
    cons?: string[];
    gaps?: string | null;
    sources?: Source[];
    examples?: CaseExample[];
    gap?: Gap;
    grounded?: GroundedSentence[];
  }) {
    if (!data.done && data.followUp) {
      setTranscript((t) => [...t, { role: 'spiderweb', text: data.followUp! }]);
      setState({
        phase: 'interview',
        sessionId: data.sessionId,
        followUp: data.followUp,
        sending: false,
      });
      return;
    }
    setState({
      phase: 'done',
      rec: {
        recommendation: data.recommendation || '',
        pros: data.pros || [],
        cons: data.cons || [],
        gaps: data.gaps ?? null,
      },
      sources: data.sources || [],
      examples: data.examples || [],
      gap: data.gap ?? null,
      grounded: data.grounded || [],
    });
  }

  function submit() {
    if (state.phase === 'interview') answer();
    else ask();
  }

  // Re-uses the recommendation already retrieved — no second search.
  async function downloadFormat(format: Format) {
    if (state.phase !== 'done' || formatLoading) return;

    setFormatLoading(format);
    setFormatError(null);

    try {
      const res = await fetch(`/api/ask/${format}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: askedQuestion,
          answer: recToText(state.rec),
          sources: state.sources,
        }),
      });

      if (!res.ok) {
        let message = 'Generation failed. Try again.';
        try {
          const data = await res.json();
          if (data.error) message = data.error;
        } catch {
          // non-JSON error body — keep the default message
        }
        setFormatError(message);
        return;
      }

      // Pull the filename from the Content-Disposition header.
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match ? match[1] : `spiderweb-answer.${format === 'podcast' ? 'mp3' : format === 'deck' ? 'pptx' : 'docx'}`;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setFormatError('Generation failed. Try again.');
    } finally {
      setFormatLoading(null);
    }
  }

  const interviewing = state.phase === 'interview';
  const inputVisible = state.phase === 'idle' || state.phase === 'starting' || interviewing
    || state.phase === 'error' || state.phase === 'noMatch';

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        <h1 style={styles.title}>Ask Your Spiderweb</h1>
        <p style={styles.subtitle}>
          It asks a few questions first, then recommends — grounded only in
          insights you&apos;ve captured and approved.{' '}
          <a href="/simulate" style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}>
            Simulate a decision instead →
          </a>
        </p>

        {transcript.length > 0 && (
          <div style={styles.transcript}>
            {transcript.map((turn, i) => (
              <div
                key={i}
                style={{
                  ...styles.bubble,
                  ...(turn.role === 'you' ? styles.bubbleYou : styles.bubbleWeb),
                }}
              >
                <span style={styles.bubbleLabel}>
                  {turn.role === 'you' ? 'You' : 'Your Spiderweb'}
                </span>
                <span style={styles.bubbleText}>{turn.text}</span>
              </div>
            ))}
          </div>
        )}

        {inputVisible && (
          <div style={styles.inputRow}>
            <input
              style={styles.input}
              type="text"
              value={input}
              placeholder={interviewing ? 'Type your answer...' : 'Ask a question...'}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
              disabled={busy}
            />
            <button
              style={{
                ...styles.askButton,
                ...(busy || !input.trim() ? styles.askButtonDisabled : {}),
              }}
              onClick={submit}
              disabled={busy || !input.trim()}
            >
              {busy ? 'Thinking...' : interviewing ? 'Answer' : 'Ask'}
            </button>
          </div>
        )}

        {state.phase === 'starting' && (
          <p style={styles.loadingText}>Searching your captured expertise...</p>
        )}
        {interviewing && state.sending && (
          <p style={styles.loadingText}>Thinking about what else it needs...</p>
        )}

        {state.phase === 'error' && <p style={styles.errorText}>{state.message}</p>}

        {state.phase === 'noMatch' && (
          <div style={styles.noMatchCard}>
            <p style={styles.noMatchText}>{state.message}</p>
          </div>
        )}

        {state.phase === 'done' && (
          <>
            <div style={styles.answerCard}>
              {state.grounded.length > 0 ? (
                <>
                  <p style={styles.answerText}>
                    {state.grounded.map((g, i) => (
                      <span key={i} style={shadeStyle(g.score)}>
                        {g.text}{' '}
                      </span>
                    ))}
                  </p>
                  <p style={styles.heatmapLegend}>
                    <span style={styles.legendStrong}>Darker</span> = more grounded in your
                    insights; <span style={styles.legendWeak}>lighter</span> = thinner / inferred.
                  </p>
                </>
              ) : (
                <p style={styles.answerText}>{state.rec.recommendation}</p>
              )}

              {state.examples.length > 0 && (
                <div style={styles.examplesBlock}>
                  {state.examples.map((ex) => (
                    <div key={ex.id} style={styles.exampleCard}>
                      <span style={styles.exampleLabel}>📌 Real example</span>
                      {ex.illustrates && (
                        <p style={styles.exampleIllustrates}>
                          Backs up: {ex.illustrates}
                        </p>
                      )}
                      {ex.situation && <ExampleRow k="Situation" v={ex.situation} />}
                      {ex.action && <ExampleRow k="Action" v={ex.action} />}
                      {ex.outcome && <ExampleRow k="Outcome" v={ex.outcome} />}
                      {ex.lesson && <ExampleRow k="Lesson" v={ex.lesson} />}
                    </div>
                  ))}
                </div>
              )}

              {state.rec.pros.length > 0 && (
                <div style={styles.prosConsBlock}>
                  <span style={styles.prosConsTitle}>Pros</span>
                  <ul style={styles.prosConsList}>
                    {state.rec.pros.map((p, i) => (
                      <li key={i} style={styles.proItem}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}

              {state.rec.cons.length > 0 && (
                <div style={styles.prosConsBlock}>
                  <span style={styles.prosConsTitle}>Cons</span>
                  <ul style={styles.prosConsList}>
                    {state.rec.cons.map((c, i) => (
                      <li key={i} style={styles.conItem}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}

              {state.rec.gaps && (
                <p style={styles.gapsText}>Not covered by your insights: {state.rec.gaps}</p>
              )}

              <p style={styles.basedOn}>
                Based on {state.sources.length} of your insight
                {state.sources.length === 1 ? '' : 's'}
              </p>

              <button
                style={styles.sourcesToggle}
                onClick={() => setShowSources((s) => !s)}
              >
                {showSources ? 'Hide sources' : 'Show sources'}
              </button>

              {showSources && (
                <ul style={styles.sourceList}>
                  {state.sources.map((s) => (
                    <li key={s.id} style={styles.sourceItem}>
                      <span style={styles.sourceExcerpt}>{s.excerpt}</span>
                      <span style={styles.sourceSimilarity}>
                        {Math.round(s.similarity * 100)}% match
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div style={styles.formatBar}>
              <span style={styles.formatLabel}>Get this recommendation as:</span>
              <div style={styles.formatButtons}>
                <button style={{ ...styles.formatButton, ...styles.formatButtonActive }} disabled>
                  Text ✓
                </button>
                {FORMATS.map((f) => (
                  <button
                    key={f.key}
                    style={{
                      ...styles.formatButton,
                      ...(formatLoading ? styles.formatButtonDisabled : {}),
                    }}
                    onClick={() => downloadFormat(f.key)}
                    disabled={formatLoading !== null}
                  >
                    {formatLoading === f.key ? f.loadingLabel : f.label}
                  </button>
                ))}
              </div>
              {formatError && <p style={styles.errorText}>{formatError}</p>}
            </div>

            {state.gap?.detected && (
              <div style={styles.gapPrompt}>
                {state.gap.type === 'case_evidence_missing' ? (
                  <>
                    <span style={styles.gapText}>
                      You have the principle here — a real example would make it land harder.
                    </span>
                    <a href="/capture" style={styles.gapLink}>Add a quick example →</a>
                  </>
                ) : (
                  <>
                    <span style={styles.gapText}>
                      Your Spiderweb is a little thin on this one. Want to add to it?
                    </span>
                    <a href="/upload" style={styles.gapLink}>Add a quick insight →</a>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Confidence heatmap: map a 0..1 grounding score to text colour + underline.
// Strong claims read near-black with a solid underline; thin ones fade to grey.
function shadeStyle(score: number): React.CSSProperties {
  const s = Math.max(0, Math.min(1, score));
  // Interpolate grey (#94a3b8) → near-black (#0f172a).
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * s);
  const r = lerp(0x94, 0x0f);
  const g = lerp(0xa3, 0x17);
  const b = lerp(0xb8, 0x2a);
  const color = `rgb(${r}, ${g}, ${b})`;
  return {
    color,
    borderBottom: `2px solid rgba(37, 99, 235, ${0.12 + s * 0.5})`,
    paddingBottom: '1px',
  };
}

function ExampleRow({ k, v }: { k: string; v: string }) {
  return (
    <p style={styles.exampleRow}>
      <span style={styles.exampleRowKey}>{k}:</span> {v}
    </p>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    minHeight: '100vh',
    display: 'flex',
    justifyContent: 'center',
    padding: '48px 24px',
    fontFamily: 'system-ui, sans-serif',
  },
  examplesBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    marginTop: '16px',
  },
  exampleCard: {
    padding: '14px 16px',
    backgroundColor: '#eff6ff',
    border: '1px solid #bfdbfe',
    borderRadius: '10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  exampleLabel: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#1d4ed8',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  exampleIllustrates: {
    margin: '2px 0 6px',
    fontSize: '13px',
    color: '#1e3a8a',
    fontStyle: 'italic',
  },
  exampleRow: {
    margin: 0,
    fontSize: '14px',
    lineHeight: 1.5,
    color: '#1e293b',
  },
  exampleRowKey: {
    fontWeight: 700,
  },
  gapPrompt: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '10px',
    padding: '14px 18px',
    backgroundColor: '#f0fdf4',
    border: '1px solid #bbf7d0',
    borderRadius: '12px',
  },
  gapText: {
    fontSize: '14px',
    color: '#166534',
    lineHeight: 1.5,
  },
  gapLink: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#15803d',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
  },
  heatmapLegend: {
    margin: '12px 0 0',
    fontSize: '12px',
    color: '#94a3b8',
    lineHeight: 1.5,
  },
  legendStrong: {
    color: '#0f172a',
    fontWeight: 700,
  },
  legendWeak: {
    color: '#94a3b8',
    fontWeight: 600,
  },
  container: {
    width: '100%',
    maxWidth: '640px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  title: {
    fontSize: '28px',
    fontWeight: 700,
    margin: 0,
  },
  subtitle: {
    fontSize: '15px',
    color: '#666',
    margin: 0,
  },
  transcript: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    marginTop: '8px',
  },
  bubble: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '12px 16px',
    borderRadius: '12px',
    maxWidth: '85%',
  },
  bubbleYou: {
    alignSelf: 'flex-end',
    backgroundColor: '#111',
    color: '#fff',
  },
  bubbleWeb: {
    alignSelf: 'flex-start',
    backgroundColor: '#f2f2f2',
    color: '#111',
    border: '1px solid #e0e0e0',
  },
  bubbleLabel: {
    fontSize: '11px',
    fontWeight: 600,
    opacity: 0.6,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  bubbleText: {
    fontSize: '15px',
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
  },
  inputRow: {
    display: 'flex',
    gap: '8px',
    marginTop: '8px',
  },
  input: {
    flex: 1,
    padding: '12px 16px',
    fontSize: '16px',
    border: '1px solid #ccc',
    borderRadius: '8px',
    outline: 'none',
  },
  askButton: {
    padding: '12px 24px',
    fontSize: '16px',
    fontWeight: 600,
    color: '#fff',
    backgroundColor: '#111',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  askButtonDisabled: {
    backgroundColor: '#999',
    cursor: 'default',
  },
  loadingText: {
    color: '#666',
    fontSize: '15px',
  },
  errorText: {
    color: '#c0392b',
    fontSize: '15px',
    margin: 0,
  },
  noMatchCard: {
    padding: '20px',
    backgroundColor: '#f7f7f7',
    border: '1px solid #e0e0e0',
    borderRadius: '12px',
  },
  noMatchText: {
    margin: 0,
    color: '#555',
    fontSize: '15px',
    lineHeight: 1.6,
  },
  answerCard: {
    padding: '24px',
    backgroundColor: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: '12px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  answerText: {
    margin: 0,
    fontSize: '16px',
    lineHeight: 1.7,
    whiteSpace: 'pre-wrap',
  },
  prosConsBlock: {
    marginTop: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  prosConsTitle: {
    fontSize: '13px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: '#555',
  },
  prosConsList: {
    margin: 0,
    paddingLeft: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  proItem: {
    fontSize: '15px',
    lineHeight: 1.6,
    color: '#1a7f37',
  },
  conItem: {
    fontSize: '15px',
    lineHeight: 1.6,
    color: '#b35900',
  },
  gapsText: {
    marginTop: '16px',
    marginBottom: 0,
    fontSize: '14px',
    color: '#777',
    fontStyle: 'italic',
    lineHeight: 1.6,
  },
  basedOn: {
    marginTop: '16px',
    marginBottom: 0,
    fontSize: '13px',
    color: '#888',
  },
  sourcesToggle: {
    marginTop: '8px',
    padding: 0,
    fontSize: '13px',
    color: '#2563eb',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
  },
  sourceList: {
    margin: '12px 0 0',
    padding: 0,
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  sourceItem: {
    padding: '12px',
    backgroundColor: '#fafafa',
    border: '1px solid #eee',
    borderRadius: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  sourceExcerpt: {
    fontSize: '14px',
    color: '#333',
    lineHeight: 1.5,
  },
  sourceSimilarity: {
    fontSize: '12px',
    color: '#999',
  },
  formatBar: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '16px 20px',
    backgroundColor: '#f7f7f7',
    border: '1px solid #e0e0e0',
    borderRadius: '12px',
  },
  formatLabel: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#555',
  },
  formatButtons: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  formatButton: {
    padding: '10px 16px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#111',
    backgroundColor: '#fff',
    border: '1px solid #ccc',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  formatButtonActive: {
    borderColor: '#111',
    fontWeight: 600,
    cursor: 'default',
  },
  formatButtonDisabled: {
    opacity: 0.6,
    cursor: 'default',
  },
};
