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
  // Floor Guide Phase A — the role ladder + the onboarding state.
  const [isContributor, setIsContributor] = useState(false);
  const [floorGuideActive, setFloorGuideActive] = useState(false);
  const [openAsks, setOpenAsks] = useState(0);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      await Promise.all([loadProfile(), loadGaps(), loadScore(), loadGrowth(), loadNeedsContext(), loadAdminFlag()]);
      setLoading(false);
    })();
  }, [router]);

  async function loadAdminFlag() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('is_org_admin, org_id, role, floor_guide_active, deactivated_at')
      .eq('id', user.id)
      .maybeSingle();
    const row = data as {
      is_org_admin: boolean | null;
      org_id: string | null;
      role: string | null;
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

    try {
      const res = await fetch('/api/requests/mine?count=1');
      if (res.ok) {
        const body = await res.json();
        if (typeof body?.open === 'number') setOpenAsks(body.open);
      }
    } catch {
      // non-fatal: the tile just doesn't appear
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

        {/* ⭐ FLOOR GUIDE PHASE A — FIRST TILE ON THE PAGE WHEN IT'S ON.
            Position is the point: somebody in their second week should not have
            to scan nine tiles to find the one built for them. Admin-assigned per
            person, so it is hidden (not shown-and-gated) for everybody else —
            offering a locked "new hire" door to a twenty-year veteran reads as an
            insult, which is the opposite of the read-and-gate default the rest of
            this dashboard uses.

            ⚠️ DRAFT CUSTOMER-FACING COPY — PENDING BRIAN (Floor Guide A). */}
        {floorGuideActive && (
          <div style={styles.resumeBanner}>
            <div>
              <h2 style={styles.resumeBannerTitle}>🧑‍🏭 Floor Guide</h2>
              <p style={styles.resumeBannerSub}>
                What the people who&apos;ve been doing this a while say matters most — and a
                private place to ask anything you&apos;re not sure about.
              </p>
            </div>
            <a href="/floor-guide" style={styles.resumeBannerLink}>Open Floor Guide →</a>
          </div>
        )}

        {/* Codify — HIDDEN for contributors. The integrity rule says their input
            never becomes canonical judgment, and the pattern_records trigger
            enforces it; offering the session and refusing at the end would waste
            somebody's afternoon and read as a bait-and-switch. Phase B is what
            gives contributor input a real destination. */}
        {!isContributor && (
        <div style={styles.resumeBanner}>
          <div>
            <h2 style={styles.resumeBannerTitle}>🌱 Codify a pattern</h2>
            <p style={styles.resumeBannerSub}>
              A short interview about work you&apos;ve already done — walk out with a
              branded framework you could put in a proposal.
            </p>
          </div>
          <a href="/codify" style={styles.resumeBannerLink}>Start a session →</a>
        </div>
        )}

        {/* P-3 — Contextual retrieval (the Copilot moment). Describe a
            situation, get the org's matching framework(s). */}
        <div style={styles.resumeBanner}>
          <div>
            <h2 style={styles.resumeBannerTitle}>🔍 Ask your team&apos;s brain</h2>
            <p style={styles.resumeBannerSub}>
              Describe a situation in plain language — the right codified framework surfaces,
              in your team&apos;s own words.
            </p>
          </div>
          <a href="/retrieve" style={styles.resumeBannerLink}>Find a framework →</a>
        </div>

        {/* P-1 Build 2 — shared org library. Solo users with no org yet still
            see their own completed frameworks here (RLS falls back to
            own-rows-only), so this is additive, not a behavior change. */}
        <div style={styles.resumeBanner}>
          <div>
            <h2 style={styles.resumeBannerTitle}>📚 Team Library</h2>
            <p style={styles.resumeBannerSub}>
              Every completed framework your org has captured, with attribution.
            </p>
          </div>
          <a href="/library" style={styles.resumeBannerLink}>Browse library →</a>
        </div>

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

        {/* P-7 — the On-Demand Training Studio. The manager+ gate lives in
            the API route (is_manager()); the link is safe to show to
            everyone, same "link is visible, the gate is real" pattern as
            Coaching Watch. */}
        <div style={styles.resumeBanner}>
          <div>
            <h2 style={styles.resumeBannerTitle}>✨ Training Studio</h2>
            <p style={styles.resumeBannerSub}>
              Something going wrong right now? Describe it, name who it&apos;s for, and get
              the right kind of training — with the reasoning shown.
            </p>
          </div>
          <a href="/training-studio" style={styles.resumeBannerLink}>Create training →</a>
        </div>

        {/* T1B2 — "asked of you." Appears ONLY when something is actually
            waiting: a permanently-visible empty queue teaches people to stop
            looking at it. Amber, because it's waiting on them, not a prize. */}
        {openAsks > 0 && (
          <div style={styles.resumeBanner}>
            <div>
              <h2 style={styles.resumeBannerTitle}>📝 Asked of you</h2>
              <p style={styles.resumeBannerSub}>
                {openAsks === 1
                  ? 'Someone asked you to write down how you handle something.'
                  : `${openAsks} things your team has asked you to write down.`}
              </p>
            </div>
            <a href="/requests" style={styles.resumeBannerLink}>Take a look →</a>
          </div>
        )}

        {/* T1B2 — capture campaigns. Manager-or-admin only: the tile is the
            entry point to ASKING people for things, which is a management
            action. Everyone can still be asked. */}
        {canRunCampaigns && (
          <div style={styles.resumeBanner}>
            <div>
              <h2 style={styles.resumeBannerTitle}>📣 Capture campaigns</h2>
              <p style={styles.resumeBannerSub}>
                Ask specific people specific questions — starting with the ones your team
                already asked and nobody could answer.
              </p>
            </div>
            <a href="/campaigns" style={styles.resumeBannerLink}>Open →</a>
          </div>
        )}

        {/* T1B3 — the value readout. Same manager-or-admin bar as campaigns:
            it carries no person-level negative so a wider audience would be
            safe, but a readout circulating before its owner has read it is how
            a half-finished number reaches a VP. */}
        {canRunCampaigns && (
          <div style={styles.resumeBanner}>
            <div>
              <h2 style={styles.resumeBannerTitle}>📊 What your team wrote down</h2>
              <p style={styles.resumeBannerSub}>
                Built live from your own records — what&apos;s been captured, what people asked for,
                and where it changed what someone did. Two pages you can forward.
              </p>
            </div>
            <a href="/readout" style={styles.resumeBannerLink}>Open the readout →</a>
          </div>
        )}

        {/* P-9 — the shared gaps queue. Org-wide by design: anyone can see what
            the team can't answer, and anyone can pick one up. No routing in v1. */}
        <div style={styles.resumeBanner}>
          <div>
            <h2 style={styles.resumeBannerTitle}>🧩 Gaps worth filling</h2>
            <p style={styles.resumeBannerSub}>
              Questions your team asked that nobody has codified yet — and the ones you asked,
              waiting on an answer.
            </p>
          </div>
          <a href="/gaps" style={styles.resumeBannerLink}>Open the queue →</a>
        </div>

        {/* New — manager-only coaching watch. Visible link for everyone, but
            RLS (is_manager_of()) means it renders empty for anyone with no
            direct reports on file — same "link is safe to show, RLS is the
            real gate" pattern as the rest of the app. */}
        <div style={styles.resumeBanner}>
          <div>
            <h2 style={styles.resumeBannerTitle}>🧭 Coaching Watch</h2>
            <p style={styles.resumeBannerSub}>
              Private, for your direct reports only — an early signal from concern or friction
              records, before it becomes a documented failure.
            </p>
          </div>
          <a href="/coaching" style={styles.resumeBannerLink}>Open →</a>
        </div>

        {/* T1B1 — the admin console. Unlike the other tiles, this one is
            HIDDEN for non-admins rather than shown-and-gated: everything else
            in this app is a surface everybody is meant to use (the gate just
            decides what renders inside it), whereas administering the account
            is not most people's job and a locked door on the dashboard reads
            as "there's a part of this you don't get." The real gate is still
            is_org_admin() in Postgres, checked by every /api/admin route. */}
        {isOrgAdmin && (
          <div style={styles.resumeBanner}>
            <div>
              <h2 style={styles.resumeBannerTitle}>⚙️ Your account</h2>
              <p style={styles.resumeBannerSub}>
                Invite your people, set who reports to whom, and see how far along your
                setup is.
              </p>
            </div>
            <a href="/admin" style={styles.resumeBannerLink}>Manage →</a>
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
