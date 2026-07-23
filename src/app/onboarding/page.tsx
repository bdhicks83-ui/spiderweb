"use client";
// Phase 6 Slice 1 — "It Grows": onboarding for brand-new users.
// P-1 Build 3 adds a persona step BEFORE the goal fork: "Which best
// describes you?" (exec | technical_director | sr_manager). This is the
// expert-tier categorization the P-0.5 Methodology Router uses to shade
// question wording in /codify (persona never changes which method gets
// suggested — see ELICITATION-ENGINE-SPEC-ADDENDUM-2026-07-22 §1). It's a
// one-time step: once profiles.persona is set, returning users skip straight
// to the fork (or /upload, if they've also finished the fork already).
// Step 0: persona → step 1: goal fork (which track?) → steps 2-6: tailored
// questions → answers POST to /api/onboarding (saves goal_track + creates
// the first source, which flows through the existing extract-insights
// pipeline) → then on to /upload as normal.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

type Track = "content" | "career" | "licensing" | "recruiter";
type Persona = "exec" | "technical_director" | "sr_manager";

type Question =
  | { kind: "text"; prompt: string; placeholder?: string }
  | { kind: "multi"; prompt: string; hint: string; options: string[]; min: number; max?: number };

const PERSONAS: { id: Persona; emoji: string; label: string; help: string }[] = [
  {
    id: "exec",
    emoji: "\u{1F3AF}",
    label: "Executive",
    help: "Judgment-heavy — the call and the stakes, not the mechanics.",
  },
  {
    id: "technical_director",
    emoji: "\u{1F527}",
    label: "Technical Director",
    help: "Equipment / error-class / 5-Whys-heavy — the concrete detail.",
  },
  {
    id: "sr_manager",
    emoji: "\u{1F465}",
    label: "Senior Manager",
    help: "A blend of judgment and operational detail.",
  },
];

const GOALS: { track: Track; emoji: string; label: string }[] = [
  { track: "content", emoji: "🎥", label: "Turn my knowledge into content (YouTube/blog/social)" },
  { track: "career", emoji: "💼", label: "Build my professional reputation & career story" },
  { track: "licensing", emoji: "🏢", label: "License my expertise to organizations" },
  { track: "recruiter", emoji: "🔍", label: "Get visibility for my next role (recruiters)" },
];

const TRACK_LABELS: Record<Track, string> = {
  content: "Turn my knowledge into content",
  career: "Build my professional reputation & career story",
  licensing: "License my expertise to organizations",
  recruiter: "Get visibility for my next role",
};

const QUESTIONS: Record<Track, Question[]> = {
  content: [
    {
      kind: "text",
      prompt: "What niche or subject do you know best?",
      placeholder: "e.g. leadership in healthcare, home DIY, personal finance...",
    },
    {
      kind: "text",
      prompt: "Who is your audience? Who are you making this for?",
      placeholder: "e.g. first-time managers, new homeowners, side-hustlers...",
    },
    {
      kind: "multi",
      prompt: "Which platforms do you want to publish on?",
      hint: "Pick all that apply",
      options: ["YouTube", "Blog / newsletter", "LinkedIn", "X (Twitter)", "Instagram", "TikTok", "Podcast"],
      min: 1,
    },
    {
      kind: "multi",
      prompt: "How would you describe your voice?",
      hint: "Pick 2–3",
      options: ["Educational", "Conversational", "Bold / contrarian", "Story-driven", "Analytical", "Playful"],
      min: 2,
      max: 3,
    },
    {
      kind: "text",
      prompt: "What existing content do you already have that you could upload?",
      placeholder: "Videos, posts, scripts, notes, voice memos — anything counts.",
    },
  ],
  career: [
    {
      kind: "text",
      prompt: "What's your current role and industry?",
      placeholder: "e.g. Operations Director, logistics",
    },
    {
      kind: "text",
      prompt: "How many years of experience do you have?",
      placeholder: "e.g. 12 years, the last 5 in leadership",
    },
    {
      kind: "text",
      prompt: "What decisions or projects are you proudest of?",
      placeholder: "The calls you made that mattered — big or small.",
    },
    {
      kind: "text",
      prompt: "What should this profile help you do?",
      placeholder: "e.g. promotion case, thought leadership, board seats...",
    },
    {
      kind: "text",
      prompt: "What existing documents could you upload?",
      placeholder: "Resume, performance reviews, project write-ups, presentations...",
    },
  ],
  licensing: [
    {
      kind: "text",
      prompt: "What's your area of expertise?",
      placeholder: "The thing organizations would pay to tap into.",
    },
    {
      kind: "text",
      prompt: "What scale have you led?",
      placeholder: "Team size, revenue, org size — whatever shows the scope.",
    },
    {
      kind: "text",
      prompt: "Who would license this expertise?",
      placeholder: "e.g. mid-size manufacturers, hospital systems, agencies...",
    },
    {
      kind: "text",
      prompt: "What makes your approach different from others in your field?",
      placeholder: "Your differentiator — the thing only you bring.",
    },
    {
      kind: "text",
      prompt: "What existing strategic documents could you upload?",
      placeholder: "Playbooks, frameworks, case studies, decks, memos...",
    },
  ],
  recruiter: [
    {
      kind: "text",
      prompt: "What role or title are you targeting next?",
      placeholder: "e.g. VP of Operations, Head of Product",
    },
    {
      kind: "text",
      prompt: "Which industries are you targeting?",
      placeholder: "e.g. healthcare, SaaS, manufacturing",
    },
    {
      kind: "text",
      prompt: "What's your strongest quantifiable win?",
      placeholder: "e.g. cut fulfillment costs 23% across 4 warehouses",
    },
    {
      kind: "text",
      prompt: "What should recruiters find you for?",
      placeholder: "The search you want to show up in.",
    },
    {
      kind: "text",
      prompt: "What existing documents could you upload?",
      placeholder: "Resume, LinkedIn export, reviews, portfolio pieces...",
    },
  ],
};

