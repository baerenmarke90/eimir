import { ContentVisibility } from '../api/generated/models/ContentVisibility';
import { DateRepeat } from '../api/generated/models/DateRepeat';
import { ImportantDateType } from '../api/generated/models/ImportantDateType';
import type { ImportantDateView } from '../api/generated/models/ImportantDateView';

/**
 * #1907 F2: occasions a memory can fall on, derived from data the Space
 * already exposes. Nothing is stored; the match is recomputed per viewer.
 *
 * All dates are date-only values as delivered by the API (UTC midnight), so
 * every comparison uses UTC calendar fields and never the device time zone.
 */
export type SpaceOccasion =
  | { kind: 'relationship'; key: string; date: Date }
  | {
      kind: 'birthday';
      key: string;
      date: Date;
      accountId: string;
      displayName: string;
      isViewer: boolean;
    }
  | {
      kind: 'custom';
      key: string;
      date: Date;
      label: string;
      type: ImportantDateType;
      repeats: DateRepeat;
    };

export type OccasionMatch =
  | { kind: 'relationship'; key: string; years: number }
  | {
      kind: 'birthday';
      key: string;
      accountId: string;
      displayName: string;
      isViewer: boolean;
    }
  | { kind: 'custom'; key: string; label: string; type: ImportantDateType };

export interface PartnerBirthday {
  accountId: string;
  displayName: string;
  birthday: Date;
}

const validDate = (value: Date | null | undefined): value is Date =>
  Boolean(value) && Number.isFinite(value?.getTime());

const sameMonthDay = (a: Date, b: Date) =>
  a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();

/** The day an annual occasion falls on in `year`; 29 Feb → 28 Feb otherwise. */
export function annualOccurrence(date: Date, year: number): Date {
  const month = date.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay)));
}

/**
 * Collects the couple's own occasions. Product Owner decision (2026-11-15):
 * only the relationship start, both partners' birthdays and shared important
 * dates that are not linked to a related person count. Private dates are
 * ignored even for their owner so both partners see the same mark; the server
 * already withholds the other partner's private dates.
 */
export function collectSpaceOccasions({
  relationshipStartedOn,
  birthdays,
  importantDates,
  viewerAccountId,
}: {
  relationshipStartedOn?: Date | null;
  birthdays: readonly (PartnerBirthday | null | undefined)[];
  importantDates: readonly ImportantDateView[];
  viewerAccountId?: string;
}): SpaceOccasion[] {
  const occasions: SpaceOccasion[] = [];
  const relationshipStart = validDate(relationshipStartedOn)
    ? relationshipStartedOn
    : null;
  if (relationshipStart)
    occasions.push({
      kind: 'relationship',
      key: 'relationship',
      date: relationshipStart,
    });
  const partnerBirthdays = birthdays.filter(
    (entry): entry is PartnerBirthday =>
      Boolean(entry) && validDate(entry?.birthday),
  );
  for (const entry of partnerBirthdays)
    occasions.push({
      kind: 'birthday',
      key: `birthday:${entry.accountId}`,
      date: entry.birthday,
      accountId: entry.accountId,
      displayName: entry.displayName,
      isViewer: entry.accountId === viewerAccountId,
    });
  for (const date of importantDates) {
    if (
      date.visibility !== ContentVisibility.SHARED ||
      date.relatedPersonId ||
      !validDate(date.date)
    )
      continue;
    const annual = date.repeats === DateRepeat.ANNUALLY;
    // An explicit record of the anniversary or a partner's birthday repeats
    // what the derived occasion already says (with more meaning).
    const duplicatesRelationship =
      annual &&
      date.type === ImportantDateType.ANNIVERSARY &&
      relationshipStart !== null &&
      sameMonthDay(date.date, relationshipStart);
    const duplicatesBirthday =
      annual &&
      date.type === ImportantDateType.BIRTHDAY &&
      partnerBirthdays.some((entry) => sameMonthDay(date.date, entry.birthday));
    if (duplicatesRelationship || duplicatesBirthday) continue;
    occasions.push({
      kind: 'custom',
      key: `date:${date.id}`,
      date: date.date,
      label: date.label.trim(),
      type: date.type,
      repeats: date.repeats,
    });
  }
  return occasions;
}

const DAY_MS = 86_400_000;
/** A memory range longer than this is not an occasion "on that day". */
const MAX_RANGE_DAYS = 31;

function dayValue(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function matchIn(
  occasion: SpaceOccasion,
  from: number,
  until: number,
): OccasionMatch | null {
  const origin = dayValue(occasion.date);
  if (occasion.kind === 'custom' && occasion.repeats !== DateRepeat.ANNUALLY)
    return origin >= from && origin <= until
      ? {
          kind: 'custom',
          key: occasion.key,
          label: occasion.label,
          type: occasion.type,
        }
      : null;
  const originYear = occasion.date.getUTCFullYear();
  const fromYear = new Date(from).getUTCFullYear();
  const untilYear = new Date(until).getUTCFullYear();
  for (let year = Math.max(fromYear, originYear); year <= untilYear; year++) {
    const day = dayValue(annualOccurrence(occasion.date, year));
    if (day < from || day > until) continue;
    if (occasion.kind === 'relationship')
      return {
        kind: 'relationship',
        key: occasion.key,
        years: year - originYear,
      };
    // Nobody celebrates a birthday on the day they are born.
    if (occasion.kind === 'birthday') {
      if (year === originYear) continue;
      return {
        kind: 'birthday',
        key: occasion.key,
        accountId: occasion.accountId,
        displayName: occasion.displayName,
        isViewer: occasion.isViewer,
      };
    }
    return {
      kind: 'custom',
      key: occasion.key,
      label: occasion.label,
      type: occasion.type,
    };
  }
  return null;
}

/**
 * Occasions on the memory's day, or inside its range for a multi-day memory.
 * Order: relationship, the viewer's birthday, the partner's, then shared
 * dates by label.
 */
export function occasionsOn(
  happenedOn: Date | null | undefined,
  happenedUntil: Date | null | undefined,
  occasions: readonly SpaceOccasion[],
  locale?: string,
): OccasionMatch[] {
  if (!validDate(happenedOn)) return [];
  const from = dayValue(happenedOn);
  const end = validDate(happenedUntil) ? dayValue(happenedUntil) : from;
  if (end < from || (end - from) / DAY_MS > MAX_RANGE_DAYS) {
    // A broken or very long range only marks its first day.
    return occasionsOn(happenedOn, null, occasions, locale);
  }
  const rank = (match: OccasionMatch) =>
    match.kind === 'relationship'
      ? 0
      : match.kind === 'birthday'
        ? match.isViewer
          ? 1
          : 2
        : 3;
  return occasions
    .map((occasion) => matchIn(occasion, from, end))
    .filter((match): match is OccasionMatch => match !== null)
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (a.kind === 'custom' && b.kind === 'custom'
          ? a.label.localeCompare(b.label, locale)
          : 0),
    );
}
