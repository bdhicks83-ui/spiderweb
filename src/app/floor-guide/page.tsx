"use client";
// FLOOR GUIDE / PHASE A — the new-hire surface.
//
// ═══════════════════════════════════════════════════════════════════════════
// WHO THIS PAGE IS FOR, because every decision below follows from it:
//
// Somebody on their second week. They were shown the line once, they have a
// laminator making a noise they can't name, and the thing they are actually
// managing is not the panel — it's not wanting to look stupid. They will guess
// before they ask a person. That is the behaviour this page has to beat.
//
// So: it opens with answers, not a box. It never scores them. It shows no match
// percentages (a "61% match" on your third day is an anxiety generator, not
// information). And it says out loud that nobody is watching, because the whole
// mechanism only works if they believe that.
//
// ⭐ THE PRIVACY IS NOT A UI DECISION AND THIS PAGE DOES NOT IMPLEMENT IT.
// Every call from here carries floor_guide: true, and the SERVER decides what
// that means by AND-ing it against this person's own profiles.floor_guide_active
// (src/lib/floor-guide.ts → resolveFloorGuideMode). The suppression happens at
// the point of write, in /api/retrieve/signal and /api/gaps. If this page were
// deleted tomorrow the promise would still hold; if the suppression were deleted
// the promise would be a lie while this page still looked perfect. That asymmetry
// is why the flag travels rather than the filtering.
//
// ⭐ WHAT THIS PAGE DELIBERATELY DOES NOT HAVE:
//   • No "was this helpful?" control. On /retrieve that control is the product's
//     best training signal (P-8 signal 7). Here it would be suppressed server-
//     side and write nothing — so rendering it would be asking a nervous person
//     to click a button we quietly throw away. An honest surface shows no
//     control rather than a decorative one.
//   • No match percentage, no "Strong match" band.
//   • No "answer it now" on an uncovered question. A person in their second week
//     is not the right author of the team's official answer, and the integrity
//     rule would refuse them at the end of the interview anyway (contributors
//     can't codify). Flagging the hole IS their contribution, and the copy says
//     so without patronising them.
// ═══════════════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import BrandHeader from "@/components/BrandHeader";
// FLOOR GUIDE B — the invitation. Self-gating (renders only for a contributor)
// and privacy-safe on this surface: passive detection is NOT permitted to write
// from Floor Guide, so when something they said looks like a practice the panel
// ASKS them to send it up and writes nothing until they click. See
// PASSIVE_SURFACES in src/lib/candidate-insights.ts for the whole argument.
import ShareIdeaPanel from "@/components/ShareIdeaPanel";

const supabase = createClient();

// ═════════════════════════════════════════════════════════════════════════════
// ⭐⭐ INVISIBLE COMPLEXITY — THE DEFAULT, AND IT IS A DELIBERATE ONE.
//
// Behind this surface a model now restates what the person typed in their own
// team's vocabulary, and BOTH phrasings get searched (see /api/retrieve step 2).
// That machinery is why "the panel looks bubbled along one edge" finds the
// delamination frameworks at all. `SHOW_READING` decides one thing only: whether
// the person is shown the restatement.
//
// FALSE — the shipped default — means they see none of it. They type what they
// can see and they get what to do about it. No "did you mean," no second thing to
// read above the answer, no exposed translation. That is the doctrine this whole
// page is built on: the complexity is ours to carry, not theirs to evaluate.
//
// THE ARGUMENT FOR TRUE IS REAL, WHICH IS WHY THE PANEL AND COPY STAY WIRED
// RATHER THAN DELETED. Not knowing what things are called here is a new hire's
// biggest handicap, and handing them their team's words for what they just
// described is genuine onboarding value — and a good demo beat.
//
// It loses on default anyway, for two reasons. It puts a second thing to read
// ABOVE the answer at the exact moment somebody is stressed and wants the answer.
// And the low-confidence variant ("I think you might mean this — worth checking")
// is a did-you-mean by another name: it asks the one person who cannot yet tell
// whether the reading is right to be the one who checks it.
//
// ⚠️ CUSTOMER-FACING ⇒ BRIAN'S CALL, and it is one line. Flip to true and the
// readingLabel / readingTentative / readingTermsLabel strings below go live.
// ═════════════════════════════════════════════════════════════════════════════
const SHOW_READING: boolean = false;

