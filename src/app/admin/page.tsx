"use client";
// TIER 1 / BUILD 1 — THE ADMIN & ONBOARDING CONSOLE.
//
// The wall between "a demo" and "a product a company can run." Everything on
// this page used to require somebody with database access: creating the org,
// adding people, setting who reports to whom, closing a seat.
//
// Client-safe imports only — @/lib/org-admin is server-only (it holds the
// service-role client and the Supabase auth admin API). Everything this page
// needs travels over /api/admin/*.
//
// The admin gate is REAL and lives in Postgres (is_org_admin(), SECURITY
// DEFINER, checked over RPC by every route). What this page does is render the
// honest empty state when the gate says no — same "the link is safe to show,
// the gate is the gate" pattern as Coaching Watch and the Training Studio.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import BrandHeader from "@/components/BrandHeader";

const supabase = createClient();

// ═════════════════════════════════════════════════════════════════════════════
// ⚠️⚠️ DRAFT CUSTOMER-FACING COPY — PENDING BRIAN'S SIGN-OFF (T1B1) ⚠️⚠️
//
// THE THING TO GET RIGHT: this is the first screen a paying customer's admin
// ever sees, and it has to read like setting up a team, not administering a
// database. No "users," no "records," no "provisioning." People have names and
// titles; seats open and close; the checklist is momentum, never a scold.
//
// Track B register — plain operating-brain language. No Vine/plant metaphors,
// no "SOP," no AI-product framing. Land each point once.
// ═════════════════════════════════════════════════════════════════════════════
const COPY = {
  title: "Your account",
  subtitle:
    "Everyone on the account, what they're responsible for, and who they report to. Changes here take effect immediately.",
  notAdmin:
    "This page is for whoever administers your account. If you need someone added, changed, or given access, they can do it here in about a minute.",
  noOrg:
    "You're not part of an organization yet. Set one up and you'll be its first admin.",
  noOrgCta: "Set up your organization →",

  setupTitle: "Getting set up",
  setupDone: "You're set up. Everything below stays here if you need it.",
  setupSub: "Four things worth doing before the rest of this earns its keep.",

  peopleTitle: "People",
  peopleSub:
    "Roles decide what someone can approve. Reporting lines decide who hears about it when something needs attention.",
  invite: "Invite someone",
  inviteCancel: "Cancel",
  inviteSubmit: "Create their seat",
  inviteWorking: "Setting up the seat…",

  linkTitle: "Send them this link",
  linkBody:
    "It signs them in and puts them on your account. Send it however you normally reach them — we don't email it for you yet.",
  linkExpiry: (hint: string) => `Good for ${hint}. If it expires, send a fresh one — their seat is already there.`,
  copy: "Copy link",
  copied: "Copied",
  dismiss: "Done",

  edit: "Edit",
  save: "Save",
  cancel: "Cancel",
  resend: "Send sign-in link",
  deactivate: "Close this seat",
  reactivate: "Reopen this seat",
  confirmDeactivate:
    "Close this seat? They'll stop being able to sign in. Everything they've captured stays exactly where it is, under their name.",

  pending: "hasn't signed in yet",
  deactivated: "seat closed",
  adminChip: "admin",
  managerChip: "manager",
  // ⚠️ DRAFT CUSTOMER-FACING COPY — PENDING BRIAN (Floor Guide A).
  contributorChip: "contributor",
  floorGuideChip: "in Floor Guide",
  roleHelp:
    "Contributors use everything — they ask, they search, they flag what's missing — but capturing a framework stays with your experts, so the library only ever carries judgment you'd stand behind.",
  floorGuideLabel: "Floor Guide (their first few weeks)",
  floorGuideHelp:
    "Opens with what your veterans say matters most for their job, and gives them a private place to ask anything. What they ask there isn't reported to their manager — that's the part that makes them use it instead of guessing.",
  onboardingTitle: "Currently onboarding",
  onboardingSub:
    "Floor Guide is on for these people. Switch it off when they've found their feet — nothing they've done is lost either way.",
  onboardingSince: (days: number) =>
    days <= 0 ? "started today" : `${days} day${days === 1 ? "" : "s"} in`,
  you: "you",
  capture: (n: number) =>
    n === 0 ? "nothing codified yet" : `${n} framework${n === 1 ? "" : "s"} codified`,
  reportsTo: (name: string) => `reports to ${name}`,
  noManager: "no manager set",

  orgTitle: "Organization",
  orgSub: "The name that appears on attribution across your team's library.",
  orgSave: "Save",
  orgSaved: "Saved.",

  showClosed: "Show closed seats",
  hideClosed: "Hide closed seats",
  keepNote:
    "A closed seat is never deleted. Their frameworks, conflicts and mentions stay in the library under their name — that's the point of capturing them.",
};
// ═════════════════════════════════════════════════════════════════════════════

