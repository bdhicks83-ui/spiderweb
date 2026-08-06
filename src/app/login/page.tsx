"use client";
// Magic-link + password login (password = fast dev testing).
// ?mode=signup → "Start free" copy for visitors arriving from the marketing page.
// (Same flow either way — the magic link creates the account if it doesn't exist.)
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// ─── SIMPLIFIED DEMO LOGIN (2026-08-05) ─────────────────────────────────────
// Live-demo affordance for the AWIP exec walk: three first names log the
// three pinned leadership seats in, with a forgiving password.
//
// SCOPE — deliberately tiny:
//   · Fires ONLY on the password form, ONLY when the username field contains
//     no "@", and ONLY when the typed name is in this explicit alias table
//     (case-insensitive). Anything containing "@" follows the existing path
//     completely untouched.
//   · On an alias hit the typed password is UPPERCASED before submitting to
//     Supabase auth (seat passwords are exactly "AWIP2026", so any casing of
//     awip2026 works on stage).
//   · An explicit table, NEVER a generic first-name → domain mapping —
//     brian.ng@… also exists in the demo org, and "brian" must always mean
//     Brian Montes here.
const DEMO_LOGIN_ALIASES: Record<string, string> = {
  brian: "brian.montes@awip-demo.example",
  joe: "joe.paparella@awip-demo.example",
  greg: "greg.lusty@awip-demo.example",
};

// Stacked lockup (mark above wordmark) for the centered login card — distinct
// from BrandHeader's horizontal nav lockup used elsewhere. Falls back to a
// plain wordmark so a missing asset can never render a broken image.
function LoginMark() {
  const [logoMissing, setLogoMissing] = useState(false);
  return logoMissing ? (
    <span style={loginMarkStyles.fallback}>Viridescent</span>
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/viridescent-stacked.png"
      alt="Viridescent"
      style={loginMarkStyles.logo}
      onError={() => setLogoMissing(true)}
    />
  );
}

const loginMarkStyles: Record<string, React.CSSProperties> = {
  logo: { height: "72px", width: "auto", display: "block" },
  fallback: {
    fontFamily: "var(--font-serif)",
    fontSize: "22px",
    fontWeight: 600,
    letterSpacing: "0.02em",
    color: "var(--pine)",
  },
};

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signup, setSignup] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Read ?mode=signup on the client — avoids useSearchParams' Suspense requirement.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSignup(params.get("mode") === "signup");
    // T1B1 — an admin-issued invite link that expired or was already used. The
    // single most common thing to go wrong in a live onboarding session, so it
    // gets its own message: their account exists, only the link is stale.
    // ⚠️ DRAFT CUSTOMER-FACING COPY — PENDING BRIAN'S SIGN-OFF.
    if (params.get("error") === "link_expired") {
      setNotice(
        "That sign-in link has expired or was already used. Your account is fine — send yourself a magic link below, or ask your admin for a fresh one."
      );
    }
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
    // Demo alias shim — see DEMO_LOGIN_ALIASES above. Both transforms (alias
    // email + uppercased password) apply together, and only on an alias hit;
    // any input containing "@" (and any unknown alias) is submitted verbatim,
    // exactly as before.
    let loginEmail = email;
    let loginPassword = password;
    if (!email.includes("@")) {
      const alias = DEMO_LOGIN_ALIASES[email.trim().toLowerCase()];
      if (alias) {
        loginEmail = alias;
        loginPassword = password.toUpperCase();
      }
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    });
    if (error) setError(error.message);
    else window.location.href = "/";
  }

  if (sent) {
    return (
      <div style={styles.wrapper}>
        <LoginMark />
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
        <LoginMark />
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
      <LoginMark />
      <div style={styles.card}>
        <h1 style={styles.title}>Log in</h1>

        {notice && <p style={styles.notice}>{notice}</p>}

        <form onSubmit={signInPassword} style={styles.form}>
          {/* type="text", not "email": the demo alias shim ("brian"/"joe"/
              "greg") must be submittable — the browser's built-in email
              validation would block a bare first name before JS ever ran.
              Email-format logins behave exactly as before. */}
          <input
            style={styles.input}
            type="text"
            autoComplete="username"
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
  wrapper: { minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: 'var(--font-sans)' },
  card: { width: '100%', maxWidth: '380px', padding: '32px', backgroundColor: 'var(--white)', border: '1px solid var(--line)', borderRadius: '14px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: '16px' },
  title: { fontSize: '24px', fontWeight: 700, margin: 0 },
  form: { display: 'flex', flexDirection: 'column', gap: '10px' },
  input: { padding: '10px 12px', fontSize: '15px', border: '1px solid var(--line)', borderRadius: '8px', fontFamily: 'inherit', boxSizing: 'border-box', width: '100%' },
  primary: { padding: '10px 16px', fontSize: '15px', fontWeight: 600, color: 'var(--white)', background: 'var(--growth)', border: 'none', borderRadius: '8px', cursor: 'pointer' },
  ghost: { padding: '10px 16px', fontSize: '14px', fontWeight: 600, color: 'var(--pine)', background: 'var(--white)', border: '1px solid var(--line)', borderRadius: '8px', cursor: 'pointer' },
  divider: { fontSize: '13px', color: 'var(--muted)', textAlign: 'center', margin: 0 },
  subtle: { fontSize: '13px', color: 'var(--muted)', margin: 0, lineHeight: 1.5 },
  help: { fontSize: '14px', color: 'var(--pine-soft)', margin: 0, lineHeight: 1.5 },
  error: { fontSize: '13px', color: 'var(--danger)', margin: 0 },
  notice: { fontSize: '13px', color: 'var(--warn-text)', background: 'var(--warn-bg)', border: '1px solid var(--warn-border)', borderRadius: '8px', padding: '10px 12px', margin: 0, lineHeight: 1.5 },
};
