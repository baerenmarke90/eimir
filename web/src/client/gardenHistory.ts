/**
 * Presentation of the garden's history (#2158 G): what happened between the
 * two, told from the reader's side and grouped by the couple's calendar day.
 *
 * The server decides what may be shown (a surprise stays wrapped, a waiting
 * seed keeps its words folded); this module only words it.
 */
import type { TFunction } from 'i18next';
import type { GardenHistoryEntry } from '../api/generated/models/GardenHistoryEntry';
import type { GardenSpecies } from '../api/generated/models/GardenSpecies';
import type { GardenWords } from '../api/generated/models/GardenWords';
import { resolvedLocale } from '../i18n';

export type HistoryRole = 'own' | 'partner' | 'both';

export interface HistoryLine {
  key: string;
  /** Whose colour the entry carries; `both` for something done together. */
  role: HistoryRole;
  text: string;
  /** A quiet second line: the species, whose seed it was, a reveal. */
  detail: string | null;
  words: GardenWords | null;
  /** Flowers shown as the entry's mark: one species, or a bouquet. */
  marks: ReadonlyArray<{ species: GardenSpecies; role: 'own' | 'partner' }>;
}

export interface HistoryDay {
  /** ISO calendar day, the group's identity. */
  day: string;
  label: string;
  lines: HistoryLine[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function isoDay(day: Date): string {
  return day.toISOString().slice(0, 10);
}

/** "Heute", "Gestern" or a localized day, relative to the couple's day. */
export function historyDayLabel(
  day: Date,
  today: Date,
  t: TFunction,
  locale = resolvedLocale(),
): string {
  const difference = Math.round((today.getTime() - day.getTime()) / DAY_MS);
  if (difference === 0) return t('games.garden.history.today');
  if (difference === 1) return t('games.garden.history.yesterday');
  // Domain days arrive as UTC midnight; format them in UTC so they never shift.
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    ...(day.getUTCFullYear() !== today.getUTCFullYear()
      ? { year: 'numeric' as const }
      : {}),
    timeZone: 'UTC',
  }).format(day);
}

interface Names {
  own: string;
  partner: string;
}

/** One entry as a sentence from the reader's side. */
export function historyLine(
  entry: GardenHistoryEntry,
  accountId: string,
  names: Names,
  t: TFunction,
): HistoryLine {
  const roleOf = (id: string | null | undefined): 'own' | 'partner' =>
    id === accountId ? 'own' : 'partner';
  const actor = roleOf(entry.actorId);
  const sender = roleOf(entry.senderId);
  const species = entry.species ?? null;
  const speciesName = species
    ? t(`games.garden.species.${species}.name`)
    : null;
  const fromWhom = speciesName
    ? sender === 'own'
      ? t('games.garden.history.speciesFromYou', { species: speciesName })
      : t('games.garden.history.speciesFrom', {
          species: speciesName,
          name: names.partner,
        })
    : null;
  const mark = species ? [{ species, role: sender }] : [];
  const name = { name: names.partner };
  const base = { key: entry.key, words: null, marks: mark };
  switch (entry.kind) {
    case 'SEED_SENT':
      return {
        ...base,
        role: actor,
        text: t(
          actor === 'own'
            ? 'games.garden.history.seedSentOwn'
            : 'games.garden.history.seedSentPartner',
          name,
        ),
        detail: entry.waiting
          ? [speciesName, t('games.garden.history.seedWaiting')]
              .filter(Boolean)
              .join(' · ')
          : speciesName,
        words: entry.waiting ? null : (entry.words ?? null),
      };
    case 'SEED_PLANTED':
      return {
        ...base,
        role: entry.actorId ? actor : sender,
        text: entry.actorId
          ? t(
              actor === 'own'
                ? 'games.garden.history.plantedOwn'
                : 'games.garden.history.plantedPartner',
              name,
            )
          : t(
              sender === 'own'
                ? 'games.garden.history.plantedItselfOwn'
                : 'games.garden.history.plantedItselfPartner',
              name,
            ),
        detail: speciesName,
      };
    case 'SHARED_DAY':
      return {
        ...base,
        role: 'both',
        text: t('games.garden.history.sharedDay'),
        detail: null,
      };
    case 'FIRST_BLOOM':
      return {
        ...base,
        role: sender,
        text: t(
          sender === 'own'
            ? 'games.garden.history.bloomOwn'
            : 'games.garden.history.bloomPartner',
          name,
        ),
        detail:
          species === 'MOONFLOWER'
            ? t('games.garden.history.moonflowerRevealed')
            : speciesName,
      };
    case 'WATERED':
      return {
        ...base,
        role: actor,
        text: t(
          actor === 'own'
            ? 'games.garden.history.wateredOwn'
            : 'games.garden.history.wateredPartner',
          name,
        ),
        detail: fromWhom,
      };
    case 'WATERED_TOGETHER':
      return {
        ...base,
        role: 'both',
        text: t('games.garden.history.wateredTogether'),
        detail: null,
      };
    case 'BOUQUET_GIVEN':
    case 'BOUQUET_KEPT': {
      const flowers = entry.flowers ?? [];
      const own = entry.kind === 'BOUQUET_GIVEN' ? 'bouquetOwn' : 'keptOwn';
      const partner =
        entry.kind === 'BOUQUET_GIVEN' ? 'bouquetPartner' : 'keptPartner';
      return {
        ...base,
        role: actor,
        text: t(
          `games.garden.history.${actor === 'own' ? own : partner}`,
          name,
        ),
        detail: flowers.length
          ? new Intl.ListFormat(resolvedLocale(), {
              type: 'conjunction',
            }).format(
              flowers.map((flower) =>
                t(`games.garden.species.${flower.species}.name`),
              ),
            )
          : null,
        marks: flowers.map((flower) => ({
          species: flower.species,
          role: roleOf(flower.senderId),
        })),
      };
    }
    default:
      return { ...base, role: actor, text: '', detail: null };
  }
}

/** Entries grouped by day, newest first, as the server ordered them. */
export function historyDays(
  entries: ReadonlyArray<GardenHistoryEntry>,
  today: Date,
  accountId: string,
  names: Names,
  t: TFunction,
): HistoryDay[] {
  const days: HistoryDay[] = [];
  for (const entry of entries) {
    const day = isoDay(entry.happenedOn);
    let group = days[days.length - 1];
    if (group?.day !== day) {
      group = {
        day,
        label: historyDayLabel(entry.happenedOn, today, t),
        lines: [],
      };
      days.push(group);
    }
    const line = historyLine(entry, accountId, names, t);
    if (line.text) group.lines.push(line);
  }
  return days;
}
