'use client';

// P0 — Codify a Pattern: the 30-minute elicitation session. Answer ladder
// questions about work you already did; walk out with one branded framework
// you'd put in a client proposal. Mirrors the Ask page's chat pattern.
// Auth is enforced by the API routes (401 → friendly message).

import { useState } from 'react';

type Framework = {
  name: string;
  tagline: string;
  when_to_apply: string[];
  signals: string[];
  the_play: string;
  why_it_works: string;
  boundaries: string[];
};

type PatternRecord = {
  context_summary: string | null;
  trigger_signal: string | null;
  signal_detail: string | null;
  judgment: string | null;
  rationale: string | null;
  boundaries: string | null;
};

type Turn = { role: 'you' | 'engine'; text: string };

type CodifyState =
  | { phase: 'idle' }
  | { phase: 'starting' }
  | {
      phase: 'interview';
      recordId: string;
      question: string;
      rung: number;
      questionNumber: number;
      rungsReached: number[];
      sending: boolean;
    }
  | { phase: 'error'; message: string }
  | {
      phase: 'done';
      recordId: string;
      record: PatternRecord;
      rungsReached: number[];
      framework: Framework | null;
      framing: boolean;
      frameError: string | null;
    };

const RUNGS: { n: number; label: string }[] = [
  { n: 1, label: 'Situate' },
  { n: 2, label: 'Classify' },
  { n: 3, label: 'The call' },
  { n: 4, label: 'The signal' },
  { n: 5, label: 'Reasoning' },
  { n: 6, label: 'Boundaries' },
  { n: 7, label: 'Generalize' },
];

