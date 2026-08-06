'use client';

// Logged-in hub. Step 4 adds the profile-verification card; Steps 6 & 7 add
// the query-gap banner and the credibility score here.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { badgeForScore } from '@/lib/insight-score';
import { HIDE_TRACK_A } from '@/lib/demo-scope';
import BrandHeader from '@/components/BrandHeader';

const supabase = createClient();

type Flag = 'consistent' | 'partial_mismatch' | 'no_linkedin_provided';

type Profile = {
  linkedin_url: string | null;
  verification_flag: Flag;
  verification_notes: string | null;
  verification_checked_at: string | null;
};

type QueryGap = {
  id: string;
  question_text: string;
  gap_type: 'coverage' | 'case_evidence_missing';
  gap_description: string | null;
};

// Phase 8 (Block 2) — an approved insight that contradicts an established
// pattern. Approved normally, but earns no credibility until the expert explains
// what changed (and that explanation clears the belief-revision depth gate).
type NeedsContext = {
  id: string;
  content: string;
  contradiction_note: string | null;
};

type Credibility = {
  overall_score: number;
  source_diversity_pct: number;
  high_confidence_pct: number;
  applied_evidence_ratio: number;
  avg_trust_tier: number;
  last_calculated_at: string | null;
};

// Phase 8 (Blocks 1 + 5) — per-insight portfolio strength + monthly growth trend.
type GrowthSnapshot = {
  snapshot_month: string;
  combined_avg: number;
  growth_value: number;
  approved_count: number;
};

const BADGE_STYLE: Record<string, { bg: string; fg: string }> = {
  Emerging: { bg: 'rgba(255,255,255,0.14)', fg: 'var(--on-dark-soft)' },
  Rising: { bg: 'var(--growth-soft)', fg: 'var(--growth-deep)' },
  Verified: { bg: 'var(--ok-bg)', fg: 'var(--ok-text)' },
  Elite: { bg: 'var(--warn-bg)', fg: 'var(--warn-text)' },
};