// ═════════════════════════════════════════════════════════════════════════════
// ⚠️⚠️⚠️ DRAFT CUSTOMER-FACING COPY — PENDING BRIAN'S SIGN-OFF ⚠️⚠️⚠️
//
// EVERY STRING A NERVOUS PERSON READS IS IN THIS ONE BLOCK. This is the most
// emotionally load-bearing copy in the product: it is talking to somebody who is
// slightly scared, and its job is to lower the cost of admitting they don't know
// something. Get the tone wrong and the feature has no users.
//
// ⭐ THE "NOBODY'S GRADING YOU" LINE IS BRIAN'S TO VOICE. It is the promise the
// whole feature rests on, it is a promise about how the company behaves, and it
// should be said in his words, not drafted in mine. What is here is functional
// and honest — it is not final.
//
// Register: Track B, plain, kind, warm. Not chirpy. No exclamation marks, no
// "Don't worry!", no emoji in body copy — a new hire being talked to brightly by
// software reads as being handled. Short sentences. Land it once.
//
// The one thing this copy must never do is over-promise. It says nothing will be
// reported because nothing is written. If that ever stops being true at the write
// layer, these strings become a lie, which is why the suppression is verified by
// scripts/verify-floor-guide.mjs and not by reading this file.
// ═════════════════════════════════════════════════════════════════════════════
const COPY = {
  title: "Floor Guide",
  welcomeWithTitle: (title: string) => `You're new on ${title}.`,
  welcomePlain: "You're new here.",
  orientLead: "Here's what the people who've been doing this a while say matters most.",
  orientFallback:
    "Here's what your team has written down so far. It isn't scoped to your job yet — that comes as more gets captured.",
  scopedNote: (title: string) => `Picked for ${title}`,

  // ⭐ The promise. Brian's line to write.
  privacyTitle: "Ask anything — nobody's grading you.",
  privacyBody:
    "This is yours. What you ask here isn't reported to your manager and isn't kept against your name. If the answer isn't in here yet, that's a hole in what your team has written down, not a hole in you.",

  askTitle: "What are you seeing?",
  askHelp:
    "Describe it however you'd say it out loud. You don't need the right words for it — plain is fine, and so is a guess.",
  askPlaceholders: [
    "e.g. the panel looks bubbled along one edge",
    "e.g. the laminator sounds different than it did this morning",
    "e.g. the foam is coming out darker than the last run",
    "e.g. someone told me to hold the bundle and I don't know what for",
    "e.g. the edges aren't lining up the way they did on the last order",
  ],
  askButton: "Show me",
  askWorking: "Looking…",

  answersLead: "Here's what your team says about that.",
  // ⏸️ OFF BY DEFAULT — gated behind SHOW_READING at the top of this file, which
  // is where the reasoning lives. Drafted and wired so turning the vocabulary
  // bridge on is a one-line decision rather than a build. Two versions, because if
  // it is ever shown, presenting a shaky mapping as a certainty to somebody who
  // can't yet tell the difference is the thing to avoid.
  readingLabel: "Here's how I read that, in your team's words:",
  readingTentative: "I think you might mean this — worth checking if it looks off:",
  readingTermsLabel: "Words your team uses for this:",
  theCall: "What to do",
  whoOwns: "Who to grab",
  watchFor: "What to look for",
  whenApplies: "When this applies",
  whyLabel: "Why they do it this way",
  carefulLabel: "When it doesn't apply",
  contested: "Two people here do this differently",
  contestedHelp:
    "Your team hasn't settled this one. Worth knowing before you act on it — ask whoever's on shift which way they run it.",
  openFull: "Read the whole thing →",
  noCall: "This one's written up in the library rather than as a single call.",

  gapTitle: "Nobody's written this one down yet.",
  gapBody:
    "That's worth knowing. It means the answer is in somebody's head and nowhere else — including for the next person who starts. Flagging it tells your team where the hole is.",
  gapFlag: "Flag it as missing",
  gapFlagging: "Flagging…",
  // ⚠️ Deliberately does NOT promise a notification. A Floor Guide flag carries
  // no asker row by design, so nothing will ever come back to this person. The
  // /retrieve version of this copy DOES promise it, correctly, because there the
  // asker is recorded. Do not copy that line over here.
  gapFlagged:
    "Flagged. Your team can see there's a hole here now — and it went in without your name on it.",
  gapFlaggedRepeat: (n: number) =>
    `Flagged. You're not the first — this has come up ${n} times, so it's near the top of what your team needs to write down.`,
  gapFailed: "That didn't go through. Try again — what you typed is still here.",
  gapAskSomeone:
    "In the meantime: this is a good one to ask out loud. Nobody expects you to know it.",

  inactiveTitle: "Floor Guide isn't switched on for you.",
  inactiveBody:
    "It's turned on per person, usually for someone's first few weeks. Whoever administers your account can switch it on.",
  inactiveElsewhere: "You can still ask your team's brain anything →",

  emptyOrgTitle: "Nothing's been written down yet.",
  emptyOrgBody:
    "Your team hasn't captured any frameworks yet, so there's nothing to show you here — that's about how new the account is, not about you. Ask away anyway; anything that comes up empty gets flagged for your experts.",

  loading: "Getting your starting points…",
  failed: "Couldn't load your starting points just now. Reload the page and it should come back.",
  backToApp: "Dashboard",
};
// ═════════════════════════════════════════════════════════════════════════════

