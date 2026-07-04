"use client";
// Email magic-link login — no passwords to manage.
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setError(error.message);
    else setSent(true);
  }

  if (sent)
    return (
      <main>
        <h1>Check your email 📬</h1>
        <p>Magic link sent to {email}. Click it and you&apos;re in.</p>
      </main>
    );

  return (
    <main>
      <h1>Log in</h1>
      <form onSubmit={sendLink}>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          style={{ padding: 8, fontSize: 16, width: "100%", maxWidth: 320 }}
        />
        <button type="submit" style={{ padding: 8, fontSize: 16, marginLeft: 8 }}>
          Send magic link
        </button>
      </form>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </main>
  );
}
