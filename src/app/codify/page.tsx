'use client';

// P0 / P-0.5 — Codify a Pattern: the elicitation session. Opens with the
// Methodology Router ("What are we capturing?"), suggests a method, then
// runs an 8-rung ladder (rung 6 is the new Entity Map) ending in one branded
// framework you'd put in a proposal or team playbook. Mirrors the Ask page's
// chat pattern. Auth is enforced by the API routes (401 → friendly message).

import { useEffect, useState } from 'react';
import {
  TRIGGER_TYPES,
  METHODS,
  RUNG_LABELS,
  suggestedMethodFor,
  type TriggerType,
  type MethodId,
  type EntityType,
} from '@/lib/elicitation';

type Framework = {
  name: string;
  tagline: string;
  when_to_apply: string[];
  signals: string[];
  the_play: string;
  why_it_works: string;
  boundaries: string[];
};

type EntityMapEntry = { type: EntityType; name: string; detail: string | null };

type PatternRecord = {
  context_summary: string | null;
  trigger_signal: string | null;
  signal_detail: string | null;
  judgment: string | null;
  rationale: string | null;
  boundaries: string | null;
  entity_map: EntityMapEntry[];
};

type Turn = { role: 'you' | 'engine'; text: string };

type ResumableSession = {
  recordId: string;
  question: string;
  rung: number;
  questionNumber: number;
  rungsReached: number[];
  triggerType: TriggerType;
  method: MethodId;
  sessionStart: string;
};

type CodifyState =
  | { phase: 'loading' }
  | { phase: 'trigger-select'; resumable: ResumableSession | null }
  | {
      phase: 'method-select';
      trigger: TriggerType;
      method: MethodId;
      resumable: ResumableSession | null;
    }
  | { phase: 'starting' }
  | {
      phase: 'interview';
      recordId: string;
      question: string;
      rung: number;
      questionNumber: number;
      rungsReached: number[];
      sending: boolean;
      triggerType: TriggerType;
      method: MethodId;
      sessionStart: string;
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
      triggerType: TriggerType;
      method: MethodId;
    };

const RUNGS = Object.entries(RUNG_LABELS).map(([n, label]) => ({ n: Number(n), label }));

const ENTITY_META: Record<EntityType, { emoji: string; label: string }> = {
  equipment_asset: { emoji: '\u{1F3ED}', label: 'Equipment/asset' },
  process: { emoji: '⚙️', label: 'Process' },
  error_class: { emoji: '❌', label: 'Error class' },
  role_person: { emoji: '\u{1F464}', label: 'Role/person' },
  department: { emoji: '\u{1F3E2}', label: 'Department' },
};

const SOFT_WARNING_MIN = 15;
const HARD_CAP_MIN = 20;

function minutesSince(iso: string, nowMs: number): number {
  return (nowMs - new Date(iso).getTime()) / 60000;
}