type Member = {
  id: string;
  display_name: string | null;
  email: string | null;
  claimed_title: string | null;
  role: string;
  persona: string | null;
  manager_id: string | null;
  manager_name: string | null;
  is_org_admin: boolean;
  floor_guide_active: boolean;
  floor_guide_started_at: string | null;
  is_me: boolean;
  deactivated_at: string | null;
  invited_at: string | null;
  last_sign_in_at: string | null;
  pending: boolean;
  frameworks_codified: number;
};

type ChecklistItem = {
  key: string;
  label: string;
  detail: string;
  done: boolean;
  href: string | null;
};

type Org = {
  id: string;
  name: string;
  industry: string | null;
  default_persona: string | null;
  is_demo: boolean;
};

type Overview = {
  is_org_admin: boolean;
  org: Org;
  members: Member[];
  checklist: ChecklistItem[];
  setup_percent: number;
  counts: {
    active: number;
    deactivated: number;
    managers: number;
    admins: number;
    contributors: number;
    onboarding: number;
  };
  onboarding: {
    id: string;
    display_name: string | null;
    claimed_title: string | null;
    role: string;
    started_at: string | null;
  }[];
  auth_warning: string | null;
};

function daysSince(iso: string | null): number {
  if (!iso) return 0;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

type IssuedLink = { url: string; who: string; expires: string } | null;

const PERSONA_LABEL: Record<string, string> = {
  exec: "Executive",
  technical_director: "Technical Expert",
  sr_manager: "Senior Manager",
};

export default function AdminPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Overview | null>(null);
  const [gateError, setGateError] = useState<{ message: string; code?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [issued, setIssued] = useState<IssuedLink>(null);
  const [copied, setCopied] = useState(false);

  // Invite form
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invEmail, setInvEmail] = useState("");
  const [invName, setInvName] = useState("");
  const [invTitle, setInvTitle] = useState("");
  const [invRole, setInvRole] = useState("member");
  const [invManager, setInvManager] = useState("");
  const [invFloorGuide, setInvFloorGuide] = useState(false);

  // Inline person editor
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edName, setEdName] = useState("");
  const [edTitle, setEdTitle] = useState("");
  const [edRole, setEdRole] = useState("member");
  const [edManager, setEdManager] = useState("");
  const [edAdmin, setEdAdmin] = useState(false);
  const [edFloorGuide, setEdFloorGuide] = useState(false);

  // Org settings
  const [orgName, setOrgName] = useState("");
  const [orgIndustry, setOrgIndustry] = useState("");
  const [orgPersona, setOrgPersona] = useState("");
  const [orgMessage, setOrgMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Cache-bust: the P-9 lesson — a freshly written row read back through a
      // cached GET reads as "the write didn't land." It always had; the read
      // was stale. Every reload here is explicitly fresh.
      const res = await fetch(`/api/admin/overview?t=${Date.now()}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) {
        setGateError({ message: body.error || "Could not load your account.", code: body.code });
        setData(null);
        return;
      }
      setGateError(null);
      setData(body as Overview);
      setOrgName(body.org?.name ?? "");
      setOrgIndustry(body.org?.industry ?? "");
      setOrgPersona(body.org?.default_persona ?? "");
    } catch {
      setGateError({ message: "Could not load your account." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      setChecking(false);
      await load();
    })();
  }, [router, load]);

  const activeMembers = useMemo(
    () => (data?.members ?? []).filter((m) => !m.deactivated_at),
    [data]
  );
  const closedMembers = useMemo(
    () => (data?.members ?? []).filter((m) => !!m.deactivated_at),
    [data]
  );

  function showLink(url: string, who: string, expires: string) {
    setIssued({ url, who, expires });
    setCopied(false);
  }

  async function copyLink() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.url);
      setCopied(true);
    } catch {
      // Clipboard can be blocked; the link is on screen and selectable anyway.
      setCopied(false);
      setNotice("Couldn't copy automatically — select the link and copy it.");
    }
  }

  async function submitInvite() {
    if (busy) return;
    setBusy("invite");
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: invEmail,
          display_name: invName,
          claimed_title: invTitle || null,
          role: invRole,
          manager_id: invManager || null,
          floor_guide_active: invFloorGuide,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || "Could not create that seat.");
        return;
      }
      showLink(body.invite_link, invName || invEmail, body.invite_expires_hint);
      setInviteOpen(false);
      setInvEmail("");
      setInvName("");
      setInvTitle("");
      setInvRole("member");
      setInvManager("");
      setInvFloorGuide(false);
      await load();
    } catch {
      setError("Could not create that seat.");
    } finally {
      setBusy(null);
    }
  }

  function startEdit(m: Member) {
    setEditingId(m.id);
    setEdName(m.display_name ?? "");
    setEdTitle(m.claimed_title ?? "");
    setEdRole(m.role);
    setEdManager(m.manager_id ?? "");
    setEdAdmin(m.is_org_admin);
    setEdFloorGuide(m.floor_guide_active);
    setError(null);
  }

  async function saveEdit(id: string) {
    if (busy) return;
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/members/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: edName,
          claimed_title: edTitle,
          role: edRole,
          manager_id: edManager || null,
          is_org_admin: edAdmin,
          floor_guide_active: edFloorGuide,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || "Could not save that.");
        return;
      }
      setEditingId(null);
      await load();
    } catch {
      setError("Could not save that.");
    } finally {
      setBusy(null);
    }
  }

  async function resendLink(m: Member) {
    if (busy) return;
    setBusy(m.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/members/${m.id}/invite-link`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || "Could not create a link.");
        return;
      }
      showLink(body.invite_link, m.display_name || body.email, body.invite_expires_hint);
    } catch {
      setError("Could not create a link.");
    } finally {
      setBusy(null);
    }
  }

  async function setStatus(m: Member, action: "deactivate" | "reactivate") {
    if (busy) return;
    if (action === "deactivate" && !window.confirm(COPY.confirmDeactivate)) return;
    setBusy(m.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/members/${m.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || "Could not change that seat.");
        return;
      }
      if (body.warning) setNotice(body.warning);
      else if (action === "reactivate" && body.note) setNotice(body.note);
      await load();
    } catch {
      setError("Could not change that seat.");
    } finally {
      setBusy(null);
    }
  }

  async function saveOrg() {
    if (busy) return;
    setBusy("org");
    setOrgMessage(null);
    try {
      const res = await fetch("/api/admin/org", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: orgName,
          industry: orgIndustry,
          default_persona: orgPersona || null,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setOrgMessage(body.error || "Could not save.");
        return;
      }
      setOrgMessage(COPY.orgSaved);
      await load();
    } catch {
      setOrgMessage("Could not save.");
    } finally {
      setBusy(null);
    }
  }

  if (checking) {
    return (
      <div style={styles.center}>
        <p>Loading…</p>
      </div>
    );
  }

  // ─── The honest gate states ───
  if (!loading && gateError) {
    const noOrg = gateError.code === "NO_ORG";
    return (
      <div style={styles.wrapper}>
        <div style={styles.container}>
          <div style={{ marginBottom: 18 }}>
            <BrandHeader />
          </div>
          <h1 style={styles.title}>{COPY.title}</h1>
          <div style={styles.emptyCard}>
            <p style={styles.emptyText}>{noOrg ? COPY.noOrg : COPY.notAdmin}</p>
            {noOrg ? (
              <a href="/admin/start" style={styles.primaryLink}>
                {COPY.noOrgCta}
              </a>
            ) : (
              <a href="/dashboard" style={styles.backLink}>
                ← Back to dashboard
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  const managerOptions = activeMembers;

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        <div style={{ marginBottom: 18 }}>
          <BrandHeader />
        </div>

        <div style={styles.headerRow}>
          <h1 style={styles.title}>⚙️ {COPY.title}</h1>
          <a href="/dashboard" style={styles.headerLink}>
            ← Dashboard
          </a>
        </div>
        <p style={styles.subtitle}>{COPY.subtitle}</p>

        {error && <div style={styles.errorBanner}>{error}</div>}
        {notice && <div style={styles.noticeBanner}>{notice}</div>}
        {data?.auth_warning && (
          <div style={styles.noticeBanner}>
            Email and sign-in state couldn&apos;t be read just now — names and roles below are
            still accurate.
          </div>
        )}

        {/* ─── The issued invite link ─── */}
        {issued && (
          <div style={styles.linkCard}>
            <h2 style={styles.cardTitle}>
              🔗 {COPY.linkTitle} — {issued.who}
            </h2>
            <p style={styles.help}>{COPY.linkBody}</p>
            <div style={styles.linkRow}>
              <input style={styles.linkInput} readOnly value={issued.url} />
              <button type="button" style={styles.primaryButton} onClick={copyLink}>
                {copied ? COPY.copied : COPY.copy}
              </button>
            </div>
            <p style={styles.linkExpiry}>{COPY.linkExpiry(issued.expires)}</p>
            <button type="button" style={styles.textButton} onClick={() => setIssued(null)}>
              {COPY.dismiss}
            </button>
          </div>
        )}

        {/* ─── Setup checklist ─── */}
        {data && (
          <div style={styles.card}>
            <div style={styles.cardHead}>
              <h2 style={styles.cardTitle}>{COPY.setupTitle}</h2>
              <span style={styles.percent}>{data.setup_percent}%</span>
            </div>
            <p style={styles.help}>
              {data.setup_percent === 100 ? COPY.setupDone : COPY.setupSub}
            </p>
            <div style={styles.barTrack}>
              <div style={{ ...styles.barFill, width: `${data.setup_percent}%` }} />
            </div>
            <ul style={styles.checklist}>
              {data.checklist.map((item) => (
                <li key={item.key} style={styles.checkItem}>
                  <span style={item.done ? styles.checkOn : styles.checkOff}>
                    {item.done ? "✓" : "○"}
                  </span>
                  <span>
                    <span style={item.done ? styles.checkLabelDone : styles.checkLabel}>
                      {item.label}
                    </span>
                    <span style={styles.checkDetail}> — {item.detail}</span>
                    {!item.done && item.href && item.href.startsWith("/") && (
                      <>
                        {" "}
                        <a href={item.href} style={styles.inlineLink}>
                          go →
                        </a>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ─── FLOOR GUIDE PHASE A · Currently onboarding ───
            Only renders when somebody is actually in Floor Guide, so an account
            that isn't onboarding anyone sees nothing new.

            ⭐ WHAT THIS VIEW IS AND ISN'T. It is a management fact: an admin
            switched Floor Guide on for these people, and this is how long ago.
            The useful question it answers is "has anyone been left in onboarding
            mode for four months," which is a real thing to forget.

            It is NOT a window into anything private, and it structurally cannot
            become one: a Floor Guide question is never written against a person
            at all (no learning_signals actor, no knowledge_gap_askers row), so
            there is no per-person activity for a future version of this card to
            start showing. The absence is in the data, not in this JSX. */}
        {data && data.onboarding.length > 0 && (
          <div style={styles.card}>
            <div style={styles.cardHead}>
              <h2 style={styles.cardTitle}>
                {COPY.onboardingTitle} · {data.onboarding.length}
              </h2>
            </div>
            <p style={styles.help}>{COPY.onboardingSub}</p>
            {data.onboarding.map((p) => (
              <div key={p.id} style={styles.person}>
                <div style={styles.personTop}>
                  <span style={styles.personName}>{p.display_name || "Unnamed seat"}</span>
                  <span style={styles.floorGuideChip}>{COPY.floorGuideChip}</span>
                  {p.role === "contributor" && (
                    <span style={styles.roleChip}>{COPY.contributorChip}</span>
                  )}
                </div>
                <div style={styles.personMeta}>
                  {p.claimed_title || "no title set"} · {COPY.onboardingSince(daysSince(p.started_at))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ─── FLOOR GUIDE PHASE C · Deep dives ───
            The admin's door to asking the floor how the work really gets done.
            Lives HERE (and on the dashboard) and nowhere near Floor Guide:
            the two surfaces carry opposite promises — Floor Guide records
            nothing about a person, a deep dive is assessed and says so — and
            keeping their entry points apart is part of keeping that legible.
            ⚠️ Draft copy, pending Brian. */}
        <div style={styles.card}>
          <div style={styles.cardHead}>
            <h2 style={styles.cardTitle}>🔍 Deep dives</h2>
          </div>
          <p style={styles.help}>
            Ask people on contributor seats how they actually handle something, and compare
            the answers with what&apos;s codified. Every ask discloses who reads the answer
            before they type, and declining is silent — that honesty is why the answers are
            worth having.{" "}
            <a href="/deep-dives" style={styles.inlineLink}>
              Open deep dives →
            </a>
          </p>
        </div>

        {/* ─── People ─── */}
        <div style={styles.card} id="people">
          <div style={styles.cardHead}>
            <h2 style={styles.cardTitle}>
              {COPY.peopleTitle}
              {data ? ` · ${data.counts.active}` : ""}
            </h2>
            <button
              type="button"
              style={styles.primaryButton}
              onClick={() => {
                setInviteOpen((v) => !v);
                setError(null);
              }}
            >
              {inviteOpen ? COPY.inviteCancel : `+ ${COPY.invite}`}
            </button>
          </div>
          <p style={styles.help}>{COPY.peopleSub}</p>

          {inviteOpen && (
            <div style={styles.inviteBox}>
              <div style={styles.formGrid}>
                <label style={styles.label}>
                  Name
                  <input
                    style={styles.input}
                    value={invName}
                    onChange={(e) => setInvName(e.target.value)}
                    placeholder="e.g. Dana Whitfield"
                  />
                </label>
                <label style={styles.label}>
                  Email
                  <input
                    style={styles.input}
                    type="email"
                    value={invEmail}
                    onChange={(e) => setInvEmail(e.target.value)}
                    placeholder="dana@company.com"
                  />
                </label>
                <label style={styles.label}>
                  Title
                  <input
                    style={styles.input}
                    value={invTitle}
                    onChange={(e) => setInvTitle(e.target.value)}
                    placeholder="e.g. Quality Manager"
                  />
                </label>
                <label style={styles.label}>
                  Role
                  <select
                    style={styles.select}
                    value={invRole}
                    onChange={(e) => setInvRole(e.target.value)}
                  >
                    <option value="contributor">Contributor</option>
                    <option value="member">Member</option>
                    <option value="manager">Manager</option>
                  </select>
                </label>
                <label style={styles.label}>
                  Reports to
                  <select
                    style={styles.select}
                    value={invManager}
                    onChange={(e) => setInvManager(e.target.value)}
                  >
                    <option value="">Nobody yet</option>
                    {managerOptions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.display_name || "Unnamed seat"}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p style={styles.help}>{COPY.roleHelp}</p>
              {/* Floor Guide on from the first sign-in, which is the real
                  onboarding moment — switching it on the day after somebody's
                  first shift is a worse product. */}
              <label style={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={invFloorGuide}
                  onChange={(e) => setInvFloorGuide(e.target.checked)}
                />
                <span>{COPY.floorGuideLabel}</span>
              </label>
              <p style={styles.help}>{COPY.floorGuideHelp}</p>
              <button
                type="button"
                style={styles.primaryButton}
                disabled={busy === "invite" || !invName.trim() || !invEmail.trim()}
                onClick={submitInvite}
              >
                {busy === "invite" ? COPY.inviteWorking : COPY.inviteSubmit}
              </button>
            </div>
          )}

          {loading && <p style={styles.help}>Loading…</p>}

          {activeMembers.map((m) => (
            <div key={m.id} style={styles.person}>
              {editingId === m.id ? (
                <div style={styles.editBox}>
                  <div style={styles.formGrid}>
                    <label style={styles.label}>
                      Name
                      <input
                        style={styles.input}
                        value={edName}
                        onChange={(e) => setEdName(e.target.value)}
                      />
                    </label>
                    <label style={styles.label}>
                      Title
                      <input
                        style={styles.input}
                        value={edTitle}
                        onChange={(e) => setEdTitle(e.target.value)}
                      />
                    </label>
                    <label style={styles.label}>
                      Role
                      <select
                        style={styles.select}
                        value={edRole}
                        onChange={(e) => setEdRole(e.target.value)}
                      >
                        <option value="contributor">Contributor</option>
                        <option value="member">Member</option>
                        <option value="manager">Manager</option>
                      </select>
                    </label>
                    <label style={styles.label}>
                      Reports to
                      <select
                        style={styles.select}
                        value={edManager}
                        onChange={(e) => setEdManager(e.target.value)}
                      >
                        <option value="">Nobody</option>
                        {managerOptions
                          .filter((o) => o.id !== m.id)
                          .map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.display_name || "Unnamed seat"}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label style={styles.checkboxRow}>
                      <input
                        type="checkbox"
                        checked={edAdmin}
                        onChange={(e) => setEdAdmin(e.target.checked)}
                      />
                      <span>Can administer this account</span>
                    </label>
                    <label style={styles.checkboxRow}>
                      <input
                        type="checkbox"
                        checked={edFloorGuide}
                        onChange={(e) => setEdFloorGuide(e.target.checked)}
                      />
                      <span>{COPY.floorGuideLabel}</span>
                    </label>
                  </div>
                  <p style={styles.help}>{COPY.floorGuideHelp}</p>
                  <div style={styles.actionRow}>
                    <button
                      type="button"
                      style={styles.primaryButton}
                      disabled={busy === m.id || !edName.trim()}
                      onClick={() => saveEdit(m.id)}
                    >
                      {COPY.save}
                    </button>
                    <button
                      type="button"
                      style={styles.textButton}
                      onClick={() => setEditingId(null)}
                    >
                      {COPY.cancel}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={styles.personTop}>
                    <span style={styles.personName}>{m.display_name || "Unnamed seat"}</span>
                    {m.is_org_admin && <span style={styles.adminChip}>{COPY.adminChip}</span>}
                    {m.role === "manager" && <span style={styles.roleChip}>{COPY.managerChip}</span>}
                    {m.role === "contributor" && (
                      <span style={styles.roleChip}>{COPY.contributorChip}</span>
                    )}
                    {m.floor_guide_active && (
                      <span style={styles.floorGuideChip}>{COPY.floorGuideChip}</span>
                    )}
                    {m.is_me && <span style={styles.youChip}>{COPY.you}</span>}
                    {m.pending && <span style={styles.pendingChip}>{COPY.pending}</span>}
                  </div>
                  <div style={styles.personMeta}>
                    {m.claimed_title || "no title set"}
                    {m.email ? ` · ${m.email}` : ""}
                  </div>
                  <div style={styles.personMeta}>
                    {m.manager_name ? COPY.reportsTo(m.manager_name) : COPY.noManager}
                    {" · "}
                    {COPY.capture(m.frameworks_codified)}
                    {m.persona ? ` · ${PERSONA_LABEL[m.persona] ?? m.persona}` : ""}
                  </div>
                  <div style={styles.actionRow}>
                    <button type="button" style={styles.smallButton} onClick={() => startEdit(m)}>
                      {COPY.edit}
                    </button>
                    <button
                      type="button"
                      style={styles.smallButton}
                      disabled={busy === m.id}
                      onClick={() => resendLink(m)}
                    >
                      {COPY.resend}
                    </button>
                    {!m.is_me && (
                      <button
                        type="button"
                        style={styles.dangerButton}
                        disabled={busy === m.id}
                        onClick={() => setStatus(m, "deactivate")}
                      >
                        {COPY.deactivate}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}

          {closedMembers.length > 0 && (
            <button
              type="button"
              style={styles.toggleButton}
              onClick={() => setShowClosed((v) => !v)}
            >
              {showClosed ? COPY.hideClosed : `${COPY.showClosed} (${closedMembers.length})`}
            </button>
          )}

          {showClosed && (
            <>
              <p style={styles.keepNote}>{COPY.keepNote}</p>
              {closedMembers.map((m) => (
                <div key={m.id} style={styles.personClosed}>
                  <div style={styles.personTop}>
                    <span style={styles.personName}>{m.display_name || "Unnamed seat"}</span>
                    <span style={styles.closedChip}>{COPY.deactivated}</span>
                  </div>
                  <div style={styles.personMeta}>
                    {m.claimed_title || "no title set"} · {COPY.capture(m.frameworks_codified)}
                  </div>
                  <div style={styles.actionRow}>
                    <button
                      type="button"
                      style={styles.smallButton}
                      disabled={busy === m.id}
                      onClick={() => setStatus(m, "reactivate")}
                    >
                      {COPY.reactivate}
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* ─── Org settings ─── */}
        {data && (
          <div style={styles.card} id="org-settings">
            <h2 style={styles.cardTitle}>{COPY.orgTitle}</h2>
            <p style={styles.help}>{COPY.orgSub}</p>
            <div style={styles.formGrid}>
              <label style={styles.label}>
                Organization name
                <input
                  style={styles.input}
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                />
              </label>
              <label style={styles.label}>
                Industry (optional)
                <input
                  style={styles.input}
                  value={orgIndustry}
                  onChange={(e) => setOrgIndustry(e.target.value)}
                  placeholder="e.g. Manufacturing"
                />
              </label>
              <label style={styles.label}>
                Default register for new people
                <select
                  style={styles.select}
                  value={orgPersona}
                  onChange={(e) => setOrgPersona(e.target.value)}
                >
                  <option value="">No default</option>
                  <option value="exec">Executive</option>
                  <option value="technical_director">Technical Expert</option>
                  <option value="sr_manager">Senior Manager</option>
                </select>
              </label>
            </div>
            <button
              type="button"
              style={styles.primaryButton}
              disabled={busy === "org" || !orgName.trim()}
              onClick={saveOrg}
            >
              {COPY.orgSave}
            </button>
            {orgMessage && <p style={styles.okText}>{orgMessage}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { minHeight: "100vh", fontFamily: "var(--font-sans)" },
  container: { maxWidth: 820, margin: "0 auto", padding: "40px 24px 80px" },
  center: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "var(--font-sans)",
  },
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  title: { fontSize: "26px", margin: 0 },
  headerLink: { fontSize: "14px", fontWeight: 600, color: "var(--muted)", textDecoration: "none" },
  subtitle: { color: "var(--muted)", fontSize: "14px", margin: "6px 0 22px", lineHeight: 1.55 },

  card: {
    background: "var(--white)",
    border: "1px solid var(--line)",
    borderRadius: 14,
    padding: "20px 20px 22px",
    marginBottom: 16,
  },
  cardHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  cardTitle: { fontSize: "17px", margin: "0 0 4px" },
  help: { fontSize: "13px", color: "var(--muted)", margin: "0 0 14px", lineHeight: 1.55 },

  emptyCard: {
    background: "var(--white)",
    border: "1px dashed var(--line)",
    borderRadius: 14,
    padding: "28px 24px",
    display: "flex",
    flexDirection: "column",
    gap: 14,
    alignItems: "flex-start",
  },
  emptyText: { fontSize: "14px", color: "var(--pine-soft)", lineHeight: 1.6, margin: 0 },
  primaryLink: { fontSize: "14px", fontWeight: 600, color: "var(--growth)", textDecoration: "none" },
  backLink: { fontSize: "13px", color: "var(--muted)", textDecoration: "none" },
  inlineLink: { fontSize: "13px", fontWeight: 600, color: "var(--growth)", textDecoration: "none" },

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
  noticeBanner: {
    background: "var(--warn-bg)",
    border: "1px solid var(--warn-border)",
    color: "var(--warn-text)",
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
  linkExpiry: { fontSize: "12px", color: "var(--muted)", margin: "10px 0 6px", lineHeight: 1.5 },

  percent: { fontSize: "20px", fontWeight: 700, color: "var(--growth-deep)" },
  barTrack: {
    height: 8,
    borderRadius: 999,
    background: "var(--paper-2)",
    overflow: "hidden",
    marginBottom: 14,
  },
  barFill: { height: "100%", background: "var(--growth)", borderRadius: 999 },
  checklist: { listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 },
  checkItem: { display: "flex", gap: 10, alignItems: "flex-start", fontSize: "13px", lineHeight: 1.55 },
  checkOn: { color: "var(--ok-text)", fontWeight: 700 },
  checkOff: { color: "var(--muted)", fontWeight: 700 },
  checkLabel: { fontWeight: 700, color: "var(--pine)" },
  checkLabelDone: { fontWeight: 700, color: "var(--muted)" },
  checkDetail: { color: "var(--muted)" },

  inviteBox: {
    background: "var(--paper)",
    border: "1px solid var(--line)",
    borderRadius: 12,
    padding: "16px 16px 18px",
    marginBottom: 16,
  },
  editBox: {
    background: "var(--paper)",
    border: "1px solid var(--growth)",
    borderRadius: 12,
    padding: "16px 16px 18px",
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
    marginBottom: 14,
  },
  label: { display: "flex", flexDirection: "column", gap: 5, fontSize: "12px", fontWeight: 600, color: "var(--pine-soft)" },
  checkboxRow: { display: "flex", alignItems: "center", gap: 8, fontSize: "13px", color: "var(--pine)", alignSelf: "end" },
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
  select: {
    padding: "9px 11px",
    fontSize: "14px",
    borderRadius: 8,
    border: "1px solid var(--line)",
    fontFamily: "inherit",
    fontWeight: 400,
    color: "var(--pine)",
    background: "var(--white)",
  },

  person: {
    borderTop: "1px solid var(--line)",
    padding: "14px 0 4px",
  },
  personClosed: {
    borderTop: "1px solid var(--line)",
    padding: "14px 0 4px",
    opacity: 0.72,
  },
  personTop: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 },
  personName: { fontSize: "15px", fontWeight: 700, color: "var(--pine)" },
  personMeta: { fontSize: "12px", color: "var(--muted)", marginBottom: 4, lineHeight: 1.5 },

  adminChip: {
    fontSize: "11px",
    fontWeight: 700,
    color: "var(--ok-text)",
    background: "var(--ok-bg)",
    border: "1px solid var(--ok-border)",
    borderRadius: 999,
    padding: "2px 8px",
  },
  roleChip: {
    fontSize: "11px",
    fontWeight: 700,
    color: "var(--growth-deep)",
    background: "var(--white)",
    border: "1px solid var(--growth)",
    borderRadius: 999,
    padding: "2px 8px",
  },
  // Floor Guide: pale action tint, never a warning colour. Being in Floor Guide
  // is a good thing happening to a new person, not a flag on them.
  floorGuideChip: {
    fontSize: "11px",
    fontWeight: 700,
    color: "var(--growth-deep)",
    background: "var(--growth-soft)",
    border: "1px solid var(--ok-border)",
    borderRadius: 999,
    padding: "2px 8px",
  },
  youChip: {
    fontSize: "11px",
    fontWeight: 700,
    color: "var(--muted)",
    background: "var(--paper-2)",
    border: "1px solid var(--line)",
    borderRadius: 999,
    padding: "2px 8px",
  },
  pendingChip: {
    fontSize: "11px",
    fontWeight: 700,
    color: "var(--warn-text)",
    background: "var(--warn-chip-bg)",
    border: "1px solid var(--warn-border)",
    borderRadius: 999,
    padding: "2px 8px",
  },
  closedChip: {
    fontSize: "11px",
    fontWeight: 700,
    color: "var(--muted)",
    background: "var(--paper-2)",
    border: "1px solid var(--line)",
    borderRadius: 999,
    padding: "2px 8px",
  },

  actionRow: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 8 },
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
  smallButton: {
    fontSize: "12px",
    fontWeight: 600,
    color: "var(--growth-deep)",
    background: "var(--growth-soft)",
    border: "1px solid var(--new-leaf-light)",
    borderRadius: 8,
    padding: "6px 12px",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  dangerButton: {
    fontSize: "12px",
    fontWeight: 600,
    color: "var(--danger)",
    background: "var(--danger-bg)",
    border: "1px solid var(--danger-border)",
    borderRadius: 8,
    padding: "6px 12px",
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
  toggleButton: {
    marginTop: 14,
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
  keepNote: {
    fontSize: "12px",
    color: "var(--muted)",
    lineHeight: 1.55,
    margin: "12px 0 0",
    fontStyle: "italic",
  },
  okText: { fontSize: "13px", color: "var(--ok-text)", marginTop: 10 },
};
