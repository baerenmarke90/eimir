import type { ReactNode } from 'react';
import type { PersonKey } from '../client/dailyInsightsModel';
import { type IsoDate, isoToDate } from '../client/dailyInsightsModel';
import { resolvedLocale, useTranslation } from '../i18n';
import { EimirIcon, type EimirIconName } from './EimirIcon';
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

const INSIGHT_ICONS: Record<InsightIconName, EimirIconName> = {
  calendar: 'kalender',
  bars: 'statistiken',
  hearts: 'hearts',
  sprout: 'sprout',
  moon: 'moon',
  trend: 'trend',
  sun: 'sun',
  people: 'gemeinsam',
  bolt: 'bolt',
  heart: 'heart',
  sparkle: 'sparkle',
};

export function InsightIcon({
  name,
  className = 'insight-icon',
}: {
  name: InsightIconName;
  className?: string;
}) {
  return <EimirIcon name={INSIGHT_ICONS[name]} className={className} />;
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
