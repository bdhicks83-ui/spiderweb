'use client';

// P0 / P-0.5 — Capture your judgment: the elicitation session. Opens with
// the six-card "What are you bringing?" picker (Capture Your Judgment,
// 2026-08-03 — replaces the user-facing Methodology Router screens; every
// branch runs the CDM engine internally; 2×3 on desktop via the grid's
// min column width, collapsing to one column on mobile), then runs the
// 8-rung ladder
// (rung 6 is the Entity Map) ending in one branded framework in the
// expert's own words. Each branch loads a tuned, approved interview script
// (prompts/capture-*.md); the extraction/synthesis downstream is unchanged.
// Mirrors the Ask page's chat pattern. Auth is enforced by the API routes
// (401 → friendly message).
//
// Gap-fill (/codify?gap=<id>) + campaign asks (?request=<id>): DECIDED
// 2026-08-03 — the picker still shows (no forced default branch). The
// banner keeps the colleague's question on screen; which branch fits is the
// expert's call (they may be facing it now, may have solved it before, or
// may have a general approach). All three produce a framework that closes
// the gap the same way (P-9 reconciliation is capture-time, branch-blind).

import { useEffect, useState } from 'react';
import BrandHeader from '@/components/BrandHeader';
// P-9 — renders only when /codify is opened with ?gap=<id> from the gap alert
// or the gaps queue. Keeps the colleague's actual question on screen for the
// whole interview, so nobody ends up answering from memory two clicks later.
import GapAnswerBanner from '@/components/GapAnswerBanner';
// T1B2 — renders only when /codify is opened with ?request=<id> from an ask in
// a capture campaign. Same job as the gap banner: keep the exact question that
// was asked on screen for the whole interview, so nobody ends up answering from
// memory two clicks later. Both render nothing without their query param, so
// /codify is unchanged for everyone arriving the normal way.
import CaptureRequestBanner from '@/components/CaptureRequestBanner';
import {
  TRIGGER_TYPES,
  METHODS,
  RUNG_LABELS,
  CAPTURE_TYPES,
  CAPTURE_PICKER_PROMPT,
  CAPTURE_PICKER_MICROCOPY,
  captureOption,
  type CaptureType,
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

// ─── "Already Walked" (2026-08-04) ──────────────────────────────────────────
// The one-per-session capture-time check. A duplicate shows a SOFT inline
// card between interviewer turns (never a modal, never a block); a conflict
// shows a one-line heads-up and the capture continues — the value beat lands
// on the completion screen. All strings below are
// ⚠️ DRAFT CUSTOMER-FACING COPY — PENDING BRIAN'S WALK.
type WalkedDuplicate = { kind: 'duplicate'; matchId: string; title: string; author: string };
type WalkedConflict = { kind: 'conflict'; title: string; author: string };
type WalkedDone = {
  kind: 'conflict';
  conflictId: string | null;
  otherTitle: string;
  otherAuthor: string;
  managerName: string | null;
};

const WALKED_COPY = {
  cardKicker: "Someone's walked this ground.",
  cardBody: (author: string, title: string) =>
    `${author}'s “${title}” looks like it covers this.`,
  view: 'View it',
  keepGoing: "Mine's different — keep going",
  savesTime: 'Good — that saves me time',
  conflictNotice: (author: string) =>
    `⚡ Heads up — ${author} sees this one differently. That's worth capturing: finish yours, and we'll set up the compare.`,
  savedTitle: 'Good call — that time is yours back.',
  savedBody: (author: string, title: string) =>
    `${author}'s “${title}” already covers this ground, so nothing was recorded from this session. Spotting that early is the system working.`,
  savedView: 'View the framework →',
  doneContested: (otherAuthor: string, managerName: string | null) =>
    `⚡ This one's CONTESTED with ${otherAuthor} — a compare session is queued for ${managerName ?? 'your manager'} to launch.`,
  doneConflictLink: 'View the conflict →',
};

type ResumableSession = {
  recordId: string;
  question: string;
  rung: number;
  questionNumber: number;
  rungsReached: number[];
  triggerType: TriggerType;
  method: MethodId;
  // null = legacy Methodology Router session (pre-branching) — resumes fine.
  captureType: CaptureType | null;
  sessionStart: string;
};

type CodifyState =
  | { phase: 'loading' }
  | { phase: 'picker'; resumable: ResumableSession | null }
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
      captureType: CaptureType | null;
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
      captureType: CaptureType | null;
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
  // Already Walked — card / one-liner / graceful-exit / completion-line state.
  const [walkedCard, setWalkedCard] = useState<WalkedDuplicate | null>(null);
  const [walkedNotice, setWalkedNotice] = useState<WalkedConflict | null>(null);
  const [walkedSaved, setWalkedSaved] = useState<WalkedDuplicate | null>(null);
  const [walkedDone, setWalkedDone] = useState<WalkedDone | null>(null);
  const [walkedClosing, setWalkedClosing] = useState(false);

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
        setState({ phase: 'picker', resumable: data?.active ?? null });
      } catch {
        if (!cancelled) setState({ phase: 'picker', resumable: null });
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

  // One click on the duplicate card. Fire-and-forget record-keeping for
  // "viewed"; "kept_going" collapses the card for good (never re-shown this
  // session); "saved_time" ends the session gracefully — positive frame,
  // nothing negative recorded.
  async function walkedAct(
    recordId: string,
    action: 'viewed' | 'kept_going' | 'saved_time'
  ) {
    if (action === 'kept_going') setWalkedCard(null);
    if (action === 'saved_time') {
      if (walkedClosing) return;
      setWalkedClosing(true);
    }
    try {
      const res = await fetch('/api/codify/walked', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId, action }),
      });
      if (action === 'saved_time') {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setWalkedClosing(false);
          setAnswerError(
            data.error || 'Could not close the session — you can just keep going.'
          );
          return;
        }
        setWalkedSaved(walkedCard);
        setWalkedCard(null);
        setWalkedNotice(null);
        setWalkedClosing(false);
        setTranscript([]);
        setInput('');
        setState({ phase: 'picker', resumable: null });
      }
    } catch {
      if (action === 'saved_time') {
        setWalkedClosing(false);
        setAnswerError('Could not close the session — you can just keep going.');
      }
      // viewed / kept_going are best-effort — the card already behaved.
    }
  }

  async function resumeSession(r: ResumableSession) {
    setWalkedCard(null);
    setWalkedNotice(null);
    setWalkedSaved(null);
    setWalkedDone(null);
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
      captureType: r.captureType ?? null,
      sessionStart: r.sessionStart,
    });
  }

  // One click on a picker card starts the interview — the branch's opener is
  // fixed server-side, so starting is instant ("it takes a few minutes"
  // starts being true at the first tap).
  async function start(captureType: CaptureType) {
    if (busy) return;
    setTranscript([]);
    setPdfError(null);
    setAnswerError(null);
    setPausedNotice(false);
    setWalkedCard(null);
    setWalkedNotice(null);
    setWalkedSaved(null);
    setWalkedDone(null);
    setState({ phase: 'starting' });

    // Already Walked: a ?gap= arrival skips the capture-time check entirely
    // (retrieval already failed at 0.75 for that gap — the interrupt would be
    // noise). Same window.location read the banners use, same reason: no
    // useSearchParams Suspense restructuring for /codify.
    const gapEntry =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).has('gap');

    try {
      const res = await fetch('/api/codify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ captureType, gapEntry }),
      });
      const data = await res.json();
      if (res.status === 401) return fail('Please log in to capture your judgment.');
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
        captureType: data.captureType ?? captureType,
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

      if (res.status === 401) return fail('Please log in to capture your judgment.');
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
        // Already Walked: at most one turn ever carries this. A duplicate
        // shows the soft card; a conflict shows the one-liner and the
        // capture just continues.
        if (data.walked?.kind === 'duplicate') setWalkedCard(data.walked);
        else if (data.walked?.kind === 'conflict') setWalkedNotice(data.walked);
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
          captureType: state.captureType,
          sessionStart: state.sessionStart,
        });
        return;
      }

      // Already Walked conflict path: the completion screen's extra line.
      setWalkedCard(null);
      setWalkedDone(data.walked ?? null);
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
        captureType: state.captureType,
      });
    } catch {
      fail('Something went wrong. Try again.');
    }
  }

  function pauseSession() {
    if (state.phase !== 'interview') return;
    setPausedNotice(true);
    setState({
      phase: 'picker',
      resumable: {
        recordId: state.recordId,
        question: state.question,
        rung: state.rung,
        questionNumber: state.questionNumber,
        rungsReached: state.rungsReached,
        triggerType: state.triggerType,
        method: state.method,
        captureType: state.captureType,
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
        <BrandHeader />
        <h1 style={styles.title}>Capture your judgment</h1>
        <GapAnswerBanner />
        <CaptureRequestBanner />
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

        {/* Already Walked — graceful exit after "that saves me time". Positive
            frame: their time was respected, nothing negative recorded.
            ⚠️ DRAFT COPY — PENDING BRIAN'S WALK. */}
        {walkedSaved && state.phase === 'picker' && (
          <div style={styles.walkedSavedCard}>
            <p style={styles.walkedSavedTitle}>✅ {WALKED_COPY.savedTitle}</p>
            <p style={styles.walkedSavedBody}>
              {WALKED_COPY.savedBody(walkedSaved.author, walkedSaved.title)}
            </p>
            <a
              href={`/library/${walkedSaved.matchId}`}
              style={styles.walkedLink}
            >
              {WALKED_COPY.savedView}
            </a>
          </div>
        )}

        {state.phase === 'picker' && (
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
                      onClick={() => setState({ phase: 'picker', resumable: null })}
                    >
                      Start fresh instead
                    </button>
                  </div>
                </div>
              );
            })()}

            <div style={styles.introCard}>
              <p style={styles.pickerPrompt}>{CAPTURE_PICKER_PROMPT}</p>
              <div style={styles.captureGrid}>
                {CAPTURE_TYPES.map((c) => (
                  <button key={c.id} style={styles.captureCard} onClick={() => start(c.id)}>
                    <span style={styles.captureLabel}>{c.label}</span>
                    <span style={styles.captureSubline}>{c.subline}</span>
                  </button>
                ))}
              </div>
              <p style={styles.pickerMicrocopy}>{CAPTURE_PICKER_MICROCOPY}</p>
              <p style={styles.nudge}>
                {'\u{1F512}'} Names of people on your own team are fine to use — they stay
                private inside your organization, and are only stripped from
                anything you export outside it.
              </p>
            </div>
          </>
        )}

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
                {state.captureType
                  ? captureOption(state.captureType).label
                  : `${TRIGGER_TYPES.find((t) => t.id === state.triggerType)?.emoji ?? ''} ${
                      TRIGGER_TYPES.find((t) => t.id === state.triggerType)?.label ?? ''
                    } · ${METHODS[state.method].name}`}
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

        {/* Already Walked — soft inline card between interviewer turns. NOT a
            modal, NOT a block: the input below stays live the whole time.
            ⚠️ DRAFT COPY — PENDING BRIAN'S WALK. */}
        {interviewing && walkedCard && (
          <div style={styles.walkedCard}>
            <span style={styles.walkedKicker}>{WALKED_COPY.cardKicker}</span>
            <p style={styles.walkedBody}>
              {WALKED_COPY.cardBody(walkedCard.author, walkedCard.title)}
            </p>
            <div style={styles.actionRow}>
              <a
                href={`/library/${walkedCard.matchId}`}
                target="_blank"
                rel="noreferrer"
                style={styles.walkedViewButton}
                onClick={() => walkedAct(state.recordId, 'viewed')}
              >
                {WALKED_COPY.view}
              </a>
              <button
                style={styles.walkedGhostButton}
                onClick={() => walkedAct(state.recordId, 'kept_going')}
              >
                {WALKED_COPY.keepGoing}
              </button>
              <button
                style={styles.walkedGhostButton}
                disabled={walkedClosing}
                onClick={() => walkedAct(state.recordId, 'saved_time')}
              >
                {walkedClosing ? 'Closing…' : WALKED_COPY.savesTime}
              </button>
            </div>
          </div>
        )}

        {/* Already Walked — conflict heads-up: ONE line, capture continues,
            no further interruption (the value beat is at completion).
            ⚠️ DRAFT COPY — PENDING BRIAN'S WALK. */}
        {interviewing && walkedNotice && (
          <p style={styles.walkedNotice}>
            {WALKED_COPY.conflictNotice(walkedNotice.author)}
          </p>
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
              {state.captureType
                ? `✅ ${captureOption(state.captureType).closing}`
                : `✅ Pattern captured — ${METHODS[state.method].name}, all eight fields including entities and boundaries.`}
            </p>

            {/* Already Walked conflict path — the one extra completion line.
                ⚠️ DRAFT COPY — PENDING BRIAN'S WALK. */}
            {walkedDone && (
              <p style={styles.walkedContestedLine}>
                {WALKED_COPY.doneContested(walkedDone.otherAuthor, walkedDone.managerName)}{' '}
                {walkedDone.conflictId && (
                  <a
                    href={`/conflicts/${walkedDone.conflictId}`}
                    style={styles.walkedLink}
                  >
                    {WALKED_COPY.doneConflictLink}
                  </a>
                )}
              </p>
            )}

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
                    onClick={() => setState({ phase: 'picker', resumable: null })}
                  >
                    Capture another framework
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
    fontFamily: 'var(--font-sans)',
  },
  container: {
    width: '100%',
    maxWidth: '680px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  title: { fontSize: '28px', fontWeight: 700, margin: 0 },
  subtitle: { fontSize: '15px', color: 'var(--muted)', margin: 0, lineHeight: 1.5 },
  introCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    padding: '20px 24px',
    backgroundColor: 'var(--white)',
    border: '1px solid var(--line)',
    borderRadius: '12px',
  },
  introText: { margin: 0, fontSize: '15px', lineHeight: 1.6, color: 'var(--pine)' },
  resumeCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '16px 20px',
    backgroundColor: 'var(--growth-soft)',
    border: '1px solid var(--new-leaf-light)',
    borderRadius: '12px',
  },
  pickerPrompt: { margin: 0, fontSize: '17px', fontWeight: 700, color: 'var(--pine)' },
  // Six cards. 240px min column width → exactly 2 columns in the 680px
  // container (a 2×3 grid), and a single column on narrow/mobile viewports —
  // no media query needed with inline styles.
  captureGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: '10px',
  },
  captureCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    textAlign: 'left',
    gap: '6px',
    padding: '16px 14px',
    backgroundColor: 'var(--paper-2)',
    border: '1px solid var(--line)',
    borderRadius: '10px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  captureLabel: { fontSize: '15px', fontWeight: 700, color: 'var(--pine)', lineHeight: 1.3 },
  captureSubline: { fontSize: '13px', color: 'var(--muted)', lineHeight: 1.45 },
  pickerMicrocopy: { margin: 0, fontSize: '13px', color: 'var(--muted)', lineHeight: 1.5 },
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
    backgroundColor: 'var(--paper-2)',
    border: '1px solid var(--line)',
    borderRadius: '10px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  triggerEmoji: { fontSize: '26px' },
  triggerLabel: { fontSize: '13px', fontWeight: 600, color: 'var(--pine)', textAlign: 'center' },
  methodCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '16px 18px',
    backgroundColor: 'var(--paper-2)',
    border: '1px solid var(--line)',
    borderRadius: '10px',
  },
  methodName: { fontSize: '20px', fontWeight: 700, margin: 0 },
  swapDetails: { marginTop: '2px' },
  swapSummary: { fontSize: '13px', color: 'var(--muted)', cursor: 'pointer' },
  methodList: { display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' },
  methodListItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    textAlign: 'left',
    padding: '10px 14px',
    backgroundColor: 'var(--white)',
    border: '1px solid var(--line)',
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  methodListItemActive: { borderColor: 'var(--growth)', backgroundColor: 'var(--growth-soft)' },
  methodListMeta: { fontSize: '12px', color: 'var(--muted)' },
  methodBadgeRow: { fontSize: '13px', color: 'var(--muted)', margin: 0 },
  nudge: {
    margin: 0,
    fontSize: '13px',
    lineHeight: 1.5,
    color: 'var(--ok-text)',
    backgroundColor: 'var(--ok-bg)',
    border: '1px solid var(--ok-border)',
    borderRadius: '8px',
    padding: '10px 12px',
  },
  nudgeInline: { fontSize: '12px', color: 'var(--ok-text)', fontWeight: 600 },
  ladder: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px 10px',
    padding: '12px 14px',
    backgroundColor: 'var(--paper-2)',
    border: '1px solid var(--line)',
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
    color: 'var(--muted)',
    backgroundColor: 'var(--white)',
    border: '1.5px solid var(--line)',
  },
  ladderDotReached: {
    color: 'var(--white)',
    backgroundColor: 'var(--new-leaf)',
    borderColor: 'var(--new-leaf)',
  },
  ladderDotCurrent: {
    color: 'var(--pine)',
    borderColor: 'var(--pine)',
  },
  ladderLabel: { fontSize: '12px', color: 'var(--muted)' },
  ladderLabelActive: { color: 'var(--pine)', fontWeight: 600 },
  softWarning: {
    margin: 0,
    fontSize: '13px',
    color: 'var(--warn-text)',
    backgroundColor: 'var(--warn-bg)',
    border: '1px solid var(--warn-border)',
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
    backgroundColor: 'var(--warn-bg)',
    border: '1px solid var(--warn-border)',
    borderRadius: '10px',
  },
  hardCapText: { margin: 0, fontSize: '13px', color: 'var(--warn-text)', flex: '1 1 260px' },
  transcript: { display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' },
  bubble: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '12px 16px',
    borderRadius: '12px',
    maxWidth: '85%',
  },
  bubbleYou: { alignSelf: 'flex-end', backgroundColor: 'var(--deep-forest)', color: 'var(--on-dark)' },
  bubbleEngine: {
    alignSelf: 'flex-start',
    backgroundColor: 'var(--paper-2)',
    color: 'var(--pine)',
    border: '1px solid var(--line)',
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
    border: '1px solid var(--line)',
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
    color: 'var(--white)',
    backgroundColor: 'var(--growth)',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    alignSelf: 'flex-start',
  },
  primaryDisabled: { backgroundColor: 'var(--muted)', cursor: 'default' },
  ghost: {
    padding: '12px 14px',
    fontSize: '14px',
    color: 'var(--muted)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    textDecoration: 'underline',
  },
  loadingText: { color: 'var(--muted)', fontSize: '15px', margin: 0 },
  errorText: { color: 'var(--danger)', fontSize: '15px', margin: 0 },
  scrubNotice: {
    margin: 0,
    fontSize: '13px',
    color: 'var(--ok-text)',
    backgroundColor: 'var(--ok-bg)',
    border: '1px solid var(--ok-border)',
    borderRadius: '8px',
    padding: '8px 12px',
  },
  doneBadge: {
    fontSize: '15px',
    fontWeight: 600,
    color: 'var(--ok-text)',
    backgroundColor: 'var(--ok-bg)',
    border: '1px solid var(--ok-border)',
    borderRadius: '9999px',
    padding: '8px 16px',
    margin: 0,
    alignSelf: 'flex-start',
  },
  entityRow: { display: 'flex', flexWrap: 'wrap', gap: '6px' },
  entityChip: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--pine-soft)',
    backgroundColor: 'var(--paper-2)',
    border: '1px solid var(--line)',
    borderRadius: '9999px',
    padding: '5px 10px',
  },
  frameworkCard: {
    padding: '28px',
    backgroundColor: 'var(--white)',
    border: '1px solid var(--line)',
    borderTop: '4px solid var(--growth)',
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
    color: 'var(--growth-deep)',
  },
  frameworkName: { fontSize: '26px', fontWeight: 700, margin: 0, lineHeight: 1.2 },
  frameworkTagline: { fontSize: '15px', color: 'var(--pine-soft)', margin: 0, lineHeight: 1.5 },
  frameworkSection: { display: 'flex', flexDirection: 'column', gap: '6px' },
  frameworkSectionTitle: {
    fontSize: '12px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--pine-soft)',
  },
  frameworkList: {
    margin: 0,
    paddingLeft: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
  },
  frameworkItem: { fontSize: '14px', lineHeight: 1.55, color: 'var(--pine)' },
  frameworkPara: { margin: 0, fontSize: '14px', lineHeight: 1.6, color: 'var(--pine)' },
  signalsCard: {
    backgroundColor: 'var(--ok-bg)',
    border: '1px solid var(--ok-border)',
    borderRadius: '8px',
    padding: '12px 14px',
  },
  boundariesCard: {
    backgroundColor: 'var(--warn-bg)',
    border: '1px solid var(--warn-border)',
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
    color: 'var(--warn-text)',
  },
  boundaryItem: { fontSize: '14px', lineHeight: 1.55, color: 'var(--warn-text)' },
  actionRow: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' },
  retryCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '16px 20px',
    backgroundColor: 'var(--paper-2)',
    border: '1px solid var(--line)',
    borderRadius: '10px',
  },
  // ─── Already Walked (2026-08-04) ─────────────────────────────────────────
  // Soft, never alarming: the duplicate card reads like a helpful colleague,
  // the conflict notice borrows the warn palette but stays one line.
  walkedCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '14px 18px',
    backgroundColor: 'var(--paper-2)',
    border: '1px solid var(--line)',
    borderLeft: '4px solid var(--new-leaf)',
    borderRadius: '10px',
  },
  walkedKicker: {
    fontSize: '12px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--growth-deep)',
  },
  walkedBody: { margin: 0, fontSize: '14px', lineHeight: 1.55, color: 'var(--pine)' },
  walkedViewButton: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--white)',
    backgroundColor: 'var(--growth)',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    textDecoration: 'none',
    display: 'inline-block',
  },
  walkedGhostButton: {
    padding: '8px 10px',
    fontSize: '13px',
    color: 'var(--pine-soft)',
    background: 'none',
    border: '1px solid var(--line)',
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  walkedNotice: {
    margin: 0,
    fontSize: '13px',
    lineHeight: 1.5,
    color: 'var(--warn-text)',
    backgroundColor: 'var(--warn-bg)',
    border: '1px solid var(--warn-border)',
    borderRadius: '8px',
    padding: '10px 12px',
  },
  walkedSavedCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '14px 18px',
    backgroundColor: 'var(--ok-bg)',
    border: '1px solid var(--ok-border)',
    borderRadius: '10px',
  },
  walkedSavedTitle: { margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--ok-text)' },
  walkedSavedBody: { margin: 0, fontSize: '14px', lineHeight: 1.55, color: 'var(--ok-text)' },
  walkedLink: { fontSize: '13px', fontWeight: 600, color: 'var(--growth-deep)' },
  walkedContestedLine: {
    margin: 0,
    fontSize: '14px',
    lineHeight: 1.55,
    color: 'var(--warn-text)',
    backgroundColor: 'var(--warn-bg)',
    border: '1px solid var(--warn-border)',
    borderRadius: '8px',
    padding: '10px 14px',
  },
};
