"use client";
// TIER 1 / BUILD 3 — THE VALUE READOUT.
//
// The page a champion opens the week before the renewal conversation, and the
// button that gives them the two pages they forward.
//
// Everything here is computed live from the org's own rows — no stored metrics,
// no new tables. See src/lib/value-readout.ts for the three rules the whole
// feature obeys: no invented dollars, no person-level negative, and say out
// loud how thin the data is.
//
// Client-safe imports only — @/lib/value-readout and @/lib/readout-pdf are
// server-only.
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import BrandHeader from "@/components/BrandHeader";

const supabase = createClient();

// ═════════════════════════════════════════════════════════════════════════════
// ⚠️⚠️ DRAFT CUSTOMER-FACING COPY — PENDING BRIAN'S SIGN-OFF (T1B3) ⚠️⚠️
//
// ⭐ HIGHEST-STAKES COPY IN THE PRODUCT: this is read by the budget holder, not
// the user. Two hard rules —
//   1. NO DOLLAR FIGURE, EVER. Not a saving, not a valuation, not a
//      "conservatively." Anchor on replacement cost (years of judgment, sourced
//      to named people) and let the reader run their own number. A computed
//      dollar makes this a document that gets checked, and it only has to be
//      caught once.
//   2. THE CAVEATS ARE THE CREDIBILITY, not fine print. A readout that admits
//      what it cannot see is a readout the reader believes about what it can.
// ═════════════════════════════════════════════════════════════════════════════
const COPY = {
  title: "What your team wrote down",
  subtitle:
    "Built from your own records, live. Nothing on this page is estimated, modeled, or extrapolated — and where the evidence is thin, it says so.",
  notViewer: "The readout is for managers and account admins.",
  noOrg: "Once you're part of an organization, its readout shows up here.",
  download: "Download the two-page version",
  building: "Building it…",
  rangeAll: "Everything so far",
  rangeLabel: "Counting from",

  s1: "What is now written down",
  s1lead:
    "Judgment that existed only in someone's head, and now exists in your library — attributed, searchable, and yours.",
  anchorLead: (partial: boolean) =>
    partial ? "At least this much experience is now on the record" : "Experience now on the record",
  anchorTail:
    "That's the replacement cost you were carrying without a copy. What it's worth to you is your number to run — we don't estimate it.",

  s2: "What people asked for",
  s2lead: "Every question someone brought to the library, and whether the answer was there.",

  s3: "Where it changed what someone did",
  s3lead:
    "The hardest thing to claim, so it's the most guarded number here — confirmed outcomes only, never activity.",

  s4: "Disagreements you didn't know you had",
  s4lead:
    "Two experienced people giving opposite guidance on the same situation. Nobody was hiding it; nothing had ever put the two answers side by side.",

  s5: "What you asked for, and what came back",

  s6: "What this readout can't see",
  s6lead:
    "Read this first if you're deciding anything. It's the shortest honest description of the limits of everything above.",

  // ─── THE VALUE LEDGER, IN FULL (2026-08-06) ────────────────────────────
  // ⚠️ DRAFT — PENDING BRIAN. Brian's call, 2026-08-06: the ledger LIVES HERE.
  // There is no separate /ledger page; the readout is the one surface where an
  // org sees what it captured and what that cost to acquire.
  //
  // ⭐ ADDITIVE AND SUBORDINATE. It renders BELOW the years-of-judgment anchor,
  // never above, and only when the org has entered its own rates. The anchor
  // stays the headline of this page.
  //
  // The subtitle above still says "nothing on this page is estimated" — that
  // remains true: nothing here is estimated BY US. Every rate behind every
  // figure is one the customer typed, and the section says so out loud.
  ledgerTitle: "Value Ledger",
  ledgerLead:
    "What that judgment cost to acquire, and what it would cost to acquire again. Priced entirely with rates you entered. No saving is claimed anywhere on this page.",
  ledgerTiers: {
    realized: {
      name: "Realized",
      lead: "Things that measurably happened. Someone said an answer landed; a problem stopped coming back. This is the smallest number here and the one to argue about first.",
    },
    substitution: {
      name: "Substitution",
      lead: "Work you would otherwise have paid someone else to do. Priced at what it would cost to buy, not at what it saved you.",
    },
    modeled: {
      name: "Modeled",
      lead: "Exposure you are no longer carrying. Probabilistic by nature, so it is always a range and never a single number.",
    },
  },
  noRateShort: "no rate entered",
  enterRates: "Enter your rates",
  showWorkings: "Show what's behind this",
  hideWorkings: "Hide",
  nothingYet: "Nothing recorded in this tier yet.",
  assumptionsTitle: "Your numbers",
  assumptionsLead:
    "Every figure above is one of your quantities multiplied by one of these. Change one and the totals move. We never fill these in for you — a default would be us inventing your business.",
  save: "Save",
  saving: "Saving…",
  saved: "Saved",
  emptyTitle: "Your rates aren't in yet",
  emptyLead:
    "Everything below is already counted. It just doesn't carry a dollar figure until you say what your time and your incidents actually cost. Two minutes, and it's yours to change any time.",

  // Ledger caveats — appended to the readout's own "what this can't see"
  // section rather than given a second one. ONE limits block per page: two
  // teaches the reader that neither is important.
  limitNoSavings:
    "No saving is claimed anywhere on this page. Every ledger figure is an acquisition cost — what this cost to get, or what it would cost to get again.",
  limitModeled: (band: number) =>
    `Modeled figures are probabilistic and are shown as a ±${band}% range. They are not revenue, they are not cash, and they should never be added to the realized number.`,
  limitMissing: (names: string[]) =>
    `${names.length === 1 ? "One rate is" : `${names.length} rates are`} still blank — ${names.join(
      ", "
    )}. Anything that depends on ${names.length === 1 ? "it" : "them"} is counted but not priced.`,
  limitExcluded: (n: number) =>
    `${n} captured ${
      n === 1 ? "framework was" : "frameworks were"
    } too thin to value confidently and ${
      n === 1 ? "is" : "are"
    } excluded from every ledger total. Excluding them is deliberate — a guess would be worse.`,
  limitAppendOnly:
    "The ledger only ever adds. Editing a rate re-prices history, it never rewrites what happened or when.",

  early: "Early signal — too few observations to call this a pattern yet.",
  none: "Nothing recorded in this period.",
  proven: "Enough observations to describe this as a pattern.",
};
// ═════════════════════════════════════════════════════════════════════════════

