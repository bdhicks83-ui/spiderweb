"use client";
// TIER 1 / BUILD 2 — CAPTURE CAMPAIGNS: the list, and the thing that makes one.
//
// ⭐ THE POINT OF THIS PAGE IS THE "FROM QUESTIONS NOBODY COULD ANSWER" TAB.
// Anyone can write "please document your process" into a box; that produces
// nothing, and every knowledge-management product in history has shipped that
// box. What no other surface in this product could do until now is take a row
// out of the P-9 gaps queue — a question somebody actually typed, that the
// team's brain actually failed to answer, with a count of how many times it
// happened — and put it in front of the one person who probably knows.
//
// Demand → ask → capture → retrieval → the next question. This page is the
// only place those two ends of the flywheel touch.
//
// Client-safe imports only. People come from the profiles table through the
// browser client (P-1's "org members read profiles" policy is the gate); open
// gaps come from /api/gaps, which is already org-readable.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import BrandHeader from "@/components/BrandHeader";

const supabase = createClient();

// ═════════════════════════════════════════════════════════════════════════════
// ⚠️⚠️ DRAFT CUSTOMER-FACING COPY — PENDING BRIAN'S SIGN-OFF (T1B2) ⚠️⚠️
//
// THE THING TO GET RIGHT: a campaign is a manager asking specific people
// specific questions, not a compliance drive. Every string here should sound
// like something a plant manager would actually say out loud. Nothing may
// frame an unanswered ask as somebody failing.
// ═════════════════════════════════════════════════════════════════════════════
const COPY = {
  title: "Capture campaigns",
  subtitle:
    "A named push to get specific judgment out of specific heads. The ask is always a question, because “document your process” gets you nothing and “how do you decide whether to release the first run after a changeover?” gets you a framework.",
  empty:
    "No campaigns yet. The fastest first one: pick a question your team already asked and couldn't answer, and send it to whoever knows.",
  noOrg: "Campaigns are a team surface — once you're part of an organization, they show up here.",
  notOwner:
    "Campaigns are started by managers and account admins. If there's judgment worth capturing on your team, tell yours — or capture it yourself from the dashboard.",
  start: "Start a campaign",
  cancel: "Cancel",
  create: "Send these asks",
  creating: "Sending…",

  nameLabel: "What are you calling this?",
  namePlaceholder: "e.g. Little Rock line changeovers",
  purposeLabel: "Why now? (shown to everyone you ask)",
  purposePlaceholder:
    "e.g. Chuck retires in March and the changeover call has never been written down anywhere.",
  dueLabel: "Target date (optional, nothing nags)",

  tabGaps: "From questions nobody could answer",
  tabManual: "Write your own",
  gapsEmpty:
    "Nothing in the gaps queue right now. That's a good sign — it means every question your team asked got an answer.",
  gapsHelp:
    "These are real questions your team asked that nothing could answer, most-asked first. Pick who'd know.",
  asked: (n: number) => (n === 1 ? "asked once" : `asked ${n} times`),
  addAsk: "Add this ask",
  whoLabel: "Who'd know?",
  whoPlaceholder: "Pick a person…",
  promptLabel: "What do you want to ask them?",
  promptPlaceholder:
    "e.g. How do you decide whether the first run after a profile changeover can ship before the bond-strength check clears?",
  staged: (n: number) => (n === 1 ? "1 ask ready to send" : `${n} asks ready to send`),
  remove: "Remove",
  progress: (captured: number, answerable: number) => `${captured} of ${answerable} captured`,
  declinedNote: (n: number) => (n === 1 ? "1 passed on" : `${n} passed on`),
  openCampaign: "Open →",
  statusOpen: "open",
  statusClosed: "closed",
  yourAsks: "Asked of you →",
};
// ═════════════════════════════════════════════════════════════════════════════

type Person = { id: string; display_name: string | null; claimed_title: string | null };
type Gap = { id: string; question: string; asked_count: number; status: string };
type StagedAsk = { key: string; person_id: string; person_name: string; prompt: string; gap_id: string | null };

