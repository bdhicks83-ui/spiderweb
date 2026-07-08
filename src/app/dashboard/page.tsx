'use client';

// Logged-in hub. Step 4 adds the profile-verification card; Steps 6 & 7 add
// the query-gap banner and the credibility score here.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

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

type Credibility = {
  overall_score: number;
  source_diversity_pct: number;
  high_confidence_pct: number;
  applied_evidence_ratio: number;
  avg_trust_tier: number;
  last_calculated_at: string | null;
};

const BADGE: Record<Flag, { label: string; bg: string; fg: string; border: string; emoji: string }> = {
  consistent: { label: 'Verified via LinkedIn', bg: '#f0fdf4', fg: '#166534', border: '#bbf7d0', emoji: '✓' },
  partial_mismatch: { label: 'Some details didn’t line up', bg: '#fffbeb', fg: '#92400e', border: '#fde68a', emoji: '⚠' },
  no_linkedin_provided: { label: 'Not verified yet', bg: '#f5f5f5', fg: '#666', border: '#e0e0e0', emoji: '—' },
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
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      await Promise.all([loadProfile(), loadGaps(), loadScore()]);
      setLoading(false);
    })();
  }, [router]);

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
        <h1 style={styles.title}>Your Dashboard</h1>

        <div style={styles.resumeBanner}>
          <div>
            <h2 style={styles.resumeBannerTitle}>🌟 Build your resume</h2>
            <p style={styles.resumeBannerSub}>
              Turn your approved insights into a one-page executive resume — free on every plan.
            </p>
          </div>
          <a href="/resume" style={styles.resumeBannerLink}>Generate my resume →</a>
        </div>

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

        {gaps.length > 0 && (
          <div style={styles.gapBanner}>
            <h2 style={styles.gapBannerTitle}>🌱 Grow your Spiderweb</h2>
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
      </div>
    </div>
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
  wrapper: { minHeight: '100vh', display: 'flex', justifyContent: 'center', padding: '48px 24px', fontFamily: 'system-ui, sans-serif' },
  container: { width: '100%', maxWidth: '640px', display: 'flex', flexDirection: 'column', gap: '20px' },
  center: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' },
  title: { fontSize: '28px', fontWeight: 700, margin: 0 },
  card: { padding: '24px', backgroundColor: '#fff', border: '1px solid #e0e0e0', borderRadius: '14px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: '12px' },
  resumeBanner: { padding: '20px 24px', backgroundColor: '#111', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' },
  resumeBannerTitle: { fontSize: '16px', fontWeight: 700, margin: 0, color: '#fff' },
  resumeBannerSub: { fontSize: '13px', color: '#bbb', margin: '4px 0 0', lineHeight: 1.5, maxWidth: '360px' },
  resumeBannerLink: { fontSize: '14px', fontWeight: 600, color: '#111', background: '#fff', padding: '10px 18px', borderRadius: '8px', textDecoration: 'none', whiteSpace: 'nowrap' },
  cardHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' },
  cardTitle: { fontSize: '17px', fontWeight: 600, margin: 0 },
  badge: { fontSize: '13px', fontWeight: 600, padding: '5px 12px', borderRadius: '9999px', border: '1px solid' },
  notes: { margin: 0, fontSize: '14px', color: '#444', lineHeight: 1.5, background: '#fafafa', padding: '10px 12px', borderRadius: '8px' },
  help: { margin: 0, fontSize: '13px', color: '#888', lineHeight: 1.5 },
  linkButton: { alignSelf: 'flex-start', padding: '8px 16px', fontSize: '14px', fontWeight: 600, color: '#111', background: '#fff', border: '1px solid #ccc', borderRadius: '8px', cursor: 'pointer' },
  form: { display: 'flex', flexDirection: 'column', gap: '8px' },
  label: { fontSize: '13px', fontWeight: 600, color: '#555' },
  input: { padding: '10px 12px', fontSize: '15px', border: '1px solid #ccc', borderRadius: '8px', fontFamily: 'inherit' },
  textarea: { padding: '10px 12px', fontSize: '15px', border: '1px solid #ccc', borderRadius: '8px', fontFamily: 'inherit', boxSizing: 'border-box', width: '100%' },
  formRow: { display: 'flex', gap: '10px', marginTop: '4px' },
  primary: { padding: '10px 20px', fontSize: '15px', fontWeight: 600, color: '#fff', background: '#111', border: 'none', borderRadius: '8px', cursor: 'pointer' },
  ghost: { padding: '10px 14px', fontSize: '14px', color: '#666', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' },
  message: { margin: 0, fontSize: '14px', color: '#555' },
  gapBanner: { padding: '18px 20px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '8px' },
  gapBannerTitle: { fontSize: '16px', fontWeight: 700, margin: 0, color: '#166534' },
  gapBannerSub: { fontSize: '13px', color: '#3f6212', margin: 0, lineHeight: 1.5 },
  gapList: { listStyle: 'none', margin: '4px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' },
  gapItem: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', background: '#fff', border: '1px solid #d1fae5', borderRadius: '10px', padding: '10px 12px' },
  gapQuestion: { fontSize: '14px', color: '#166534', fontStyle: 'italic', flex: 1, minWidth: '200px' },
  gapItemLink: { fontSize: '13px', fontWeight: 600, color: '#15803d', textDecoration: 'none', whiteSpace: 'nowrap' },
  scoreCard: { padding: '24px', backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '10px', color: '#fff' },
  scoreHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' },
  scoreMain: { display: 'flex', alignItems: 'baseline', gap: '8px' },
  scoreNumber: { fontSize: '56px', fontWeight: 800, lineHeight: 1, color: '#fff' },
  scoreOutOf: { fontSize: '18px', color: '#94a3b8', fontWeight: 600 },
  breakdownToggle: { alignSelf: 'flex-start', padding: 0, fontSize: '13px', color: '#7dd3fc', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' },
  breakdown: { display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '8px' },
  linkButtonSm: { padding: '6px 12px', fontSize: '13px', fontWeight: 600, color: '#fff', background: 'transparent', border: '1px solid #334155', borderRadius: '8px', cursor: 'pointer' },
  metric: { display: 'flex', flexDirection: 'column', gap: '4px' },
  metricTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  metricLabel: { fontSize: '14px', fontWeight: 600, color: '#e2e8f0' },
  metricPct: { fontSize: '14px', fontWeight: 700, color: '#fff' },
  metricBarTrack: { height: '8px', background: '#1e293b', borderRadius: '9999px', overflow: 'hidden' },
  metricBarFill: { height: '100%', background: 'linear-gradient(90deg,#38bdf8,#22c55e)', borderRadius: '9999px' },
  metricHelp: { fontSize: '12px', color: '#94a3b8' },
};