type BeginnerFrame = {
  the_call: string;
  who_to_grab: string | null;
  watch_for: string[];
  when_it_applies: string[];
  why: string;
  careful_when: string[];
};

type Card = {
  id: string;
  name: string;
  tagline: string;
  method: string | null;
  context_function: string | null;
  author: { display_name: string | null; claimed_title: string | null } | null;
  beginner: BeginnerFrame;
  contested: boolean;
};

type Start =
  | { kind: "loading" }
  | { kind: "inactive" }
  | { kind: "ready"; cards: Card[]; scopedBy: string | null; you: { title: string | null } }
  | { kind: "failed" };

type Answer = {
  id: string;
  name: string;
  tagline: string;
  beginner: BeginnerFrame | null;
  contested: boolean;
};

type Reading = { text: string; terms: string[]; confident: boolean } | null;

type Ask =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "answers"; askedFor: string; answers: Answer[]; reading: Reading }
  | { kind: "gap"; askedFor: string; reading: Reading }
  | { kind: "failed"; message: string };

type GapState =
  | { kind: "idle" }
  | { kind: "flagging" }
  | { kind: "flagged"; askedCount: number }
  | { kind: "error" };

// Anything model-authored gets coerced before it is mapped. Same P-7 lesson as
// /retrieve: a `signals` that arrived as a string survives `.length` and throws
// on `.map`, and on this page a throw would blank the screen of the person least
// equipped to work out what happened.
function asArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((s): s is string => typeof s === "string" && !!s.trim());
  if (typeof v === "string" && v.trim()) return [v];
  return [];
}
function asText(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function safeFrame(v: unknown): BeginnerFrame {
  const f = (v ?? {}) as Record<string, unknown>;
  return {
    the_call: asText(f.the_call),
    who_to_grab: typeof f.who_to_grab === "string" ? f.who_to_grab : null,
    watch_for: asArray(f.watch_for),
    when_it_applies: asArray(f.when_it_applies),
    why: asText(f.why),
    careful_when: asArray(f.careful_when),
  };
}

function log(msg: string, extra?: unknown) {
  // eslint-disable-next-line no-console
  console.log(`[floor-guide-page] ${msg}`, extra ?? "");
}

// One malformed framework degrades to one quiet card, never to a blank page.
// React only offers this as a class component.
class CardBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      // No error jargon on this surface — a new hire cannot act on a stack trace
      // and should not be made to feel they broke something.
      return <div style={styles.cardQuiet}>This one didn&apos;t load. The rest below are fine.</div>;
    }
    return this.props.children;
  }
}

