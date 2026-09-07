// ShotLog brand mark — the mushroom cloud + shockwave from the final kit
// (Downloads/shotlog-final-kit, Sep 2026). One source of truth for every
// in-app use: <ShotLogTile/> is the rounded navy app tile (sidebar header,
// sign-in), <ShotLogMark/> the bare mark on any background, <ShotLogLogo/>
// tile + SHOTLOG wordmark. Static copies of the same artwork live in
// public/ (favicon, PWA icons, apple-touch-icon, lockups for email/print).
//
// Brand colours: navy #1C3859 · orange #EE7A2E · ember #C9481E · gold #FFC53D
// · flash #FFF4D8. Minimum size for the full-colour mark is 24 px.
import { useId } from 'react';

function Defs({ p }: { p: string }) {
  return (
    <defs>
      <radialGradient id={`${p}tile`} gradientUnits="userSpaceOnUse" cx="128" cy="118" r="120">
        <stop offset="0" stopColor="#EE7A2E" stopOpacity="0.22" />
        <stop offset="0.55" stopColor="#EE7A2E" stopOpacity="0.06" />
        <stop offset="1" stopColor="#EE7A2E" stopOpacity="0" />
      </radialGradient>
      <linearGradient id={`${p}dome`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#F79A4F" />
        <stop offset="0.7" stopColor="#EE7A2E" />
        <stop offset="1" stopColor="#C9481E" />
      </linearGradient>
      <linearGradient id={`${p}rim`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#C9481E" />
        <stop offset="1" stopColor="#A83A16" />
      </linearGradient>
      <linearGradient id={`${p}stem`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#FFC53D" />
        <stop offset="0.55" stopColor="#EE7A2E" />
        <stop offset="1" stopColor="#C9481E" />
      </linearGradient>
      <radialGradient id={`${p}core`} gradientUnits="userSpaceOnUse" cx="128" cy="96" r="62">
        <stop offset="0" stopColor="#FFF4D8" />
        <stop offset="0.3" stopColor="#FFC53D" />
        <stop offset="0.75" stopColor="#EE7A2E" />
        <stop offset="1" stopColor="#EE7A2E" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`${p}base`} gradientUnits="userSpaceOnUse" cx="128" cy="192" r="80">
        <stop offset="0" stopColor="#FFC53D" />
        <stop offset="0.4" stopColor="#EE7A2E" />
        <stop offset="1" stopColor="#C9481E" />
      </radialGradient>
      <linearGradient id={`${p}sheen`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.26" />
        <stop offset="0.55" stopColor="#FFFFFF" stopOpacity="0" />
      </linearGradient>
    </defs>
  );
}

/** The cloud, shockwave and dust — drawn in a 256×256 box, no background */
function Cloud({ p }: { p: string }) {
  return (
    <>
      <path d="M14 214 A114 30 0 0 0 242 214" fill="none" stroke="#C9481E" strokeWidth="4" strokeLinecap="round" opacity="0.28" />
      <path d="M26 206 A102 24 0 0 0 230 206" fill="none" stroke="#C9481E" strokeWidth="12" strokeLinecap="round" />
      <path d="M48 202 A80 17 0 0 0 208 202" fill="none" stroke="#EE7A2E" strokeWidth="7" strokeLinecap="round" opacity="0.92" />
      <g fill={`url(#${p}stem)`}>
        <path d="M87.0 198 C93.0 186.5,102.0 176.5,102.0 166.5 C102.0 156.5,94.0 136,94.0 128 L162.0 128 C162.0 136,154.0 156.5,154.0 166.5 C154.0 176.5,163.0 186.5,169.0 198 Z" />
      </g>
      <g fill={`url(#${p}base)`}>
        <ellipse cx="128" cy="196" rx="63.0" ry="16" />
        <circle cx="88.9" cy="190.0" r="18.0" />
        <circle cx="167.1" cy="190.0" r="18.0" />
        <circle cx="110.4" cy="184.0" r="22.0" />
        <circle cx="145.6" cy="184.0" r="22.0" />
        <circle cx="128.0" cy="186.0" r="20.0" />
      </g>
      <g fill={`url(#${p}rim)`}>
        <ellipse cx="128" cy="116" rx="98" ry="24" />
      </g>
      <g fill={`url(#${p}dome)`}>
        <path d="M30 116 C30 30, 226 30, 226 116 Z" />
      </g>
      <g fill={`url(#${p}sheen)`}>
        <path d="M30 116 C30 30, 226 30, 226 116 Z" />
      </g>
      <g fill={`url(#${p}core)`} transform="translate(128 96) scale(0.78 0.62) translate(-128 -96)">
        <path d="M30 116 C30 30, 226 30, 226 116 Z" />
      </g>
      <circle cx="128" cy="98" r="12" fill="#FFF4D8" />
    </>
  );
}

/** Bare mark, transparent background — for any ground (empty states, print) */
export function ShotLogMark({ size = 40, className }: { size?: number; className?: string }) {
  const p = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" className={className} aria-hidden="true" focusable="false">
      <Defs p={p} />
      <Cloud p={p} />
    </svg>
  );
}

/** Rounded navy app tile with the mark — what the installed icon looks like */
export function ShotLogTile({
  size = 40,
  radius = 58,
  className,
}: {
  size?: number;
  radius?: number;
  className?: string;
}) {
  const p = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" className={className} aria-hidden="true" focusable="false">
      <Defs p={p} />
      <rect width="256" height="256" rx={radius} fill="#1C3859" />
      <circle cx="128" cy="118" r="120" fill={`url(#${p}tile)`} />
      <Cloud p={p} />
    </svg>
  );
}

/** Tile + SHOTLOG wordmark (live text, weight 800, LOG in brand orange).
 *  `tone` picks the wordmark colour for the ground it sits on. */
export function ShotLogLogo({
  size = 40,
  tone = 'light',
  className,
}: {
  size?: number;
  /** 'light' = white SHOT (on navy); 'dark' = navy SHOT (on white) */
  tone?: 'light' | 'dark';
  className?: string;
}) {
  return (
    <span
      className={className}
      data-brand-logo
      style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(size * 0.3) }}
    >
      <ShotLogTile size={size} />
      <span
        style={{
          fontWeight: 800,
          fontSize: Math.round(size * 0.6),
          letterSpacing: '-0.01em',
          lineHeight: 1,
          color: tone === 'light' ? '#FFFFFF' : '#1C3859',
        }}
      >
        SHOT<span style={{ color: '#EE7A2E' }}>LOG</span>
      </span>
    </span>
  );
}

export default ShotLogLogo;
