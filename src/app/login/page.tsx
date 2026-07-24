"use client";
// Magic-link + password login (password = fast dev testing).
// ?mode=signup → "Start free" copy for visitors arriving from the marketing page.
// (Same flow either way — the magic link creates the account if it doesn't exist.)
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signup, setSignup] = useState(false);

  // Read ?mode=signup on the client — avoids useSearchParams' Suspense requirement.
  useEffect(() => {
    setSignup(
      new URLSearchParams(window.location.search).get("mode") === "signup"
    );
  }, []);

  const supabase = createClient();

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setError(error.message);
    else setSent(true);
  }

  async function signInPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    else window.location.href = "/";
  }

  if (sent) {
    return (
      <div style={styles.wrapper}>
        <div style={styles.card}>
          <h1 style={styles.title}>Check your email 📬</h1>
          <p style={styles.help}>Magic link sent to {email}. Click it and you&apos;re in.</p>
        </div>
      </div>
    );
  }

  if (signup) {
    return (
      <div style={styles.wrapper}>
        <div style={styles.card}>
          <h1 style={styles.title}>Start free today 🌸</h1>
          <p style={styles.help}>
            Enter your email — we&apos;ll send you a magic link. No password, no
            credit card.
          </p>
          <form onSubmit={sendLink} style={styles.form}>
            <input
              style={styles.input}
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button style={styles.primary} type="submit">Send my magic link →</button>
          </form>
          <p style={styles.subtle}>
            Already have an account? The same link signs you in.
          </p>
          {error && <p style={styles.error}>{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.card}>
        <h1 style={styles.title}>Log in</h1>

        <form onSubmit={signInPassword} style={styles.form}>
          <input
            style={styles.input}
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            style={styles.input}
            type="password"
            placeholder="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button style={styles.primary} type="submit">Log in with password</button>
        </form>

        <p style={styles.divider}>— or —</p>

        <button style={styles.ghost} onClick={sendLink}>Send magic link instead</button>

        {error && <p style={styles.error}>{error}</p>}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: 'system-ui, sans-serif' },
  card: { width: '100%', maxWidth: '380px', padding: '32px', backgroundColor: '#fff', border: '1px solid #e0e0e0', borderRadius: '14px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: '16px' },
  title: { fontSize: '24px', fontWeight: 700, margin: 0 },
  form: { display: 'flex', flexDirection: 'column', gap: '10px' },
  input: { padding: '10px 12px', fontSize: '15px', border: '1px solid #ccc', borderRadius: '8px', fontFamily: 'inherit', boxSizing: 'border-box', width: '100%' },
  primary: { padding: '10px 16px', fontSize: '15px', fontWeight: 600, color: '#fff', background: '#111', border: 'none', borderRadius: '8px', cursor: 'pointer' },
  ghost: { padding: '10px 16px', fontSize: '14px', fontWeight: 600, color: '#111', background: '#fff', border: '1px solid #ccc', borderRadius: '8px', cursor: 'pointer' },
  divider: { fontSize: '13px', color: '#999', textAlign: 'center', margin: 0 },
  subtle: { fontSize: '13px', color: '#888', margin: 0, lineHeight: 1.5 },
  help: { fontSize: '14px', color: '#555', margin: 0, lineHeight: 1.5 },
  error: { fontSize: '13px', color: '#b91c1c', margin: 0 },
};