const BADGE: Record<Flag, { label: string; bg: string; fg: string; border: string; emoji: string }> = {
  consistent: { label: 'Verified via LinkedIn', bg: 'var(--ok-bg)', fg: 'var(--ok-text)', border: 'var(--ok-border)', emoji: '✓' },
  partial_mismatch: { label: 'Some details didn’t line up', bg: 'var(--warn-bg)', fg: 'var(--warn-text)', border: 'var(--warn-border)', emoji: '⚠' },
  no_linkedin_provided: { label: 'Not verified yet', bg: 'var(--paper-2)', fg: 'var(--muted)', border: 'var(--line)', emoji: '—' },
};

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [gaps, setGaps] = useState<QueryGap[]>([]);
  const [score, setScore] = useState<Credibility | null>(null);
  const [scoreLoading, setScoreLoading] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [snapshots, setSnapshots] = useState<GrowthSnapshot[]>([]);
  const [growthLoading, setGrowthLoading] = useState(false);
  const [needsContext, setNeedsContext] = useState<NeedsContext[]>([]);
  // T1B1 — is this person the account's admin? Read off their OWN profile row
  // (the "own profile read" policy allows it), so this costs no extra route
  // and cannot report an authority the database wouldn't also grant.
  const [isOrgAdmin, setIsOrgAdmin] = useState(false);
  const [hasOrg, setHasOrg] = useState(true);
  // T1B2 — capture campaigns.
  const [canRunCampaigns, setCanRunCampaigns] = useState(false);
  // Exposure + Ledger (2026-08-06) — manager OR admin OR an executive seat.
  // One rung wider than the readout gate, matching requireExposureViewer /
  // requireLedgerViewer in Postgres-terms: the readout is what a champion
  // forwards OUT, these are what leadership uses INSIDE. Hidden, never locked.
  const [canSeeExposure, setCanSeeExposure] = useState(false);
  // Floor Guide Phase A — the role ladder + the onboarding state.
  const [isContributor, setIsContributor] = useState(false);
  const [floorGuideActive, setFloorGuideActive] = useState(false);
  const [openAsks, setOpenAsks] = useState(0);
  // ─── "Needs attention" strip (dashboard simplification, 2026-08-04) ───
  // Every count here is a SECOND RENDERER of data an existing, verified
  // endpoint already serves — the strip adds zero new count queries:
  //   openGapsCount   ← /api/gaps            (the gaps queue's own payload)
  //   gapAnswers      ← /api/gaps/mine       (GapBadge's exact data path)
  //   openAsks        ← /api/requests/mine   (CaptureRequestBadge's path)
  //   ideasWaiting    ← /api/insights        (the review queue's own counts)
  // Each item skips rendering independently at zero; the whole strip renders
  // NOTHING when every count is zero (the existing tile doctrine: a
  // permanently-visible empty queue teaches people to stop looking).
  const [openGapsCount, setOpenGapsCount] = useState(0);
  const [gapAnswers, setGapAnswers] = useState(0);
  const [ideasWaiting, setIdeasWaiting] = useState(0);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      await Promise.all([loadProfile(), loadGaps(), loadScore(), loadGrowth(), loadNeedsContext(), loadAdminFlag(), loadStrip()]);
      setLoading(false);
    })();
  }, [router]);

  // Role-based onboarding — route a brand-new seat to their track's welcome
  // tour ONCE. /api/welcome answers needsOnboarding=true only when this person
  // has never seen (or been exempted from) their OWN track; every seat that
  // existed before the feature shipped was backfilled complete by
  // supabase/role-onboarding.sql, so existing users and the AWIP demo are
  // never hijacked. /welcome records "seen" the moment it loads, so this can
  // fire at most once per person.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/welcome', { cache: 'no-store' });
        if (!res.ok) return;
        const j = await res.json();
        if (!cancelled && j?.needsOnboarding) router.replace('/welcome');
      } catch {
        // Never block the dashboard on the tour check.
      }
    })();
    return () => { cancelled = true; };
  }, [router]);

  async function loadAdminFlag() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('is_org_admin, org_id, role, persona, floor_guide_active, deactivated_at')
      .eq('id', user.id)
      .maybeSingle();
    const row = data as {
      is_org_admin: boolean | null;
      org_id: string | null;
      role: string | null;
      persona: string | null;
      floor_guide_active: boolean | null;
      deactivated_at: string | null;
    } | null;
    setIsOrgAdmin(!!row?.is_org_admin);
    setHasOrg(!!row?.org_id);
    // Own-row read, so this is the same answer the SECURITY DEFINER functions
    // give — it decides what to OFFER, never what is permitted. The real gates
    // are is_contributor() / is_floor_guide_active() in Postgres and the
    // pattern_records trigger behind them.
    setIsContributor(row?.role === 'contributor');
    setFloorGuideActive(!!row?.floor_guide_active && !row?.deactivated_at);

    // T1B2 — can this person run a capture campaign? Manager OR admin, both
    // evaluated by Postgres as the caller (SECURITY DEFINER), so the tile is
    // never offered to somebody the API would refuse.
    const [{ data: mgr }, { data: adm }] = await Promise.all([
      supabase.rpc('is_manager'),
      supabase.rpc('is_org_admin'),
    ]);
    setCanRunCampaigns(mgr === true || adm === true);
    // The exec seat is `persona`, not `role` — the same signal resolveTrackKey()
    // uses to route the executive onboarding track.
    setCanSeeExposure(mgr === true || adm === true || row?.persona === 'exec');

    try {
      const res = await fetch('/api/requests/mine?count=1');
      if (res.ok) {
        const body = await res.json();
        if (typeof body?.open === 'number') setOpenAsks(body.open);
      }
    } catch {
      // non-fatal: the strip item just doesn't appear
    }

    // Strip: ideas waiting for review — admin only, and only fetched for
    // admins (the endpoint is the review queue's own GET; its counts.waiting
    // is already verified data). Same badge discipline: silent on failure.
    if (row?.is_org_admin) {
      try {
        const res = await fetch('/api/insights');
        if (res.ok) {
          const body = await res.json();
          if (typeof body?.counts?.waiting === 'number') setIdeasWaiting(body.counts.waiting);
        }
      } catch {
        // non-fatal: the strip item just doesn't appear
      }
    }
  }

  // ─── "Needs attention" strip loads (2026-08-04) ───
  // Reuses the EXISTING endpoints end to end — see the state block comment.
  async function loadStrip() {
    // Open gaps: the same payload the /gaps queue page renders (default fetch
    // already excludes resolved rows, so the length IS the open count).
    try {
      const res = await fetch('/api/gaps');
      if (res.ok) {
        const body = await res.json();
        if (body?.org === true && Array.isArray(body.gaps)) setOpenGapsCount(body.gaps.length);
      }
    } catch {
      // non-fatal: the strip item just doesn't appear
    }
    // New answers for you: GapBadge's exact data path.
    try {
      const res = await fetch('/api/gaps/mine?count=1');
      if (res.ok) {
        const body = await res.json();
        if (typeof body?.unread === 'number') setGapAnswers(body.unread);
      }
    } catch {
      // non-fatal: the strip item just doesn't appear
    }
  }

  async function loadNeedsContext() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('insights')
      .select('id, content, contradiction_note')
      .eq('user_id', user.id)
      .eq('needs_explanation', true)
      .order('created_at', { ascending: false });
    setNeedsContext((data as NeedsContext[]) || []);
  }

  // An explanation was submitted for one flagged insight — drop it from the list.
  function clearNeedsContext(id: string) {
    setNeedsContext((prev) => prev.filter((n) => n.id !== id));
  }

  async function loadGrowth() {
    try {
      const res = await fetch('/api/growth');
      if (!res.ok) return;
      const data = await res.json();
      setSnapshots((data.snapshots as GrowthSnapshot[]) || []);
    } catch {
      // non-fatal: growth trend is additive
    }
  }

  // Retroactively score every approved insight (Block 1) then recompute this
  // month's growth snapshot (Block 5), and reload the trend.
  async function refreshGrowth() {
    if (growthLoading) return;
    setGrowthLoading(true);
    try {
      await fetch('/api/score-insights', { method: 'POST' });
      await fetch('/api/growth', { method: 'POST' });
      await loadGrowth();
    } catch {
      // leave existing trend in place on failure
    } finally {
      setGrowthLoading(false);
    }
  }

  async function loadScore() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('credibility_scores')
      .select('overall_score, source_diversity_pct, high_confidence_pct, applied_evidence_ratio, avg_trust_tier, last_calculated_at')
      .eq('user_id', user.id)
      .maybeSingle();
    if (data) setScore(data as Credibility);
  }

  async function recalcScore() {
    if (scoreLoading) return;
    setScoreLoading(true);
    try {
      const res = await fetch('/api/credibility', { method: 'POST' });
      const data = await res.json();
      if (res.ok) setScore({ ...data, last_calculated_at: new Date().toISOString() });
    } catch {
      // leave existing score in place on failure
    } finally {
      setScoreLoading(false);
    }
  }

  async function loadGaps() {
    const { data } = await supabase
      .from('query_gaps')
      .select('id, question_text, gap_type, gap_description')
      .eq('resolved', false)
      .order('created_at', { ascending: false })
      .limit(3);
    setGaps((data as QueryGap[]) || []);
  }

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('linkedin_url, verification_flag, verification_notes, verification_checked_at')
      .eq('id', user.id)
      .single();
    if (data) {
      setProfile(data as Profile);
      setUrl(data.linkedin_url || '');
      setShowForm(data.verification_flag === 'no_linkedin_provided');
    }
  }

  async function verify() {
    if (verifying) return;
    if (!url.trim() && !text.trim()) {
      setMessage('Add your LinkedIn URL or paste your profile text.');
      return;
    }
    setVerifying(true);
    setMessage(null);
    try {
      const res = await fetch('/api/verify-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkedinUrl: url.trim() || null, linkedinText: text.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || 'Verification failed. Try again.');
      } else {
        if (data.message) setMessage(data.message);
        await loadProfile();
        if (data.flag !== 'no_linkedin_provided') { setShowForm(false); setText(''); }
      }
    } catch {
      setMessage('Verification failed. Try again.');
    } finally {
      setVerifying(false);
    }
  }

  if (loading) {
    return (
      <div style={styles.center}><p>Loading…</p></div>
    );
  }

  const flag: Flag = profile?.verification_flag ?? 'no_linkedin_provided';
  const badge = BADGE[flag];

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        <BrandHeader />
        <div style={styles.titleRow}>
          <h1 style={styles.title}>Your Dashboard</h1>
          <div style={styles.headerLinks}>
            {/* Dashboard simplification (2026-08-04): the admin console and
                the value readout lost their tiles in the 4-card collapse but
                keep quiet doors here — small header links, role-hidden, so
                "exactly four cards" holds without orphaning either route.
                (Design call in the build; Brian can move or drop these.) */}
            {isOrgAdmin && <a href="/admin" style={styles.settingsLink}>Admin</a>}
            {/* Readout link widened to the exec seat 2026-08-06, alongside the
                requireReadoutViewer change — the Value Ledger now lives on that
                page, and execs are part of its audience. */}
            {canSeeExposure && <a href="/readout" style={styles.settingsLink}>Readout</a>}
            <a href="/settings" style={styles.settingsLink}>Settings</a>
            <button
              style={styles.signOutLink}
              onClick={async () => {
                await supabase.auth.signOut();
                router.replace('/login');
              }}
            >
              Sign out
            </button>
          </div>
        </div>

        {/* ═══ DASHBOARD SIMPLIFICATION (2026-08-04) ═══════════════════════
            The ~10 feature tiles collapse into ONE "Needs attention" strip +
            FOUR verb cards, organized by what the person is DOING. No route
            was removed and no logic was forked: the old routes all stay live
            (nav badges, the demo script, and muscle memory point at them);
            the two hub pages (/knowledge, /people) render the existing page
            components as-is. Role math: a contributor sees TWO cards (Ask +
            Knowledge), an expert three (+ Capture), a manager/admin four
            (+ Your people) plus whatever the strip has to say.
            ⚠️ ALL strip + card copy below is DRAFT — PENDING BRIAN'S WALK. */}

        {/* "Needs attention" — renders ONLY when non-empty (existing tile
            doctrine: a permanently-visible empty queue teaches people to stop
            looking). Every count is a second renderer of an existing verified
            endpoint — see the state block comment; zero new count queries.
            Each item skips rendering independently at zero. */}
        {(openGapsCount > 0 || gapAnswers > 0 || openAsks > 0 || ideasWaiting > 0) && (
          <div style={styles.attentionStrip}>
            <span style={styles.attentionHeader}>Needs attention</span>
            <div style={styles.attentionRow}>
              {openGapsCount > 0 && (
                <a href="/knowledge?tab=gaps" style={styles.attentionItem}>
                  🧩 {openGapsCount === 1 ? '1 open gap' : `${openGapsCount} open gaps`}
                </a>
              )}
              {gapAnswers > 0 && (
                <a href="/gaps/mine" style={styles.attentionItem}>
                  ✅ {gapAnswers === 1 ? '1 new answer for you' : `${gapAnswers} new answers for you`}
                </a>
              )}
              {openAsks > 0 && (
                <a href="/requests" style={styles.attentionItem}>
                  📝 {openAsks === 1 ? '1 asked of you' : `${openAsks} asked of you`}
                </a>
              )}
              {ideasWaiting > 0 && (
                <a href="/knowledge?tab=ideas" style={styles.attentionItem}>
                  💡 {ideasWaiting === 1 ? '1 idea waiting for review' : `${ideasWaiting} ideas waiting for review`}
                </a>
              )}
            </div>
          </div>
        )}

        {/* 🌱 CAPTURE — hidden for contributors (existing doctrine: the
            integrity rule says their input never becomes canonical judgment,
            and the pattern_records trigger enforces it; offering the session
            and refusing at the end would read as a bait-and-switch). Absorbs
            the old Capture tile; the picker now includes Branch 7 (win). */}
        {!isContributor && (
          <div style={styles.resumeBanner}>
            <div>
              <h2 style={styles.resumeBannerTitle}>🌱 Capture</h2>
              <p style={styles.resumeBannerSub}>
                A short interview about a problem you know how to solve — or a win worth
                telling. Your judgment, with your name on it.
              </p>
            </div>
            <a href="/codify" style={styles.resumeBannerLink}>Start a session →</a>
          </div>
        )}

        {/* 💬 ASK — ONE card, the routing decides. Absorbs Ask-the-brain and
            the Floor Guide tile: a contributor whose Floor Guide seat is on
            goes to /floor-guide, everyone else to /retrieve. floorGuideActive
            is the dashboard's existing viewer-context read (own profile row,
            floor_guide_active AND the seat is open — mirrors
            resolveFloorGuideMode's required conjunct); no new role check. */}
        <div style={styles.resumeBanner}>
          <div>
            <h2 style={styles.resumeBannerTitle}>💬 Ask</h2>
            <p style={styles.resumeBannerSub}>
              Your team&apos;s judgment, the moment you need it.
            </p>
          </div>
          <a
            href={floorGuideActive ? '/floor-guide' : '/retrieve'}
            style={styles.resumeBannerLink}
          >
            Ask →
          </a>
        </div>

        {/* 🧠 YOUR TEAM'S KNOWLEDGE — the /knowledge hub (Library · Gaps ·
            Ideas as tabs; Ideas admin-only and hidden inside the hub). */}
        <div style={styles.resumeBanner}>
          <div>
            <h2 style={styles.resumeBannerTitle}>🧠 Your team&apos;s knowledge</h2>
            <p style={styles.resumeBannerSub}>
              What&apos;s written down, what&apos;s missing, and what your people are surfacing.
            </p>
          </div>
          <a href="/knowledge" style={styles.resumeBannerLink}>Open →</a>
        </div>

        {/* 👥 YOUR PEOPLE — managers + org admins only, HIDDEN (never
            shown-and-gated) for everyone else, per the T1B1 doctrine. The
            gate is the same is_manager()/is_org_admin() RPC pair the old
            campaigns/readout tiles used (canRunCampaigns). The /people hub
            groups Win Column · Coaching · Training · Deep Dives · Campaigns
            without widening anyone's access — every per-tab gate applies
            exactly as on the standalone routes. */}
        {canRunCampaigns && (
          <div style={styles.resumeBanner}>
            <div>
              <h2 style={styles.resumeBannerTitle}>👥 Your people</h2>
              <p style={styles.resumeBannerSub}>
                Who&apos;s getting named, who needs a hand, and what to teach next.
              </p>
            </div>
            <a href="/people" style={styles.resumeBannerLink}>Open →</a>
          </div>
        )}

        {/* ⚠️ WHAT'S AT RISK — the FIFTH card (Brian's call, 2026-08-06).
            This deliberately takes the v2.58 dashboard from four verb cards to
            five. The four-card collapse was approved and walked 11/11, so the
            change is a decision, not a drift — recorded in the decision log.
            Same audience as the readout: manager, admin, or an executive seat,
            HIDDEN (never shown-and-gated) for everyone else.
            ⚠️ DRAFT COPY — pending Brian's walk. */}
        {canSeeExposure && (
          <div style={styles.resumeBanner}>
            <div>
              <h2 style={styles.resumeBannerTitle}>⚠️ What&apos;s at risk</h2>
              <p style={styles.resumeBannerSub}>
                Which judgment sits in too few heads, and what your own frameworks
                are telling you to watch.
              </p>
            </div>
            <a href="/exposure" style={styles.resumeBannerLink}>Open →</a>
          </div>
        )}

        {/* hidden for Track B demo, recoverable — flip HIDE_TRACK_A in src/lib/demo-scope.ts */}
        {!HIDE_TRACK_A && (
          <div style={styles.resumeBanner}>
            <div>
              <h2 style={styles.resumeBannerTitle}>🌟 Build your resume</h2>
              <p style={styles.resumeBannerSub}>
                Turn your approved insights into a one-page executive resume — free on every plan.
              </p>
            </div>
            <a href="/resume" style={styles.resumeBannerLink}>Generate my resume →</a>
          </div>
        )}

        {/* T1B1 — first run. Somebody with no organization has no shared
            library, no gaps queue and no coaching routing; naming an org is
            the one action that turns all of it on. */}
        {!hasOrg && (
          <div style={styles.resumeBanner}>
            <div>
              <h2 style={styles.resumeBannerTitle}>🏢 Set up your organization</h2>
              <p style={styles.resumeBannerSub}>
                Name your team and invite the people whose judgment you&apos;d lose if they
                left tomorrow.
              </p>
            </div>
            <a href="/admin/start" style={styles.resumeBannerLink}>Set it up →</a>
          </div>
        )}

        {/* hidden for Track B demo, recoverable — flip HIDE_TRACK_A in src/lib/demo-scope.ts */}
        {!HIDE_TRACK_A && (
          <div style={styles.scoreCard}>
            <div style={styles.scoreHeader}>
              <h2 style={styles.cardTitle}>Expert Credibility Score</h2>
              <button style={styles.linkButtonSm} onClick={recalcScore} disabled={scoreLoading}>
                {scoreLoading ? 'Calculating…' : score ? 'Recalculate' : 'Calculate'}
              </button>
            </div>

            {score ? (
              <>
                <div style={styles.scoreMain}>
                  <span style={styles.scoreNumber}>{score.overall_score}</span>
                  <span style={styles.scoreOutOf}>/ 100</span>
                </div>
                <button style={styles.breakdownToggle} onClick={() => setShowBreakdown((s) => !s)}>
                  {showBreakdown ? 'Hide breakdown' : 'See breakdown'}
                </button>
                {showBreakdown && (
                  <div style={styles.breakdown}>
                    <Metric label="Source diversity" pct={score.source_diversity_pct}
                      help="Variety of trust tiers behind your insights" />
                    <Metric label="High-confidence" pct={score.high_confidence_pct}
                      help="Insights with no unresolved contradiction" />
                    <Metric label="Applied evidence" pct={score.applied_evidence_ratio}
                      help="Principles backed by a real example" />
                    <Metric label="Avg. trust tier" pct={score.avg_trust_tier}
                      help="Average strength of your sources" />
                  </div>
                )}
              </>
            ) : (
              <p style={styles.help}>
                Calculate your score from your captured expertise — source diversity,
                confidence, applied evidence, and source strength.
              </p>
            )}
          </div>
        )}

        {/* hidden for Track B demo, recoverable — copy references the credibility score */}
        {!HIDE_TRACK_A && needsContext.length > 0 && (
          <NeedsContextCard items={needsContext} onResolved={clearNeedsContext} />
        )}

        {/* hidden for Track B demo, recoverable — flip HIDE_TRACK_A in src/lib/demo-scope.ts */}
        {!HIDE_TRACK_A && (
          <GrowthCard snapshots={snapshots} loading={growthLoading} onRefresh={refreshGrowth} />
        )}

        {/* hidden for Track B demo, recoverable — gap links route to /upload + /capture */}
        {!HIDE_TRACK_A && gaps.length > 0 && (
          <div style={styles.gapBanner}>
            <h2 style={styles.gapBannerTitle}>🌱 Grow your Knowledge Graph</h2>
            <p style={styles.gapBannerSub}>
              A few things you asked about came up thin. Adding to them is like adding a
              record to your collection — no pressure.
            </p>
            <ul style={styles.gapList}>
              {gaps.map((g) => (
                <li key={g.id} style={styles.gapItem}>
                  <span style={styles.gapQuestion}>“{g.question_text}”</span>
                  <a
                    href={g.gap_type === 'case_evidence_missing' ? '/capture' : '/upload'}
                    style={styles.gapItemLink}
                  >
                    {g.gap_type === 'case_evidence_missing' ? 'Add an example →' : 'Add expertise →'}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* hidden for Track B demo, recoverable — flip HIDE_TRACK_A in src/lib/demo-scope.ts */}
        {!HIDE_TRACK_A && (
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <h2 style={styles.cardTitle}>Profile verification</h2>
            <span style={{ ...styles.badge, background: badge.bg, color: badge.fg, borderColor: badge.border }}>
              {badge.emoji} {badge.label}
            </span>
          </div>

          {profile?.verification_notes && flag !== 'no_linkedin_provided' && (
            <p style={styles.notes}>{profile.verification_notes}</p>
          )}

          <p style={styles.help}>
            Verify your identity by comparing your LinkedIn profile against your captured
            expertise. This is a plausibility check — a trust signal, not a background check.
          </p>

          {!showForm && (
            <button style={styles.linkButton} onClick={() => setShowForm(true)}>
              {flag === 'no_linkedin_provided' ? 'Verify with LinkedIn' : 'Re-run verification'}
            </button>
          )}

          {showForm && (
            <div style={styles.form}>
              <label style={styles.label}>LinkedIn URL (optional)</label>
              <input
                style={styles.input}
                type="url"
                placeholder="https://www.linkedin.com/in/you"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={verifying}
              />
              <label style={styles.label}>Paste your LinkedIn profile text (most reliable)</label>
              <textarea
                style={styles.textarea}
                rows={6}
                placeholder="Copy the visible text from your LinkedIn profile — headline, experience, education — and paste it here."
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={verifying}
              />
              <div style={styles.formRow}>
                <button style={styles.primary} onClick={verify} disabled={verifying}>
                  {verifying ? 'Checking…' : 'Verify'}
                </button>
                <button style={styles.ghost} onClick={() => { setShowForm(false); setMessage(null); }} disabled={verifying}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {message && <p style={styles.message}>{message}</p>}
        </div>
        )}
      </div>
    </div>
  );
}

// Phase 8 (Block 2). Lists approved insights flagged needs_explanation, each
// with a small "Needs context" badge on the insight itself and an inline
// belief-revision box. A depth-passing explanation unlocks the insight's score;
// a shallow one is logged but doesn't. Reuses the gap-detection card pattern.
function NeedsContextCard({
  items,
  onResolved,
}: {
  items: NeedsContext[];
  onResolved: (id: string) => void;
}) {
  return (
    <div style={styles.needsCard}>
      <h2 style={styles.needsTitle}>🔄 Needs your context</h2>
      <p style={styles.needsSub}>
        A few insights look like they changed your earlier thinking. Explain what changed and why —
        the prior belief, what shifted it, and why the new view is better. A real revision counts
        toward your credibility; these don&apos;t until you do.
      </p>
      <div style={styles.needsList}>
        {items.map((item) => (
          <NeedsContextItem key={item.id} item={item} onResolved={onResolved} />
        ))}
      </div>
    </div>
  );
}

function NeedsContextItem({
  item,
  onResolved,
}: {
  item: NeedsContext;
  onResolved: (id: string) => void;
}) {
  const [explanation, setExplanation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [depthOk, setDepthOk] = useState<boolean | null>(null);

  async function submit() {
    if (submitting || !explanation.trim()) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/explain-revision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ insight_id: item.id, explanation: explanation.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || 'That didn’t save. Try again.');
      } else {
        setDepthOk(data.depth_ok === true);
        setMessage(data.message || null);
        // A real revision clears the flag; keep a shallow one visible to improve.
        if (data.depth_ok === true) setTimeout(() => onResolved(item.id), 1600);
      }
    } catch {
      setMessage('That didn’t save. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={styles.needsItem}>
      <div style={styles.needsItemTop}>
        <span style={styles.needsBadge}>Needs context</span>
        {item.contradiction_note && (
          <span style={styles.needsNote}>vs. “{item.contradiction_note}”</span>
        )}
      </div>
      <p style={styles.needsContent}>{item.content}</p>
      <textarea
        style={styles.needsTextarea}
        rows={3}
        placeholder="I used to think… then… now I think… which is better because…"
        value={explanation}
        onChange={(e) => setExplanation(e.target.value)}
        disabled={submitting || depthOk === true}
      />
      <div style={styles.needsRow}>
        <button
          style={styles.needsSubmit}
          onClick={submit}
          disabled={submitting || depthOk === true || !explanation.trim()}
        >
          {submitting ? 'Checking…' : depthOk === true ? 'Counted ✓' : 'Submit explanation'}
        </button>
        {message && (
          <span style={{ ...styles.needsMessage, color: depthOk === false ? 'var(--warn-strong)' : 'var(--ok-text)' }}>
            {message}
          </span>
        )}
      </div>
    </div>
  );
}

// Phase 8 (Blocks 1 + 5). Block 1: portfolio combined score as a number + a
// status-word badge (no breakdown). Block 5: a simple growth trend line over the
// monthly snapshots ("grown X% over N months"). Expert-only, dashboard-only.
function GrowthCard({
  snapshots,
  loading,
  onRefresh,
}: {
  snapshots: GrowthSnapshot[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const latest = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
  const badge = latest ? badgeForScore(latest.combined_avg) : null;
  const badgeStyle = badge ? BADGE_STYLE[badge] : null;

  // Growth headline: first vs. latest snapshot's growth_value.
  let growthLine: string | null = null;
  if (snapshots.length >= 2) {
    const first = snapshots[0];
    const months = snapshots.length - 1;
    const base = first.growth_value || 1;
    const pct = Math.round(((latest!.growth_value - first.growth_value) / base) * 100);
    const span = months === 1 ? '1 month' : `${months} months`;
    growthLine =
      pct > 0
        ? `Your Knowledge Graph's value has grown ${pct}% over ${span}.`
        : pct < 0
          ? `Your Knowledge Graph's value has moved ${pct}% over ${span}.`
          : `Your Knowledge Graph's value has held steady over ${span}.`;
  }

  return (
    <div style={styles.growthCard}>
      <div style={styles.scoreHeader}>
        <h2 style={styles.cardTitle}>Your Knowledge Graph&apos;s Value</h2>
        <button style={styles.linkButtonSm} onClick={onRefresh} disabled={loading}>
          {loading ? 'Updating…' : latest ? 'Refresh' : 'Calculate'}
        </button>
      </div>

      {latest ? (
        <>
          <div style={styles.growthMain}>
            <span style={styles.scoreNumber}>{latest.combined_avg}</span>
            <span style={styles.scoreOutOf}>/ 100</span>
            {badge && (
              <span style={{ ...styles.statusBadge, background: badgeStyle!.bg, color: badgeStyle!.fg }}>
                {badge}
              </span>
            )}
          </div>
          <p style={styles.growthSub}>
            Portfolio strength across {latest.approved_count} approved{' '}
            {latest.approved_count === 1 ? 'insight' : 'insights'}.
          </p>
          {snapshots.length >= 2 && <Sparkline values={snapshots.map((s) => s.growth_value)} />}
          {growthLine && <p style={styles.growthLine}>{growthLine}</p>}
          {snapshots.length < 2 && (
            <p style={styles.help}>
              One monthly snapshot so far — your trend line appears once there&apos;s a second month
              to compare against.
            </p>
          )}
        </>
      ) : (
        <p style={styles.help}>
          Score your captured expertise to see your portfolio strength and track how your
          Knowledge Graph&apos;s value grows month over month.
        </p>
      )}
    </div>
  );
}

// Tiny inline SVG trend line — no external chart dependency.
function Sparkline({ values }: { values: number[] }) {
  const W = 560;
  const H = 60;
  const P = 4;
  const max = Math.max(...values, 100);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = values.length === 1 ? W / 2 : P + (i / (values.length - 1)) * (W - 2 * P);
    const y = H - P - ((v - min) / range) * (H - 2 * P);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={styles.sparkline} preserveAspectRatio="none">
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke="var(--new-leaf)"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {values.length > 0 && (
        <circle
          cx={pts[pts.length - 1].split(',')[0]}
          cy={pts[pts.length - 1].split(',')[1]}
          r={4}
          fill="var(--growth)"
        />
      )}
    </svg>
  );
}

function Metric({ label, pct, help }: { label: string; pct: number; help: string }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div style={styles.metric}>
      <div style={styles.metricTop}>
        <span style={styles.metricLabel}>{label}</span>
        <span style={styles.metricPct}>{Math.round(pct)}%</span>
      </div>
      <div style={styles.metricBarTrack}>
        <div style={{ ...styles.metricBarFill, width: `${clamped}%` }} />
      </div>
      <span style={styles.metricHelp}>{help}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { minHeight: '100vh', display: 'flex', justifyContent: 'center', padding: '48px 24px', fontFamily: 'var(--font-sans)' },
  container: { width: '100%', maxWidth: '640px', display: 'flex', flexDirection: 'column', gap: '20px' },
  center: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-sans)' },
  title: { fontSize: '28px', fontWeight: 700, margin: 0 },
  titleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' },
  headerLinks: { display: 'flex', alignItems: 'center', gap: '14px' },
  settingsLink: { fontSize: '13px', fontWeight: 600, color: 'var(--muted)', textDecoration: 'none' },
  signOutLink: { fontSize: '13px', fontWeight: 600, color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' },
  card: { padding: '24px', backgroundColor: 'var(--white)', border: '1px solid var(--line)', borderRadius: '14px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: '12px' },
  // "Needs attention" strip (2026-08-04) — one horizontal row of amber-family
  // pills; the strip itself only mounts when at least one count is non-zero.
  attentionStrip: { display: 'flex', flexDirection: 'column', gap: '8px', padding: '14px 18px', backgroundColor: 'var(--warn-bg)', border: '1px solid var(--warn-border)', borderRadius: '14px' },
  attentionHeader: { fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--warn-text)' },
  attentionRow: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
  attentionItem: { display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: 'var(--warn-text)', background: 'var(--white)', border: '1px solid var(--warn-border)', borderRadius: '9999px', padding: '6px 14px', textDecoration: 'none', whiteSpace: 'nowrap' },
  resumeBanner: { padding: '20px 24px', backgroundColor: 'var(--deep-forest)', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' },
  resumeBannerTitle: { fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--on-dark)' },
  resumeBannerSub: { fontSize: '13px', color: 'var(--on-dark-soft)', margin: '4px 0 0', lineHeight: 1.5, maxWidth: '360px' },
  resumeBannerLink: { fontSize: '14px', fontWeight: 600, color: 'var(--pine)', background: 'var(--white)', padding: '10px 18px', borderRadius: '8px', textDecoration: 'none', whiteSpace: 'nowrap' },
  cardHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' },
  cardTitle: { fontSize: '17px', fontWeight: 600, margin: 0 },
  badge: { fontSize: '13px', fontWeight: 600, padding: '5px 12px', borderRadius: '9999px', border: '1px solid' },
  notes: { margin: 0, fontSize: '14px', color: 'var(--pine-soft)', lineHeight: 1.5, background: 'var(--paper-2)', padding: '10px 12px', borderRadius: '8px' },
  help: { margin: 0, fontSize: '13px', color: 'var(--muted)', lineHeight: 1.5 },
  linkButton: { alignSelf: 'flex-start', padding: '8px 16px', fontSize: '14px', fontWeight: 600, color: 'var(--pine)', background: 'var(--white)', border: '1px solid var(--line)', borderRadius: '8px', cursor: 'pointer' },
  form: { display: 'flex', flexDirection: 'column', gap: '8px' },
  label: { fontSize: '13px', fontWeight: 600, color: 'var(--pine-soft)' },
  input: { padding: '10px 12px', fontSize: '15px', border: '1px solid var(--line)', borderRadius: '8px', fontFamily: 'inherit' },
  textarea: { padding: '10px 12px', fontSize: '15px', border: '1px solid var(--line)', borderRadius: '8px', fontFamily: 'inherit', boxSizing: 'border-box', width: '100%' },
  formRow: { display: 'flex', gap: '10px', marginTop: '4px' },
  primary: { padding: '10px 20px', fontSize: '15px', fontWeight: 600, color: 'var(--white)', background: 'var(--growth)', border: 'none', borderRadius: '8px', cursor: 'pointer' },
  ghost: { padding: '10px 14px', fontSize: '14px', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' },
  message: { margin: 0, fontSize: '14px', color: 'var(--pine-soft)' },
  gapBanner: { padding: '18px 20px', backgroundColor: 'var(--ok-bg)', border: '1px solid var(--ok-border)', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '8px' },
  gapBannerTitle: { fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--ok-text)' },
  gapBannerSub: { fontSize: '13px', color: 'var(--ok-text)', margin: 0, lineHeight: 1.5 },
  gapList: { listStyle: 'none', margin: '4px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' },
  gapItem: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', background: 'var(--white)', border: '1px solid var(--ok-border)', borderRadius: '10px', padding: '10px 12px' },
  gapQuestion: { fontSize: '14px', color: 'var(--ok-text)', fontStyle: 'italic', flex: 1, minWidth: '200px' },
  gapItemLink: { fontSize: '13px', fontWeight: 600, color: 'var(--growth)', textDecoration: 'none', whiteSpace: 'nowrap' },
  scoreCard: { padding: '24px', backgroundColor: 'var(--deep-forest)', border: '1px solid var(--dark-line)', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '10px', color: 'var(--on-dark)' },
  scoreHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' },
  scoreMain: { display: 'flex', alignItems: 'baseline', gap: '8px' },
  scoreNumber: { fontSize: '56px', fontWeight: 800, lineHeight: 1, color: 'var(--on-dark)' },
  scoreOutOf: { fontSize: '18px', color: 'var(--on-dark-soft)', fontWeight: 600 },
  breakdownToggle: { alignSelf: 'flex-start', padding: 0, fontSize: '13px', color: 'var(--growth-soft)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' },
  breakdown: { display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '8px' },
  linkButtonSm: { padding: '6px 12px', fontSize: '13px', fontWeight: 600, color: 'var(--on-dark)', background: 'transparent', border: '1px solid var(--dark-line)', borderRadius: '8px', cursor: 'pointer' },
  metric: { display: 'flex', flexDirection: 'column', gap: '4px' },
  metricTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  metricLabel: { fontSize: '14px', fontWeight: 600, color: 'var(--on-dark-soft)' },
  metricPct: { fontSize: '14px', fontWeight: 700, color: 'var(--on-dark)' },
  metricBarTrack: { height: '8px', background: 'rgba(255,255,255,0.14)', borderRadius: '9999px', overflow: 'hidden' },
  metricBarFill: { height: '100%', background: 'linear-gradient(90deg,var(--new-leaf-light),var(--new-leaf))', borderRadius: '9999px' },
  metricHelp: { fontSize: '12px', color: 'var(--on-dark-muted)' },
  growthCard: { padding: '24px', backgroundColor: 'var(--deep-forest)', border: '1px solid var(--dark-line)', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '10px', color: 'var(--on-dark)' },
  growthMain: { display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' },
  statusBadge: { fontSize: '13px', fontWeight: 700, padding: '4px 12px', borderRadius: '9999px', alignSelf: 'center' },
  growthSub: { fontSize: '13px', color: 'var(--on-dark-soft)', margin: 0 },
  growthLine: { fontSize: '15px', fontWeight: 600, color: 'var(--growth-soft)', margin: '4px 0 0' },
  sparkline: { display: 'block', marginTop: '6px' },
  needsCard: { padding: '20px 22px', backgroundColor: 'var(--warn-bg)', border: '1px solid var(--warn-border)', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '10px' },
  needsTitle: { fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--warn-text)' },
  needsSub: { fontSize: '13px', color: 'var(--warn-text)', margin: 0, lineHeight: 1.5 },
  needsList: { display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '4px' },
  needsItem: { background: 'var(--white)', border: '1px solid var(--warn-border)', borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' },
  needsItemTop: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' },
  needsBadge: { fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--warn-text)', background: 'var(--warn-chip-bg)', border: '1px solid var(--warn-border)', borderRadius: '9999px', padding: '3px 10px' },
  needsNote: { fontSize: '12px', color: 'var(--warn-text)', fontStyle: 'italic' },
  needsContent: { fontSize: '15px', lineHeight: 1.5, color: 'var(--pine)', margin: 0 },
  needsTextarea: { padding: '10px 12px', fontSize: '14px', border: '1px solid var(--line)', borderRadius: '8px', fontFamily: 'inherit', boxSizing: 'border-box', width: '100%' },
  needsRow: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' },
  needsSubmit: { padding: '8px 16px', fontSize: '14px', fontWeight: 600, color: 'var(--white)', background: 'var(--warn-strong)', border: 'none', borderRadius: '8px', cursor: 'pointer' },
  needsMessage: { fontSize: '13px', fontWeight: 500, lineHeight: 1.4, flex: 1, minWidth: '180px' },
};