type Contributor = {
  person_id: string;
  name: string;
  title: string | null;
  frameworks: number;
  years_experience: number | null;
};

type Readout = {
  org_name: string;
  period: { since: string | null; until: string };
  captured: {
    frameworks: number;
    contributors: Contributor[];
    people_on_account: number;
    years_of_judgment: number | null;
    years_is_partial: boolean;
    methods_used: number;
  };
  demand: {
    questions_asked: number;
    gaps_opened: number;
    gaps_filled: number;
    gaps_open_now: number;
    unanswered_asks: number;
    top_open: { question: string; asked_count: number }[];
    evidence: string;
  };
  applied: {
    retrieval_marked_useful: number;
    prescriptions_delivered: number;
    prescriptions_effective: number;
    prescriptions_escalated: number;
    training_generated: number;
    evidence: string;
    thin: boolean;
  };
  contested: {
    surfaced: number;
    resolved: number;
    open: number;
    examples: { a: string; b: string; status: string }[];
  };
  campaigns: {
    run: number;
    asks_sent: number;
    asks_captured: number;
    asks_declined: number;
    asks_outstanding: number;
  };
  still_dark: { people_yet_to_capture: number; gaps_unfilled: number; notes: string[] };
};

type AssumptionField = { key: string; label: string; unit: string; help: string };
type LedgerLine = {
  event_type: string;
  count: number;
  amount: number | null;
  unpriced: number;
  unscoreable: number;
  quantity_total: number | null;
  quantity_unit: string;
  missing_inputs: string[];
};
type Tier = {
  tier: "realized" | "substitution" | "modeled";
  total: number | null;
  low: number | null;
  high: number | null;
  events_total: number;
  events_priced: number;
  events_unpriced: number;
  events_unscoreable: number;
  lines: LedgerLine[];
};
type Ledger = {
  assumptions: Record<string, number | string | null>;
  has_rates: boolean;
  tiers: { realized: Tier; substitution: Tier; modeled: Tier };
  missing_rates: string[];
  excluded_unscoreable: number;
  total_events: number;
  modeled_band: number;
};
type LabelMap = Record<string, { label: string; quantityUnit: string; countUnit: string }>;

function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function compact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 1_000) return `$${Math.round(n / 1000)}K`;
  return `$${Math.round(n)}`;
}

function Stat({ n, label }: { n: number | string; label: string }) {
  return (
    <div style={styles.stat}>
      <div style={styles.statNum}>{n}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  );
}

