import type { ReactNode } from 'react';
import type { PersonKey } from '../client/dailyInsightsModel';
import { isoToDate, type IsoDate } from '../client/dailyInsightsModel';
import { resolvedLocale, useTranslation } from '../i18n';
import { PersonIdentity } from './PersonIdentity';
import { ProMark as SharedProMark } from './ProMark';

export type InsightIconName =
  | 'calendar'
  | 'bars'
  | 'hearts'
  | 'sprout'
  | 'moon'
  | 'trend'
  | 'sun'
  | 'people'
  | 'bolt'
  | 'heart'
  | 'sparkle';

const ICON_PATHS: Record<InsightIconName, ReactNode> = {
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="3.5" />
      <path d="M4 10h16M8.5 3v4M15.5 3v4" />
    </>
  ),
  bars: <path d="M6 20v-7M12 20V6M18 20v-10" />,
  hearts: (
    <>
      <path d="M9 17.5s-5-3.1-5-7a3 3 0 0 1 5-2.1 3 3 0 0 1 5 2.1c0 3.9-5 7-5 7z" />
      <path d="M15.5 19.5s-4.5-2.7-4.5-6.2M15 8.2A3 3 0 0 1 20 10.3c0 3.9-4.5 7.2-4.5 7.2" />
    </>
  ),
  sprout: (
    <path d="M12 20v-8M12 12c0-4 3-6 7-6 0 4-3 6-7 6ZM12 15c0-3-2-5-6-5 0 3 2 5 6 5Z" />
  ),
  moon: <path d="M19.5 14.5A8 8 0 1 1 9.5 4.5a6.5 6.5 0 0 0 10 10Z" />,
  trend: <path d="m4 17 5-5 4 3 7-8M15 7h5v5" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="9" r="3" />
      <circle cx="17" cy="10" r="2.4" />
      <path d="M3.5 19c.5-3 2.7-5 5.5-5s5 2 5.5 5M15.5 14.5c2.6 0 4.4 1.7 5 4.5" />
    </>
  ),
  bolt: <path d="M13 3 5.5 13H11l-1 8 7.5-10H12z" />,
  heart: (
    <path d="M12 20s-7.5-4.6-7.5-10.3A4.2 4.2 0 0 1 12 7.4a4.2 4.2 0 0 1 7.5 2.3C19.5 15.4 12 20 12 20Z" />
  ),
  sparkle: (
    <path d="M12 3.5 13.8 10 20.5 12l-6.7 2L12 20.5 10.2 14 3.5 12l6.7-2z" />
  ),
};

export function InsightIcon({
  name,
  className = 'insight-icon',
}: {
  name: InsightIconName;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

/** A quiet quality mark, never an upgrade prompt. */
export function ProMark({ label }: { label?: string }) {
  const { t } = useTranslation();
  return <SharedProMark label={label ?? t('dailyInsights.pro')} />;
}

/** Decorative handwritten accent; the same meaning is never carried only here. */
export function Handwriting({ children }: { children: ReactNode }) {
  return (
    <span className="insight-handwriting" aria-hidden="true">
      {children}
    </span>
  );
}

export interface InsightPerson {
  key: PersonKey;
  name: string;
  imageUrl: string | null;
}

/** Partner identity is avatar + first name plus a non-color marker shape. */
export function PersonLegend({ people }: { people: readonly InsightPerson[] }) {
  const { t } = useTranslation();
  return (
    <ul className="insight-legend">
      {people.map((person) => (
        <li key={person.key}>
          <PersonIdentity
            displayName={person.name}
            imageUrl={person.imageUrl}
            size="small"
            imageAlt={t(
              person.key === 'own'
                ? 'dailyInsights.people.ownAvatar'
                : 'dailyInsights.people.partnerAvatar',
              { name: person.name },
            )}
            fallbackAlt={t(
              person.key === 'own'
                ? 'dailyInsights.people.ownInitials'
                : 'dailyInsights.people.partnerInitials',
              { name: person.name },
            )}
          />
          <span
            className={`insight-marker insight-marker-${person.key}`}
            role="img"
            aria-label={t(
              person.key === 'own'
                ? 'dailyInsights.people.ownMarker'
                : 'dailyInsights.people.partnerMarker',
            )}
          />
        </li>
      ))}
    </ul>
  );
}

export function InsightStatement({
  icon,
  title,
  body,
  index,
}: {
  icon: InsightIconName;
  title: string;
  body: string;
  index?: number;
}) {
  return (
    <li className="insight-statement">
      {index !== undefined ? (
        <span className="insight-statement-index" aria-hidden="true">
          {index}
        </span>
      ) : null}
      <span className="insight-statement-icon">
        <InsightIcon name={icon} />
      </span>
      <span className="insight-statement-copy">
        <strong>{title}</strong>
        <span>{body}</span>
      </span>
    </li>
  );
}

/* Formatting --------------------------------------------------------------- */

function format(iso: IsoDate, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(resolvedLocale(), {
    ...options,
    timeZone: 'UTC',
  }).format(isoToDate(iso));
}

export function formatWeekdayShort(iso: IsoDate): string {
  return format(iso, { weekday: 'short' }).replace(/\.$/u, '');
}

export function formatWeekdayNarrow(iso: IsoDate): string {
  return format(iso, { weekday: 'narrow' });
}

/** Short weekday that collapses to one letter only when the axis is tight. */
export function WeekdayLabel({ date }: { date: IsoDate }) {
  return (
    <span>
      <span className="insight-wd-short">{formatWeekdayShort(date)}</span>
      <span className="insight-wd-narrow">{formatWeekdayNarrow(date)}</span>
    </span>
  );
}

export function formatWeekdayLong(iso: IsoDate): string {
  return format(iso, { weekday: 'long' });
}

export function formatDayLong(iso: IsoDate): string {
  return format(iso, { weekday: 'long', day: 'numeric', month: 'long' });
}

export function formatDayShort(iso: IsoDate): string {
  return format(iso, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function formatDayMonth(iso: IsoDate): string {
  return format(iso, { day: 'numeric', month: 'long' });
}

export function formatMonthYear(iso: IsoDate): string {
  return format(iso, { month: 'long', year: 'numeric' });
}

export function formatDayNumber(iso: IsoDate): string {
  return format(iso, { day: 'numeric' });
}
