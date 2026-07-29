// Handles the magic-link redirect.
//
// TWO SHAPES, both landing here, both reusing Supabase's own auth:
//
//   ?code=…            The browser-initiated PKCE flow (signInWithOtp from
//                      /login). The code verifier lives in the browser, so the
//                      exchange has to happen here. Unchanged since P-1.
//
//   ?token_hash=&type= T1B1 — an ADMIN-GENERATED invite / sign-in link. It is
//                      produced server-side by supabase.auth.admin.generateLink()
//                      in src/lib/org-admin.ts, so there is NO code verifier
//                      anywhere: a ?code= exchange would fail for the invited
//                      person every single time. verifyOtp(token_hash) is the
//                      server-side path that works without one. This is the
//                      documented shape for custom invite delivery — nothing
//                      here is a new auth system, and no password or token is
//                      ever stored by this app.
//
// ?next=/path sends the person somewhere specific after landing (a fresh
// invite goes to /settings so their first act is confirming their own name).
// Only same-site relative paths are honored — an open redirect on the auth
// callback is how a sign-in link becomes a phishing link.
import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_TYPES: EmailOtpType[] = [
  "invite",
  "magiclink",
  "signup",
  "recovery",
  "email",
  "email_change",
];

function safeNext(raw: string | null): string {
  if (!raw) return "/";
  // Must be a single-slash relative path. Rejects "//evil.com" and "https://…".
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const next = safeNext(searchParams.get("next"));

  const tokenHash = searchParams.get("token_hash");
  const typeParam = searchParams.get("type");

  if (tokenHash && typeParam && ALLOWED_TYPES.includes(typeParam as EmailOtpType)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: typeParam as EmailOtpType,
    });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    // An expired or already-used invite link is the single most common thing
    // to go wrong in a live onboarding session, so it gets its own signal
    // rather than a generic auth failure — the admin can re-send in one click.
    return NextResponse.redirect(`${origin}/login?error=link_expired`);
  }

  const code = searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
