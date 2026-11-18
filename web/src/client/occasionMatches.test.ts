import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContentVisibility } from '../api/generated/models/ContentVisibility';
import { DateRepeat } from '../api/generated/models/DateRepeat';
import { ImportantDateType } from '../api/generated/models/ImportantDateType';
import {
  type ImportantDateView,
  ImportantDateViewFromJSON,
} from '../api/generated/models/ImportantDateView';
import {
  annualOccurrence,
  collectSpaceOccasions,
  occasionsOn,
} from './occasionMatches';

const day = (value: string) => new Date(`${value}T00:00:00Z`);

function importantDate(
  overrides: Partial<Record<string, unknown>> = {},
): ImportantDateView {
  return ImportantDateViewFromJSON({
    id: 'date-1',
    spaceId: 'space',
    ownerId: 'viewer',
    label: 'Wedding day',
    type: ImportantDateType.ANNIVERSARY,
    date: '2024-08-03',
    repeats: DateRepeat.ANNUALLY,
    visibility: ContentVisibility.SHARED,
    relatedPersonId: null,
    createdAt: '2024-08-03T10:00:00Z',
    updatedAt: '2024-08-03T10:00:00Z',
    version: 1,
    ...overrides,
  });
}

const VIEWER = 'viewer';
const PARTNER = 'partner';