// ─── The beginner-framed body, used for both start cards and answers ─────────
// THE ORDER IS THE FEATURE. Call first, name second, signals third, reasoning
// fourth. An expert reads a framework to decide whether they agree; a beginner
// reads it to know what to do in the next ten minutes and who to go find. Same
// words, same framework, different first line.
function BeginnerBody({ frame, defaultOpen }: { frame: BeginnerFrame; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <>
      <div style={styles.callBox}>
        <div style={styles.callLabel}>{COPY.theCall}</div>
        <p style={styles.callText}>{frame.the_call || COPY.noCall}</p>
      </div>

      {frame.who_to_grab && (
        <div style={styles.whoRow}>
          <span style={styles.whoLabel}>{COPY.whoOwns}</span>
          <span style={styles.whoName}>{frame.who_to_grab}</span>
        </div>
      )}

      {frame.watch_for.length > 0 && (
        <div style={styles.block}>
          <div style={styles.blockLabel}>{COPY.watchFor}</div>
          <ul style={styles.list}>
            {frame.watch_for.map((s, i) => (
              <li key={i} style={styles.listItem}>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* The reasoning is real and it is BELOW. Collapsed on the orientation
          cards so the start screen stays scannable; open by default on an answer,
          because somebody who just asked a question is already reading. */}
      {(frame.why || frame.when_it_applies.length > 0 || frame.careful_when.length > 0) && (
        <>
          {!open && (
            <button type="button" style={styles.moreButton} onClick={() => setOpen(true)}>
              {COPY.whyLabel} →
            </button>
          )}
          {open && (
            <div style={styles.deeper}>
              {frame.when_it_applies.length > 0 && (
                <div style={styles.block}>
                  <div style={styles.blockLabel}>{COPY.whenApplies}</div>
                  <ul style={styles.list}>
                    {frame.when_it_applies.map((s, i) => (
                      <li key={i} style={styles.listItem}>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {frame.why && (
                <div style={styles.block}>
                  <div style={styles.blockLabel}>{COPY.whyLabel}</div>
                  <p style={styles.blockText}>{frame.why}</p>
                </div>
              )}
              {frame.careful_when.length > 0 && (
                <div style={styles.block}>
                  <div style={styles.blockLabel}>{COPY.carefulLabel}</div>
                  <ul style={styles.list}>
                    {frame.careful_when.map((s, i) => (
                      <li key={i} style={styles.listItem}>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}

export default function FloorGuidePage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [start, setStart] = useState<Start>({ kind: "loading" });
  const [situation, setSituation] = useState("");
  const [ask, setAsk] = useState<Ask>({ kind: "idle" });
  const [gap, setGap] = useState<GapState>({ kind: "idle" });
  const [placeholder] = useState(
    () => COPY.askPlaceholders[Math.floor(Math.random() * COPY.askPlaceholders.length)]
  );

  const loadStart = useCallback(async () => {
    try {
      // Cache-bust, per the P-9 read-freshness lesson: an admin switching Floor
      // Guide on and the person refreshing is the FIRST thing that happens with
      // this feature, and a stale "not switched on" would look like a broken
      // toggle.
      const res = await fetch(`/api/floor-guide?t=${Date.now()}`, { cache: "no-store" });
      const body = (await res.json()) as Record<string, unknown>;
      log(`GET /api/floor-guide → HTTP ${res.status}`, body);
      if (!res.ok) {
        setStart({ kind: "failed" });
        return;
      }
      if (body?.active !== true) {
        setStart({ kind: "inactive" });
        return;
      }
      const rawCards = Array.isArray(body?.cards) ? (body.cards as Record<string, unknown>[]) : [];
      setStart({
        kind: "ready",
        scopedBy: typeof body?.scoped_by === "string" ? body.scoped_by : null,
        you: {
          title:
            body?.you && typeof (body.you as Record<string, unknown>).claimed_title === "string"
              ? ((body.you as Record<string, unknown>).claimed_title as string)
              : null,
        },
        cards: rawCards.map((c) => ({
          id: asText(c.id),
          name: asText(c.name) || "A framework",
          tagline: asText(c.tagline),
          method: typeof c.method === "string" ? c.method : null,
          context_function: typeof c.context_function === "string" ? c.context_function : null,
          author:
            c.author && typeof c.author === "object"
              ? {
                  display_name: asText((c.author as Record<string, unknown>).display_name) || null,
                  claimed_title: asText((c.author as Record<string, unknown>).claimed_title) || null,
                }
              : null,
          beginner: safeFrame(c.beginner),
          contested: c.contested === true,
        })),
      });
    } catch {
      setStart({ kind: "failed" });
    }
  }, []);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      setChecking(false);
      await loadStart();
    })();
  }, [router, loadStart]);

  // ── The symptom-first ask. Reuses /api/retrieve verbatim, with the privacy
  //    flag. Not a second engine — see the header note on /api/retrieve.
  async function runAsk() {
    if (ask.kind === "working" || !situation.trim()) return;
    const askedFor = situation.trim();
    setAsk({ kind: "working" });
    setGap({ kind: "idle" });
    try {
      const res = await fetch("/api/retrieve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // ⭐ THE FLAG. The server AND-s it against this person's own
        // floor_guide_active and refuses (403 FLOOR_GUIDE_NOT_ACTIVE) rather than
        // silently running with the writes live.
        body: JSON.stringify({ situation: askedFor, floor_guide: true }),
      });
      const data = (await res.json()) as Record<string, unknown>;
      log(`POST /api/retrieve → HTTP ${res.status}`, data);
      if (!res.ok) {
        setAsk({ kind: "failed", message: asText(data?.error) || COPY.failed });
        return;
      }
      const results = Array.isArray(data?.results) ? (data.results as Record<string, unknown>[]) : [];
      // Null whenever the raw words were what found the answer — showing a
      // restatement that didn't produce the result would be theatre.
      const reading: Reading =
        typeof data?.reading === "string" && data.reading.trim()
          ? {
              text: data.reading.trim(),
              terms: asArray(data?.reading_terms),
              confident: data?.reading_confident === true,
            }
          : null;
      if (data?.noMatch === true || results.length === 0) {
        setAsk({ kind: "gap", askedFor, reading });
        return;
      }
      setAsk({
        kind: "answers",
        askedFor,
        reading,
        answers: results.map((r) => ({
          id: asText(r.id),
          name: asText((r.framework as Record<string, unknown>)?.name) || "A framework",
          tagline: asText((r.framework as Record<string, unknown>)?.tagline),
          beginner: r.beginner ? safeFrame(r.beginner) : null,
          contested: Array.isArray(r.contested) && r.contested.length > 0,
        })),
      });
    } catch {
      setAsk({ kind: "failed", message: COPY.failed });
    }
  }

  // ── Flag the hole. The gap row lands org-wide; NO asker row is written, so
  //    nothing ever comes back to this person — and the copy above says so.
  async function flagGap(question: string) {
    if (gap.kind === "flagging") return;
    setGap({ kind: "flagging" });
    try {
      const res = await fetch("/api/gaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, floor_guide: true }),
      });
      const data = (await res.json()) as Record<string, unknown>;
      log(`POST /api/gaps → HTTP ${res.status}`, data);
      if (!res.ok) {
        setGap({ kind: "error" });
        return;
      }
      const n = typeof data?.asked_count === "number" ? data.asked_count : 1;
      setGap({ kind: "flagged", askedCount: n });
    } catch {
      setGap({ kind: "error" });
    }
  }

  if (checking || start.kind === "loading") {
    return (
      <div style={styles.center}>
        <p style={styles.quiet}>{COPY.loading}</p>
      </div>
    );
  }

  if (start.kind === "inactive") {
    return (
      <div style={styles.wrapper}>
        <div style={styles.container}>
          <BrandHeader />
          <h1 style={styles.title}>{COPY.title}</h1>
          <div style={styles.calmPanel}>
            <h2 style={styles.panelTitle}>{COPY.inactiveTitle}</h2>
            <p style={styles.panelBody}>{COPY.inactiveBody}</p>
            <a href="/retrieve" style={styles.link}>
              {COPY.inactiveElsewhere}
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (start.kind === "failed") {
    return (
      <div style={styles.wrapper}>
        <div style={styles.container}>
          <BrandHeader />
          <h1 style={styles.title}>{COPY.title}</h1>
          <div style={styles.calmPanel}>
            <p style={styles.panelBody}>{COPY.failed}</p>
          </div>
        </div>
      </div>
    );
  }

  const roleTitle = start.you.title;

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        <div style={styles.headerRow}>
          <BrandHeader />
          <a href="/dashboard" style={styles.headerLink}>
            {COPY.backToApp}
          </a>
        </div>

        <h1 style={styles.title}>{COPY.title}</h1>
        <p style={styles.welcome}>
          {roleTitle ? COPY.welcomeWithTitle(roleTitle) : COPY.welcomePlain}{" "}
          {start.cards.length > 0
            ? start.scopedBy
              ? COPY.orientLead
              : COPY.orientFallback
            : ""}
        </p>

        {/* THE PROMISE. Above the box, not buried under it — it has to be read
            before the first question, not after. Calm sage panel, never a warning
            colour: this is reassurance, not an alert. */}
        <div style={styles.privacyPanel}>
          <div style={styles.privacyTitle}>{COPY.privacyTitle}</div>
          <p style={styles.privacyBody}>{COPY.privacyBody}</p>
        </div>

        {/* ── THE ASK. Symptom-first: plain words, no jargon required. ── */}
        <div style={styles.askBox}>
          <label style={styles.askTitle} htmlFor="fg-situation">
            {COPY.askTitle}
          </label>
          <p style={styles.askHelp}>{COPY.askHelp}</p>
          <textarea
            id="fg-situation"
            style={styles.textarea}
            rows={3}
            value={situation}
            placeholder={placeholder}
            onChange={(e) => setSituation(e.target.value)}
          />
          <button
            type="button"
            style={styles.primaryButton}
            disabled={ask.kind === "working" || !situation.trim()}
            onClick={runAsk}
          >
            {ask.kind === "working" ? COPY.askWorking : COPY.askButton}
          </button>
        </div>

        {/* ── ANSWERS ── */}
        {ask.kind === "failed" && (
          <div style={styles.calmPanel}>
            <p style={styles.panelBody}>{ask.message}</p>
          </div>
        )}

        {/* ── THE READING. Rendered only when SHOW_READING is on; invisible by
            default (see the note at the top of this file). The rephrase still
            RUNS either way — it is what found the answer. */}
        {SHOW_READING && (ask.kind === "answers" || ask.kind === "gap") && ask.reading && (
          <div style={styles.readingPanel}>
            <div style={styles.readingLabel}>
              {ask.reading.confident ? COPY.readingLabel : COPY.readingTentative}
            </div>
            <p style={styles.readingText}>{ask.reading.text}</p>
            {ask.reading.terms.length > 0 && (
              <div style={styles.termsRow}>
                <span style={styles.blockLabel}>{COPY.readingTermsLabel}</span>
                {ask.reading.terms.map((t, i) => (
                  <span key={i} style={styles.termChip}>
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {ask.kind === "answers" && (
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>{COPY.answersLead}</h2>
            {ask.answers.map((a) => (
              <CardBoundary key={a.id}>
                <div style={styles.card}>
                  <div style={styles.cardTop}>
                    <span style={styles.cardName}>{a.name}</span>
                    {a.contested && <span style={styles.contestedChip}>{COPY.contested}</span>}
                  </div>
                  {a.tagline && <p style={styles.cardTagline}>{a.tagline}</p>}
                  {a.contested && <p style={styles.contestedHelp}>{COPY.contestedHelp}</p>}
                  {a.beginner && <BeginnerBody frame={a.beginner} defaultOpen />}
                  <a href={`/library/${a.id}`} style={styles.link}>
                    {COPY.openFull}
                  </a>
                </div>
              </CardBoundary>
            ))}
          </div>
        )}

        {/* ── NO MATCH → the gap. Amber (attention), never red. Opportunity
            framing, and explicitly not the person's fault. ── */}
        {ask.kind === "gap" && (
          <div style={styles.gapPanel}>
            <div style={styles.gapTitle}>{COPY.gapTitle}</div>
            <p style={styles.gapBody}>{COPY.gapBody}</p>
            {gap.kind === "flagged" ? (
              <p style={styles.gapDone}>
                {gap.askedCount > 1 ? COPY.gapFlaggedRepeat(gap.askedCount) : COPY.gapFlagged}
              </p>
            ) : (
              <button
                type="button"
                style={styles.gapButton}
                disabled={gap.kind === "flagging"}
                onClick={() => flagGap(ask.askedFor)}
              >
                {gap.kind === "flagging" ? COPY.gapFlagging : COPY.gapFlag}
              </button>
            )}
            {gap.kind === "error" && <p style={styles.gapBody}>{COPY.gapFailed}</p>}
            <p style={styles.gapAside}>{COPY.gapAskSomeone}</p>
          </div>
        )}

        {/* ── THE OTHER DIRECTION. Everything above this line is the system
            answering them. This is the one place on the page where they get to
            answer back — and it sits below the answers on purpose, because
            somebody who came here stuck needs help first and has nothing to
            offer until they've had it. ── */}
        <ShareIdeaPanel
          surface="floor_guide"
          observation={ask.kind === "answers" || ask.kind === "gap" ? ask.askedFor : null}
          contextNote={
            ask.kind === "answers" && ask.answers.length > 0 ? ask.answers[0].name : null
          }
        />

        {/* ── THE ORIENTATION CARDS. Below the ask once you've asked something,
            but present from the first paint so the page is never a blank box. ── */}
        {start.cards.length > 0 ? (
          <div style={styles.section}>
            <div style={styles.sectionHeadRow}>
              <h2 style={styles.sectionTitle}>{COPY.orientLead}</h2>
              {start.scopedBy && <span style={styles.scopeChip}>{COPY.scopedNote(start.scopedBy)}</span>}
            </div>
            {start.cards.map((c) => (
              <CardBoundary key={c.id}>
                <div style={styles.card}>
                  <div style={styles.cardTop}>
                    <span style={styles.cardName}>{c.name}</span>
                    {c.contested && <span style={styles.contestedChip}>{COPY.contested}</span>}
                  </div>
                  {c.tagline && <p style={styles.cardTagline}>{c.tagline}</p>}
                  {c.contested && <p style={styles.contestedHelp}>{COPY.contestedHelp}</p>}
                  <BeginnerBody frame={c.beginner} defaultOpen={false} />
                  <a href={`/library/${c.id}`} style={styles.link}>
                    {COPY.openFull}
                  </a>
                </div>
              </CardBoundary>
            ))}
          </div>
        ) : (
          <div style={styles.calmPanel}>
            <h2 style={styles.panelTitle}>{COPY.emptyOrgTitle}</h2>
            <p style={styles.panelBody}>{COPY.emptyOrgBody}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
// Viridescent tokens only (src/styles/theme.css). CALM IS THE BRIEF: more white
// space than the other surfaces, softer rules, no dense chrome, one accent
// colour. The only non-brand hue is the amber gap panel, which is the app-wide
// "attention, not error" treatment and is consistent with contested badges and
// Coaching Watch.
const styles: Record<string, React.CSSProperties> = {
  wrapper: { minHeight: "100vh", fontFamily: "var(--font-sans)" },
  container: { maxWidth: 720, margin: "0 auto", padding: "40px 24px 96px" },
  center: {
    minHeight: "60vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  headerLink: { fontSize: 14, fontWeight: 600, color: "var(--pine)", textDecoration: "none" },
  title: { fontSize: 30, margin: "22px 0 8px" },
  welcome: {
    fontSize: 17,
    lineHeight: 1.6,
    color: "var(--pine)",
    margin: "0 0 24px",
    maxWidth: "60ch",
  },
  quiet: { color: "var(--muted)", fontSize: 14 },

  privacyPanel: {
    background: "var(--growth-soft)",
    border: "1px solid var(--ok-border)",
    borderRadius: 16,
    padding: "18px 20px",
    marginBottom: 26,
  },
  privacyTitle: {
    fontFamily: "var(--font-serif)",
    fontSize: 18,
    color: "var(--growth-deep)",
    marginBottom: 6,
  },
  privacyBody: {
    fontSize: 14.5,
    lineHeight: 1.65,
    color: "var(--pine)",
    margin: 0,
    maxWidth: "62ch",
  },

  askBox: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    background: "var(--white)",
    border: "1px solid var(--line)",
    borderRadius: 16,
    padding: "20px 20px 18px",
    marginBottom: 30,
  },
  askTitle: { fontFamily: "var(--font-serif)", fontSize: 20, color: "var(--pine)" },
  askHelp: { fontSize: 14, color: "var(--muted)", margin: "0 0 4px", lineHeight: 1.55 },
  textarea: {
    fontSize: 15.5,
    fontFamily: "inherit",
    border: "1px solid var(--line)",
    borderRadius: 12,
    padding: "13px 15px",
    resize: "vertical",
    boxSizing: "border-box",
    width: "100%",
    lineHeight: 1.55,
    color: "var(--pine)",
  },
  primaryButton: {
    alignSelf: "flex-start",
    padding: "11px 26px",
    fontSize: 15,
    fontWeight: 600,
    color: "var(--white)",
    background: "var(--growth)",
    border: "none",
    borderRadius: 12,
    cursor: "pointer",
  },

  section: { marginBottom: 34 },
  sectionHeadRow: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 19, margin: "0 0 12px", color: "var(--pine)" },
  scopeChip: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--growth-deep)",
    background: "var(--growth-soft)",
    border: "1px solid var(--ok-border)",
    borderRadius: 999,
    padding: "3px 10px",
    whiteSpace: "nowrap",
  },

  card: {
    background: "var(--white)",
    border: "1px solid var(--line)",
    borderRadius: 16,
    padding: "20px 22px",
    marginBottom: 14,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  cardQuiet: {
    background: "var(--paper-2)",
    border: "1px dashed var(--line)",
    borderRadius: 16,
    padding: "16px 20px",
    marginBottom: 14,
    fontSize: 14,
    color: "var(--muted)",
  },
  cardTop: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  cardName: { fontFamily: "var(--font-serif)", fontSize: 19, color: "var(--pine)" },
  cardTagline: { fontSize: 14.5, color: "var(--pine-soft)", margin: 0, lineHeight: 1.6 },

  contestedChip: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--warn-text)",
    background: "var(--warn-chip-bg)",
    border: "1px solid var(--warn-border)",
    borderRadius: 999,
    padding: "3px 10px",
  },
  contestedHelp: {
    fontSize: 13.5,
    color: "var(--warn-text)",
    background: "var(--warn-bg)",
    border: "1px solid var(--warn-border)",
    borderRadius: 10,
    padding: "10px 12px",
    margin: 0,
    lineHeight: 1.55,
  },

  // ⭐ The call is the loudest thing on the card. That is the beginner framing,
  // expressed in layout as well as in order.
  callBox: {
    background: "var(--paper-2)",
    borderLeft: "3px solid var(--growth)",
    borderRadius: "0 12px 12px 0",
    padding: "12px 16px",
  },
  callLabel: {
    fontSize: 11.5,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--growth-deep)",
    marginBottom: 5,
  },
  callText: { fontSize: 16, lineHeight: 1.6, color: "var(--pine)", margin: 0 },

  whoRow: { display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" },
  whoLabel: {
    fontSize: 11.5,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--muted)",
  },
  whoName: { fontSize: 14.5, fontWeight: 600, color: "var(--pine)" },

  block: { display: "flex", flexDirection: "column", gap: 5 },
  blockLabel: {
    fontSize: 11.5,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--muted)",
  },
  blockText: { fontSize: 14.5, lineHeight: 1.65, color: "var(--pine-soft)", margin: 0 },
  list: { margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4 },
  listItem: { fontSize: 14.5, lineHeight: 1.6, color: "var(--pine-soft)" },
  moreButton: {
    alignSelf: "flex-start",
    background: "none",
    border: "none",
    padding: 0,
    fontSize: 14,
    fontWeight: 600,
    color: "var(--growth)",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  deeper: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    borderTop: "1px solid var(--line)",
    paddingTop: 12,
  },

  // Paper-toned, not accented: the reading is context for what follows, not a
  // result in its own right. It must not compete with the WHAT TO DO box.
  readingPanel: {
    background: "var(--paper-2)",
    border: "1px solid var(--line)",
    borderRadius: 14,
    padding: "14px 18px",
    marginBottom: 18,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  readingLabel: { fontSize: 13, fontWeight: 600, color: "var(--muted)" },
  readingText: {
    fontSize: 15.5,
    lineHeight: 1.6,
    color: "var(--pine)",
    margin: 0,
    fontFamily: "var(--font-serif)",
    maxWidth: "62ch",
  },
  termsRow: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" },
  termChip: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--growth-deep)",
    background: "var(--growth-soft)",
    border: "1px solid var(--ok-border)",
    borderRadius: 999,
    padding: "2px 9px",
  },

  gapPanel: {
    background: "var(--warn-bg)",
    border: "1px solid var(--warn-border)",
    borderRadius: 16,
    padding: "18px 20px",
    marginBottom: 30,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  gapTitle: { fontFamily: "var(--font-serif)", fontSize: 18, color: "var(--warn-text)" },
  gapBody: { fontSize: 14.5, lineHeight: 1.6, color: "var(--warn-text)", margin: 0, maxWidth: "62ch" },
  gapDone: {
    fontSize: 14.5,
    lineHeight: 1.6,
    color: "var(--growth-deep)",
    margin: 0,
    fontWeight: 600,
    maxWidth: "62ch",
  },
  gapAside: { fontSize: 13.5, lineHeight: 1.55, color: "var(--warn-text)", margin: 0, opacity: 0.9 },
  gapButton: {
    alignSelf: "flex-start",
    padding: "9px 20px",
    fontSize: 14.5,
    fontWeight: 600,
    color: "var(--white)",
    background: "var(--warn-strong)",
    border: "none",
    borderRadius: 10,
    cursor: "pointer",
  },

  calmPanel: {
    background: "var(--white)",
    border: "1px solid var(--line)",
    borderRadius: 16,
    padding: "22px 24px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  panelTitle: { fontSize: 19, margin: 0, color: "var(--pine)" },
  panelBody: { fontSize: 14.5, lineHeight: 1.65, color: "var(--pine-soft)", margin: 0, maxWidth: "62ch" },
  link: { fontSize: 14, fontWeight: 600, color: "var(--growth)", textDecoration: "none" },
};