export default function CodifyPage() {
  const [input, setInput] = useState('');
  const [transcript, setTranscript] = useState<Turn[]>([]);
  const [state, setState] = useState<CodifyState>({ phase: 'loading' });
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [now, setNow] = useState<number>(0);
  const [pausedNotice, setPausedNotice] = useState(false);

  const busy =
    state.phase === 'starting' ||
    (state.phase === 'interview' && state.sending);

  // Check once for an in-progress session so the router screen can offer
  // "resume where you left off" (P-0.5 session guardrails).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/codify');
        const data = await res.json();
        if (cancelled) return;
        setState({ phase: 'trigger-select', resumable: data?.active ?? null });
      } catch {
        if (!cancelled) setState({ phase: 'trigger-select', resumable: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Session timer tick — only matters during an interview. 20s resolution is
  // plenty for a 15/20-minute cap and keeps re-renders cheap.
  useEffect(() => {
    if (state.phase !== 'interview') return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 20000);
    return () => clearInterval(id);
  }, [state.phase]);

  function fail(message: string) {
    setState({ phase: 'error', message });
  }

  function pickTrigger(trigger: TriggerType) {
    if (state.phase !== 'trigger-select') return;
    setState({
      phase: 'method-select',
      trigger,
      method: suggestedMethodFor(trigger),
      resumable: state.resumable,
    });
  }

  async function resumeSession(r: ResumableSession) {
    setTranscript([
      {
        role: 'engine',
        text: `▶ Resumed — picking up at rung ${r.rung} (${RUNG_LABELS[r.rung] ?? ''}).`,
      },
      { role: 'engine', text: r.question },
    ]);
    setState({
      phase: 'interview',
      recordId: r.recordId,
      question: r.question,
      rung: r.rung,
      questionNumber: r.questionNumber,
      rungsReached: r.rungsReached,
      sending: false,
      triggerType: r.triggerType,
      method: r.method,
      sessionStart: r.sessionStart,
    });
  }

  async function start(triggerType: TriggerType, method: MethodId) {
    if (busy) return;
    setTranscript([]);
    setPdfError(null);
    setAnswerError(null);
    setPausedNotice(false);
    setState({ phase: 'starting' });

    try {
      const res = await fetch('/api/codify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggerType, method }),
      });
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
        triggerType: data.triggerType,
        method: data.method,
        sessionStart: data.sessionStart,
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
        // Model hiccup: nothing was saved — put the answer back so one click
        // retries it, and drop the optimistic transcript turn.
        setTranscript((t) => t.slice(0, -1));
        setInput(a);
        setState({ ...state, sending: false });
        setAnswerError(
          data.error || 'Something went wrong — your answer was not saved. Try again.'
        );
        return;
      }
      setAnswerError(null);

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
          triggerType: state.triggerType,
          method: state.method,
          sessionStart: state.sessionStart,
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
        triggerType: state.triggerType,
        method: state.method,
      });
    } catch {
      fail('Something went wrong. Try again.');
    }
  }

  function pauseSession() {
    if (state.phase !== 'interview') return;
    setPausedNotice(true);
    setState({
      phase: 'trigger-select',
      resumable: {
        recordId: state.recordId,
        question: state.question,
        rung: state.rung,
        questionNumber: state.questionNumber,
        rungsReached: state.rungsReached,
        triggerType: state.triggerType,
        method: state.method,
        sessionStart: state.sessionStart,
      },
    });
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

  const elapsedMin =
    state.phase === 'interview' && now ? minutesSince(state.sessionStart, now) : 0;
  const showSoftWarning = interviewing && elapsedMin >= SOFT_WARNING_MIN && elapsedMin < HARD_CAP_MIN;
  const showHardCap = interviewing && elapsedMin >= HARD_CAP_MIN;

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        <h1 style={styles.title}>Codify a pattern</h1>
        <p style={styles.subtitle}>
          A short interview about a situation worth capturing. Answer in your own
          words — at the end you get a branded framework you could reuse or hand
          to your team.
        </p>

        {state.phase === 'loading' && <p style={styles.loadingText}>Loading…</p>}

        {pausedNotice && (
          <p style={styles.scrubNotice}>
            {'\u{1F4BE}'} Saved — your progress is right where you left it. Resume anytime below.
          </p>
        )}

        {state.phase === 'trigger-select' && (
          <>
            {(() => {
              const resumable = state.resumable;
              if (!resumable) return null;
              return (
                <div style={styles.resumeCard}>
                  <p style={styles.introText}>
                    You have a session in progress — started {Math.round(
                      minutesSince(resumable.sessionStart, Date.now())
                    )} min ago, at rung {resumable.rung} ({RUNG_LABELS[resumable.rung]}).
                  </p>
                  <div style={styles.actionRow}>
                    <button style={styles.primary} onClick={() => resumeSession(resumable)}>
                      Resume where you left off
                    </button>
                    <button
                      style={styles.ghost}
                      onClick={() => setState({ phase: 'trigger-select', resumable: null })}
                    >
                      Start fresh instead
                    </button>
                  </div>
                </div>
              );
            })()}

            <div style={styles.introCard}>
              <p style={styles.introText}>What are we capturing?</p>
              <div style={styles.triggerGrid}>
                {TRIGGER_TYPES.map((t) => (
                  <button key={t.id} style={styles.triggerCard} onClick={() => pickTrigger(t.id)}>
                    <span style={styles.triggerEmoji}>{t.emoji}</span>
                    <span style={styles.triggerLabel}>{t.label}</span>
                  </button>
                ))}
              </div>
              <p style={styles.nudge}>
                {'\u{1F512}'} Names of people on your own team are fine to use — they stay
                private inside your organization, and are only stripped from
                anything you export outside it.
              </p>
            </div>
          </>
        )}

        {state.phase === 'method-select' && (() => {
          const { trigger, method, resumable } = state;
          const triggerMeta = TRIGGER_TYPES.find((t) => t.id === trigger);
          return (
            <div style={styles.introCard}>
              <p style={styles.introText}>
                {triggerMeta?.emoji} {triggerMeta?.label}
              </p>
              <div style={styles.methodCard}>
                <span style={styles.frameworkKicker}>Suggested method</span>
                <h2 style={styles.methodName}>{METHODS[method].name}</h2>
                <p style={styles.frameworkTagline}>
                  {METHODS[method].origin} · outputs a {METHODS[method].outputLabel.toLowerCase()}
                </p>
                <p style={styles.introText}>
                  {method === suggestedMethodFor(trigger)
                    ? triggerMeta?.why
                    : 'You’ve swapped off the suggested method — that’s fine, use whatever fits.'}
                </p>
              </div>

              <div style={styles.actionRow}>
                <button style={styles.primary} onClick={() => start(trigger, method)}>
                  Use this method
                </button>
              </div>

              <details style={styles.swapDetails}>
                <summary style={styles.swapSummary}>Choose a different method</summary>
                <div style={styles.methodList}>
                  {(Object.keys(METHODS) as MethodId[]).map((m) => (
                    <button
                      key={m}
                      style={{
                        ...styles.methodListItem,
                        ...(m === method ? styles.methodListItemActive : {}),
                      }}
                      onClick={() => setState({ phase: 'method-select', trigger, method: m, resumable })}
                    >
                      <strong>{METHODS[m].name}</strong>
                      <span style={styles.methodListMeta}>
                        {METHODS[m].origin} · {METHODS[m].outputLabel}
                      </span>
                    </button>
                  ))}
                </div>
              </details>
            </div>
          );
        })()}

        {(interviewing || state.phase === 'done') && (
          <>
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
            {(state.phase === 'interview' || state.phase === 'done') && (
              <p style={styles.methodBadgeRow}>
                {TRIGGER_TYPES.find((t) => t.id === state.triggerType)?.emoji}{' '}
                {TRIGGER_TYPES.find((t) => t.id === state.triggerType)?.label} · {METHODS[state.method].name}
              </p>
            )}
          </>
        )}

        {showSoftWarning && (
          <p style={styles.softWarning}>
            ⏱ {Math.round(elapsedMin)} min in — most sessions wrap by 20. Keep
            going, or wrap up whenever feels right.
          </p>
        )}
        {showHardCap && (
          <div style={styles.hardCapCard}>
            <p style={styles.hardCapText}>
              ⏱ {Math.round(elapsedMin)} min — your answers are already saved
              after every question. Keep going, or pause and pick up right where
              you left off later.
            </p>
            <button style={styles.ghost} onClick={pauseSession}>
              Pause for now
            </button>
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
                <span style={styles.nudgeInline}>{'\u{1F512}'} Team names OK — kept internal</span>
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
          </>
        )}

        {state.phase === 'starting' && (
          <p style={styles.loadingText}>Starting your session…</p>
        )}

        {state.phase === 'error' && <p style={styles.errorText}>{state.message}</p>}

        {state.phase === 'done' && (
          <>
            <p style={styles.doneBadge}>
              ✅ Pattern captured — {METHODS[state.method].name}, all eight fields including entities and boundaries.
            </p>

            {state.record.entity_map.length > 0 && (
              <div style={styles.entityRow}>
                {state.record.entity_map.map((e, i) => (
                  <span key={i} style={styles.entityChip}>
                    {ENTITY_META[e.type].emoji} {e.name}
                  </span>
                ))}
              </div>
            )}

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
                  <button
                    style={styles.ghost}
                    onClick={() => setState({ phase: 'trigger-select', resumable: null })}
                  >
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
  resumeCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '16px 20px',
    backgroundColor: '#eff6ff',
    border: '1px solid #bfdbfe',
    borderRadius: '12px',
  },
  triggerGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: '10px',
  },
  triggerCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    padding: '18px 12px',
    backgroundColor: '#fafafa',
    border: '1px solid #e5e5e5',
    borderRadius: '10px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  triggerEmoji: { fontSize: '26px' },
  triggerLabel: { fontSize: '13px', fontWeight: 600, color: '#222', textAlign: 'center' },
  methodCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '16px 18px',
    backgroundColor: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '10px',
  },
  methodName: { fontSize: '20px', fontWeight: 700, margin: 0 },
  swapDetails: { marginTop: '2px' },
  swapSummary: { fontSize: '13px', color: '#666', cursor: 'pointer' },
  methodList: { display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' },
  methodListItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    textAlign: 'left',
    padding: '10px 14px',
    backgroundColor: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  methodListItemActive: { borderColor: '#111', backgroundColor: '#f5f5f5' },
  methodListMeta: { fontSize: '12px', color: '#888' },
  methodBadgeRow: { fontSize: '13px', color: '#888', margin: 0 },
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
  softWarning: {
    margin: 0,
    fontSize: '13px',
    color: '#92400e',
    backgroundColor: '#fffbeb',
    border: '1px solid #fde68a',
    borderRadius: '8px',
    padding: '10px 12px',
  },
  hardCapCard: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
    flexWrap: 'wrap',
    padding: '12px 16px',
    backgroundColor: '#fff7ed',
    border: '1px solid #fed7aa',
    borderRadius: '10px',
  },
  hardCapText: { margin: 0, fontSize: '13px', color: '#9a3412', flex: '1 1 260px' },
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
  entityRow: { display: 'flex', flexWrap: 'wrap', gap: '6px' },
  entityChip: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#334155',
    backgroundColor: '#f1f5f9',
    border: '1px solid #e2e8f0',
    borderRadius: '9999px',
    padding: '5px 10px',
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