export default function CodifyPage() {
  const [input, setInput] = useState('');
  const [transcript, setTranscript] = useState<Turn[]>([]);
  const [state, setState] = useState<CodifyState>({ phase: 'idle' });
  const [scrubNotice, setScrubNotice] = useState(false);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const busy =
    state.phase === 'starting' ||
    (state.phase === 'interview' && state.sending);

  function fail(message: string) {
    setState({ phase: 'error', message });
  }

  async function start() {
    if (busy) return;
    setTranscript([]);
    setScrubNotice(false);
    setPdfError(null);
    setAnswerError(null);
    setState({ phase: 'starting' });

    try {
      const res = await fetch('/api/codify', { method: 'POST' });
      const data = await res.json();
      if (res.status === 401) return fail('Please log in to codify a pattern.');
      if (!res.ok) return fail(data.error || 'Something went wrong. Try again.');

      setTranscript([{ role: 'engine', text: data.question }]);
      setState({
        phase: 'interview',
        recordId: data.recordId,
        question: data.question,
        rung: data.rung,
        questionNumber: data.questionNumber,
        rungsReached: [],
        sending: false,
      });
    } catch {
      fail('Something went wrong. Try again.');
    }
  }

  async function answer() {
    if (state.phase !== 'interview' || state.sending) return;
    const a = input.trim();
    if (!a) return;

    setTranscript((t) => [...t, { role: 'you', text: a }]);
    setInput('');
    setState({ ...state, sending: true });

    try {
      const res = await fetch('/api/codify/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId: state.recordId, answer: a }),
      });
      const data = await res.json();

      if (res.status === 401) return fail('Please log in to codify a pattern.');
      if (!res.ok) {
        // Scrub/model hiccup: nothing was saved — put the answer back so one
        // click retries it, and drop the optimistic transcript turn.
        setTranscript((t) => t.slice(0, -1));
        setInput(a);
        setState({ ...state, sending: false });
        setAnswerError(
          data.error || 'Something went wrong — your answer was not saved. Try again.'
        );
        return;
      }
      setAnswerError(null);

      if (data.scrubbed) setScrubNotice(true);

      if (!data.done) {
        setTranscript((t) => [...t, { role: 'engine', text: data.question }]);
        setState({
          phase: 'interview',
          recordId: state.recordId,
          question: data.question,
          rung: data.rung,
          questionNumber: data.questionNumber,
          rungsReached: data.rungsReached || [],
          sending: false,
        });
        return;
      }

      setState({
        phase: 'done',
        recordId: state.recordId,
        record: data.record,
        rungsReached: data.rungsReached || [],
        framework: data.framework ?? null,
        framing: false,
        frameError: data.framework
          ? null
          : 'The framework didn’t render on the first try — your record is saved. Generate it below.',
      });
    } catch {
      fail('Something went wrong. Try again.');
    }
  }

  async function generateFramework() {
    if (state.phase !== 'done' || state.framing) return;
    setState({ ...state, framing: true, frameError: null });
    try {
      const res = await fetch('/api/codify/frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId: state.recordId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setState({
          ...state,
          framing: false,
          frameError: data.error || 'Framework generation failed — try again.',
        });
        return;
      }
      setState({ ...state, framing: false, framework: data.framework, frameError: null });
    } catch {
      setState({ ...state, framing: false, frameError: 'Framework generation failed — try again.' });
    }
  }

  async function downloadPdf() {
    if (state.phase !== 'done' || !state.framework || pdfLoading) return;
    setPdfLoading(true);
    setPdfError(null);
    try {
      const res = await fetch('/api/codify/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId: state.recordId }),
      });
      if (!res.ok) {
        let message = 'PDF generation failed. Try again.';
        try {
          const data = await res.json();
          if (data.error) message = data.error;
        } catch {
          // non-JSON error body — keep the default
        }
        setPdfError(message);
        return;
      }
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match ? match[1] : 'framework.pdf';
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
      setPdfError('PDF generation failed. Try again.');
    } finally {
      setPdfLoading(false);
    }
  }

  const interviewing = state.phase === 'interview';
  const reached =
    state.phase === 'interview' || state.phase === 'done' ? state.rungsReached : [];
  const currentRung = state.phase === 'interview' ? state.rung : null;

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        <h1 style={styles.title}>Codify a pattern</h1>
        <p style={styles.subtitle}>
          A short interview about work you&apos;ve already done. Answer in your own
          words — at the end you get a branded framework you could put in a
          proposal.
        </p>

        {state.phase === 'idle' && (
          <div style={styles.introCard}>
            <p style={styles.introText}>
              Think of one engagement where you made a judgment call you&apos;d stand
              behind. The interview digs for what you <em>saw</em> — the read that
              others would have missed — and where that call would <em>not</em> apply.
              Usually 5–7 questions.
            </p>
            <p style={styles.nudge}>
              🔒 Roles, not names — say &ldquo;the AP clerk,&rdquo; not her name.
              Client and personal names are stripped automatically before anything
              is stored.
            </p>
            <button style={styles.primary} onClick={start}>
              Start a session
            </button>
          </div>
        )}

        {(interviewing || state.phase === 'done') && (
          <div style={styles.ladder}>
            {RUNGS.map((r) => {
              const isReached = reached.includes(r.n);
              const isCurrent = currentRung === r.n;
              return (
                <div key={r.n} style={styles.ladderStep}>
                  <span
                    style={{
                      ...styles.ladderDot,
                      ...(isReached ? styles.ladderDotReached : {}),
                      ...(isCurrent ? styles.ladderDotCurrent : {}),
                    }}
                  >
                    {isReached ? '✓' : r.n}
                  </span>
                  <span
                    style={{
                      ...styles.ladderLabel,
                      ...(isReached || isCurrent ? styles.ladderLabelActive : {}),
                    }}
                  >
                    {r.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {transcript.length > 0 && (
          <div style={styles.transcript}>
            {transcript.map((turn, i) => (
              <div
                key={i}
                style={{
                  ...styles.bubble,
                  ...(turn.role === 'you' ? styles.bubbleYou : styles.bubbleEngine),
                }}
              >
                <span style={styles.bubbleLabel}>
                  {turn.role === 'you' ? 'You' : 'Interviewer'}
                </span>
                <span style={styles.bubbleText}>{turn.text}</span>
              </div>
            ))}
          </div>
        )}

        {interviewing && (
          <>
            <div style={styles.inputCol}>
              <textarea
                style={styles.textarea}
                rows={3}
                value={input}
                placeholder="Answer in your own words…"
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) answer();
                }}
                disabled={busy}
              />
              <div style={styles.inputMetaRow}>
                <span style={styles.nudgeInline}>🔒 Roles, not names</span>
                <button
                  style={{
                    ...styles.primary,
                    ...(busy || !input.trim() ? styles.primaryDisabled : {}),
                  }}
                  onClick={answer}
                  disabled={busy || !input.trim()}
                >
                  {state.sending ? 'Thinking…' : 'Answer'}
                </button>
              </div>
            </div>
            {state.sending && (
              <p style={styles.loadingText}>Folding that into your pattern…</p>
            )}
            {answerError && !state.sending && (
              <p style={styles.errorText}>{answerError}</p>
            )}
            {scrubNotice && (
              <p style={styles.scrubNotice}>
                🔒 A name was replaced with a role before saving — only the
                anonymized version is stored.
              </p>
            )}
          </>
        )}

        {state.phase === 'starting' && (
          <p style={styles.loadingText}>Starting your session…</p>
        )}

        {state.phase === 'error' && <p style={styles.errorText}>{state.message}</p>}

        {state.phase === 'done' && (
          <>
            <p style={styles.doneBadge}>✅ Pattern captured — all six fields, boundaries included.</p>

            {state.framework ? (
              <>
                <div style={styles.frameworkCard}>
                  <span style={styles.frameworkKicker}>Framework</span>
                  <h2 style={styles.frameworkName}>{state.framework.name}</h2>
                  <p style={styles.frameworkTagline}>{state.framework.tagline}</p>

                  <FrameworkSection title="When to apply">
                    <ul style={styles.frameworkList}>
                      {state.framework.when_to_apply.map((x, i) => (
                        <li key={i} style={styles.frameworkItem}>{x}</li>
                      ))}
                    </ul>
                  </FrameworkSection>

                  <FrameworkSection title="Signals to look for">
                    <div style={styles.signalsCard}>
                      <ul style={styles.frameworkList}>
                        {state.framework.signals.map((x, i) => (
                          <li key={i} style={styles.frameworkItem}>{x}</li>
                        ))}
                      </ul>
                    </div>
                  </FrameworkSection>

                  <FrameworkSection title="The play">
                    <p style={styles.frameworkPara}>{state.framework.the_play}</p>
                  </FrameworkSection>

                  <FrameworkSection title="Why it works">
                    <p style={styles.frameworkPara}>{state.framework.why_it_works}</p>
                  </FrameworkSection>

                  <div style={styles.boundariesCard}>
                    <span style={styles.boundariesTitle}>
                      Boundaries — when NOT to use this
                    </span>
                    <ul style={styles.frameworkList}>
                      {state.framework.boundaries.map((x, i) => (
                        <li key={i} style={styles.boundaryItem}>{x}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div style={styles.actionRow}>
                  <button
                    style={{ ...styles.primary, ...(pdfLoading ? styles.primaryDisabled : {}) }}
                    onClick={downloadPdf}
                    disabled={pdfLoading}
                  >
                    {pdfLoading ? 'Building PDF…' : 'Download as branded PDF'}
                  </button>
                  <button style={styles.ghost} onClick={start}>
                    Codify another pattern
                  </button>
                </div>
                {pdfError && <p style={styles.errorText}>{pdfError}</p>}
              </>
            ) : (
              <div style={styles.retryCard}>
                {state.frameError && <p style={styles.errorText}>{state.frameError}</p>}
                <button
                  style={{ ...styles.primary, ...(state.framing ? styles.primaryDisabled : {}) }}
                  onClick={generateFramework}
                  disabled={state.framing}
                >
                  {state.framing ? 'Generating…' : 'Generate my framework'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function FrameworkSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={styles.frameworkSection}>
      <span style={styles.frameworkSectionTitle}>{title}</span>
      {children}
    </div>
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
  container: {
    width: '100%',
    maxWidth: '680px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  title: { fontSize: '28px', fontWeight: 700, margin: 0 },
  subtitle: { fontSize: '15px', color: '#666', margin: 0, lineHeight: 1.5 },
  introCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    padding: '20px 24px',
    backgroundColor: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: '12px',
  },
  introText: { margin: 0, fontSize: '15px', lineHeight: 1.6, color: '#333' },
  nudge: {
    margin: 0,
    fontSize: '13px',
    lineHeight: 1.5,
    color: '#166534',
    backgroundColor: '#f0fdf4',
    border: '1px solid #bbf7d0',
    borderRadius: '8px',
    padding: '10px 12px',
  },
  nudgeInline: { fontSize: '12px', color: '#166534', fontWeight: 600 },
  ladder: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px 10px',
    padding: '12px 14px',
    backgroundColor: '#fafafa',
    border: '1px solid #eee',
    borderRadius: '10px',
  },
  ladderStep: { display: 'flex', alignItems: 'center', gap: '5px' },
  ladderDot: {
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    fontWeight: 700,
    color: '#999',
    backgroundColor: '#fff',
    border: '1.5px solid #ddd',
  },
  ladderDotReached: {
    color: '#fff',
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },
  ladderDotCurrent: {
    color: '#111',
    borderColor: '#111',
  },
  ladderLabel: { fontSize: '12px', color: '#aaa' },
  ladderLabelActive: { color: '#333', fontWeight: 600 },
  transcript: { display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' },
  bubble: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '12px 16px',
    borderRadius: '12px',
    maxWidth: '85%',
  },
  bubbleYou: { alignSelf: 'flex-end', backgroundColor: '#111', color: '#fff' },
  bubbleEngine: {
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
  bubbleText: { fontSize: '15px', lineHeight: 1.6, whiteSpace: 'pre-wrap' },
  inputCol: { display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' },
  textarea: {
    width: '100%',
    padding: '12px 16px',
    fontSize: '16px',
    border: '1px solid #ccc',
    borderRadius: '8px',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    resize: 'vertical',
  },
  inputMetaRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
  },
  primary: {
    padding: '12px 24px',
    fontSize: '16px',
    fontWeight: 600,
    color: '#fff',
    backgroundColor: '#111',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    alignSelf: 'flex-start',
  },
  primaryDisabled: { backgroundColor: '#999', cursor: 'default' },
  ghost: {
    padding: '12px 14px',
    fontSize: '14px',
    color: '#666',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    textDecoration: 'underline',
  },
  loadingText: { color: '#666', fontSize: '15px', margin: 0 },
  errorText: { color: '#c0392b', fontSize: '15px', margin: 0 },
  scrubNotice: {
    margin: 0,
    fontSize: '13px',
    color: '#166534',
    backgroundColor: '#f0fdf4',
    border: '1px solid #bbf7d0',
    borderRadius: '8px',
    padding: '8px 12px',
  },
  doneBadge: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#16a34a',
    backgroundColor: '#f0fdf4',
    border: '1px solid #bbf7d0',
    borderRadius: '9999px',
    padding: '8px 16px',
    margin: 0,
    alignSelf: 'flex-start',
  },
  frameworkCard: {
    padding: '28px',
    backgroundColor: '#fff',
    border: '1px solid #e0e0e0',
    borderTop: '4px solid #166534',
    borderRadius: '12px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  frameworkKicker: {
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: '#166534',
  },
  frameworkName: { fontSize: '26px', fontWeight: 700, margin: 0, lineHeight: 1.2 },
  frameworkTagline: { fontSize: '15px', color: '#555', margin: 0, lineHeight: 1.5 },
  frameworkSection: { display: 'flex', flexDirection: 'column', gap: '6px' },
  frameworkSectionTitle: {
    fontSize: '12px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: '#555',
  },
  frameworkList: {
    margin: 0,
    paddingLeft: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
  },
  frameworkItem: { fontSize: '14px', lineHeight: 1.55, color: '#1e293b' },
  frameworkPara: { margin: 0, fontSize: '14px', lineHeight: 1.6, color: '#1e293b' },
  signalsCard: {
    backgroundColor: '#f0fdf4',
    border: '1px solid #bbf7d0',
    borderRadius: '8px',
    padding: '12px 14px',
  },
  boundariesCard: {
    backgroundColor: '#fff7ed',
    border: '1px solid #fed7aa',
    borderRadius: '8px',
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  boundariesTitle: {
    fontSize: '12px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: '#9a3412',
  },
  boundaryItem: { fontSize: '14px', lineHeight: 1.55, color: '#7c2d12' },
  actionRow: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' },
  retryCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '16px 20px',
    backgroundColor: '#fafafa',
    border: '1px solid #eee',
    borderRadius: '10px',
  },
};
