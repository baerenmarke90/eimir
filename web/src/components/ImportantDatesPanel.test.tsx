// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { PeopleApi } from '../api/generated/apis/PeopleApi';
import { ContentVisibility } from '../api/generated/models/ContentVisibility';
import { DateRepeat } from '../api/generated/models/DateRepeat';
import { ImportantDateType } from '../api/generated/models/ImportantDateType';
import type { ImportantDateView } from '../api/generated/models/ImportantDateView';
import { PersonRelationship } from '../api/generated/models/PersonRelationship';
import type { RelatedPersonView } from '../api/generated/models/RelatedPersonView';
import {
  occasionHolidayPreferenceKey,
  saveOccasionHolidayPreference,
} from '../client/occasionHolidayPreferences';
import { EDITOR_HISTORY_STATE_KEY } from '../client/useEditorHistoryEntry';
import importantDates from '../i18n/locales/importantDates';
import taskSheets from '../i18n/locales/taskSheets';
import { ImportantDatesPanel } from './ImportantDatesPanel';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation((media: string) => ({
      matches: media === '(prefers-reduced-motion: reduce)',
      media,
      addEventListener() {},
      removeEventListener() {},
    })),
  });
});
// The calendar shows the twelve months that start with the current one, so the
// tests pin the local calendar day. Only `Date` is faked: timers stay real for
// Testing Library, user-event and the history-backed editor.
const TODAY = new Date(2026, 5, 10, 12, 0, 0);
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(TODAY);
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.useRealTimers();
});

