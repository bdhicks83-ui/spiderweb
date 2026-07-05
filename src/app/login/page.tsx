"use client";
// Magic-link + password login (password = fast dev testing).
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

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