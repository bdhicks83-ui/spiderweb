'use client';

// Dashboard simplification (2026-08-04) — the 👥 "Your people" hub.
//
// ═══════════════════════════════════════════════════════════════════════════
// THIS PAGE IS A DOOR-GROUPER, NOT A FEATURE. It owns NO data path and NO
// logic: each tab renders the EXISTING page component (/win-column,
// /coaching, /training-studio, /deep-dives, /campaigns) exactly as it ships
// on its own route — same components, same API routes, same RLS. The old
// routes all stay live; this hub is a new front door, not a demolition.
//
// WHO SEES IT: managers + org admins only — and the door is HIDDEN, never
// shown-and-gated (the dashboard only offers the 👥 card to the same
// audience; a direct visit by anyone else is quietly sent home). This hub
// does NOT widen anyone's access: it only groups doors its audience already
// had, and every per-tab gate still applies exactly as on the standalone
// routes — Coaching renders only your direct reports (is_manager_of() RLS),
// Training Studio's create gate is is_manager() in the API, Deep Dives'
// create surface is admin-only, Campaigns is manager-or-admin in the API.
// The visibility check below is the same pair of SECURITY DEFINER RPCs the
// dashboard already uses (is_manager / is_org_admin) — it decides what to
// OFFER; Postgres decides what is permitted.
//
// Tab state rides the URL (?tab=) so deep links and refreshes work.
// window.location instead of useSearchParams, same reason as /codify: the
// latter would force this whole client page into a Suspense boundary.
import { useEffect, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
// The absorbed pages, rendered as-is — all 'use client', all self-contained.
import WinColumnPage from '@/app/win-column/page';
import CoachingPage from '@/app/coaching/page';
import TrainingStudioPage from '@/app/training-studio/page';
import DeepDivesPage from '@/app/deep-dives/page';
import CampaignsPage from '@/app/campaigns/page';

const supabase = createClient();

type PeopleTab = 'wins' | 'coaching' | 'training' | 'dives' | 'campaigns';

// ⚠️ DRAFT CUSTOMER-FACING COPY — PENDING BRIAN'S WALK (tab labels).
const TABS: { id: PeopleTab; label: string }[] = [
  { id: 'wins', label: '🏆 Win Column' },
  { id: 'coaching', label: '🧭 Coaching' },
  { id: 'training', label: '✨ Training' },
  { id: 'dives', label: '🔍 Deep dives' },
  { id: 'campaigns', label: '📣 Campaigns' },
];

function tabFromUrl(): PeopleTab {
  if (typeof window === 'undefined') return 'wins';
  const t = new URLSearchParams(window.location.search).get('tab');
  return t === 'coaching' || t === 'training' || t === 'dives' || t === 'campaigns'
    ? t
    : 'wins';
}

export default function PeopleHubPage() {
  const [tab, setTab] = useState<PeopleTab>('wins');
  // null = still checking; false = not this page's audience (sent home).
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const router = useRouter();

  useEffect(() => {
    setTab(tabFromUrl());
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/login');
        return;
      }
      // Same manager-or-admin pair the dashboard's campaigns/readout tiles
      // already use — both evaluated by Postgres as the caller (SECURITY
      // DEFINER), so the hub is never offered to somebody the APIs refuse.
      const [{ data: mgr }, { data: adm }] = await Promise.all([
        supabase.rpc('is_manager'),
        supabase.rpc('is_org_admin'),
      ]);
      if (cancelled) return;
      const ok = mgr === true || adm === true;
      setAllowed(ok);
      // Hidden, not locked: no stub, no explanation — home, quietly.
      if (!ok) router.replace('/dashboard');
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  function switchTab(next: PeopleTab) {
    setTab(next);
    window.history.replaceState(null, '', next === 'wins' ? '/people' : `/people?tab=${next}`);
  }

  if (allowed !== true) {
    return <p style={styles.loading}>Loading…</p>;
  }

  return (
    <div>
      <div style={styles.tabBarWrap}>
        <div style={styles.tabBar}>
          {TABS.map((t) => (
            <button
              key={t.id}
              style={{ ...styles.tab, ...(tab === t.id ? styles.tabActive : {}) }}
              onClick={() => switchTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {tab === 'wins' ? (
        <WinColumnPage />
      ) : tab === 'coaching' ? (
        <CoachingPage />
      ) : tab === 'training' ? (
        <TrainingStudioPage />
      ) : tab === 'dives' ? (
        <DeepDivesPage />
      ) : (
        <CampaignsPage />
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  tabBarWrap: {
    display: 'flex',
    justifyContent: 'center',
    padding: '20px 24px 0',
    fontFamily: 'var(--font-sans)',
  },
  tabBar: {
    width: '100%',
    maxWidth: '760px',
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
    padding: '6px',
    backgroundColor: 'var(--paper-2)',
    border: '1px solid var(--line)',
    borderRadius: '10px',
  },
  tab: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--muted)',
    background: 'none',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  tabActive: {
    color: 'var(--pine)',
    backgroundColor: 'var(--white)',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  loading: {
    textAlign: 'center',
    color: 'var(--muted)',
    fontSize: '15px',
    padding: '48px 24px',
    fontFamily: 'var(--font-sans)',
  },
};
