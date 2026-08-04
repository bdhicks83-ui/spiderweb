'use client';

// Dashboard simplification (2026-08-04) — the 🧠 "Your team's knowledge" hub.
//
// ═══════════════════════════════════════════════════════════════════════════
// THIS PAGE IS A DOOR-GROUPER, NOT A FEATURE. It owns NO data path and NO
// logic: each tab renders the EXISTING page component (/library, /gaps,
// /insights) exactly as it ships on its own route — same components, same API
// routes, same RLS. The old routes all stay live (nav links, badges, the demo
// script, and muscle memory point at them); this hub is a new front door, not
// a demolition. If a tab here ever behaves differently from its standalone
// route, something forked that shouldn't have.
//
// Tabs: 📚 Library · 🧩 Gaps · 💡 Ideas.
// The Ideas tab is admin-only and HIDDEN (not shown-and-gated) for everybody
// else — same T1B1 doctrine as the dashboard tiles it replaces: reviewing
// what the floor surfaced is not most people's job, and a locked door reads
// worse than no door. The real gate is is_org_admin() in Postgres, checked by
// /api/insights on every read and action — this flag only decides what to
// OFFER, never what is permitted.
//
// Tab state rides the URL (?tab=library|gaps|ideas) so deep links and
// refreshes work — the "Needs attention" strip on the dashboard links
// straight to ?tab=gaps and ?tab=ideas. window.location instead of
// useSearchParams, same reason as /codify and /training-studio: the latter
// would force this whole client page into a Suspense boundary.
import { useEffect, useState, type CSSProperties } from 'react';
import { createClient } from '@/lib/supabase/client';
// The absorbed pages, rendered as-is. Importing a page component from
// another route module is just a module import — each one is 'use client'
// and self-contained (fetches its own data, renders its own header).
import LibraryPage from '@/app/library/page';
import GapsPage from '@/app/gaps/page';
import InsightsQueuePage from '@/app/insights/page';

const supabase = createClient();

type KnowledgeTab = 'library' | 'gaps' | 'ideas';

// ⚠️ DRAFT CUSTOMER-FACING COPY — PENDING BRIAN'S WALK (tab labels).
const TABS: { id: KnowledgeTab; label: string; adminOnly?: boolean }[] = [
  { id: 'library', label: '📚 Library' },
  { id: 'gaps', label: '🧩 Gaps' },
  { id: 'ideas', label: '💡 Ideas', adminOnly: true },
];

function tabFromUrl(): KnowledgeTab {
  if (typeof window === 'undefined') return 'library';
  const t = new URLSearchParams(window.location.search).get('tab');
  return t === 'gaps' || t === 'ideas' ? t : 'library';
}

export default function KnowledgeHubPage() {
  const [tab, setTab] = useState<KnowledgeTab>('library');
  // null = still checking. The Ideas tab (and an ?tab=ideas deep link) waits
  // for the answer instead of flashing the wrong surface.
  const [isOrgAdmin, setIsOrgAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    setTab(tabFromUrl());
    let cancelled = false;
    (async () => {
      // Own-row read, same shape as the dashboard's loadAdminFlag — this is
      // the same answer the SECURITY DEFINER functions give, and it decides
      // what to OFFER, never what is permitted.
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setIsOrgAdmin(false);
        return;
      }
      const { data } = await supabase
        .from('profiles')
        .select('is_org_admin')
        .eq('id', user.id)
        .maybeSingle();
      if (!cancelled) setIsOrgAdmin(!!(data as { is_org_admin: boolean | null } | null)?.is_org_admin);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function switchTab(next: KnowledgeTab) {
    setTab(next);
    // Keep the URL honest so refresh and share both land on the same tab.
    window.history.replaceState(null, '', next === 'library' ? '/knowledge' : `/knowledge?tab=${next}`);
  }

  // Hidden, not locked: a non-admin deep-linked to ?tab=ideas just gets the
  // library — no stub, no explanation, same as the tab not existing.
  const effectiveTab: KnowledgeTab =
    tab === 'ideas' && isOrgAdmin !== true ? (isOrgAdmin === null ? tab : 'library') : tab;
  const waitingOnAdminCheck = tab === 'ideas' && isOrgAdmin === null;

  const visibleTabs = TABS.filter((t) => !t.adminOnly || isOrgAdmin === true);

  return (
    <div>
      <div style={styles.tabBarWrap}>
        <div style={styles.tabBar}>
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              style={{
                ...styles.tab,
                ...(effectiveTab === t.id && !waitingOnAdminCheck ? styles.tabActive : {}),
              }}
              onClick={() => switchTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {waitingOnAdminCheck ? (
        <p style={styles.loading}>Loading…</p>
      ) : effectiveTab === 'library' ? (
        <LibraryPage />
      ) : effectiveTab === 'gaps' ? (
        <GapsPage />
      ) : (
        <InsightsQueuePage />
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
    maxWidth: '680px',
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