const LOCALE = 'de';
const monthAndYearFormat = new Intl.DateTimeFormat(LOCALE, {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const detailDateFormat = new Intl.DateTimeFormat(LOCALE, {
  weekday: 'short',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

function utcDay(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

function partnerBirthdayLabel(name: string): string {
  return importantDates.partnerBirthdayLabel.replace('{{name}}', name);
}

type AccessibleName = string | RegExp;

/** List rows of the selected month (and of the past list) with this name. */
function queryOccasionRows(name: AccessibleName): HTMLElement[] {
  return screen
    .queryAllByRole('button', { name })
    .filter((button) => button.classList.contains('important-date-card'));
}

/**
 * One occasion is reachable through its list row, its calendar day and, when
 * it is the nearest one, the lead card. The row is the full timeline item.
 */
async function findOccasionRow(name: AccessibleName): Promise<HTMLElement> {
  return waitFor(() => {
    const rows = queryOccasionRows(name);
    expect(rows).toHaveLength(1);
    return rows[0];
  });
}

function bandMonths(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>('button.occasions-band-month'),
  );
}

/** The band button of a month; its name is the month, year and occasion count. */
function bandMonth(year: number, month: number): HTMLElement {
  const label = monthAndYearFormat.format(utcDay(year, month, 1));
  return screen.getByRole('button', {
    name: new RegExp(`^${label}, \\d+$`),
  });
}

function selectedBandMonths(): HTMLElement[] {
  return bandMonths().filter(
    (button) => button.getAttribute('aria-pressed') === 'true',
  );
}

function sheetTitle(): string | null | undefined {
  return document.querySelector('.occasions-sheet-title')?.textContent;
}

function occasionDayButtons(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>('button.occasions-grid-day'),
  );
}

function leadCard(): HTMLElement {
  const card = document.querySelector<HTMLElement>('button.occasions-next');
  if (!card) throw new Error('lead card not found');
  return card;
}

const person: RelatedPersonView = {
  id: 'person-1',
  displayName: 'Lisa Example',
  relationship: PersonRelationship.FRIEND,
  birthday: null,
  birthdayYearKnown: false,
  visibility: ContentVisibility.SHARED,
  showBirthdayOnDashboard: false,
  avatarAttachmentId: null,
  version: 2,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
};

const date: ImportantDateView = {
  id: 'date-1',
  label: 'Our first shared seaside holiday',
  date: new Date('2026-09-21T00:00:00Z'),
  relatedPersonId: person.id,
  repeats: DateRepeat.ANNUALLY,
  type: ImportantDateType.ANNIVERSARY,
  visibility: ContentVisibility.SHARED,
  version: 3,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
};

function importantDate(
  id: string,
  label: string,
  overrides: Partial<ImportantDateView> = {},
): ImportantDateView {
  return { ...date, id, label, ...overrides };
}

function createMockPeopleApi(dates: ImportantDateView[] = [date]): PeopleApi {
  let values = [...dates];
  return {
    listImportantDatesApiV1SpacesSpaceIdImportantDatesGet: vi
      .fn()
      .mockImplementation(async () => values),
    createImportantDateApiV1SpacesSpaceIdImportantDatesPost: vi
      .fn()
      .mockImplementation(({ importantDateFields }) =>
        Promise.resolve(
          values[
            values.push({
              id: 'date-new',
              ...importantDateFields,
              version: 1,
              createdAt: new Date(),
              updatedAt: new Date(),
            }) - 1
          ],
        ),
      ),
    updateImportantDateApiV1SpacesSpaceIdImportantDatesDateIdPut: vi
      .fn()
      .mockImplementation(async ({ dateId, importantDateFields }) => {
        const saved = {
          id: dateId,
          ...importantDateFields,
          version: 4,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        values = values.map((value) => (value.id === dateId ? saved : value));
        return saved;
      }),
    deleteImportantDateApiV1SpacesSpaceIdImportantDatesDateIdDelete: vi
      .fn()
      .mockImplementation(async ({ dateId }) => {
        values = values.filter((value) => value.id !== dateId);
      }),
  } as unknown as PeopleApi;
}

function renderPanel(
  peopleApi = createMockPeopleApi(),
  partnerBirthday: {
    accountId: string;
    birthday: Date;
    displayName: string;
  } | null = null,
  people = [person],
  holidayContext?: { accountId: string; instance: string },
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return render(
    <MemoryRouter initialEntries={['/plan#dates']}>
      <QueryClientProvider client={queryClient}>
        <ImportantDatesPanel
          peopleApi={peopleApi}
          spaceId="space-1"
          people={people}
          partnerBirthday={partnerBirthday}
          accountId={holidayContext?.accountId}
          instance={holidayContext?.instance}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('ImportantDatesPanel mobile-first surface', () => {
  it('shows opt-in holidays in the existing agenda without persisting or editing generated dates', async () => {
    const holidayContext = {
      instance: 'https://api.example.test',
      accountId: 'account-one',
    };
    saveOccasionHolidayPreference(
      occasionHolidayPreferenceKey(
        holidayContext.instance,
        holidayContext.accountId,
        'space-1',
      ),
      true,
    );
    const api = createMockPeopleApi([]);
    const { container } = renderPanel(api, null, [], holidayContext);
    // St Nicholas is the nearest holiday, so its month opens first.
    const christmasName = new RegExp(importantDates.holidays.christmasDay);
    const easterName = new RegExp(importantDates.holidays.easterSunday);
    const christmas = await findOccasionRow(christmasName);
    expect(christmas.querySelector('.people-chevron')).toBeNull();
    expect(leadCard().textContent).toContain(
      importantDates.holidays.stNicholas,
    );
    expect(sheetTitle()).toBe(monthAndYearFormat.format(utcDay(2026, 12, 1)));
    // Holidays of other months are projected too and wait behind their month.
    expect(queryOccasionRows(easterName)).toHaveLength(0);
    fireEvent.click(bandMonth(2027, 3));
    expect(await findOccasionRow(easterName)).toBeTruthy();
    expect(queryOccasionRows(christmasName)).toHaveLength(0);
    fireEvent.click(bandMonth(2026, 12));
    fireEvent.click(await findOccasionRow(christmasName));
    const reader = screen.getByRole('dialog');
    expect(
      within(reader).getByRole('button', {
        name: importantDates.holidaySettings.manage,
      }),
    ).toBeTruthy();
    expect(
      within(reader).queryByRole('button', { name: importantDates.edit }),
    ).toBeNull();
    expect(container.querySelector('.occasions-list')).toBeTruthy();
    expect(
      api.createImportantDateApiV1SpacesSpaceIdImportantDatesPost,
    ).not.toHaveBeenCalled();
  });

  it('does not add a generated duplicate for an existing annual named occasion', async () => {
    const holidayContext = {
      instance: 'https://api.example.test',
      accountId: 'account-two',
    };
    saveOccasionHolidayPreference(
      occasionHolidayPreferenceKey(
        holidayContext.instance,
        holidayContext.accountId,
        'space-1',
      ),
      true,
    );
    renderPanel(
      createMockPeopleApi([
        importantDate('christmas', importantDates.holidays.christmasDay, {
          date: new Date('2024-12-25T00:00:00Z'),
          repeats: DateRepeat.ANNUALLY,
          type: ImportantDateType.CUSTOM,
        }),
      ]),
      null,
      [],
      holidayContext,
    );
    // The generated holidays render before the saved dates arrive; wait for
    // the saved occasion so the assertion covers the de-duplicated state.
    await waitFor(() =>
      expect(
        document.querySelector('[data-planning-key="christmas"]'),
      ).not.toBeNull(),
    );
    // Exactly one row, and the calendar day names the occasion once.
    const row = await findOccasionRow(
      new RegExp(importantDates.holidays.christmasDay),
    );
    expect(row.getAttribute('data-planning-key')).toBe('christmas');
    const christmasDay = occasionDayButtons().filter(
      (button) => button.textContent === '25',
    );
    expect(christmasDay).toHaveLength(1);
    expect(christmasDay[0].getAttribute('aria-label')).toBe(
      `${detailDateFormat.format(utcDay(2026, 12, 25))}: ${importantDates.holidays.christmasDay}`,
    );
    expect(
      screen.getAllByRole('button', {
        name: new RegExp(importantDates.holidays.christmasDay),
      }),
    ).toHaveLength(2);
  });

  it('projects the active partner birthday without creating an editable ImportantDate', async () => {
    const { container } = renderPanel(createMockPeopleApi([]), {
      accountId: 'partner-1',
      birthday: new Date('1992-05-14T00:00:00Z'),
      displayName: 'Alex',
    });

    const derived = await findOccasionRow(
      new RegExp(partnerBirthdayLabel('Alex')),
    );
    expect(derived.getAttribute('data-planning-key')).toBe('partner:partner-1');
    expect(leadCard().textContent).toContain(partnerBirthdayLabel('Alex'));
    fireEvent.click(derived);
    expect(
      within(screen.getByRole('dialog')).queryByRole('textbox'),
    ).toBeNull();
    expect(
      within(screen.getByRole('dialog')).queryByRole('button', {
        name: importantDates.edit,
      }),
    ).toBeNull();
    expect(container.querySelectorAll('.important-date-card')).toHaveLength(1);
    expect(screen.queryByText(importantDates.emptyTitle)).toBeNull();
  });

  it('deduplicates an existing shared birthday without hiding an independent private date', async () => {
    const birthday = { ...person, birthday: new Date('2000-05-14T00:00:00Z') };
    const explicit = {
      ...date,
      label: 'Existing birthday',
      type: ImportantDateType.BIRTHDAY,
      date: birthday.birthday,
    };
    renderPanel(
      createMockPeopleApi([
        explicit,
        {
          ...explicit,
          id: 'private-birthday',
          label: 'Private birthday note',
          visibility: ContentVisibility.PRIVATE,
        },
      ]),
      null,
      [birthday],
    );
    await findOccasionRow(/Existing birthday/);
    // No projected birthday anywhere: not as a row, a day or the lead card.
    expect(
      screen.queryByRole('button', {
        name: new RegExp(partnerBirthdayLabel(person.displayName)),
      }),
    ).toBeNull();
    expect(await findOccasionRow(/Private birthday note/)).not.toBeNull();
    expect(document.querySelectorAll('.important-date-card')).toHaveLength(2);
    const days = occasionDayButtons();
    expect(days).toHaveLength(1);
    expect(days[0].getAttribute('aria-label')).toBe(
      `${detailDateFormat.format(utcDay(2027, 5, 14))}: Existing birthday, Private birthday note`,
    );
  });

  it('projects a shared birthday even when the only explicit birthday date is private', async () => {
    const birthday = { ...person, birthday: new Date('2000-05-14T00:00:00Z') };
    renderPanel(
      createMockPeopleApi([
        {
          ...date,
          type: ImportantDateType.BIRTHDAY,
          date: birthday.birthday,
          visibility: ContentVisibility.PRIVATE,
        },
      ]),
      null,
      [birthday],
    );
    const projected = await findOccasionRow(
      new RegExp(partnerBirthdayLabel(person.displayName)),
    );
    expect(projected.getAttribute('data-planning-key')).toBe(
      `person:${person.id}`,
    );
    await waitFor(() =>
      expect(document.querySelectorAll('.important-date-card')).toHaveLength(2),
    );
  });

  describe('calendar', () => {
    const picnic = importantDate('date-picnic', 'Summer picnic', {
      date: new Date('2024-07-04T00:00:00Z'),
      relatedPersonId: null,
    });

    it('leads with the nearest occasion and opens it from the lead card', async () => {
      // Listed out of order: the lead card follows the calendar, not the API.
      renderPanel(createMockPeopleApi([date, picnic]));
      await findOccasionRow(new RegExp(picnic.label));

      const lead = leadCard();
      expect(document.querySelectorAll('.occasions-next')).toHaveLength(1);
      expect(lead.getAttribute('aria-haspopup')).toBe('dialog');
      expect(lead.querySelector('.occasions-next-title')?.textContent).toBe(
        picnic.label,
      );
      expect(lead.textContent).not.toContain(date.label);
      const when = lead.querySelector('time');
      expect(when?.getAttribute('datetime')).toBe('2026-07-04');
      expect(when?.textContent).toBe(
        detailDateFormat.format(utcDay(2026, 7, 4)),
      );
      // 10 June to 4 July of the pinned year.
      expect(lead.querySelector('.occasions-next-when')?.textContent).toBe(
        new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' }).format(
          24,
          'day',
        ),
      );

      lead.focus();
      fireEvent.click(lead);
      const reader = screen.getByRole('dialog');
      expect(
        within(reader).getByRole('heading', { name: new RegExp(picnic.label) }),
      ).not.toBeNull();
      expect(within(reader).queryByRole('textbox')).toBeNull();
      expect(
        within(reader).getByRole('button', { name: importantDates.edit }),
      ).not.toBeNull();
      fireEvent.click(
        within(reader).getByRole('button', { name: taskSheets.close }),
      );
      await waitFor(() => expect(document.activeElement).toBe(lead));
    });

    it('shows the month of the next occasion first and follows the month band', async () => {
      renderPanel(createMockPeopleApi([date, picnic]));
      await findOccasionRow(new RegExp(picnic.label));

      // Twelve months starting with the current one.
      const months = bandMonths();
      expect(months).toHaveLength(12);
      expect(months[0]).toBe(bandMonth(2026, 6));
      expect(months[11]).toBe(bandMonth(2027, 5));
      expect(bandMonth(2026, 7).getAttribute('aria-label')).toBe(
        `${monthAndYearFormat.format(utcDay(2026, 7, 1))}, 1`,
      );
      expect(bandMonth(2026, 8).getAttribute('aria-label')).toBe(
        `${monthAndYearFormat.format(utcDay(2026, 8, 1))}, 0`,
      );

      // Default: the month of the next occasion, not the current month.
      expect(selectedBandMonths()).toEqual([bandMonth(2026, 7)]);
      expect(sheetTitle()).toBe(monthAndYearFormat.format(utcDay(2026, 7, 1)));
      expect(document.querySelectorAll('.important-date-card')).toHaveLength(1);
      expect(queryOccasionRows(new RegExp(date.label))).toHaveLength(0);

      fireEvent.click(bandMonth(2026, 9));
      expect(selectedBandMonths()).toEqual([bandMonth(2026, 9)]);
      expect(sheetTitle()).toBe(monthAndYearFormat.format(utcDay(2026, 9, 1)));
      const september = await findOccasionRow(new RegExp(date.label));
      expect(
        september.closest('.occasions-sheet .occasions-list'),
      ).not.toBeNull();
      expect(document.querySelectorAll('.important-date-card')).toHaveLength(1);
      expect(queryOccasionRows(new RegExp(picnic.label))).toHaveLength(0);
      // The lead card keeps naming the nearest occasion.
      expect(leadCard().textContent).toContain(picnic.label);

      // A month without occasions says so instead of showing an empty list.
      fireEvent.click(bandMonth(2026, 8));
      expect(selectedBandMonths()).toEqual([bandMonth(2026, 8)]);
      expect(sheetTitle()).toBe(monthAndYearFormat.format(utcDay(2026, 8, 1)));
      expect(document.querySelectorAll('.important-date-card')).toHaveLength(0);
      expect(
        document.querySelector('.occasions-sheet .occasions-list'),
      ).toBeNull();
      expect(
        document.querySelector('.occasions-sheet-empty')?.textContent,
      ).toBe(importantDates.monthEmpty);
      expect(occasionDayButtons()).toHaveLength(0);
    });

    it('opens an occasion from its day in the month grid', async () => {
      renderPanel(createMockPeopleApi([date, picnic]));
      await findOccasionRow(new RegExp(picnic.label));
      fireEvent.click(bandMonth(2026, 9));
      await findOccasionRow(new RegExp(date.label));

      // Only the day with an occasion is interactive; the other 29 days of
      // September and the weekday header stay out of the accessibility tree.
      const days = occasionDayButtons();
      expect(days).toHaveLength(1);
      const [day] = days;
      expect(day.textContent).toBe('21');
      expect(day.getAttribute('aria-label')).toBe(
        `${detailDateFormat.format(utcDay(2026, 9, 21))}: ${date.label}`,
      );
      expect(day.getAttribute('aria-haspopup')).toBe('dialog');
      const plainDays = document.querySelectorAll('span.occasions-grid-day');
      expect(plainDays).toHaveLength(29);
      for (const plain of plainDays) {
        expect(plain.getAttribute('aria-hidden')).toBe('true');
      }
      for (const weekday of document.querySelectorAll(
        '.occasions-grid-weekday',
      )) {
        expect(weekday.getAttribute('aria-hidden')).toBe('true');
      }
      expect(document.querySelectorAll('.occasions-grid-weekday')).toHaveLength(
        7,
      );

      day.focus();
      fireEvent.click(day);
      const reader = screen.getByRole('dialog');
      expect(
        within(reader).getByRole('heading', { name: new RegExp(date.label) }),
      ).not.toBeNull();
      fireEvent.click(
        within(reader).getByRole('button', { name: taskSheets.close }),
      );
      await waitFor(() => expect(document.activeElement).toBe(day));
    });

    it('names every occasion of a shared day and opens the first one', async () => {
      const second = importantDate('date-second', 'Another seaside day', {
        relatedPersonId: null,
      });
      renderPanel(createMockPeopleApi([date, second]));
      await findOccasionRow(new RegExp(date.label));

      const days = occasionDayButtons();
      expect(days).toHaveLength(1);
      // Occasions of one day are ordered by title.
      expect(days[0].getAttribute('aria-label')).toBe(
        `${detailDateFormat.format(utcDay(2026, 9, 21))}: ${second.label}, ${date.label}`,
      );
      expect(document.querySelectorAll('.important-date-card')).toHaveLength(2);

      fireEvent.click(days[0]);
      expect(
        within(screen.getByRole('dialog')).getByRole('heading', {
          name: new RegExp(second.label),
        }),
      ).not.toBeNull();
    });

    it('keeps an annual occasion reachable whose day already passed this month', async () => {
      // 5 June is over on the pinned 10 June; the next one is twelve months
      // out, one month past the coming year.
      const early = importantDate('date-early', 'Early June day', {
        date: new Date('2024-06-05T00:00:00Z'),
        relatedPersonId: null,
      });
      renderPanel(createMockPeopleApi([early]));
      const row = await findOccasionRow(new RegExp(early.label));

      const months = bandMonths();
      expect(months).toHaveLength(13);
      expect(months[0]).toBe(bandMonth(2026, 6));
      expect(months[12]).toBe(bandMonth(2027, 6));
      expect(bandMonth(2026, 6).getAttribute('aria-label')).toBe(
        `${monthAndYearFormat.format(utcDay(2026, 6, 1))}, 0`,
      );
      expect(bandMonth(2027, 6).getAttribute('aria-label')).toBe(
        `${monthAndYearFormat.format(utcDay(2027, 6, 1))}, 1`,
      );
      // It is the next occasion, so its month is shown without selecting it.
      expect(selectedBandMonths()).toEqual([bandMonth(2027, 6)]);
      expect(sheetTitle()).toBe(monthAndYearFormat.format(utcDay(2027, 6, 1)));
      expect(leadCard().querySelector('time')?.getAttribute('datetime')).toBe(
        '2027-06-05',
      );
      expect(row.closest('.occasions-sheet .occasions-list')).not.toBeNull();
      const days = occasionDayButtons();
      expect(days).toHaveLength(1);
      expect(days[0].textContent).toBe('5');
      expect(days[0].getAttribute('aria-label')).toBe(
        `${detailDateFormat.format(utcDay(2027, 6, 5))}: ${early.label}`,
      );
      // The pinned day belongs to June 2026, not to this sheet.
      expect(document.querySelector('.occasions-grid-day.is-today')).toBeNull();

      fireEvent.click(row);
      const reader = screen.getByRole('dialog');
      expect(
        within(reader).getByRole('heading', { name: new RegExp(early.label) }),
      ).not.toBeNull();
      expect(
        within(reader).getByRole('button', { name: importantDates.edit }),
      ).not.toBeNull();
    });

    it('adds the month of a one-off date beyond the coming year to the band', async () => {
      const far = importantDate('date-far', 'Far away day', {
        date: new Date('2028-02-14T00:00:00Z'),
        repeats: DateRepeat.NONE,
        relatedPersonId: null,
      });
      renderPanel(createMockPeopleApi([far, date]));
      await findOccasionRow(new RegExp(date.label));

      // The coming twelve months, then the later month with an occasion.
      const months = bandMonths();
      expect(months).toHaveLength(13);
      expect(months[11]).toBe(bandMonth(2027, 5));
      expect(months[12]).toBe(bandMonth(2028, 2));
      expect(bandMonth(2028, 2).getAttribute('aria-label')).toBe(
        `${monthAndYearFormat.format(utcDay(2028, 2, 1))}, 1`,
      );
      // The nearest occasion still decides the month shown first.
      expect(selectedBandMonths()).toEqual([bandMonth(2026, 9)]);
      expect(queryOccasionRows(new RegExp(far.label))).toHaveLength(0);

      fireEvent.click(bandMonth(2028, 2));
      expect(selectedBandMonths()).toEqual([bandMonth(2028, 2)]);
      expect(sheetTitle()).toBe(monthAndYearFormat.format(utcDay(2028, 2, 1)));
      const row = await findOccasionRow(new RegExp(far.label));
      expect(row.closest('.occasions-sheet .occasions-list')).not.toBeNull();
      expect(document.querySelectorAll('.important-date-card')).toHaveLength(1);
      // February 2028 is a leap month: one day button and 28 plain days.
      const days = occasionDayButtons();
      expect(days).toHaveLength(1);
      expect(days[0].textContent).toBe('14');
      expect(days[0].getAttribute('aria-label')).toBe(
        `${detailDateFormat.format(utcDay(2028, 2, 14))}: ${far.label}`,
      );
      expect(document.querySelectorAll('span.occasions-grid-day')).toHaveLength(
        28,
      );

      fireEvent.click(days[0]);
      const reader = screen.getByRole('dialog');
      expect(
        within(reader).getByRole('heading', { name: new RegExp(far.label) }),
      ).not.toBeNull();
      fireEvent.click(
        within(reader).getByRole('button', { name: taskSheets.close }),
      );
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      fireEvent.click(await findOccasionRow(new RegExp(far.label)));
      expect(
        within(screen.getByRole('dialog')).getByRole('button', {
          name: importantDates.edit,
        }),
      ).not.toBeNull();
    });

    it('marks today in the grid without making it interactive', async () => {
      renderPanel(createMockPeopleApi([date]));
      await findOccasionRow(new RegExp(date.label));
      expect(document.querySelector('.occasions-grid-day.is-today')).toBeNull();

      fireEvent.click(bandMonth(2026, 6));
      const today = document.querySelectorAll('.occasions-grid-day.is-today');
      expect(today).toHaveLength(1);
      expect(today[0].textContent).toBe('10');
      expect(today[0].tagName).toBe('SPAN');
    });
  });

  it('renders a date-led timeline with concise independent-date privacy context', async () => {
    const { container } = renderPanel();

    const card = await findOccasionRow(new RegExp(date.label, 'i'));
    expect(card.classList.contains('important-date-card')).toBe(true);
    expect(card.querySelector('.important-date-marker')).not.toBeNull();
    expect(card.textContent).toContain(date.label);
    expect(card.textContent).toContain(importantDates.repeats.ANNUALLY);
    expect(card.textContent).not.toContain(importantDates.visibility.SHARED);
    expect(
      within(card).getByRole('img', { name: importantDates.visibility.SHARED }),
    ).not.toBeNull();
    expect(card.querySelector('svg')).not.toBeNull();
    expect(container.querySelector('.important-date-chip')).toBeNull();
  });

  it('opens W51 as a focused Compact-first sheet with date and meaning first', async () => {
    const { container } = renderPanel();
    await findOccasionRow(new RegExp(date.label, 'i'));

    const trigger = screen.getByRole('button', {
      name: importantDates.create,
    });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog');
    expect(dialog.classList.contains('focused-editor-sheet')).toBe(true);
    expect(dialog.classList.contains('important-date-editor')).toBe(true);
    expect(
      screen.getByRole('heading', { name: importantDates.createTitle }),
    ).not.toBeNull();

    const dateInput = screen.getByLabelText(
      importantDates.dateLabel,
    ) as HTMLInputElement;
    const labelInput = screen.getByLabelText(
      importantDates.labelLabel,
    ) as HTMLInputElement;
    expect(dateInput).toBe(document.activeElement);
    expect(dateInput.required).toBe(true);
    expect(labelInput.required).toBe(true);
    expect(labelInput.maxLength).toBe(120);

    const disclosure = container.querySelector(
      '.important-date-editor .focused-editor-disclosure',
    ) as HTMLDetailsElement | null;
    expect(disclosure).not.toBeNull();
    expect(disclosure?.open).toBe(false);
    expect(
      within(dialog).getByRole('combobox', {
        name: importantDates.visibilityLabel,
      }),
    ).not.toBeNull();
    expect(
      within(dialog).getByRole('button', { name: importantDates.create }),
    ).not.toBeNull();

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger).toBe(document.activeElement);
  });

  it('protects W53 by confirming discard on Escape after a create draft changes', async () => {
    renderPanel();
    await findOccasionRow(new RegExp(date.label, 'i'));

    fireEvent.click(
      screen.getByRole('button', { name: importantDates.create }),
    );
    const dialog = screen.getByRole('dialog');
    fireEvent.change(screen.getByLabelText(importantDates.labelLabel), {
      target: { value: 'A new important date' },
    });

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(
      screen.getByText(importantDates.discardTitle, { selector: 'strong' }),
    ).not.toBeNull();
    expect(screen.getByRole('dialog')).not.toBeNull();

    fireEvent.click(
      screen.getByRole('button', { name: importantDates.keepEditing }),
    );
    expect(screen.queryByText(importantDates.discardTitle)).toBeNull();
    expect(screen.getByRole('dialog')).not.toBeNull();

    fireEvent.keyDown(dialog, { key: 'Escape' });
    fireEvent.click(
      screen.getByRole('button', { name: importantDates.discardConfirm }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps a dirty draft on backdrop dismissal until discard is confirmed', async () => {
    const { container } = renderPanel();
    await findOccasionRow(new RegExp(date.label, 'i'));
    fireEvent.click(
      screen.getByRole('button', { name: importantDates.create }),
    );
    const labelInput = screen.getByLabelText(
      importantDates.labelLabel,
    ) as HTMLInputElement;
    fireEvent.change(labelInput, { target: { value: 'Still editing' } });

    const backdrop = container.querySelector('.focused-editor-backdrop');
    if (!backdrop) throw new Error('editor backdrop not found');
    fireEvent.click(backdrop);

    expect(screen.getByText(importantDates.discardTitle)).not.toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: importantDates.keepEditing }),
    );
    expect(labelInput.value).toBe('Still editing');
  });

  it('uses Browser Back to close a clean editor', async () => {
    renderPanel();
    await findOccasionRow(new RegExp(date.label, 'i'));
    fireEvent.click(
      screen.getByRole('button', { name: importantDates.create }),
    );
    await waitFor(() =>
      expect(window.history.state?.[EDITOR_HISTORY_STATE_KEY]).toBeTruthy(),
    );

    window.history.back();

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('uses Browser Back to confirm a dirty draft without losing it', async () => {
    renderPanel();
    await findOccasionRow(new RegExp(date.label, 'i'));
    fireEvent.click(
      screen.getByRole('button', { name: importantDates.create }),
    );
    await waitFor(() =>
      expect(window.history.state?.[EDITOR_HISTORY_STATE_KEY]).toBeTruthy(),
    );
    const labelInput = screen.getByLabelText(
      importantDates.labelLabel,
    ) as HTMLInputElement;
    fireEvent.change(labelInput, { target: { value: 'Back-safe draft' } });

    window.history.back();

    await screen.findByText(importantDates.discardTitle);
    fireEvent.click(
      screen.getByRole('button', { name: importantDates.keepEditing }),
    );
    expect(labelInput.value).toBe('Back-safe draft');
    expect(screen.getByRole('dialog')).not.toBeNull();

    window.history.back();
    await screen.findByText(importantDates.discardTitle);
    fireEvent.click(
      screen.getByRole('button', { name: importantDates.discardConfirm }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('opens the reader then the focused editor from the full timeline item and separates delete from Save', async () => {
    const { container } = renderPanel();
    const card = await findOccasionRow(new RegExp(date.label, 'i'));
    card.focus();
    fireEvent.click(card);
    expect(
      within(screen.getByRole('dialog')).queryByRole('textbox'),
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: importantDates.edit }));
    await screen.findByLabelText(importantDates.labelLabel);

    const dialog = screen.getByRole('dialog');
    expect(
      screen.getByRole('heading', { name: importantDates.editTitle }),
    ).not.toBeNull();
    expect(screen.getByDisplayValue(date.label)).not.toBeNull();

    const disclosure = container.querySelector(
      '.important-date-editor .focused-editor-disclosure',
    ) as HTMLDetailsElement;
    expect(disclosure.open).toBe(true);
    expect(screen.getByDisplayValue(person.displayName)).not.toBeNull();

    const deleteButton = within(dialog).getByRole('button', {
      name: importantDates.delete,
    });
    expect(deleteButton.closest('.focused-editor-danger-zone')).not.toBeNull();
    expect(
      within(dialog).getByRole('button', { name: importantDates.saveChanges }),
    ).not.toBeNull();
  });

  it('protects W53 delete confirmation before invoking the delete mutation', async () => {
    const peopleApi = createMockPeopleApi();
    renderPanel(peopleApi);
    const card = await findOccasionRow(new RegExp(date.label, 'i'));
    fireEvent.click(card);
    expect(
      within(screen.getByRole('dialog')).queryByRole('textbox'),
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: importantDates.edit }));
    await screen.findByLabelText(importantDates.labelLabel);

    fireEvent.click(
      screen.getByRole('button', { name: importantDates.delete }),
    );
    expect(
      screen.getByText(importantDates.deleteQuestion, { selector: 'strong' }),
    ).not.toBeNull();
    expect(
      peopleApi.deleteImportantDateApiV1SpacesSpaceIdImportantDatesDateIdDelete,
    ).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('button', { name: importantDates.deleteConfirm }),
    );
    await waitFor(() => {
      expect(
        peopleApi.deleteImportantDateApiV1SpacesSpaceIdImportantDatesDateIdDelete,
      ).toHaveBeenCalledTimes(1);
    });
  });

  it('preserves API semantics when saving an edited date', async () => {
    const peopleApi = createMockPeopleApi();
    renderPanel(peopleApi);
    const card = await findOccasionRow(new RegExp(date.label, 'i'));
    card.focus();
    fireEvent.click(card);
    expect(
      within(screen.getByRole('dialog')).queryByRole('textbox'),
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: importantDates.edit }));
    await screen.findByLabelText(importantDates.labelLabel);

    fireEvent.change(screen.getByLabelText(importantDates.labelLabel), {
      target: { value: 'Our seaside anniversary' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: importantDates.saveChanges }),
    );

    await waitFor(() => {
      expect(
        peopleApi.updateImportantDateApiV1SpacesSpaceIdImportantDatesDateIdPut,
      ).toHaveBeenCalledTimes(1);
    });
    await screen.findByRole('heading', { name: /Our seaside anniversary/ });
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: taskSheets.close,
      }),
    );
    await waitFor(() => expect(document.activeElement).toBe(card));
    const call = (
      peopleApi.updateImportantDateApiV1SpacesSpaceIdImportantDatesDateIdPut as ReturnType<
        typeof vi.fn
      >
    ).mock.calls[0][0];
    expect(call.dateId).toBe(date.id);
    expect(call.ifMatch).toBe(String(date.version));
    expect(call.importantDateFields.label).toBe('Our seaside anniversary');
    expect(call.importantDateFields.relatedPersonId).toBe(person.id);
    expect(call.importantDateFields.visibility).toBe(date.visibility);
  });

  it('keeps long labels intact instead of truncating relationship content in the DOM', async () => {
    const longLabel =
      'A very long important date label describing the beginning of an exceptionally long shared journey together';
    renderPanel(createMockPeopleApi([{ ...date, label: longLabel }]));

    const card = await findOccasionRow(/A very long important date label/i);
    expect(leadCard().textContent).toContain(longLabel);
    expect(card.textContent).toContain(longLabel);
    fireEvent.click(card);
    expect(
      within(screen.getByRole('dialog')).queryByRole('textbox'),
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: importantDates.edit }));
    await screen.findByLabelText(importantDates.labelLabel);
    expect(screen.getByDisplayValue(longLabel)).not.toBeNull();
  });

  it('accepts 120 label characters and prevents a 121st character', async () => {
    const user = userEvent.setup();
    const peopleApi = createMockPeopleApi();
    renderPanel(peopleApi);
    await findOccasionRow(new RegExp(date.label, 'i'));
    fireEvent.click(
      screen.getByRole('button', { name: importantDates.create }),
    );
    fireEvent.change(screen.getByLabelText(importantDates.dateLabel), {
      target: { value: '2026-10-20' },
    });
    const labelInput = screen.getByLabelText(
      importantDates.labelLabel,
    ) as HTMLInputElement;

    await user.type(labelInput, 'x'.repeat(121));
    expect(labelInput.value).toHaveLength(120);
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: importantDates.create,
      }),
    );

    await waitFor(() =>
      expect(
        peopleApi.createImportantDateApiV1SpacesSpaceIdImportantDatesPost,
      ).toHaveBeenCalledTimes(1),
    );
    const call = (
      peopleApi.createImportantDateApiV1SpacesSpaceIdImportantDatesPost as ReturnType<
        typeof vi.fn
      >
    ).mock.calls[0][0];
    expect(call.importantDateFields.label).toHaveLength(120);
  });

  it('announces private visibility without inventing a linked person', async () => {
    const privateDate = importantDate('date-private', 'A private day', {
      relatedPersonId: null,
      visibility: ContentVisibility.PRIVATE,
    });
    renderPanel(createMockPeopleApi([privateDate]));

    // Only the row announces visibility; the lead card and the day do not.
    expect(
      await screen.findAllByRole('button', {
        name: new RegExp(importantDates.visibility.PRIVATE, 'i'),
      }),
    ).toHaveLength(1);
    const card = await findOccasionRow(
      new RegExp(importantDates.visibility.PRIVATE, 'i'),
    );
    expect(card.textContent).toContain(privateDate.label);
    expect(card.textContent).not.toContain(importantDates.visibility.PRIVATE);
    expect(
      within(card).getByRole('img', {
        name: importantDates.visibility.PRIVATE,
      }),
    ).not.toBeNull();
    expect(card.textContent).not.toContain(person.displayName);
  });

  async function expectFocusAfterDelete(
    dates: ImportantDateView[],
    deletedLabel: string,
    expectedRowName: RegExp | null,
  ) {
    renderPanel(createMockPeopleApi(dates));
    const deletedCard = await findOccasionRow(new RegExp(deletedLabel, 'i'));
    fireEvent.click(deletedCard);
    fireEvent.click(screen.getByRole('button', { name: importantDates.edit }));
    await screen.findByLabelText(importantDates.labelLabel);
    fireEvent.click(
      screen.getByRole('button', { name: importantDates.delete }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: importantDates.deleteConfirm }),
    );

    await waitFor(() =>
      expect(queryOccasionRows(new RegExp(deletedLabel, 'i'))).toHaveLength(0),
    );
    // Focus moves to the neighbouring row, or to the create action when the
    // calendar is gone with its last occasion.
    const expectedTarget = expectedRowName
      ? await findOccasionRow(expectedRowName)
      : await screen.findByRole('button', { name: importantDates.create });
    await waitFor(() => expect(document.activeElement).toBe(expectedTarget));
    if (!expectedRowName) {
      expect(document.querySelector('.occasions-calendar')).toBeNull();
    }
  }

  it('focuses the next date after deleting a middle item', async () => {
    await expectFocusAfterDelete(
      [
        importantDate('date-first', 'First date'),
        importantDate('date-middle', 'Middle date'),
        importantDate('date-last', 'Last date'),
      ],
      'Middle date',
      /Last date/i,
    );
  });

  it('focuses the previous date after deleting the last item', async () => {
    await expectFocusAfterDelete(
      [
        importantDate('date-first', 'First date'),
        importantDate('date-last', 'Last date'),
      ],
      'Last date',
      /First date/i,
    );
  });

  it('moves the sheet to the neighbouring month and focuses its row after a delete', async () => {
    renderPanel(
      createMockPeopleApi([
        importantDate('date-july', 'July day', {
          date: new Date('2024-07-04T00:00:00Z'),
        }),
        importantDate('date-september', 'September day'),
      ]),
    );
    await findOccasionRow(/July day/);
    fireEvent.click(bandMonth(2026, 9));
    fireEvent.click(await findOccasionRow(/September day/));
    fireEvent.click(screen.getByRole('button', { name: importantDates.edit }));
    await screen.findByLabelText(importantDates.labelLabel);
    fireEvent.click(
      screen.getByRole('button', { name: importantDates.delete }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: importantDates.deleteConfirm }),
    );

    // The neighbour lives in July, which was not the listed month.
    const neighbour = await findOccasionRow(/July day/);
    await waitFor(() => expect(document.activeElement).toBe(neighbour));
    expect(queryOccasionRows(/September day/)).toHaveLength(0);
    expect(sheetTitle()).toBe(monthAndYearFormat.format(utcDay(2026, 7, 1)));
    expect(selectedBandMonths()).toEqual([bandMonth(2026, 7)]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('focuses the create action after deleting the only date', async () => {
    await expectFocusAfterDelete(
      [importantDate('date-only', 'Only date')],
      'Only date',
      null,
    );
  });
});
