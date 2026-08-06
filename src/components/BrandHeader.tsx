'use client';

// Viridescent brand mark for app pages. Renders the horizontal logo PNG once
// it exists at public/brand/viridescent-horizontal.png; until then (or if the
// file is missing) it falls back to the inline sprout mark + serif wordmark,
// so the header can never render a broken image on camera.
// NOTE: the component/export names (BrandHeader, Daisy) are code identifiers —
// the identifier rename is parked by standing decision; only visuals changed.
import { useState, type CSSProperties } from 'react';
import GapBadge from '@/components/GapBadge';
// T1B2 — "somebody asked you to capture something." Sits next to GapBadge and
// behaves identically: renders NOTHING when there is nothing to say, never
// errors, never blocks. Green badge = something good arrived for you; amber
// badge = something is waiting on you.
import CaptureRequestBadge from '@/components/CaptureRequestBadge';
// Floor Guide B — "something you shared is moving." Same discipline again:
// renders NOTHING when there is nothing to say, and it can only ever carry good
// news because RLS never hands a dismissal to the person who surfaced it.
import InsightBadge from '@/components/InsightBadge';
// Floor Guide C — "someone asked how you really do it." Amber like the T1B2
// badge (something waits on you), and it goes dark on answer OR decline alike,
// because both remove you from the ask's live target list.
import DeepDiveBadge from '@/components/DeepDiveBadge';

const LOGO_SRC = '/brand/viridescent-horizontal.png';

// Sprout mark drawn from brand tokens only (growth + new-leaf).
// Name kept for import compatibility; the pink daisy artwork is retired.
export function Daisy({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* stem */}
      <path
        d="M12 21.5 C 12 16.5, 12 13.5, 12 10.5"
        stroke="var(--growth)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      {/* left leaf */}
      <path
        d="M12 13.5 C 7.5 13.2, 4.8 10.4, 4.4 6.2 C 8.6 6.6, 11.4 9.2, 12 13.5 Z"
        fill="var(--growth)"
      />
      {/* right leaf */}
      <path
        d="M12 10.5 C 12.6 6.6, 15.2 4.2, 19.6 3.8 C 19.2 8.2, 16.4 10.8, 12 10.5 Z"
        fill="var(--new-leaf)"
      />
    </svg>
  );
}

const styles: Record<string, CSSProperties> = {
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
  },
  wrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    textDecoration: 'none',
    color: 'var(--pine)',
    fontFamily: 'var(--font-serif)',
    fontSize: '17px',
    fontWeight: 600,
    letterSpacing: '0.02em',
  },
  logo: {
    height: '26px',
    width: 'auto',
    display: 'block',
  },
};

export default function BrandHeader({ bare = false }: { bare?: boolean }) {
  const [logoMissing, setLogoMissing] = useState(false);

  const mark = logoMissing ? (
    <>
      <Daisy />
      <span>Viridescent</span>
    </>
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={LOGO_SRC}
      alt="Viridescent"
      style={styles.logo}
      onError={() => setLogoMissing(true)}
    />
  );

  // 2026-08-05 forced onboarding click-through: /welcome renders the header
  // `bare` until the person's own track is complete — the mark doesn't link
  // home and no badge (each can carry a link out) is mounted. Every other
  // page keeps the default linking header, unchanged.
  if (bare) {
    return (
      <div style={styles.row}>
        <span style={styles.wrap}>{mark}</span>
      </div>
    );
  }

  return (
    // P-9: the mark and the "your question was answered" badge travel together
    // as the app's nav row. GapBadge renders NOTHING when there is nothing to
    // say, so on every page where nobody has answered your question this is
    // visually identical to what shipped before.
    <div style={styles.row}>
      <a href="/dashboard" style={styles.wrap}>
        {mark}
      </a>
      <GapBadge />
      <CaptureRequestBadge />
      <InsightBadge />
      <DeepDiveBadge />
    </div>
  );
}
