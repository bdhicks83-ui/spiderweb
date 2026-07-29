"use client";
// TIER 1 / BUILD 1 — FIRST RUN.
//
// The path a brand-new organization comes into existence on. Two audiences,
// one page, and which form you see is decided by the SERVER (the platform-owner
// check lives in /api/admin/orgs, never in this component):
//
//   • Someone with no org yet → name it, and they're its first admin.
//   • The platform owner (Brian) → stand up an org for a pilot customer AND
//     its first admin seat, then hand over the link. That is the whole point
//     of this build: no more seed script per pilot.
//
// Somebody already in an org gets an honest "you're already on a team" state
// rather than a form that would fail on submit.
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import BrandHeader from "@/components/BrandHeader";

const supabase = createClient();

// ═════════════════════════════════════════════════════════════════════════════
// ⚠️⚠️ DRAFT CUSTOMER-FACING COPY — PENDING BRIAN'S SIGN-OFF (T1B1) ⚠️⚠️
// This is the very first thing a new customer reads inside the product. It
// should feel like naming a team, not creating a tenant.
// ═════════════════════════════════════════════════════════════════════════════
const COPY = {
  title: "Set up your organization",
  subtitle:
    "Name it, and you're its first admin. You can invite your people on the next screen — it takes about a minute each.",
  namePlaceholder: "e.g. Northside Manufacturing",
  create: "Create it",
  creating: "Setting it up…",
  already:
    "You're already part of an organization. Head to your account to manage people and settings.",
  alreadyCta: "Open your account →",

  ownerTitle: "Stand up a customer account",
  ownerSub:
    "Creates the organization and its first admin seat. They take it from there — every other person on that account gets invited by them.",
  ownerCreate: "Create the account",
  linkTitle: "Send this to their admin",
  linkBody:
    "It signs them in as the admin of the new organization. Everything after this is theirs to run.",
  copy: "Copy link",
  copied: "Copied",
};
// ═════════════════════════════════════════════════════════════════════════════

