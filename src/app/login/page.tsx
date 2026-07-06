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
      <main>
        <h1>Check your email 📬</h1>
        <p>Magic link sent to {email}. Click it and you&apos;re in.</p>
      </main>
    );
  }

  if (signup) {
    return (
      <main>
        <h1>Start free today 🌸</h1>
        <p>
          Enter your email — we&apos;ll send you a magic link. No password, no
          credit card.
        </p>
        <form onSubmit={sendLink}>
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button type="submit">Send my magic link →</button>
        </form>
        <p style={{ margin: "16px 0", color: "#888" }}>
          Already have an account? The same link signs you in.
        </p>
        {error && <p style={{ color: "red" }}>{error}</p>}
      </main>
    );
  }

  return (
    <main>
      <h1>Log in</h1>

      <form onSubmit={signInPassword}>
        <input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          placeholder="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit">Log in with password</button>
      </form>

      <p style={{ margin: "16px 0" }}>— or —</p>

      <button onClick={sendLink}>Send magic link instead</button>

      {error && <p style={{ color: "red" }}>{error}</p>}
    </main>
  );
}
