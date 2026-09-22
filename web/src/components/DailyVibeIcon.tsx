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
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  let shape;
  switch (value) {
    case DailyVibe.GOOD:
      shape = (
        <>
          <circle cx="12" cy="12" r="3.2" />
          <path d="M12 3.2v2.1M12 18.7v2.1M3.2 12h2.1M18.7 12h2.1M5.8 5.8l1.5 1.5M16.7 16.7l1.5 1.5M18.2 5.8l-1.5 1.5M7.3 16.7l-1.5 1.5" />
        </>
      );
      break;
    case DailyVibe.OKAY:
      shape = (
        <>
          <circle cx="12" cy="12" r="7.4" />
          <path d="M8.6 12h6.8" />
        </>
      );
      break;
    case DailyVibe.STRESSED:
      shape = (
        <>
          <path d="M4.5 13c2.2-6.1 4.1 6.1 6.3 0s4.1 6.1 6.3 0 2.4-1.8 2.4-1.8" />
          <path d="M6.2 8.1 7.6 5.8M16.4 18.2l1.4-2.3" />
        </>
      );
      break;
    case DailyVibe.SAD:
      shape = (
        <>
          <path d="M5.2 10.4c1.9-4.3 11.7-4.3 13.6 0" />
          <path d="M8.2 16.1c2.3-2.2 5.3-2.2 7.6 0" />
          <path d="M17.7 11.9c0 1.7-1.2 2.9-1.2 2.9s-1.2-1.2-1.2-2.9a1.2 1.2 0 0 1 2.4 0Z" />
        </>
      );
      break;
    case DailyVibe.NEEDS_CONNECTION:
      shape = (
        <path d="M12 20s-7-4.3-7-10a4.1 4.1 0 0 1 7-2.9A4.1 4.1 0 0 1 19 10c0 5.7-7 10-7 10Z" />
      );
      break;
    case DailyVibe.NEEDS_SPACE:
      shape = (
        <>
          <circle cx="12" cy="12" r="5.1" />
          <path d="M12 3.1v2M12 18.9v2M3.1 12h2M18.9 12h2" />
        </>
      );
      break;
  }

  return (
    <svg
      className={`daily-vibe-icon ${className}`.trim()}
      viewBox="0 0 24 24"
      aria-hidden="true"
      data-vibe-icon={value}
      {...common}
    >
      {shape}
    </svg>
  );
}
