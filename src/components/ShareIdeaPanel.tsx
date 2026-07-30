"use client";
// FLOOR GUIDE / PHASE B — the invitation.
//
// ═══════════════════════════════════════════════════════════════════════════
// WHO THIS IS FOR: somebody who has been doing the job long enough to have
// worked something out, and who is not on the list of people allowed to write
// the team's official answers. They have never been asked. Most of them assume
// nobody wants to know.
//
// So the emotional job of this panel is narrow and it is not "collect data." It
// is to make offering something feel welcomed rather than audited. Everything
// below follows from that:
//
//   • It is an invitation, not a form. No required fields beyond the one, no
//     categories to pick, no "submit request."
//   • It promises a HUMAN READER and CREDIT, and promises nothing about
//     acceptance. "If it becomes part of the playbook, your name goes on it" is
//     true. "We'll add it" would not be.
//   • It never reports a rejection, because it never learns about one.
//
// ⭐ TWO DOORS, ONE PANEL. A person can open it themselves ("Know a better
// way?"), or the system can notice that something they just said sounded like a
// practice and INVITE them to send it up. The second door is how Floor Guide
// gets to keep its privacy promise: on that surface nothing is written until the
// person clicks, so being noticed costs them nothing and reveals nothing.
// ═══════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

export type ShareSurface = "floor_guide" | "retrieve" | "ask";

// ⚠️⚠️ DRAFT CUSTOMER-FACING COPY — PENDING BRIAN'S SIGN-OFF (Floor Guide B).
// Full draft set, with the reasoning, in claude/COPY-DRAFT-floorguide-phaseB.md.
// ═════════════════════════════════════════════════════════════════════════════
const COPY = {
  openLink: "Know a better way? Share it.",
  openLinkAfterAnswer: "I do it differently →",
  heading: "Tell us your way.",
  body: "You work this every day. If you've found something that works better — or something nobody ever wrote down — this is where it goes.",
  label: "What do you do, and when do you do it?",
  placeholder: "Plain words. What you look for, what you do, and why it beats the other way.",
  reassure: "No wrong answers here. Nobody's grading you.",
  submit: "Share it",
  submitting: "Sending…",
  cancel: "Not now",
  saved: "Got it — that's in front of a person now. If it becomes part of the playbook, your name goes on it.",

  // The noticed-but-not-written invitation. Deliberately does NOT say "we
  // detected" or name a score: the person is being asked, not measured.
  inviteTitle: "That sounded like you've got a way of doing this.",
  inviteBody:
    "Nothing's been sent anywhere — this is just us asking. If that's something you worked out yourself, your team would want it written down.",
  inviteCta: "Send it up",
  inviteDismiss: "No thanks",
};

const MIN_CHARS = 40;

type Props = {
  surface: ShareSurface;
  /** What they just typed on this surface, if anything. Used for the noticed
   *  invitation and to pre-fill the box so nobody types it twice. */
  observation?: string | null;
  /** What they were looking at — the question they asked, the framework on
   *  screen. Stored as context, never as content. */
  contextNote?: string | null;
  /** The last similarity retrieval achieved, when the surface knows it. Only
   *  ever used to SUPPRESS detection (a confident answer means the library
   *  already covers it), so it cannot manufacture an invitation. */
  topSimilarity?: number | null;
};

