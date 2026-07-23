"use client";
// P-1 Build 3 — profile settings: persona picker + display name.
// Persona shades HOW the /codify ladder asks its questions (methodology
// router logic never changes — see ELICITATION-ENGINE-SPEC-ADDENDUM
// 2026-07-22 §1). display_name is what the shared org library (Build 2)
// shows as author attribution.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

type Persona = "exec" | "technical_director" | "sr_manager";

const PERSONAS: { id: Persona; emoji: string; label: string; help: string }[] = [
  {
    id: "exec",
    emoji: "\u{1F3AF}",
    label: "Executive",
    help: "Judgment-heavy wording — the call and the stakes, not the mechanics.",
  },
  {
    id: "technical_director",
    emoji: "\u{1F527}",
    label: "Technical Director",
    help: "Equipment / error-class / 5-Whys-heavy wording — the concrete detail.",
  },
  {
    id: "sr_manager",
    emoji: "\u{1F465}",
    label: "Senior Manager",
    help: "A blend of judgment and operational detail.",
  },
];

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [persona, setPersona] = useState<Persona | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("persona, display_name")
        .eq("id", user.id)
        .single();
      setPersona((data?.persona as Persona) ?? null);
      setDisplayName(data?.display_name ?? "");
      setLoading(false);
    })();
  }, [router]);

  async function save(update: { persona?: Persona; display_name?: string }) {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Could not save.");
      } else {
        setMessage("Saved.");
      }
    } catch {
      setMessage("Could not save.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div style={styles.center}>
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        <h1 style={styles.title}>Settings</h1>

        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Your name</h2>
          <p style={styles.help}>Shown as author attribution in your org&apos;s shared library.</p>
          <div style={styles.row}>
            <input
              style={styles.input}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Jordan Reyes"
            />
            <button
              style={styles.saveButton}
              disabled={saving || !displayName.trim()}
              onClick={() => save({ display_name: displayName })}
            >
              Save
            </button>
          </div>
        </div>

        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Your persona</h2>
          <p style={styles.help}>
            Shades how /codify asks its questions — it never changes which method gets suggested.
          </p>
          <div style={styles.personaGrid}>
            {PERSONAS.map((p) => (
              <button
                key={p.id}
                style={{
                  ...styles.personaCard,
                  ...(persona === p.id ? styles.personaCardSelected : {}),
                }}
                onClick={() => {
                  setPersona(p.id);
                  save({ persona: p.id });
                }}
              >
                <span style={styles.personaEmoji}>{p.emoji}</span>
                <span style={styles.personaLabel}>{p.label}</span>
                <span style={styles.personaHelp}>{p.help}</span>
              </button>
            ))}
          </div>
        </div>

        {message && <p style={styles.message}>{message}</p>}

        <a href="/dashboard" style={styles.backLink}>← Back to dashboard</a>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { minHeight: "100vh", background: "#fafafa", fontFamily: "system-ui, sans-serif" },
  container: { maxWidth: 560, margin: "0 auto", padding: "40px 24px 80px" },
  title: { fontSize: "26px", marginBottom: 20 },
  card: {
    background: "#fff",
    border: "1px solid #e5e5e5",
    borderRadius: 12,
    padding: "20px 20px 22px",
    marginBottom: 16,
  },
  cardTitle: { fontSize: "16px", margin: "0 0 4px" },
  help: { fontSize: "13px", color: "#777", margin: "0 0 14px" },
  row: { display: "flex", gap: 8 },
  input: {
    flex: 1,
    padding: "10px 12px",
    fontSize: "14px",
    borderRadius: 8,
    border: "1px solid #d4d4d4",
  },
  saveButton: {
    padding: "10px 18px",
    fontSize: "14px",
    fontWeight: 600,
    border: "none",
    borderRadius: 8,
    background: "#4338ca",
    color: "#fff",
    cursor: "pointer",
  },
  personaGrid: { display: "grid", gap: 10 },
  personaCard: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 4,
    padding: "14px 16px",
    border: "1px solid #e5e5e5",
    borderRadius: 10,
    background: "#fff",
    cursor: "pointer",
    textAlign: "left",
  },
  personaCardSelected: {
    borderColor: "#4338ca",
    background: "#eef2ff",
  },
  personaEmoji: { fontSize: "18px" },
  personaLabel: { fontWeight: 700, fontSize: "14px" },
  personaHelp: { fontSize: "12px", color: "#777" },
  message: { fontSize: "13px", color: "#166534" },
  backLink: { fontSize: "13px", color: "#666", textDecoration: "none" },
  center: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "system-ui, sans-serif",
  },
};
