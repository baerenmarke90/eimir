import type { ReactNode } from 'react';
import {
  DailyVibe,
  type DailyVibe as DailyVibeValue,
} from '../api/generated/models/DailyVibe';

/**
 * The single source of the duotone vibe faces (#1790, Product Owner decision
 * 2026-11-13). Contour and features follow `currentColor`; warm and cool
 * accents come from the identity tokens so they adapt to Light and Dark.
 * Accents only clarify a face: the localized vibe label always accompanies
 * the glyph, which stays decorative for assistive technology.
 */
const warmFill = 'var(--identity-icon-warm-fill)';
const coolFill = 'var(--identity-icon-cool-fill)';

function Dot({ cx, cy, r = 0.9 }: { cx: number; cy: number; r?: number }) {
  return <circle cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />;
}

function vibeFace(value: DailyVibeValue): ReactNode {
  switch (value) {
    case DailyVibe.VERY_GOOD:
      return (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <circle
            cx="7.4"
            cy="13.3"
            r="1.35"
            fill={warmFill}
            stroke="none"
            opacity=".55"
          />
          <circle
            cx="16.6"
            cy="13.3"
            r="1.35"
            fill={warmFill}
            stroke="none"
            opacity=".55"
          />
          <path d="M8.3 10q.85-1.3 1.7 0m4 0q.85-1.3 1.7 0M8.8 13.6h6.4a3.2 3.2 0 0 1-6.4 0Z" />
        </>
      );
    case DailyVibe.GOOD:
      return (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M8.3 10.4h1.9m3.6 0h1.9M9.4 14.4q2.6 1.9 5.2 0" />
          <path className="accent" d="M18.4 3.2v2.2m-1.1-1.1h2.2" />
        </>
      );
    case DailyVibe.OKAY:
      return (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <Dot cx={9.2} cy={10.2} />
          <Dot cx={14.8} cy={10.2} />
          <path className="accent" d="M9 15h6" />
        </>
      );
    case DailyVibe.STRESSED:
      return (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="m8.2 9 2 1.1m5.6-1.1-2 1.1M8.6 15.2l1.35-.9 1.35.9 1.35-.9 1.35.9 1.35-.9" />
          <path className="accent" d="m19.6 7 1.6-.9m-1 3.4 1.8.2" />
        </>
      );
    case DailyVibe.SAD:
      return (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <Dot cx={9.2} cy={10.2} />
          <Dot cx={14.8} cy={10.2} />
          <path d="M9 16q3-2.6 6 0" />
          <path
            d="M15.4 12.1c.55.85.95 1.45.95 1.95a.95.95 0 0 1-1.9 0c0-.5.4-1.1.95-1.95Z"
            fill={coolFill}
            stroke="none"
          />
        </>
      );
    case DailyVibe.NEEDS_CONNECTION:
      return (
        <>
          <path d="M19.1 8.6A8.5 8.5 0 1 1 13.9 3.7" />
          <Dot cx={9.2} cy={10.6} />
          <Dot cx={14.8} cy={10.6} />
          <path d="M9.4 14.6q2.6 1.7 5.2 0" />
          <path
            d="M18.6 7.4s-2.6-1.6-2.6-3.3a1.35 1.35 0 0 1 2.6-.6 1.35 1.35 0 0 1 2.6.6c0 1.7-2.6 3.3-2.6 3.3Z"
            fill={warmFill}
            stroke="none"
          />
        </>
      );
    case DailyVibe.NEEDS_SPACE:
      return (
        <>
          <path d="M19.4 9.2A8.5 8.5 0 1 1 13.5 3.6" />
          <path d="M8.2 10.6q1 .9 2 0m3.6 0q1 .9 2 0M10.4 14.8h3.2" />
          <path
            d="M21.2 5.9a2.6 2.6 0 0 1-3.2-3.2 2.7 2.7 0 1 0 3.2 3.2Z"
            fill={coolFill}
            stroke="none"
          />
        </>
      );
  }
  return null;
}

export function DailyVibeIcon({
  value,
  className = '',
}: {
  value: DailyVibeValue;
  className?: string;
}) {
  return (
    <svg
      className={`eimir-icon daily-vibe-icon ${className}`.trim()}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.65}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-vibe-icon={value}
    >
      {vibeFace(value)}
    </svg>
  );
}