export default function ShareIdeaPanel({
  surface,
  observation,
  contextNote,
  topSimilarity,
}: Props) {
  // Rendered only for people whose input isn't already canonical judgment.
  // An expert seeing "know a better way?" would rightly wonder why we're asking
  // instead of letting them capture it.
  const [canShare, setCanShare] = useState(false);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [invite, setInvite] = useState<string | null>(null);
  const detectedFor = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/insights/mine?count=1");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data?.can_share === true) setCanShare(true);
      } catch {
        // Silent. The panel simply doesn't appear.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── The second door. Runs AFTER the page has its answer on screen, which is
  //    the whole reason detection is a separate call: the person's actual
  //    request is never waiting on this.
  useEffect(() => {
    const obs = (observation ?? "").trim();
    if (!canShare || !obs || obs.length < MIN_CHARS) return;
    if (detectedFor.current === obs) return; // one probe per thing they said
    detectedFor.current = obs;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/insights/detect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            observation: obs,
            surface,
            context_note: contextNote ?? null,
            top_similarity: typeof topSimilarity === "number" ? topSimilarity : null,
          }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        // invite → nothing was written; we're asking. candidate → it was
        // written on a surface that makes no privacy promise, and the person is
        // told so here rather than only via the badge.
        if (data?.invite === true) {
          setInvite(typeof data.summary === "string" ? data.summary : "");
        } else if (data?.candidate === true && data?.noticed === true) {
          setMessage(COPY.saved);
          setState("done");
        }
      } catch {
        // Silent by design. Detection failing must be invisible.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canShare, observation, surface, contextNote, topSimilarity]);

  const send = useCallback(
    async (idea: string) => {
      if (idea.trim().length < MIN_CHARS) return;
      setState("sending");
      try {
        const res = await fetch("/api/insights", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idea: idea.trim(),
            surface,
            context_note: contextNote ?? null,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setMessage(typeof data?.error === "string" ? data.error : COPY.saved);
          setState("error");
          return;
        }
        setMessage(typeof data?.message === "string" ? data.message : COPY.saved);
        setState("done");
        setOpen(false);
        setInvite(null);
        setText("");
      } catch {
        setMessage("Couldn't send that just now. Try again in a moment.");
        setState("error");
      }
    },
    [surface, contextNote]
  );

  if (!canShare) return null;

  // The confirmation replaces the whole panel. Somebody who has just offered
  // something should get one clear sentence back, not a form still sitting there
  // inviting them to do it again.
  if (state === "done") {
    return (
      <div style={styles.donePanel}>
        <p style={styles.doneText}>{message ?? COPY.saved}</p>
      </div>
    );
  }

  if (invite !== null && !open) {
    return (
      <div style={styles.invitePanel}>
        <div style={styles.inviteTitle}>{COPY.inviteTitle}</div>
        {invite ? <p style={styles.inviteQuote}>“{invite}”</p> : null}
        <p style={styles.inviteBody}>{COPY.inviteBody}</p>
        <div style={styles.row}>
          <button
            type="button"
            style={styles.primary}
            disabled={state === "sending"}
            onClick={() => send((observation ?? "").trim())}
          >
            {state === "sending" ? COPY.submitting : COPY.inviteCta}
          </button>
          <button type="button" style={styles.textButton} onClick={() => setInvite(null)}>
            {COPY.inviteDismiss}
          </button>
        </div>
        {state === "error" && message ? <p style={styles.errorText}>{message}</p> : null}
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        style={styles.openLink}
        onClick={() => {
          setOpen(true);
          if (!text && observation) setText(observation.trim());
        }}
      >
        {observation ? COPY.openLinkAfterAnswer : COPY.openLink}
      </button>
    );
  }

  return (
    <div style={styles.panel}>
      <div style={styles.heading}>{COPY.heading}</div>
      <p style={styles.body}>{COPY.body}</p>
      <label style={styles.label} htmlFor="share-idea">
        {COPY.label}
      </label>
      <textarea
        id="share-idea"
        style={styles.textarea}
        rows={4}
        value={text}
        placeholder={COPY.placeholder}
        onChange={(e) => setText(e.target.value)}
      />
      <div style={styles.row}>
        <button
          type="button"
          style={styles.primary}
          disabled={state === "sending" || text.trim().length < MIN_CHARS}
          onClick={() => send(text)}
        >
          {state === "sending" ? COPY.submitting : COPY.submit}
        </button>
        <button type="button" style={styles.textButton} onClick={() => setOpen(false)}>
          {COPY.cancel}
        </button>
      </div>
      <p style={styles.reassure}>{COPY.reassure}</p>
      {state === "error" && message ? <p style={styles.errorText}>{message}</p> : null}
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
// Viridescent tokens only. The invitation panels are the calm green family, NOT
// amber: amber across this product means "attention needed" and is used for gaps,
// contested frameworks and Coaching Watch. Being asked for your knowledge is not
// an alert.
const styles: Record<string, CSSProperties> = {
  openLink: {
    fontSize: "13px",
    fontWeight: 600,
    color: "var(--growth)",
    background: "transparent",
    border: "none",
    padding: 0,
    margin: "14px 0 0",
    cursor: "pointer",
    textDecoration: "underline",
    fontFamily: "inherit",
  },
  panel: {
    background: "var(--white)",
    border: "1px solid var(--new-leaf-light)",
    borderRadius: 14,
    padding: "18px 20px",
    margin: "18px 0 0",
  },
  invitePanel: {
    background: "var(--growth-soft)",
    border: "1px solid var(--new-leaf-light)",
    borderRadius: 14,
    padding: "16px 18px",
    margin: "18px 0 0",
  },
  donePanel: {
    background: "var(--ok-bg)",
    border: "1px solid var(--ok-border)",
    borderRadius: 14,
    padding: "14px 18px",
    margin: "18px 0 0",
  },
  heading: {
    fontFamily: "var(--font-serif)",
    fontSize: "18px",
    color: "var(--pine)",
    marginBottom: 6,
  },
  inviteTitle: {
    fontFamily: "var(--font-serif)",
    fontSize: "17px",
    color: "var(--pine)",
    marginBottom: 6,
  },
  inviteQuote: {
    fontSize: "14px",
    color: "var(--pine)",
    fontStyle: "italic",
    lineHeight: 1.55,
    margin: "0 0 8px",
  },
  inviteBody: { fontSize: "13px", color: "var(--muted)", lineHeight: 1.6, margin: "0 0 12px" },
  body: { fontSize: "14px", color: "var(--pine-soft)", lineHeight: 1.6, margin: "0 0 14px" },
  label: {
    display: "block",
    fontSize: "13px",
    fontWeight: 600,
    color: "var(--pine)",
    marginBottom: 6,
  },
  textarea: {
    width: "100%",
    boxSizing: "border-box",
    fontSize: "14px",
    fontFamily: "inherit",
    color: "var(--pine)",
    background: "var(--white)",
    border: "1px solid var(--line)",
    borderRadius: 10,
    padding: "10px 12px",
    lineHeight: 1.55,
    resize: "vertical",
  },
  row: { display: "flex", alignItems: "center", gap: 14, marginTop: 12, flexWrap: "wrap" },
  primary: {
    fontSize: "14px",
    fontWeight: 600,
    color: "var(--white)",
    background: "var(--growth)",
    border: "none",
    borderRadius: 8,
    padding: "8px 16px",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  textButton: {
    fontSize: "13px",
    fontWeight: 600,
    color: "var(--muted)",
    background: "transparent",
    border: "none",
    padding: 0,
    cursor: "pointer",
    textDecoration: "underline",
    fontFamily: "inherit",
  },
  reassure: { fontSize: "12px", color: "var(--muted)", margin: "12px 0 0" },
  doneText: { fontSize: "14px", color: "var(--ok-text)", lineHeight: 1.6, margin: 0 },
  errorText: { fontSize: "13px", color: "var(--danger)", margin: "10px 0 0" },
};
