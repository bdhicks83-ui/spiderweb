// Humanbloom brand mark for app pages — daisy + serif wordmark, matching the
// marketing landing page. Purely visual; safe to import from client pages.
import type { CSSProperties } from 'react';

export function Daisy({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <g opacity="0.85">
        <path d="M12 12 C 8.8 10, 8.6 5, 12 2.4 C 15.4 5, 15.2 10, 12 12 Z" fill="#dd9db2" transform="rotate(30 12 12)" />
        <path d="M12 12 C 8.8 10, 8.6 5, 12 2.4 C 15.4 5, 15.2 10, 12 12 Z" fill="#dd9db2" transform="rotate(90 12 12)" />
        <path d="M12 12 C 8.8 10, 8.6 5, 12 2.4 C 15.4 5, 15.2 10, 12 12 Z" fill="#dd9db2" transform="rotate(150 12 12)" />
        <path d="M12 12 C 8.8 10, 8.6 5, 12 2.4 C 15.4 5, 15.2 10, 12 12 Z" fill="#dd9db2" transform="rotate(210 12 12)" />
        <path d="M12 12 C 8.8 10, 8.6 5, 12 2.4 C 15.4 5, 15.2 10, 12 12 Z" fill="#dd9db2" transform="rotate(270 12 12)" />
        <path d="M12 12 C 8.8 10, 8.6 5, 12 2.4 C 15.4 5, 15.2 10, 12 12 Z" fill="#dd9db2" transform="rotate(330 12 12)" />
      </g>
      <g>
        <path d="M12 12 C 8.8 10, 8.6 5, 12 2.4 C 15.4 5, 15.2 10, 12 12 Z" fill="#f0bccd" transform="rotate(0 12 12)" />
        <path d="M12 12 C 8.8 10, 8.6 5, 12 2.4 C 15.4 5, 15.2 10, 12 12 Z" fill="#f0bccd" transform="rotate(60 12 12)" />
        <path d="M12 12 C 8.8 10, 8.6 5, 12 2.4 C 15.4 5, 15.2 10, 12 12 Z" fill="#f0bccd" transform="rotate(120 12 12)" />
        <path d="M12 12 C 8.8 10, 8.6 5, 12 2.4 C 15.4 5, 15.2 10, 12 12 Z" fill="#f0bccd" transform="rotate(180 12 12)" />
        <path d="M12 12 C 8.8 10, 8.6 5, 12 2.4 C 15.4 5, 15.2 10, 12 12 Z" fill="#f0bccd" transform="rotate(240 12 12)" />
        <path d="M12 12 C 8.8 10, 8.6 5, 12 2.4 C 15.4 5, 15.2 10, 12 12 Z" fill="#f0bccd" transform="rotate(300 12 12)" />
      </g>
      <circle cx="12" cy="12" r="2.9" fill="#eab94e" />
      <circle cx="11.1" cy="11.3" r="0.45" fill="#c99327" />
      <circle cx="12.9" cy="11.4" r="0.45" fill="#c99327" />
      <circle cx="12" cy="12.9" r="0.45" fill="#c99327" />
    </svg>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    textDecoration: 'none',
    color: 'var(--ink)',
    fontFamily: 'var(--font-serif)',
    fontSize: '17px',
    fontWeight: 600,
    letterSpacing: '0.02em',
  },
};

export default function BrandHeader() {
  return (
    <a href="/dashboard" style={styles.wrap}>
      <Daisy />
      <span>Humanbloom</span>
    </a>
  );
}
