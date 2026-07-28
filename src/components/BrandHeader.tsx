'use client';

// Viridescent brand mark for app pages. Renders the horizontal logo PNG once
// it exists at public/brand/viridescent-horizontal.png; until then (or if the
// file is missing) it falls back to the inline sprout mark + serif wordmark,
// so the header can never render a broken image on camera.
// NOTE: the component/export names (BrandHeader, Daisy) are code identifiers —
// the identifier rename is parked by standing decision; only visuals changed.
import { useState, type CSSProperties } from 'react';

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

export default function BrandHeader() {
  const [logoMissing, setLogoMissing] = useState(false);

  return (
    <a href="/dashboard" style={styles.wrap}>
      {logoMissing ? (
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
      )}
    </a>
  );
}