export default function AdminStartPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [hasOrg, setHasOrg] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");

  // Owner mode: creating an org for someone else. The server rejects this for
  // anyone who isn't a platform owner — this toggle is convenience, not a gate.
  const [ownerMode, setOwnerMode] = useState(false);
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminTitle, setAdminTitle] = useState("");

  const [issuedLink, setIssuedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const check = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.replace("/login");
      return;
    }
    const { data } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .maybeSingle();
    setHasOrg(!!(data as { org_id: string | null } | null)?.org_id);
    setChecking(false);
  }, [router]);

  useEffect(() => {
    check();
  }, [check]);

  async function create() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = { name, industry: industry || null };
      if (ownerMode) {
        payload.admin_email = adminEmail;
        payload.admin_name = adminName;
        payload.admin_title = adminTitle || null;
      }
      const res = await fetch("/api/admin/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || "Could not create the organization.");
        return;
      }
      if (body.mode === "platform_owner") {
        setIssuedLink(body.invite_link as string);
        setCopied(false);
        setName("");
        setIndustry("");
        setAdminName("");
        setAdminEmail("");
        setAdminTitle("");
        return;
      }
      router.replace("/admin");
    } catch {
      setError("Could not create the organization.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!issuedLink) return;
    try {
      await navigator.clipboard.writeText(issuedLink);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (checking) {
    return (
      <div style={styles.center}>
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        <div style={{ marginBottom: 18 }}>
          <BrandHeader />
        </div>

        <h1 style={styles.title}>{ownerMode ? COPY.ownerTitle : COPY.title}</h1>
        <p style={styles.subtitle}>{ownerMode ? COPY.ownerSub : COPY.subtitle}</p>

        {error && <div style={styles.errorBanner}>{error}</div>}

        {issuedLink && (
          <div style={styles.linkCard}>
            <h2 style={styles.cardTitle}>🔗 {COPY.linkTitle}</h2>
            <p style={styles.help}>{COPY.linkBody}</p>
            <div style={styles.linkRow}>
              <input style={styles.linkInput} readOnly value={issuedLink} />
              <button type="button" style={styles.primaryButton} onClick={copy}>
                {copied ? COPY.copied : COPY.copy}
              </button>
            </div>
          </div>
        )}

        {hasOrg && !ownerMode ? (
          <div style={styles.card}>
            <p style={styles.emptyText}>{COPY.already}</p>
            <a href="/admin" style={styles.primaryLink}>
              {COPY.alreadyCta}
            </a>
            <button
              type="button"
              style={styles.textButton}
              onClick={() => {
                setOwnerMode(true);
                setError(null);
              }}
            >
              Set one up for somebody else
            </button>
          </div>
        ) : (
          <div style={styles.card}>
            <div style={styles.formGrid}>
              <label style={styles.label}>
                Organization name
                <input
                  style={styles.input}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={COPY.namePlaceholder}
                />
              </label>
              <label style={styles.label}>
                Industry (optional)
                <input
                  style={styles.input}
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  placeholder="e.g. Manufacturing"
                />
              </label>
              {ownerMode && (
                <>
                  <label style={styles.label}>
                    First admin&apos;s name
                    <input
                      style={styles.input}
                      value={adminName}
                      onChange={(e) => setAdminName(e.target.value)}
                    />
                  </label>
                  <label style={styles.label}>
                    First admin&apos;s email
                    <input
                      style={styles.input}
                      type="email"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                    />
                  </label>
                  <label style={styles.label}>
                    First admin&apos;s title (optional)
                    <input
                      style={styles.input}
                      value={adminTitle}
                      onChange={(e) => setAdminTitle(e.target.value)}
                    />
                  </label>
                </>
              )}
            </div>
            <button
              type="button"
              style={styles.primaryButton}
              disabled={
                busy ||
                !name.trim() ||
                (ownerMode && (!adminName.trim() || !adminEmail.trim()))
              }
              onClick={create}
            >
              {busy ? COPY.creating : ownerMode ? COPY.ownerCreate : COPY.create}
            </button>
            {ownerMode && (
              <button
                type="button"
                style={styles.textButton}
                onClick={() => {
                  setOwnerMode(false);
                  setError(null);
                }}
              >
                Back
              </button>
            )}
          </div>
        )}

        <a href="/dashboard" style={styles.backLink}>
          ← Back to dashboard
        </a>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { minHeight: "100vh", fontFamily: "var(--font-sans)" },
  container: { maxWidth: 640, margin: "0 auto", padding: "40px 24px 80px" },
  center: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "var(--font-sans)",
  },
  title: { fontSize: "26px", margin: 0 },
  subtitle: { color: "var(--muted)", fontSize: "14px", margin: "6px 0 22px", lineHeight: 1.55 },
  card: {
    background: "var(--white)",
    border: "1px solid var(--line)",
    borderRadius: 14,
    padding: "20px 20px 22px",
    marginBottom: 16,
    display: "flex",
    flexDirection: "column",
    gap: 12,
    alignItems: "flex-start",
  },
  cardTitle: { fontSize: "17px", margin: "0 0 4px" },
  help: { fontSize: "13px", color: "var(--muted)", margin: "0 0 12px", lineHeight: 1.55 },
  emptyText: { fontSize: "14px", color: "var(--pine-soft)", lineHeight: 1.6, margin: 0 },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
    width: "100%",
  },
  label: {
    display: "flex",
    flexDirection: "column",
    gap: 5,
    fontSize: "12px",
    fontWeight: 600,
    color: "var(--pine-soft)",
  },
  input: {
    padding: "9px 11px",
    fontSize: "14px",
    borderRadius: 8,
    border: "1px solid var(--line)",
    fontFamily: "inherit",
    fontWeight: 400,
    color: "var(--pine)",
    background: "var(--white)",
  },
  primaryButton: {
    fontSize: "14px",
    fontWeight: 600,
    color: "var(--white)",
    background: "var(--growth)",
    border: "none",
    borderRadius: 8,
    padding: "9px 16px",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  textButton: {
    fontSize: "12px",
    fontWeight: 600,
    color: "var(--muted)",
    background: "transparent",
    border: "none",
    padding: 0,
    cursor: "pointer",
    textDecoration: "underline",
    fontFamily: "inherit",
  },
  primaryLink: { fontSize: "14px", fontWeight: 600, color: "var(--growth)", textDecoration: "none" },
  backLink: { fontSize: "13px", color: "var(--muted)", textDecoration: "none" },
  errorBanner: {
    background: "var(--danger-bg)",
    border: "1px solid var(--danger-border)",
    color: "var(--danger)",
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: "13px",
    marginBottom: 14,
    lineHeight: 1.5,
  },
  linkCard: {
    background: "var(--growth-soft)",
    border: "1px solid var(--new-leaf-light)",
    borderRadius: 14,
    padding: "18px 20px 20px",
    marginBottom: 16,
  },
  linkRow: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  linkInput: {
    flex: 1,
    minWidth: 240,
    padding: "10px 12px",
    fontSize: "13px",
    borderRadius: 8,
    border: "1px solid var(--line)",
    background: "var(--white)",
    color: "var(--pine)",
    fontFamily: "inherit",
  },
};
