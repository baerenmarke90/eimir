import type { ReactNode } from 'react';
import {
  DailyVibe,
  type DailyVibe as DailyVibeValue,
} from '../api/generated/models/DailyVibe';

export function DailyVibeIcon({
  value,
  className = '',
}: {
  value: DailyVibeValue;
  className?: string;
}) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.65,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  let shape: ReactNode = null;
  switch (value) {
    case DailyVibe.GOOD:
      shape = (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M7.5 10.5q1.5-2 3 0m3 0q1.5-2 3 0M8.5 14q3.5 4 7 0" />
        </>
      );
      break;
    case DailyVibe.OKAY:
      shape = (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <circle cx="9" cy="10" r=".6" fill="currentColor" stroke="none" />
          <circle cx="15" cy="10" r=".6" fill="currentColor" stroke="none" />
          <path d="M9 15h6" />
        </>
      );
      break;
    case DailyVibe.STRESSED:
      shape = (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="m8 9.5 2 1-2 1m8-2-2 1 2 1M8 15q1-2 2 0t2 0 2 0 2 0" />
        </>
      );
      break;
    case DailyVibe.SAD:
      shape = (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <circle cx="9" cy="10" r=".6" fill="currentColor" stroke="none" />
          <circle cx="15" cy="10" r=".6" fill="currentColor" stroke="none" />
          <path d="M8.5 16q3.5-4 7 0" />
        </>
      );
      break;
    case DailyVibe.NEEDS_CONNECTION:
      shape = (
        <path d="M12 20.5S3.5 15.3 3.5 9.5a4.6 4.6 0 0 1 8.5-2.4 4.6 4.6 0 0 1 8.5 2.4c0 5.8-8.5 11-8.5 11Z" />
      );
      break;
    case DailyVibe.NEEDS_SPACE:
      shape = (
        <path d="M20.5 13.2A8.6 8.6 0 0 1 10.8 3.5a8.6 8.6 0 1 0 9.7 9.7Z" />
      );
      break;
  }

  return (
    <svg
      className={`daily-vibe-icon ${className}`.trim()}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      data-vibe-icon={value}
      {...common}
    >
      {shape}
    </svg>
  );
}