export default function ReadoutPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Readout | null>(null);
  // null → the ledger could not be read at all. `has_rates: false` is the
  // different, expected day-one state: quantities render, dollars do not.
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [fields, setFields] = useState<AssumptionField[]>([]);
  const [labels, setLabels] = useState<LabelMap>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState<string | null>(null);
  const [gateError, setGateError] = useState<{ message: string; code?: string } | null>(null);
  const [since, setSince] = useState("");
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async (from: string) => {
    setLoading(true);
    try {
      const qs = from ? `?since=${from}&t=${Date.now()}` : `?t=${Date.now()}`;
      // Two reads, one page. The ledger is a separate endpoint so a failure in
      // it can never cost a champion their readout the week before a renewal
      // conversation — the ledger section simply doesn't render.
      const [res, ledgerRes] = await Promise.all([
        fetch(`/api/readout${qs}`, { cache: "no-store" }),
        fetch(`/api/ledger${qs}`, { cache: "no-store" }).catch(() => null),
      ]);
      const body = await res.json();
      if (ledgerRes && ledgerRes.ok) {
        const lb = await ledgerRes.json();
        setLedger((lb.ledger as Ledger) ?? null);
        setFields((lb.fields as AssumptionField[]) ?? []);
        setLabels((lb.labels as LabelMap) ?? {});
        // Seed the editor from the truth we just read, never from what we hoped
        // we had written.
        const a = (lb.ledger as Ledger | null)?.assumptions ?? {};
        const next: Record<string, string> = {};
        for (const f of (lb.fields as AssumptionField[]) ?? []) {
          const v = a[f.key];
          next[f.key] = typeof v === "number" ? String(v) : "";
        }
        setDraft(next);
      } else {
        setLedger(null);
      }
      if (!res.ok) {
        setGateError({ message: body.error || "Could not build the readout.", code: body.code });
        setData(null);
        setLedger(null);
        return;
      }
      setGateError(null);
      setData(body.readout as Readout);
    } catch {
      setGateError({ message: "Could not build the readout." });
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
      await load("");
    })();
  }, [router, load]);

  // ⭐ EVERY TOTAL RECOMPUTES FROM THE SERVER after an edit. The point of the
  // edit is that the CFO watches the number move; recomputing locally would be
  // a guess about our own arithmetic.
  async function saveField(key: string) {
    if (savingKey) return;
    setSavingKey(key);
    setSaveError(null);
    try {
      const raw = draft[key];
      const value = raw === undefined || raw.trim() === "" ? null : Number(raw);
      const res = await fetch("/api/ledger/assumptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      const body = await res.json();
      if (!res.ok) {
        setSaveError(body.error || "Could not save that.");
        return;
      }
      setJustSaved(key);
      setTimeout(() => setJustSaved((k) => (k === key ? null : k)), 1800);
      await load(since);
    } catch {
      setSaveError("Could not save that.");
    } finally {
      setSavingKey(null);
    }
  }

  function download() {
    setDownloading(true);
    const qs = since ? `?since=${since}` : "";
    // A plain navigation rather than fetch+blob: the browser handles the
    // Content-Disposition download natively, and a failed PDF then shows the
    // route's own JSON error instead of failing silently behind a spinner.
    window.location.href = `/api/readout/pdf${qs}`;
    setTimeout(() => setDownloading(false), 2500);
  }

  // ⭐ DERIVED FROM THE SAME EXPRESSIONS THAT DECIDE WHAT RENDERS. Nothing here
  // fires unless the thing it describes is actually on the page — which matters
  // most in the empty state, the state every new pilot is in on day one.
  const ledgerLimits: string[] = [];
  if (ledger) {
    ledgerLimits.push(COPY.limitNoSavings);
    if (ledger.tiers.modeled.low !== null) {
      ledgerLimits.push(COPY.limitModeled(Math.round(ledger.modeled_band * 100)));
    }
    const missingNames = ledger.missing_rates
      .map((k) => fields.find((f) => f.key === k)?.label ?? k)
      .sort();
    if (missingNames.length > 0) ledgerLimits.push(COPY.limitMissing(missingNames));
    if (ledger.excluded_unscoreable > 0) {
      ledgerLimits.push(COPY.limitExcluded(ledger.excluded_unscoreable));
    }
    ledgerLimits.push(COPY.limitAppendOnly);
  }

  if (checking) {
    return (
      <div style={styles.center}>
        <p>Loading…</p>
      </div>
    );
  }

  if (!loading && gateError) {
    return (
      <div style={styles.wrapper}>
        <div style={styles.container}>
          <div style={{ marginBottom: 18 }}>
            <BrandHeader />
          </div>
          <h1 style={styles.title}>{COPY.title}</h1>
          <div style={styles.emptyCard}>
            {gateError.code === "NO_ORG" ? COPY.noOrg : COPY.notViewer}
          </div>
          <a href="/dashboard" style={styles.backLink}>
            ← Back to dashboard
          </a>
        </div>
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
          <h1 style={styles.title}>📊 {COPY.title}</h1>
          <a href="/dashboard" style={styles.headerLink}>
            ← Dashboard
          </a>
        </div>
        <p style={styles.subtitle}>{COPY.subtitle}</p>

        <div style={styles.controls}>
          <label style={styles.rangeLabel}>
            {COPY.rangeLabel}
            <input
              style={styles.input}
              type="date"
              value={since}
              onChange={(e) => {
                setSince(e.target.value);
                load(e.target.value);
              }}
            />
          </label>
          <span style={styles.rangeNote}>{since ? "" : COPY.rangeAll}</span>
          <button type="button" style={styles.primaryButton} disabled={downloading} onClick={download}>
            {downloading ? COPY.building : `⬇ ${COPY.download}`}
          </button>
        </div>

        {loading && <p style={styles.help}>Building it…</p>}

        {data && (
          <>
            <p style={styles.orgLine}>{data.org_name}</p>

            {/* ─── 1 ─── */}
            <div style={styles.card}>
              <h2 style={styles.h2}>{COPY.s1}</h2>
              <p style={styles.lead}>{COPY.s1lead}</p>

              {data.captured.years_of_judgment !== null &&
                data.captured.contributors.length > 0 && (
                <div style={styles.anchor}>
                  <div style={styles.anchorNum}>
                    {data.captured.years_is_partial ? "≥" : ""}
                    {data.captured.years_of_judgment} years
                  </div>
                  <div style={styles.anchorLead}>
                    {COPY.anchorLead(data.captured.years_is_partial)} — across{" "}
                    {data.captured.contributors.length}{" "}
                    {data.captured.contributors.length === 1 ? "person" : "people"}.
                  </div>
                  <div style={styles.anchorTail}>{COPY.anchorTail}</div>
                </div>
              )}

              <div style={styles.statRow}>
                <Stat n={data.captured.frameworks} label="frameworks captured" />
                <Stat n={data.captured.contributors.length} label="people contributed" />
                <Stat n={data.captured.methods_used} label="elicitation methods used" />
                <Stat n={data.captured.people_on_account} label="people on the account" />
              </div>

              {data.captured.contributors.map((p) => (
                <div key={p.person_id} style={styles.contribRow}>
                  <span style={styles.contribName}>{p.name}</span>
                  <span style={styles.contribTitle}>{p.title ?? ""}</span>
                  <span style={styles.contribNum}>{p.frameworks}</span>
                </div>
              ))}
            </div>

            {/* ═══ THE VALUE LEDGER — below the anchor, always. ═══
                Brian's call 2026-08-06: the ledger lives on the readout, not on
                a page of its own. Realized on top and loudest though it is the
                smallest figure; modeled last, quietest, and ALWAYS a range. */}
            {ledger && (
              <div style={styles.card}>
                <h2 style={styles.h2}>📒 {COPY.ledgerTitle}</h2>
                <p style={styles.lead}>{COPY.ledgerLead}</p>

                {/* The no-rates state — where every new pilot starts on day one.
                    Dignified and self-explanatory, never a row of dashes. */}
                {!ledger.has_rates && (
                  <div style={styles.ledgerEmpty}>
                    <div style={styles.ledgerEmptyTitle}>{COPY.emptyTitle}</div>
                    <p style={styles.ledgerEmptyLead}>{COPY.emptyLead}</p>
                    <a href="#your-numbers" style={styles.ledgerEmptyCta}>
                      {COPY.enterRates} →
                    </a>
                  </div>
                )}

                <TierBlock
                  tier={ledger.tiers.realized}
                  name={COPY.ledgerTiers.realized.name}
                  lead={COPY.ledgerTiers.realized.lead}
                  labels={labels}
                  fields={fields}
                  variant="loud"
                  open={!!open.realized}
                  onToggle={() => setOpen((o) => ({ ...o, realized: !o.realized }))}
                />
                <TierBlock
                  tier={ledger.tiers.substitution}
                  name={COPY.ledgerTiers.substitution.name}
                  lead={COPY.ledgerTiers.substitution.lead}
                  labels={labels}
                  fields={fields}
                  variant="mid"
                  open={!!open.substitution}
                  onToggle={() => setOpen((o) => ({ ...o, substitution: !o.substitution }))}
                />
                <TierBlock
                  tier={ledger.tiers.modeled}
                  name={COPY.ledgerTiers.modeled.name}
                  lead={COPY.ledgerTiers.modeled.lead}
                  labels={labels}
                  fields={fields}
                  variant="quiet"
                  band={ledger.modeled_band}
                  probability={
                    typeof ledger.assumptions.annual_departure_probability === "number"
                      ? (ledger.assumptions.annual_departure_probability as number)
                      : null
                  }
                  open={!!open.modeled}
                  onToggle={() => setOpen((o) => ({ ...o, modeled: !o.modeled }))}
                />

                {/* ⭐ EVERY FIGURE OPENS ITS INPUTS, AND THE INPUTS ARE EDITABLE
                    IN PLACE. A CFO who disagrees with $118/hr changes it and
                    argues with their own model instead of with us. */}
                <div id="your-numbers" style={styles.numbersBlock}>
                  <h3 style={styles.numbersTitle}>{COPY.assumptionsTitle}</h3>
                  <p style={styles.lead}>{COPY.assumptionsLead}</p>
                  {saveError && <div style={styles.saveError}>{saveError}</div>}
                  {fields.map((f) => (
                    <div key={f.key} style={styles.fieldRow}>
                      <div style={styles.fieldMeta}>
                        <span style={styles.fieldLabel}>{f.label}</span>
                        <span style={styles.fieldHelp}>{f.help}</span>
                      </div>
                      <div style={styles.fieldControls}>
                        <input
                          style={styles.numberInput}
                          type="number"
                          inputMode="decimal"
                          placeholder={COPY.noRateShort}
                          value={draft[f.key] ?? ""}
                          onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveField(f.key);
                          }}
                        />
                        <span style={styles.fieldUnit}>{f.unit}</span>
                        <button
                          type="button"
                          style={styles.saveButton}
                          disabled={savingKey === f.key}
                          onClick={() => saveField(f.key)}
                        >
                          {savingKey === f.key
                            ? COPY.saving
                            : justSaved === f.key
                              ? COPY.saved
                              : COPY.save}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ─── 2 ─── */}
            <div style={styles.card}>
              <h2 style={styles.h2}>{COPY.s2}</h2>
              <p style={styles.lead}>{COPY.s2lead}</p>
              <div style={styles.statRow}>
                <Stat n={data.demand.questions_asked} label="questions brought to the library" />
                <Stat n={data.demand.gaps_filled} label="unanswered questions since answered" />
                <Stat n={data.demand.gaps_open_now} label="still with no captured answer" />
                <Stat n={data.demand.unanswered_asks} label="times someone hit one and found nothing" />
              </div>
              {data.demand.top_open.map((g, i) => (
                <p key={i} style={styles.bullet}>
                  &ldquo;{g.question}&rdquo; — asked {g.asked_count}×, still open
                </p>
              ))}
            </div>

            {/* ─── 3 ─── */}
            <div style={styles.card}>
              <h2 style={styles.h2}>{COPY.s3}</h2>
              <p style={styles.lead}>{COPY.s3lead}</p>
              <div style={styles.statRow}>
                <Stat n={data.applied.retrieval_marked_useful} label="times a retrieved framework was marked useful" />
                <Stat n={data.applied.prescriptions_effective} label="interventions the problem stopped recurring after" />
                <Stat n={data.applied.prescriptions_escalated} label="that didn't land and were redesigned" />
                <Stat n={data.applied.training_generated} label="training pieces built from your own experts" />
              </div>
              {data.applied.thin && (
                <div style={styles.caveat}>
                  {data.applied.evidence === "none" ? COPY.none : COPY.early}
                </div>
              )}
            </div>

            {/* ─── 4 ─── */}
            <div style={styles.card}>
              <h2 style={styles.h2}>{COPY.s4}</h2>
              <p style={styles.lead}>{COPY.s4lead}</p>
              <div style={styles.statRow}>
                <Stat n={data.contested.surfaced} label="contested calls surfaced" />
                <Stat n={data.contested.resolved} label="settled on the record" />
                <Stat n={data.contested.open} label="still open, both sides visible" />
              </div>
              {data.contested.examples.map((e, i) => (
                <p key={i} style={styles.bullet}>
                  &ldquo;{e.a}&rdquo; vs &ldquo;{e.b}&rdquo; — {e.status}
                </p>
              ))}
            </div>

            {/* ─── 5 ─── */}
            {data.campaigns.run > 0 && (
              <div style={styles.card}>
                <h2 style={styles.h2}>{COPY.s5}</h2>
                <div style={styles.statRow}>
                  <Stat n={data.campaigns.asks_sent} label="specific questions put to specific people" />
                  <Stat n={data.campaigns.asks_captured} label="answered with a captured framework" />
                  <Stat n={data.campaigns.asks_declined} label="redirected to someone better placed" />
                  <Stat n={data.campaigns.asks_outstanding} label="still outstanding" />
                </div>
              </div>
            )}

            {/* ─── 6 ─── */}
            <div style={styles.darkCard}>
              <h2 style={styles.h2}>{COPY.s6}</h2>
              <p style={styles.lead}>{COPY.s6lead}</p>
              {data.still_dark.notes.map((n, i) => (
                <p key={i} style={styles.caveatLine}>
                  • {n}
                </p>
              ))}
              {data.still_dark.people_yet_to_capture > 0 && (
                <p style={styles.caveatLine}>
                  • {data.still_dark.people_yet_to_capture} of the {data.captured.people_on_account}{" "}
                  people on the account haven&apos;t captured anything yet. Their judgment is still
                  only in their heads.
                </p>
              )}
              {/* ⭐ THE LEDGER'S CAVEATS LAND HERE, not in a second block of
                  their own. Two limits sections on one page teaches the reader
                  that neither matters. Each line is guarded by the SAME
                  expression that decides whether the thing it describes
                  rendered above — the standing fix for a caveat pointing at a
                  number that is not on the page. */}
              {ledgerLimits.map((l, i) => (
                <p key={`lg-${i}`} style={styles.caveatLine}>
                  • {l}
                </p>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ⭐⭐ MODELED RENDERS low–high AND NEVER `total`. The point estimate exists in
// the payload for arithmetic; it must not reach the screen. A point estimate on
// a modeled figure is the single thing that kills this page's credibility, and
// it only has to be caught once.
function TierBlock({
  tier,
  name,
  lead,
  labels,
  fields,
  variant,
  band,
  probability,
  open,
  onToggle,
}: {
  tier: Tier;
  name: string;
  lead: string;
  labels: LabelMap;
  fields: AssumptionField[];
  variant: "loud" | "mid" | "quiet";
  band?: number;
  probability?: number | null;
  open: boolean;
  onToggle: () => void;
}) {
  const isModeled = tier.tier === "modeled";
  const numStyle =
    variant === "loud" ? styles.numLoud : variant === "mid" ? styles.numMid : styles.numQuiet;
  const rowStyle =
    variant === "loud" ? styles.tierLoud : variant === "mid" ? styles.tierMid : styles.tierQuiet;

  const figure = isModeled
    ? tier.low !== null && tier.high !== null
      ? `${compact(tier.low)} – ${compact(tier.high)}`
      : null
    : tier.total !== null
      ? money(tier.total)
      : null;

  return (
    <div style={rowStyle}>
      <div style={styles.tierHead}>
        <span style={styles.tierName}>{name}</span>
        {/* The figure IS the control: clicking it opens its inputs. */}
        <button type="button" style={styles.figureButton} onClick={onToggle}>
          <span style={numStyle}>{figure ?? COPY.noRateShort}</span>
        </button>
      </div>
      <p style={styles.tierLead}>{lead}</p>

      {/* Modeled shows its probability input INLINE, not in a footnote. */}
      {isModeled && (
        <p style={styles.inlineInputs}>
          {probability !== null && probability !== undefined
            ? `Using your ${(probability * 100).toFixed(0)}% annual departure probability`
            : "No departure probability entered yet"}
          {band ? ` · ±${Math.round(band * 100)}% band` : ""}
        </p>
      )}

      {tier.events_total === 0 ? (
        <p style={styles.tierEmpty}>{COPY.nothingYet}</p>
      ) : (
        <>
          <button type="button" style={styles.linkButton} onClick={onToggle}>
            {open ? COPY.hideWorkings : COPY.showWorkings}
          </button>
          {open && (
            <div style={styles.lines}>
              {tier.lines.map((l) => (
                <div key={l.event_type} style={styles.lineRow}>
                  <div style={styles.lineTop}>
                    <span style={styles.lineLabel}>
                      {labels[l.event_type]?.label ?? l.event_type}
                    </span>
                    <span style={styles.lineAmount}>
                      {l.amount !== null ? money(l.amount) : COPY.noRateShort}
                    </span>
                  </div>
                  {/* ⭐ THE QUANTITY IS ALWAYS SHOWN, priced or not. With no rate
                      entered this line is the whole point of the section. */}
                  <p style={styles.lineQuantity}>
                    {l.count} {labels[l.event_type]?.countUnit ?? "events"}
                    {l.quantity_total !== null ? ` · ${l.quantity_total} ${l.quantity_unit}` : ""}
                  </p>
                  {l.missing_inputs.length > 0 && (
                    <p style={styles.lineMissing}>
                      Needs:{" "}
                      {l.missing_inputs
                        .map((k) => fields.find((f) => f.key === k)?.label ?? k)
                        .join(", ")}
                      .{" "}
                      <a href="#your-numbers" style={styles.inlineLink}>
                        {COPY.enterRates} →
                      </a>
                    </p>
                  )}
                  {l.unscoreable > 0 && (
                    <p style={styles.lineMissing}>
                      {l.unscoreable} excluded — too thin to value confidently.
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { minHeight: "100vh", fontFamily: "var(--font-sans)" },
  container: { maxWidth: 860, margin: "0 auto", padding: "40px 24px 80px" },
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
  subtitle: { color: "var(--muted)", fontSize: "14px", margin: "6px 0 18px", lineHeight: 1.55 },
  orgLine: { fontSize: "15px", fontWeight: 700, color: "var(--pine)", margin: "0 0 14px" },
  controls: {
    display: "flex",
    alignItems: "flex-end",
    gap: 14,
    flexWrap: "wrap",
    marginBottom: 20,
  },
  rangeLabel: {
    display: "flex",
    flexDirection: "column",
    gap: 5,
    fontSize: "12px",
    fontWeight: 600,
    color: "var(--pine-soft)",
  },
  rangeNote: { fontSize: "12px", color: "var(--muted)", paddingBottom: 10 },
  input: {
    padding: "9px 11px",
    fontSize: "14px",
    borderRadius: 8,
    border: "1px solid var(--line)",
    fontFamily: "inherit",
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
    padding: "10px 18px",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  card: {
    background: "var(--white)",
    border: "1px solid var(--line)",
    borderRadius: 14,
    padding: "20px 22px 22px",
    marginBottom: 16,
  },
  darkCard: {
    background: "var(--warn-bg)",
    border: "1px solid var(--warn-border)",
    borderRadius: 14,
    padding: "20px 22px 22px",
    marginBottom: 16,
  },
  emptyCard: {
    background: "var(--white)",
    border: "1px dashed var(--line)",
    borderRadius: 14,
    padding: "26px 24px",
    fontSize: "14px",
    color: "var(--pine-soft)",
    lineHeight: 1.6,
    marginBottom: 16,
  },
  h2: { fontSize: "17px", margin: "0 0 6px" },
  lead: { fontSize: "13px", color: "var(--muted)", margin: "0 0 16px", lineHeight: 1.6 },
  help: { fontSize: "13px", color: "var(--muted)" },
  anchor: {
    background: "var(--growth-soft)",
    borderLeft: "3px solid var(--growth)",
    borderRadius: 8,
    padding: "16px 18px",
    marginBottom: 18,
  },
  anchorNum: { fontSize: "30px", fontWeight: 700, color: "var(--pine)", fontFamily: "var(--font-serif)" },
  anchorLead: { fontSize: "13px", color: "var(--growth-deep)", fontWeight: 600, marginTop: 4 },
  anchorTail: { fontSize: "12px", color: "var(--muted)", marginTop: 8, lineHeight: 1.55 },
  // ─── VALUE LEDGER (2026-08-06) ─────────────────────────────────────────
  // Realized loudest, modeled quietest. The inversion IS the credibility play,
  // not a styling accident: a skeptic reading top-down meets the honest number
  // first. Do not "fix" it.
  tierLoud: {
    background: "var(--white)",
    border: "2px solid var(--growth)",
    borderRadius: 12,
    padding: "18px 20px 16px",
    marginBottom: 12,
  },
  tierMid: {
    background: "var(--white)",
    border: "1px solid var(--line)",
    borderRadius: 12,
    padding: "14px 18px",
    marginBottom: 12,
  },
  tierQuiet: {
    background: "var(--paper-2)",
    border: "1px solid var(--line)",
    borderRadius: 12,
    padding: "12px 16px 14px",
    marginBottom: 16,
  },
  tierHead: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  tierName: {
    fontSize: "11.5px",
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--pine-soft)",
  },
  figureButton: {
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
    fontFamily: "inherit",
    textAlign: "right",
  },
  numLoud: {
    fontSize: "40px",
    fontWeight: 800,
    lineHeight: 1.05,
    color: "var(--pine)",
    fontFamily: "var(--font-serif)",
  },
  numMid: {
    fontSize: "26px",
    fontWeight: 700,
    lineHeight: 1.1,
    color: "var(--pine)",
    fontFamily: "var(--font-serif)",
  },
  numQuiet: {
    fontSize: "18px",
    fontWeight: 600,
    lineHeight: 1.15,
    color: "var(--pine-soft)",
    fontFamily: "var(--font-serif)",
  },
  tierLead: { fontSize: "12.5px", color: "var(--muted)", margin: "6px 0 0", lineHeight: 1.55 },
  inlineInputs: { fontSize: "11.5px", color: "var(--pine-soft)", margin: "6px 0 0", fontWeight: 600 },
  tierEmpty: { fontSize: "12px", color: "var(--muted)", margin: "8px 0 0", fontStyle: "italic" },
  linkButton: {
    marginTop: 8,
    padding: 0,
    fontSize: "12.5px",
    fontWeight: 600,
    color: "var(--growth)",
    background: "none",
    border: "none",
    cursor: "pointer",
    textDecoration: "underline",
    fontFamily: "inherit",
  },
  lines: { marginTop: 8, display: "flex", flexDirection: "column" },
  lineRow: { borderTop: "1px solid var(--line)", padding: "9px 0 7px" },
  lineTop: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 },
  lineLabel: { fontSize: "13px", fontWeight: 700, color: "var(--pine)" },
  lineAmount: { fontSize: "13px", fontWeight: 700, color: "var(--pine)" },
  lineQuantity: { fontSize: "11.5px", color: "var(--muted)", margin: "3px 0 0", lineHeight: 1.5 },
  lineMissing: { fontSize: "11.5px", color: "var(--warn-text)", margin: "3px 0 0", lineHeight: 1.5 },
  inlineLink: { color: "var(--growth)", fontWeight: 600, textDecoration: "none" },
  ledgerEmpty: {
    background: "var(--growth-soft)",
    borderLeft: "3px solid var(--growth)",
    borderRadius: 8,
    padding: "13px 15px",
    marginBottom: 14,
  },
  ledgerEmptyTitle: { fontSize: "14px", fontWeight: 700, color: "var(--growth-deep)" },
  ledgerEmptyLead: { fontSize: "12.5px", color: "var(--pine-soft)", margin: "5px 0 8px", lineHeight: 1.55 },
  ledgerEmptyCta: { fontSize: "12.5px", fontWeight: 700, color: "var(--growth-deep)", textDecoration: "none" },
  numbersBlock: { borderTop: "1px solid var(--line)", marginTop: 6, paddingTop: 14 },
  numbersTitle: { fontSize: "15px", margin: "0 0 6px", color: "var(--pine)" },
  saveError: {
    background: "var(--warn-bg)",
    border: "1px solid var(--warn-border)",
    color: "var(--warn-text)",
    borderRadius: 8,
    padding: "9px 11px",
    fontSize: "12.5px",
    marginBottom: 10,
  },
  fieldRow: {
    borderTop: "1px solid var(--line)",
    padding: "11px 0",
    display: "flex",
    gap: 14,
    alignItems: "flex-start",
    justifyContent: "space-between",
    flexWrap: "wrap",
  },
  fieldMeta: { display: "flex", flexDirection: "column", gap: 3, flex: "1 1 240px" },
  fieldLabel: { fontSize: "13px", fontWeight: 700, color: "var(--pine)" },
  fieldHelp: { fontSize: "11.5px", color: "var(--muted)", lineHeight: 1.5 },
  fieldControls: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  numberInput: {
    width: 110,
    padding: "8px 10px",
    fontSize: "14px",
    borderRadius: 8,
    border: "1px solid var(--line)",
    fontFamily: "inherit",
    color: "var(--pine)",
    background: "var(--white)",
  },
  fieldUnit: { fontSize: "11px", color: "var(--muted)", minWidth: 84 },
  saveButton: {
    fontSize: "12.5px",
    fontWeight: 600,
    color: "var(--white)",
    background: "var(--growth)",
    border: "none",
    borderRadius: 8,
    padding: "7px 13px",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  statRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 14,
    marginBottom: 14,
  },
  stat: {},
  statNum: { fontSize: "26px", fontWeight: 700, color: "var(--pine)", fontFamily: "var(--font-serif)" },
  statLabel: { fontSize: "11px", color: "var(--muted)", lineHeight: 1.4, marginTop: 2 },
  contribRow: {
    display: "flex",
    gap: 12,
    alignItems: "baseline",
    borderTop: "1px solid var(--line)",
    padding: "7px 0",
  },
  contribName: { fontSize: "13px", fontWeight: 700, color: "var(--pine)", flex: "0 0 160px" },
  contribTitle: { fontSize: "12px", color: "var(--muted)", flex: 1 },
  contribNum: { fontSize: "13px", fontWeight: 700, color: "var(--pine)" },
  bullet: { fontSize: "12px", color: "var(--pine-soft)", margin: "0 0 5px", lineHeight: 1.55 },
  caveat: {
    background: "var(--warn-bg)",
    border: "1px solid var(--warn-border)",
    color: "var(--warn-text)",
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: "12px",
    lineHeight: 1.5,
  },
  caveatLine: { fontSize: "12.5px", color: "var(--warn-text)", margin: "0 0 6px", lineHeight: 1.55 },
  backLink: { fontSize: "13px", color: "var(--muted)", textDecoration: "none" },
};