type Campaign = {
  id: string;
  name: string;
  purpose: string | null;
  status: "open" | "closed";
  due_on: string | null;
  owner_name: string;
  owned_by_me: boolean;
  progress: {
    asks: number;
    captured: number;
    declined: number;
    started: number;
    open: number;
    percent: number;
    people: number;
    people_captured: number;
  };
};

export default function CampaignsPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [hasOrg, setHasOrg] = useState(true);
  const [canOwn, setCanOwn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [people, setPeople] = useState<Person[]>([]);
  const [gaps, setGaps] = useState<Gap[]>([]);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [tab, setTab] = useState<"gaps" | "manual">("gaps");
  const [staged, setStaged] = useState<StagedAsk[]>([]);

  // gap tab
  const [gapPerson, setGapPerson] = useState<Record<string, string>>({});
  // manual tab
  const [manualPerson, setManualPerson] = useState("");
  const [manualPrompt, setManualPrompt] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/campaigns?t=${Date.now()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not load campaigns.");
        return;
      }
      setError(null);
      setHasOrg(data.org !== false);
      setCampaigns((data.campaigns as Campaign[]) || []);
    } catch {
      setError("Could not load campaigns.");
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

      const { data: prof } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", user.id)
        .maybeSingle();
      const orgId = (prof as { org_id: string | null } | null)?.org_id ?? null;

      // Can this person RUN a campaign? Both gates are SECURITY DEFINER
      // functions evaluated by Postgres as the caller — the same answer the
      // API will give, so the UI never offers a control the server refuses.
      const [{ data: mgr }, { data: adm }] = await Promise.all([
        supabase.rpc("is_manager"),
        supabase.rpc("is_org_admin"),
      ]);
      setCanOwn(mgr === true || adm === true);

      if (orgId) {
        const { data: rows } = await supabase
          .from("profiles")
          .select("id, display_name, claimed_title")
          .eq("org_id", orgId)
          .is("deactivated_at", null)
          .order("display_name", { ascending: true });
        setPeople((rows as Person[]) || []);
      }

      try {
        const g = await fetch("/api/gaps").then((r) => r.json());
        setGaps(((g.gaps as Gap[]) || []).filter((x) => x.status !== "resolved"));
      } catch {
        setGaps([]);
      }

      await load();
    })();
  }, [router, load]);

  const nameById = useMemo(
    () => Object.fromEntries(people.map((p) => [p.id, p.display_name || "A teammate"])),
    [people]
  );

  function addGapAsk(g: Gap) {
    const personId = gapPerson[g.id];
    if (!personId) return;
    setStaged((prev) => [
      ...prev,
      {
        key: `${g.id}:${personId}`,
        person_id: personId,
        person_name: nameById[personId] ?? "A teammate",
        prompt: g.question,
        gap_id: g.id,
      },
    ]);
    setGapPerson((prev) => ({ ...prev, [g.id]: "" }));
  }

  function addManualAsk() {
    if (!manualPerson || !manualPrompt.trim()) return;
    setStaged((prev) => [
      ...prev,
      {
        key: `m:${manualPerson}:${prev.length}`,
        person_id: manualPerson,
        person_name: nameById[manualPerson] ?? "A teammate",
        prompt: manualPrompt.trim(),
        gap_id: null,
      },
    ]);
    setManualPrompt("");
  }

  async function submit() {
    if (busy || !name.trim() || staged.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          purpose: purpose || null,
          due_on: dueOn || null,
          asks: staged.map((s) => ({ person_id: s.person_id, prompt: s.prompt, gap_id: s.gap_id })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not create the campaign.");
        return;
      }
      setCreating(false);
      setName("");
      setPurpose("");
      setDueOn("");
      setStaged([]);
      router.push(`/campaigns/${data.campaign_id}`);
    } catch {
      setError("Could not create the campaign.");
    } finally {
      setBusy(false);
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

        <div style={styles.headerRow}>
          <h1 style={styles.title}>📣 {COPY.title}</h1>
          <div style={styles.headerLinks}>
            <a href="/requests" style={styles.headerLink}>
              {COPY.yourAsks}
            </a>
            <a href="/dashboard" style={styles.headerLink}>
              ← Dashboard
            </a>
          </div>
        </div>
        <p style={styles.subtitle}>{COPY.subtitle}</p>

        {error && <div style={styles.errorBanner}>{error}</div>}
        {!hasOrg && <div style={styles.emptyCard}>{COPY.noOrg}</div>}

        {hasOrg && canOwn && !creating && (
          <button type="button" style={styles.primaryButton} onClick={() => setCreating(true)}>
            + {COPY.start}
          </button>
        )}
        {hasOrg && !canOwn && <div style={styles.emptyCard}>{COPY.notOwner}</div>}

        {creating && (
          <div style={styles.createCard}>
            <div style={styles.formGrid}>
              <label style={styles.label}>
                {COPY.nameLabel}
                <input
                  style={styles.input}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={COPY.namePlaceholder}
                />
              </label>
              <label style={styles.label}>
                {COPY.dueLabel}
                <input
                  style={styles.input}
                  type="date"
                  value={dueOn}
                  onChange={(e) => setDueOn(e.target.value)}
                />
              </label>
            </div>
            <label style={styles.labelFull}>
              {COPY.purposeLabel}
              <textarea
                style={styles.textarea}
                rows={2}
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder={COPY.purposePlaceholder}
              />
            </label>

            <div style={styles.tabRow}>
              <button
                type="button"
                style={tab === "gaps" ? styles.tabOn : styles.tabOff}
                onClick={() => setTab("gaps")}
              >
                🧩 {COPY.tabGaps}
              </button>
              <button
                type="button"
                style={tab === "manual" ? styles.tabOn : styles.tabOff}
                onClick={() => setTab("manual")}
              >
                ✍️ {COPY.tabManual}
              </button>
            </div>

            {tab === "gaps" && (
              <div style={styles.tabBody}>
                <p style={styles.help}>{COPY.gapsHelp}</p>
                {gaps.length === 0 && <div style={styles.emptyCard}>{COPY.gapsEmpty}</div>}
                {gaps.map((g) => (
                  <div key={g.id} style={styles.gapRow}>
                    <div style={styles.gapTop}>
                      <span style={styles.demandChip}>{COPY.asked(g.asked_count)}</span>
                    </div>
                    <p style={styles.gapQuestion}>&ldquo;{g.question}&rdquo;</p>
                    <div style={styles.linkRow}>
                      <select
                        style={styles.select}
                        value={gapPerson[g.id] ?? ""}
                        onChange={(e) => setGapPerson((prev) => ({ ...prev, [g.id]: e.target.value }))}
                      >
                        <option value="">{COPY.whoPlaceholder}</option>
                        {people.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.display_name || "Unnamed"}
                            {p.claimed_title ? ` — ${p.claimed_title}` : ""}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        style={styles.secondaryButton}
                        disabled={!gapPerson[g.id]}
                        onClick={() => addGapAsk(g)}
                      >
                        {COPY.addAsk}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === "manual" && (
              <div style={styles.tabBody}>
                <label style={styles.labelFull}>
                  {COPY.whoLabel}
                  <select
                    style={styles.select}
                    value={manualPerson}
                    onChange={(e) => setManualPerson(e.target.value)}
                  >
                    <option value="">{COPY.whoPlaceholder}</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.display_name || "Unnamed"}
                        {p.claimed_title ? ` — ${p.claimed_title}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={styles.labelFull}>
                  {COPY.promptLabel}
                  <textarea
                    style={styles.textarea}
                    rows={3}
                    value={manualPrompt}
                    onChange={(e) => setManualPrompt(e.target.value)}
                    placeholder={COPY.promptPlaceholder}
                  />
                </label>
                <button
                  type="button"
                  style={styles.secondaryButton}
                  disabled={!manualPerson || !manualPrompt.trim()}
                  onClick={addManualAsk}
                >
                  {COPY.addAsk}
                </button>
              </div>
            )}

            {staged.length > 0 && (
              <div style={styles.stagedBox}>
                <p style={styles.stagedTitle}>{COPY.staged(staged.length)}</p>
                {staged.map((s, i) => (
                  <div key={`${s.key}:${i}`} style={styles.stagedRow}>
                    <div>
                      <span style={styles.stagedPerson}>{s.person_name}</span>
                      {s.gap_id && <span style={styles.fromGapChip}>from the gaps queue</span>}
                      <p style={styles.stagedPrompt}>{s.prompt}</p>
                    </div>
                    <button
                      type="button"
                      style={styles.textButton}
                      onClick={() => setStaged((prev) => prev.filter((_, j) => j !== i))}
                    >
                      {COPY.remove}
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={styles.actionRow}>
              <button
                type="button"
                style={styles.primaryButton}
                disabled={busy || !name.trim() || staged.length === 0}
                onClick={submit}
              >
                {busy ? COPY.creating : COPY.create}
              </button>
              <button type="button" style={styles.textButton} onClick={() => setCreating(false)}>
                {COPY.cancel}
              </button>
            </div>
          </div>
        )}

        {hasOrg && loading && <p style={styles.help}>Loading…</p>}
        {hasOrg && !loading && campaigns.length === 0 && !creating && (
          <div style={styles.emptyCard}>{COPY.empty}</div>
        )}

        {campaigns.map((c) => {
          const answerable = c.progress.asks - c.progress.declined;
          return (
            <div key={c.id} style={c.status === "closed" ? styles.campaignClosed : styles.campaign}>
              <div style={styles.cardTop}>
                <span style={c.status === "closed" ? styles.closedChip : styles.openChip}>
                  {c.status === "closed" ? COPY.statusClosed : COPY.statusOpen}
                </span>
                <span style={styles.meta}>{c.owner_name}</span>
                {c.due_on && <span style={styles.meta}>target {c.due_on}</span>}
              </div>
              <h2 style={styles.campaignName}>{c.name}</h2>
              {c.purpose && <p style={styles.purpose}>{c.purpose}</p>}

              <div style={styles.barTrack}>
                <div style={{ ...styles.barFill, width: `${c.progress.percent}%` }} />
              </div>
              <p style={styles.progressLine}>
                {COPY.progress(c.progress.captured, answerable)}
                {c.progress.declined > 0 ? ` · ${COPY.declinedNote(c.progress.declined)}` : ""}
              </p>

              <a href={`/campaigns/${c.id}`} style={styles.newLink}>
                {COPY.openCampaign}
              </a>
            </div>
          );
        })}
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
  headerLinks: { display: "flex", gap: 16, alignItems: "center" },
  title: { fontSize: "26px", margin: 0 },
  headerLink: { fontSize: "14px", fontWeight: 600, color: "var(--muted)", textDecoration: "none" },
  subtitle: { color: "var(--muted)", fontSize: "14px", margin: "6px 0 22px", lineHeight: 1.55 },
  help: { fontSize: "13px", color: "var(--muted)", margin: "0 0 12px", lineHeight: 1.55 },
  errorBanner: {
    background: "var(--danger-bg)",
    border: "1px solid var(--danger-border)",
    color: "var(--danger)",
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: "13px",
    marginBottom: 14,
  },
  emptyCard: {
    background: "var(--white)",
    border: "1px dashed var(--line)",
    borderRadius: 14,
    padding: "24px 22px",
    fontSize: "14px",
    color: "var(--pine-soft)",
    lineHeight: 1.6,
    marginBottom: 16,
  },
  createCard: {
    background: "var(--white)",
    border: "1px solid var(--growth)",
    borderRadius: 14,
    padding: "20px 20px 22px",
    margin: "16px 0",
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
    marginBottom: 12,
  },
  label: { display: "flex", flexDirection: "column", gap: 5, fontSize: "12px", fontWeight: 600, color: "var(--pine-soft)" },
  labelFull: {
    display: "flex",
    flexDirection: "column",
    gap: 5,
    fontSize: "12px",
    fontWeight: 600,
    color: "var(--pine-soft)",
    marginBottom: 14,
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
  textarea: {
    width: "100%",
    boxSizing: "border-box",
    padding: "9px 11px",
    fontSize: "14px",
    borderRadius: 8,
    border: "1px solid var(--line)",
    fontFamily: "inherit",
    fontWeight: 400,
    color: "var(--pine)",
    resize: "vertical",
  },
  select: {
    padding: "8px 10px",
    fontSize: "13px",
    borderRadius: 8,
    border: "1px solid var(--line)",
    fontFamily: "inherit",
    fontWeight: 400,
    color: "var(--pine)",
    background: "var(--white)",
    maxWidth: 320,
  },
  tabRow: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 },
  tabOn: {
    fontSize: "13px",
    fontWeight: 700,
    color: "var(--white)",
    background: "var(--growth)",
    border: "1px solid var(--growth)",
    borderRadius: 999,
    padding: "7px 14px",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  tabOff: {
    fontSize: "13px",
    fontWeight: 600,
    color: "var(--pine-soft)",
    background: "var(--white)",
    border: "1px solid var(--line)",
    borderRadius: 999,
    padding: "7px 14px",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  tabBody: { marginBottom: 14 },
  gapRow: {
    background: "var(--warn-bg)",
    border: "1px solid var(--warn-border)",
    borderRadius: 12,
    padding: "12px 14px",
    marginBottom: 10,
  },
  gapTop: { marginBottom: 6 },
  gapQuestion: { fontSize: "14px", fontWeight: 600, color: "var(--pine)", margin: "0 0 10px", lineHeight: 1.5 },
  demandChip: {
    fontSize: "11px",
    fontWeight: 700,
    color: "var(--warn-text)",
    background: "var(--warn-chip-bg)",
    border: "1px solid var(--warn-border)",
    borderRadius: 999,
    padding: "3px 9px",
  },
  fromGapChip: {
    fontSize: "10px",
    fontWeight: 700,
    color: "var(--growth-deep)",
    background: "var(--growth-soft)",
    border: "1px solid var(--new-leaf-light)",
    borderRadius: 999,
    padding: "2px 7px",
    marginLeft: 8,
  },
  stagedBox: {
    background: "var(--paper)",
    border: "1px solid var(--line)",
    borderRadius: 12,
    padding: "14px 16px",
    marginBottom: 14,
  },
  stagedTitle: { fontSize: "13px", fontWeight: 700, color: "var(--pine)", margin: "0 0 10px" },
  stagedRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    borderTop: "1px solid var(--line)",
    paddingTop: 10,
    marginTop: 10,
  },
  stagedPerson: { fontSize: "13px", fontWeight: 700, color: "var(--pine)" },
  stagedPrompt: { fontSize: "13px", color: "var(--muted)", margin: "4px 0 0", lineHeight: 1.5 },
  campaign: {
    background: "var(--white)",
    border: "1px solid var(--line)",
    borderRadius: 14,
    padding: "18px 20px 20px",
    marginBottom: 14,
  },
  campaignClosed: {
    background: "var(--paper-2)",
    border: "1px solid var(--line)",
    borderRadius: 14,
    padding: "18px 20px 20px",
    marginBottom: 14,
    opacity: 0.8,
  },
  cardTop: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 },
  openChip: {
    fontSize: "11px",
    fontWeight: 700,
    color: "var(--growth-deep)",
    background: "var(--growth-soft)",
    border: "1px solid var(--new-leaf-light)",
    borderRadius: 999,
    padding: "3px 9px",
  },
  closedChip: {
    fontSize: "11px",
    fontWeight: 700,
    color: "var(--muted)",
    background: "var(--white)",
    border: "1px solid var(--line)",
    borderRadius: 999,
    padding: "3px 9px",
  },
  meta: { fontSize: "11px", color: "var(--muted)" },
  campaignName: { fontSize: "18px", margin: "0 0 6px" },
  purpose: { fontSize: "13px", color: "var(--muted)", margin: "0 0 12px", lineHeight: 1.55 },
  barTrack: { height: 8, borderRadius: 999, background: "var(--paper-2)", overflow: "hidden", marginBottom: 8 },
  barFill: { height: "100%", background: "var(--growth)", borderRadius: 999 },
  progressLine: { fontSize: "12px", color: "var(--muted)", margin: "0 0 10px" },
  actionRow: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
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
  secondaryButton: {
    fontSize: "13px",
    fontWeight: 600,
    color: "var(--growth-deep)",
    background: "var(--growth-soft)",
    border: "1px solid var(--new-leaf-light)",
    borderRadius: 8,
    padding: "7px 12px",
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
  linkRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  newLink: { fontSize: "14px", fontWeight: 600, color: "var(--growth)", textDecoration: "none" },
};