function occasions(dates: ImportantDateView[] = []) {
  return collectSpaceOccasions({
    relationshipStartedOn: day('2023-06-17'),
    birthdays: [
      { accountId: VIEWER, displayName: 'Lea', birthday: day('1995-02-28') },
      { accountId: PARTNER, displayName: 'Alex', birthday: day('1994-05-12') },
    ],
    importantDates: dates,
    viewerAccountId: VIEWER,
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('occasion matching (#1907 F2)', () => {
  it('counts the years of the relationship on its anniversary', () => {
    expect(occasionsOn(day('2026-06-17'), null, occasions())).toEqual([
      { kind: 'relationship', key: 'relationship', years: 3 },
    ]);
    expect(occasionsOn(day('2023-06-17'), null, occasions())).toEqual([
      { kind: 'relationship', key: 'relationship', years: 0 },
    ]);
    // Before the relationship began there is no anniversary.
    expect(occasionsOn(day('2022-06-17'), null, occasions())).toEqual([]);
    expect(occasionsOn(day('2026-06-18'), null, occasions())).toEqual([]);
  });

  it('marks both partners’ birthdays and tells whose it is', () => {
    expect(occasionsOn(day('2026-05-12'), null, occasions())).toEqual([
      {
        kind: 'birthday',
        key: `birthday:${PARTNER}`,
        accountId: PARTNER,
        displayName: 'Alex',
        isViewer: false,
      },
    ]);
    expect(occasionsOn(day('2026-02-28'), null, occasions())[0]).toMatchObject({
      kind: 'birthday',
      isViewer: true,
    });
    // The day of birth itself is not a birthday.
    expect(occasionsOn(day('1994-05-12'), null, occasions())).toEqual([]);
  });

  it('moves a leap-day occasion to 28 February in other years', () => {
    const leap = collectSpaceOccasions({
      relationshipStartedOn: day('2020-02-29'),
      birthdays: [],
      importantDates: [],
    });
    expect(annualOccurrence(day('2020-02-29'), 2023)).toEqual(
      day('2023-02-28'),
    );
    expect(occasionsOn(day('2023-02-28'), null, leap)).toEqual([
      { kind: 'relationship', key: 'relationship', years: 3 },
    ]);
    expect(occasionsOn(day('2023-03-01'), null, leap)).toEqual([]);
    expect(occasionsOn(day('2024-02-29'), null, leap)).toEqual([
      { kind: 'relationship', key: 'relationship', years: 4 },
    ]);
    expect(occasionsOn(day('2024-02-28'), null, leap)).toEqual([]);
  });

  it('compares calendar dates independent of the device time zone', () => {
    vi.stubEnv('TZ', 'Pacific/Honolulu');
    // A date-only API value is UTC midnight; in Honolulu that is the day before.
    expect(occasionsOn(day('2026-06-17'), null, occasions())).toHaveLength(1);
    vi.stubEnv('TZ', 'Pacific/Kiritimati');
    expect(occasionsOn(day('2026-06-17'), null, occasions())).toHaveLength(1);
    expect(occasionsOn(day('2026-06-16'), null, occasions())).toHaveLength(0);
  });

  it('lists several occasions on one day in a stable order', () => {
    const sameDay = collectSpaceOccasions({
      relationshipStartedOn: day('2023-05-12'),
      birthdays: [
        {
          accountId: PARTNER,
          displayName: 'Alex',
          birthday: day('1994-05-12'),
        },
        { accountId: VIEWER, displayName: 'Lea', birthday: day('1996-05-12') },
      ],
      importantDates: [
        importantDate({
          id: 'b',
          label: 'Graduation',
          type: ImportantDateType.CUSTOM,
          date: '2020-05-12',
        }),
        importantDate({
          id: 'a',
          label: 'Arrival',
          type: ImportantDateType.CUSTOM,
          date: '2021-05-12',
        }),
      ],
      viewerAccountId: VIEWER,
    });
    expect(
      occasionsOn(day('2026-05-12'), null, sameDay, 'de').map((m) => m.key),
    ).toEqual([
      'relationship',
      `birthday:${VIEWER}`,
      `birthday:${PARTNER}`,
      'date:a',
      'date:b',
    ]);
  });

  it('ignores private dates and dates linked to a related person', () => {
    const list = occasions([
      importantDate({ id: 'private', visibility: ContentVisibility.PRIVATE }),
      importantDate({ id: 'person', relatedPersonId: 'person-1' }),
      importantDate({
        id: 'person-birthday',
        type: ImportantDateType.BIRTHDAY,
        relatedPersonId: 'person-2',
      }),
    ]);
    expect(list.map((occasion) => occasion.key)).toEqual([
      'relationship',
      `birthday:${VIEWER}`,
      `birthday:${PARTNER}`,
    ]);
    expect(occasionsOn(day('2026-08-03'), null, list)).toEqual([]);
  });

  it('marks shared annual and one-off dates from their own year on', () => {
    const list = occasions([
      importantDate(),
      importantDate({
        id: 'once',
        label: 'Move',
        type: ImportantDateType.CUSTOM,
        date: '2025-09-01',
        repeats: DateRepeat.NONE,
      }),
    ]);
    expect(occasionsOn(day('2026-08-03'), null, list)).toEqual([
      {
        kind: 'custom',
        key: 'date:date-1',
        label: 'Wedding day',
        type: ImportantDateType.ANNIVERSARY,
      },
    ]);
    expect(occasionsOn(day('2023-08-03'), null, list)).toEqual([]);
    expect(occasionsOn(day('2025-09-01'), null, list)[0]).toMatchObject({
      key: 'date:once',
    });
    expect(occasionsOn(day('2026-09-01'), null, list)).toEqual([]);
  });

  it('drops explicit records that repeat the anniversary or a birthday', () => {
    const list = occasions([
      importantDate({ id: 'anniversary', date: '2023-06-17' }),
      importantDate({
        id: 'birthday',
        type: ImportantDateType.BIRTHDAY,
        label: 'Alex birthday',
        date: '1994-05-12',
      }),
    ]);
    expect(list.map((occasion) => occasion.key)).not.toContain(
      'date:anniversary',
    );
    expect(list.map((occasion) => occasion.key)).not.toContain('date:birthday');
  });

  it('finds an occasion inside a multi-day memory', () => {
    expect(
      occasionsOn(day('2026-06-14'), day('2026-06-20'), occasions()),
    ).toEqual([{ kind: 'relationship', key: 'relationship', years: 3 }]);
    // Across New Year the range still covers both years.
    const newYear = occasions([
      importantDate({
        id: 'ny',
        label: 'New Year kiss',
        type: ImportantDateType.CUSTOM,
        date: '2023-12-31',
      }),
    ]);
    expect(
      occasionsOn(day('2025-12-28'), day('2026-01-03'), newYear),
    ).toHaveLength(1);
    // A very long or inverted range only marks its first day.
    expect(
      occasionsOn(day('2026-01-01'), day('2026-12-31'), occasions()),
    ).toEqual([]);
    expect(
      occasionsOn(day('2026-06-17'), day('2026-06-01'), occasions()),
    ).toHaveLength(1);
  });

  it('returns nothing without a valid date', () => {
    expect(occasionsOn(null, null, occasions())).toEqual([]);
    expect(occasionsOn(new Date(Number.NaN), null, occasions())).toEqual([]);
  });
});
