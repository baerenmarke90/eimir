/**
 * Today's occasion for the Wir important-day Moment (#2072). It reuses the
 * occasion matching of `OccasionMark` and the shared occasion queries.
 *
 * Only occasions visible to the viewer qualify: the relationship start (its
 * anniversary and its round days), both partners' birthdays
 * (`collectSpaceOccasions`), and shared important dates that are not linked
 * to a related person. Private dates and discreet or surprise plans never
 * surface.
 *
 * Wir does not fetch the important-date list for this. The dashboard it
 * already loads lists today's shared important dates in `upcoming`, filtered
 * by the server with the same rule (shared, no related person), so the
 * Moment adds no request and works from the dashboard's offline cache.
 */
import type { TFunction } from 'i18next';
import { useMemo } from 'react';
import { DashboardItemType } from '../api/generated/models/DashboardItemType';
import { DateRepeat } from '../api/generated/models/DateRepeat';
import { ImportantDateType } from '../api/generated/models/ImportantDateType';
import {
  type OccasionMatch,
  occasionsOn,
  type SpaceOccasion,
} from '../client/occasionMatches';
import { usePartnerNickname } from '../client/partnerNickname';
import { firstNameFromDisplayName } from '../client/personalName';
import { ROUND_DAYS } from '../client/storyWaymarks';
import { useSpaceOccasions } from '../client/useSpaceOccasions';
import { resolvedLocale, useTranslation } from '../i18n';
import { occasionMarkText } from './OccasionMark';
import { localDay, type WirOccasion } from './wirImportantDay';

/** A short non-reversible tag for the occasion key (FNV-1a). */
export function occasionTag(key: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function primaryCopy(
  match: OccasionMatch,
  t: TFunction,
  nicknameFor: (accountId: string) => string | null,
): string {
  switch (match.kind) {
    case 'relationship':
      return match.years === 0
        ? t('occasionMarks.todayRelationshipStart')
        : t('occasionMarks.todayAnniversary', { count: match.years });
    case 'birthday':
      return match.isViewer
        ? t('occasionMarks.todayOwnBirthday')
        : t('occasionMarks.todayPartnerBirthday', {
            name:
              nicknameFor(match.accountId) ||
              firstNameFromDisplayName(match.displayName, match.displayName),
          });
    default:
      return match.label;
  }
}

/** The dashboard's `upcoming` entry the Moment reads (a subset). */
export interface UpcomingDate {
  type: DashboardItemType;
  id: string;
  titleOrText: string | null;
  occurredOn: Date | null;
}

function dayDate(day: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date));
}

/**
 * Today's shared important dates from the dashboard's `upcoming` list, as
 * occasions (`occurredOn` is the next occurrence, a date-only value).
 */
export function sharedDatesToday(
  upcoming: readonly UpcomingDate[],
  day: string,
): SpaceOccasion[] {
  const today = dayDate(day).getTime();
  return upcoming
    .filter(
      (item) =>
        item.type === DashboardItemType.IMPORTANT_DATE &&
        item.occurredOn?.getTime() === today &&
        Boolean(item.titleOrText?.trim()),
    )
    .map((item) => ({
      kind: 'custom' as const,
      key: `date:${item.id}`,
      date: dayDate(day),
      label: item.titleOrText?.trim() ?? '',
      type: ImportantDateType.CUSTOM,
      repeats: DateRepeat.NONE,
    }));
}

const DAY_MS = 86_400_000;

/** Whole days from the relationship start (date-only) to `today`. */
function daysSince(start: Date, today: Date): number {
  const origin = Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth(),
    start.getUTCDate(),
  );
  return Math.round((today.getTime() - origin) / DAY_MS);
}

function localeNumber(value: number): string {
  return new Intl.NumberFormat(resolvedLocale()).format(value);
}

/**
 * Today's occasion for Wir: the first by rank, or null.
 *
 * #2370 (Product Owner, 2026-11-28): on the anniversary the quiet line below
 * the heart shows the days together instead of repeating the anniversary,
 * and a round day together (`ROUND_DAYS`) is an occasion of its own, ranked
 * after the anniversary and before birthdays and shared dates. In both, the
 * count rolls into place during the Moment.
 */
export function wirOccasionFor(
  occasions: readonly SpaceOccasion[],
  day: string,
  t: TFunction,
  nicknameFor: (accountId: string) => string | null,
  formatNumber: (value: number) => string = localeNumber,
): WirOccasion | null {
  const today = dayDate(day);
  const match = occasionsOn(today, null, occasions)[0];
  const start = occasions.find(
    (occasion) => occasion.kind === 'relationship',
  )?.date;
  const days = start ? daysSince(start, today) : null;
  const daysTogether = (value: number) => {
    const formatted = formatNumber(value);
    return {
      text: t('occasionMarks.daysTogether', { count: value, days: formatted }),
      formatted,
    };
  };
  if (match?.kind === 'relationship' && match.years > 0 && days !== null) {
    const count = daysTogether(days);
    return {
      playKey: `${day}|${occasionTag(match.key)}`,
      primary: primaryCopy(match, t, nicknameFor),
      secondary: count.text,
      birthday: null,
      count: { line: 'secondary', formatted: count.formatted },
    };
  }
  if (
    match?.kind !== 'relationship' &&
    days !== null &&
    ROUND_DAYS.includes(days)
  ) {
    const count = daysTogether(days);
    return {
      playKey: `${day}|${occasionTag(`round-day:${days}`)}`,
      primary: count.text,
      secondary: '',
      birthday: null,
      count: { line: 'primary', formatted: count.formatted },
    };
  }
  if (!match) return null;
  return {
    playKey: `${day}|${occasionTag(match.key)}`,
    primary: primaryCopy(match, t, nicknameFor),
    secondary:
      match.kind === 'custom' ? '' : occasionMarkText(match, t, nicknameFor),
    birthday:
      match.kind === 'birthday' ? (match.isViewer ? 'own' : 'partner') : null,
    count: null,
  };
}

export function useWirOccasion(
  spaceId: string | undefined,
  accountId: string | undefined,
  upcoming: readonly UpcomingDate[] | undefined,
): WirOccasion | null {
  const { t } = useTranslation();
  const { nicknameFor } = usePartnerNickname();
  const derived = useSpaceOccasions(spaceId, accountId, {
    importantDates: false,
  });
  const day = localDay();
  return useMemo(
    () =>
      spaceId
        ? wirOccasionFor(
            [...derived, ...sharedDatesToday(upcoming ?? [], day)],
            day,
            t,
            nicknameFor,
          )
        : null,
    [spaceId, derived, upcoming, day, t, nicknameFor],
  );
}