type Phase = "checking" | "persona" | "fork" | "questions" | "submitting";

export default function OnboardingPage() {
  const [phase, setPhase] = useState<Phase>("checking");
  const [track, setTrack] = useState<Track | null>(null);
  const [step, setStep] = useState(0); // index into the 5 questions
  const [textAnswers, setTextAnswers] = useState<string[]>(Array(5).fill(""));
  const [multiAnswers, setMultiAnswers] = useState<Record<number, string[]>>({});
  const [error, setError] = useState("");
  const [savingPersona, setSavingPersona] = useState(false);
  const router = useRouter();

  // Gate: must be logged in; already-onboarded users go straight to /upload.
  // Users who've set a persona but not yet done the goal fork land on "fork";
  // brand-new users land on "persona" first.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        router.replace("/login");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("goal_track, persona")
        .eq("id", user.id)
        .single();
      if (cancelled) return;
      if (profile?.goal_track) {
        router.replace("/upload");
        return;
      }
      setPhase(profile?.persona ? "fork" : "persona");
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function choosePersona(persona: Persona) {
    setSavingPersona(true);
    setError("");
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error || "Something went wrong saving that. Try again.");
        return;
      }
      setPhase("fork");
    } catch {
      setError("Something went wrong saving that. Try again.");
    } finally {
      setSavingPersona(false);
    }
  }

  const questions = track ? QUESTIONS[track] : [];
  const question = questions[step];

  function toggleMulti(option: string) {
    setMultiAnswers((prev) => {
      const current = prev[step] ?? [];
      const next = current.includes(option)
        ? current.filter((o) => o !== option)
        : [...current, option];
      return { ...prev, [step]: next };
    });
  }

  function answerFor(idx: number): string {
    const q = questions[idx];
    if (q.kind === "multi") return (multiAnswers[idx] ?? []).join(", ");
    return textAnswers[idx].trim();
  }

  function stepValid(): boolean {
    if (!question) return false;
    if (question.kind === "multi") {
      const n = (multiAnswers[step] ?? []).length;
      return n >= question.min && (!question.max || n <= question.max);
    }
    return textAnswers[step].trim().length > 0;
  }

  function handleNext() {
    setError("");
    if (!stepValid()) {
      setError(
        question.kind === "multi"
          ? `Pick ${question.min}${question.max ? `–${question.max}` : " or more"} to continue.`
          : "Add an answer to continue."
      );
      return;
    }
    if (step < questions.length - 1) {
      setStep(step + 1);
    } else {
      handleSubmit();
    }
  }

  function handleBack() {
    setError("");
    if (step > 0) {
      setStep(step - 1);
    } else {
      setTrack(null);
      setPhase("fork");
    }
  }

  async function handleSubmit() {
    if (!track) return;
    setPhase("submitting");
    setError("");
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal_track: track,
          answers: questions.map((q, i) => ({
            question: q.prompt,
            answer: answerFor(i),
          })),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error || "Something went wrong saving your answers. Try again.");
        setPhase("questions");
        return;
      }
      router.push("/upload");
    } catch {
      setError("Something went wrong saving your answers. Try again.");
      setPhase("questions");
    }
  }

  if (phase === "checking") {
    return (
      <div style={styles.center}>
        <div style={styles.spinner} aria-hidden="true" />
        <style>{`@keyframes onboarding-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (phase === "persona") {
    return (
      <div style={styles.page}>
        <h1 style={styles.h1}>Welcome to Human Bloom 🌸</h1>
        <p style={styles.subtitle}>Which best describes you?</p>
        <div style={styles.goalGrid}>
          {PERSONAS.map((p) => (
            <button
              key={p.id}
              style={styles.goalCard}
              disabled={savingPersona}
              onClick={() => choosePersona(p.id)}
            >
              <span style={styles.goalEmoji}>{p.emoji}</span>
              <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={styles.goalLabel}>{p.label}</span>
                <span style={styles.personaHelp}>{p.help}</span>
              </span>
            </button>
          ))}
        </div>
        {error && <p style={styles.errorText}>{error}</p>}
      </div>
    );
  }

  if (phase === "fork") {
    return (
      <div style={styles.page}>
        <h1 style={styles.h1}>What are you hoping to get out of Human Bloom?</h1>
        <div style={styles.goalGrid}>
          {GOALS.map((goal) => (
            <button
              key={goal.track}
              style={styles.goalCard}
              onClick={() => {
                setTrack(goal.track);
                setStep(0);
                setPhase("questions");
              }}
            >
              <span style={styles.goalEmoji}>{goal.emoji}</span>
              <span style={styles.goalLabel}>{goal.label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (phase === "submitting") {
    return (
      <div style={styles.center}>
        <div style={styles.spinner} aria-hidden="true" />
        <h2 style={styles.waitHeading}>Saving your answers...</h2>
        <style>{`@keyframes onboarding-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // phase === "questions"
  return (
    <div style={styles.page}>
      <p style={styles.trackBadge}>
        {track ? TRACK_LABELS[track] : ""}
      </p>
      <p style={styles.progress}>
        Question {step + 1} of {questions.length}
      </p>
      <h2 style={styles.questionText}>{question.prompt}</h2>

      {question.kind === "text" ? (
        <textarea
          value={textAnswers[step]}
          onChange={(e) => {
            const next = [...textAnswers];
            next[step] = e.target.value;
            setTextAnswers(next);
          }}
          rows={4}
          placeholder={question.placeholder}
          style={styles.textarea}
          autoFocus
        />
      ) : (
        <>
          <p style={styles.hint}>{question.hint}</p>
          <div style={styles.optionList}>
            {question.options.map((option) => {
              const selected = (multiAnswers[step] ?? []).includes(option);
              return (
                <button
                  key={option}
                  onClick={() => toggleMulti(option)}
                  style={{
                    ...styles.optionButton,
                    ...(selected ? styles.optionSelected : {}),
                  }}
                >
                  {selected ? "✓ " : ""}{option}
                </button>
              );
            })}
          </div>
        </>
      )}

      {error && <p style={styles.errorText}>{error}</p>}

      <div style={styles.navRow}>
        <button style={styles.quietButton} onClick={handleBack}>
          ← Back
        </button>
        <button style={styles.primaryButton} onClick={handleNext}>
          {step < questions.length - 1 ? "Next →" : "Finish"}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 560,
    margin: "0 auto",
    padding: "48px 24px",
    fontFamily: "system-ui, sans-serif",
  },
  h1: {
    fontSize: "28px",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: "17px",
    color: "#444",
    marginBottom: 24,
  },
  goalGrid: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 12,
  },
  goalCard: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "18px 16px",
    fontSize: "16px",
    textAlign: "left",
    border: "1px solid #e5e5e5",
    borderRadius: 12,
    background: "#fff",
    cursor: "pointer",
  },
  goalEmoji: {
    fontSize: "24px",
  },
  goalLabel: {
    fontWeight: 600,
  },
  personaHelp: {
    fontSize: "13px",
    color: "#888",
    fontWeight: 400,
  },
  trackBadge: {
    display: "inline-block",
    background: "#eef2ff",
    color: "#4338ca",
    border: "1px solid #c7d2fe",
    borderRadius: 999,
    padding: "0.15rem 0.6rem",
    fontSize: "0.8rem",
    fontWeight: 600,
    marginBottom: 16,
  },
  progress: {
    color: "#888",
    fontSize: "13px",
    margin: "0 0 8px",
  },
  questionText: {
    fontSize: "20px",
    fontWeight: 600,
    margin: "0 0 16px",
  },
  textarea: {
    width: "100%",
    fontSize: "15px",
    padding: 12,
    borderRadius: 8,
    border: "1px solid #d4d4d4",
    fontFamily: "inherit",
    boxSizing: "border-box",
  },
  hint: {
    color: "#888",
    fontSize: "13px",
    margin: "0 0 10px",
  },
  optionList: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },
  optionButton: {
    padding: "10px 14px",
    fontSize: "14px",
    border: "1px solid #d4d4d4",
    borderRadius: 999,
    background: "#fff",
    cursor: "pointer",
  },
  optionSelected: {
    background: "#eef2ff",
    borderColor: "#4338ca",
    color: "#4338ca",
    fontWeight: 600,
  },
  navRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 28,
  },
  primaryButton: {
    padding: "12px 24px",
    fontSize: "16px",
    fontWeight: 600,
    border: "none",
    borderRadius: "10px",
    backgroundColor: "#22c55e",
    color: "#fff",
    cursor: "pointer",
  },
  quietButton: {
    padding: "6px 12px",
    fontSize: "13px",
    border: "none",
    background: "none",
    color: "#888",
    textDecoration: "underline",
    cursor: "pointer",
  },
  errorText: {
    color: "#ef4444",
    fontSize: "14px",
    marginTop: 12,
  },
  center: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "16px",
    fontFamily: "system-ui, sans-serif",
    textAlign: "center",
    padding: "24px",
  },
  spinner: {
    width: "36px",
    height: "36px",
    borderRadius: "50%",
    border: "4px solid #e5e5e5",
    borderTopColor: "#555",
    animation: "onboarding-spin 0.8s linear infinite",
  },
  waitHeading: {
    fontSize: "20px",
    fontWeight: 600,
    margin: 0,
  },
};
