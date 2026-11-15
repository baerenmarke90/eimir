// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChaptersApi } from '../api/generated/apis/ChaptersApi';
import { DashboardApi } from '../api/generated/apis/DashboardApi';
import { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import { PeopleApi } from '../api/generated/apis/PeopleApi';
import { PlacesApi } from '../api/generated/apis/PlacesApi';
import { WishesApi } from '../api/generated/apis/WishesApi';
import { ContentVisibility } from '../api/generated/models/ContentVisibility';
import { DateRepeat } from '../api/generated/models/DateRepeat';
import { ImportantDateType } from '../api/generated/models/ImportantDateType';
import type { ImportantDateView } from '../api/generated/models/ImportantDateView';
import type { PlanDetail } from '../api/generated/models/PlanDetail';
import type { RelationshipPassportView } from '../api/generated/models/RelationshipPassportView';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { ProfilesApi } from '../client/mediaApis';
import { passportStatisticsKey } from '../client/passportPreferences';
import { ClientProblemError } from '../client/problemDetails';
import { chapterDetailPath } from '../client/routes';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { i18n } from '../i18n';
import { AnticipationCard } from './AnticipationCard';
import { PlanProductPage } from './PlanProductPage';
import { RelationshipPassport } from './RelationshipPassport';

// The places map is a lazily loaded WebGL canvas that cannot run in jsdom. The
// stand-in exposes what the story page hands to it.
vi.mock('./PlaceMapCanvas', () => ({
  default: ({
    locations = [],
    ariaLabel,
  }: {
    locations?: {
      label: string;
      latitude: number;
      longitude: number;
      count: number;
    }[];
    ariaLabel?: string;
  }) => (
    <div
      data-testid="story-places-map"
      data-label={ariaLabel}
      data-locations={JSON.stringify(
        locations.map(({ label, latitude, longitude, count }) => ({
          label,
          latitude,
          longitude,
          count,
        })),
      )}
    />
  ),
}));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
const label = () => i18n.t('relationshipReflections.anticipation.show');

function setupPlan(send?: () => Promise<PlanDetail>) {
  let saved: PlanDetail = {
    id: 'plan-1',
    spaceId: 'space-1',
    createdBy: 'account-1',
    creator: { id: 'account-1', displayName: 'Anna' },
    title: 'A special weekend',
    description: 'Time together',
    status: 'PLANNED',
    anticipationEnabled: false,
    plannedOn: new Date('2099-11-10'),
    plannedStart: null,
    plannedEnd: null,
    experiencedOn: null,
    sourceWishId: null,
    placeId: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    capabilities: { canEdit: true, canDelete: true, canComment: false },
  };
  const update = vi.fn(async (_request: unknown) => {
    saved = send
      ? await send()
      : {
          ...saved,
          anticipationEnabled: !saved.anticipationEnabled,
          version: saved.version + 1,
        };
    return saved;
  });
  const apis = {
    plans: {
      getPlan: vi.fn(async () => saved),
      listPlanCollections: vi.fn(async () => []),
      updatePlan: update,
    },
    places: {
      listPlaces: vi.fn(async () => ({ items: [], nextCursor: null })),
    },
  } as unknown as SharedPlanningApis;
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  const key = authorSummaryQueryKeys.planDetail('space-1', 'plan-1');
  client.setQueryData(key, saved);
  client.setQueryData(authorSummaryQueryKeys.placeOptions('space-1'), []);
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/plan/plans/plan-1']}>
        <Routes>
          <Route
            path="/plan/plans/:planId"
            element={<PlanProductPage spaceId="space-1" apis={apis} />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { client, key, update, plan: saved };
}

describe('Special Plan anticipation', () => {
  it('ticks from the actual instant, crosses minute boundaries and stops at zero', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-21T18:58:59Z'));
    const { unmount } = render(
      <MemoryRouter>
        <AnticipationCard
          value={{
            planId: 'plan-1',
            title: 'Ghost Night',
            daysRemaining: 0,
            eventOn: new Date('2026-11-21'),
            eventAt: new Date('2026-11-21T19:00:00Z'),
          }}
        />
      </MemoryRouter>,
    );
    const digits = () =>
      Array.from(document.querySelectorAll('.anticipation-digit')).map(
        (node) => node.textContent,
      );
    expect(document.querySelector('.anticipation-date')?.textContent).toContain(
      new Intl.DateTimeFormat('de-DE', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date('2026-11-21T19:00:00Z')) + ' Uhr',
    );
    expect(
      document.querySelector('.anticipation-date')?.getAttribute('datetime'),
    ).toBe('2026-11-21T19:00:00.000Z');
    expect(digits()).toEqual(['00', '00', '01', '01']);
    expect(screen.getByRole('timer').getAttribute('aria-live')).toBe('off');
    act(() => vi.advanceTimersByTime(2000));
    expect(digits()).toEqual(['00', '00', '00', '59']);
    act(() => vi.advanceTimersByTime(59000));
    expect(
      screen.getByText(i18n.t('relationshipReflections.anticipation.now')),
    ).toBeTruthy();
    expect(screen.queryByRole('timer')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    unmount();
  });

  it('resumes from wall-clock time after backgrounding and cleans up on unmount', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-21T18:00:00Z'));
    const { unmount } = render(
      <MemoryRouter>
        <AnticipationCard
          value={{
            planId: 'plan-1',
            title: 'Ghost Night',
            daysRemaining: 0,
            eventOn: new Date('2026-11-21'),
            eventAt: new Date('2026-11-21T19:00:00Z'),
          }}
        />
      </MemoryRouter>,
    );
    const visibility = vi.spyOn(document, 'visibilityState', 'get');
    visibility.mockReturnValue('hidden');
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(vi.getTimerCount()).toBe(0);
    vi.setSystemTime(new Date('2026-11-21T18:59:55Z'));
    visibility.mockReturnValue('visible');
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(
      Array.from(document.querySelectorAll('.anticipation-digit')).map(
        (node) => node.textContent,
      ),
    ).toEqual(['00', '00', '00', '05']);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('shows countdown only in Edit and saves its staged choice with one versioned Plan update', async () => {
    const { update } = setupPlan();
    expect(screen.queryByRole('switch', { name: label() })).toBeNull();
    expect(screen.queryByText(i18n.t('m5s3.plan.actionsHeading'))).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('common.edit') }),
    );
    fireEvent.click(screen.getByRole('switch', { name: label() }));
    expect(update).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('m5s3.common.saveChanges') }),
    );
    await waitFor(() => expect(update).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.queryByRole('switch', { name: label() })).toBeNull(),
    );
    expect(update.mock.calls[0]?.[0]).toMatchObject({
      spaceId: 'space-1',
      planId: 'plan-1',
      ifMatch: '1',
      planUpdate: {
        anticipationEnabled: true,
        schedule: { plannedOn: new Date('2099-11-10') },
      },
    });
  });

  it('keeps the staged choice after failure and deliberately retries the same intent', async () => {
    const { update } = setupPlan();
    update.mockRejectedValueOnce(new ClientProblemError('server'));
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('common.edit') }),
    );
    fireEvent.click(screen.getByRole('switch', { name: label() }));
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('m5s3.common.saveChanges') }),
    );
    await screen.findByText(i18n.t('states.server.title'));
    expect(
      screen
        .getByRole('switch', { name: label() })
        .getAttribute('aria-checked'),
    ).toBe('true');
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('m5s3.common.saveChanges') }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('switch', { name: label() })).toBeNull(),
    );
    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.calls.map((args) => args[0])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          planUpdate: expect.objectContaining({ anticipationEnabled: true }),
        }),
      ]),
    );
  });

  it('never queues an offline edit for reconnect', async () => {
    const { update } = setupPlan();
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('common.edit') }),
    );
    fireEvent.click(screen.getByRole('switch', { name: label() }));
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('m5s3.common.saveChanges') }),
    );
    await screen.findByText(i18n.t('states.offline.title'));
    expect(update).not.toHaveBeenCalled();
  });

  it.each([
    [0, i18n.t('relationshipReflections.anticipation.today')],
    [1, i18n.t('relationshipReflections.anticipation.tomorrow')],
    [12, i18n.t('relationshipReflections.anticipation.days', { count: 12 })],
  ])(
    'renders %i remaining days with the absolute calendar date',
    (days, text) => {
      render(
        <MemoryRouter>
          <AnticipationCard
            value={{
              planId: 'plan-1',
              title: 'A special weekend',
              daysRemaining: days as number,
              eventOn: new Date('2026-11-10'),
            }}
          />
        </MemoryRouter>,
      );
      expect(screen.getByText(text)).toBeTruthy();
      expect(screen.getByText(/10.11.2026/)).toBeTruthy();
      expect(screen.getByRole('link').getAttribute('href')).toBe(
        '/plan/plans/plan-1',
      );
    },
  );
});

const counts: RelationshipPassportView = {
  partner: null,
  relationshipDuration: null,
  memories: 12,
  heartMoments: 3,
  milestones: 1,
  completedPlans: 4,
  places: 2,
};

type WishPage = Awaited<ReturnType<WishesApi['listWishes']>>;
type MapPage = Awaited<ReturnType<PlacesApi['listMemoryMap']>>;
type ChapterPageView = Awaited<ReturnType<ChaptersApi['listChapters']>>;

interface PassportExtras {
  /** Saved occasions of the couple. */
  importantDates?: ImportantDateView[];
  /** Pages of fulfilled wishes in cursor order, or a failing read. */
  wishPages?: WishPage[] | Error;
  chapters?: ChapterPageView['items'];
  mapPages?: MapPage[];
  partnerBirthday?: Date | null;
}

function pagedRead<Page>(pages: Page[]) {
  // Page n is addressed by the cursor that page n-1 returned.
  return async ({ cursor }: { cursor?: string | null }) => {
    const index = cursor ? Number(cursor) : 0;
    const page = pages[index];
    if (!page) throw new Error(`unexpected cursor ${String(cursor)}`);
    return page;
  };
}

function setupPassport(
  capability: boolean | Error,
  read: RelationshipPassportView | Error = counts,
  extras: PassportExtras = {},
) {
  // Every read of the page is replaced below; anything that still reaches the
  // network is an unmocked request and must fail the test that caused it.
  const network = vi
    .spyOn(globalThis, 'fetch')
    .mockRejectedValue(new Error('unexpected network request'));
  vi.spyOn(
    EntitlementsApi.prototype,
    'getSpaceEntitlementsApiV1SpacesSpaceIdEntitlementsGet',
  ).mockImplementation(async () => {
    if (capability instanceof Error) throw capability;
    return {
      capabilities: capability ? ['relationship.passport'] : [],
    } as never;
  });
  const request = vi
    .spyOn(DashboardApi.prototype, 'getRelationshipPassport')
    .mockImplementation(async () => {
      if (read instanceof Error) throw read;
      return read;
    });
  const lifeline = vi
    .spyOn(DashboardApi.prototype, 'getStoryLifeline')
    .mockResolvedValue({ startsOn: null, today: new Date(), weeks: [] });
  const profile = vi
    .spyOn(
      ProfilesApi.prototype,
      'getPartnerProfileApiV1SpacesSpaceIdProfilesAccountIdGet',
    )
    .mockImplementation(
      async ({ accountId }) =>
        ({
          accountId,
          profileAttachmentId: null,
          birthday:
            accountId === 'account-1' ? null : (extras.partnerBirthday ?? null),
        }) as never,
    );
  const importantDates = vi
    .spyOn(
      PeopleApi.prototype,
      'listImportantDatesApiV1SpacesSpaceIdImportantDatesGet',
    )
    .mockResolvedValue(extras.importantDates ?? []);
  const wishPages: WishPage[] | Error = extras.wishPages ?? [
    { items: [], nextCursor: null, hasMore: false },
  ];
  const wishes = vi.spyOn(WishesApi.prototype, 'listWishes').mockImplementation(
    wishPages instanceof Error
      ? async () => {
          throw wishPages;
        }
      : pagedRead(wishPages),
  );
  const chapters = vi
    .spyOn(ChaptersApi.prototype, 'listChapters')
    .mockResolvedValue({
      items: extras.chapters ?? [],
      nextCursor: null,
      hasMore: false,
    });
  const memoryMap = vi
    .spyOn(PlacesApi.prototype, 'listMemoryMap')
    .mockImplementation(
      pagedRead(extras.mapPages ?? [{ items: [], nextCursor: null }]),
    );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <RelationshipPassport
          apiBaseUrl="http://example.test"
          accessToken="synthetic-token"
          account={{ id: 'account-1', displayName: 'Anna' }}
          spaceId="space-1"
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return {
    request,
    client,
    network,
    extraReads: {
      lifeline,
      profile,
      importantDates,
      wishes,
      chapters,
      memoryMap,
    },
  };
}

const passportText = (key: string, options?: Record<string, unknown>) =>
  i18n.t(`relationshipReflections.passport.${key}`, options);

/** Accessible name of a count row: the formatted count and its plural label. */
function metricName(key: string, count: number): string {
  return `${count} ${passportText(key, { count })}`;
}

/** The count rows as rendered: label, number and canonical destination. */
function metricRows() {
  return Array.from(
    document.querySelectorAll<HTMLAnchorElement>('.passport-metrics > li > a'),
  ).map((link) => ({
    name: link.getAttribute('aria-label'),
    href: link.getAttribute('href'),
    number: link.querySelector('.passport-number')?.textContent,
    share: link
      .querySelector<HTMLElement>('.passport-metric-bar')
      ?.style.getPropertyValue('--passport-share'),
    barHidden: link
      .querySelector('.passport-metric-bar')
      ?.getAttribute('aria-hidden'),
  }));
}

const baseMetricRows = [
  {
    name: metricName('memories', 12),
    href: '/story?tab=timeline&type=MEMORY',
    number: '12',
    share: '1',
    barHidden: 'true',
  },
  {
    name: metricName('heartMoments', 3),
    href: '/story?tab=timeline&type=HEART_MOMENT',
    number: '3',
    share: '0.25',
    barHidden: 'true',
  },
  {
    name: metricName('milestones', 1),
    href: '/story?tab=timeline&type=MILESTONE',
    number: '1',
    share: String(1 / 12),
    barHidden: 'true',
  },
  {
    name: metricName('completedPlans', 4),
    href: '/plan#plans',
    number: '4',
    share: String(4 / 12),
    barHidden: 'true',
  },
  {
    name: metricName('places', 2),
    href: '/more/places',
    number: '2',
    share: String(2 / 12),
    barHidden: 'true',
  },
];
const noFulfilledWishesRow = {
  name: metricName('fulfilledWishes', 0),
  href: '/plan#fulfilled-wishes',
  number: '0',
  share: '0',
  barHidden: 'true',
};

async function findMetrics() {
  await screen.findByRole('link', { name: metricName('memories', 12) });
  // The fulfilled-wishes row joins once its own read has settled.
  await waitFor(() => expect(metricRows().length).toBeGreaterThan(5));
}

function storyOccasion(
  id: string,
  label: string,
  date: string,
  repeats: DateRepeat = DateRepeat.ANNUALLY,
): ImportantDateView {
  return {
    id,
    label,
    date: new Date(`${date}T00:00:00Z`),
    relatedPersonId: null,
    repeats,
    type: ImportantDateType.CUSTOM,
    visibility: ContentVisibility.SHARED,
    version: 1,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

function mapEntry(
  memoryId: string,
  placeName: string,
  latitude: number,
  longitude: number,
): MapPage['items'][number] {
  return {
    memoryId,
    placeId: `place-${placeName}`,
    placeName,
    latitude,
    longitude,
    title: `Memory ${memoryId}`,
    happenedOn: new Date('2025-05-01T00:00:00Z'),
  };
}

describe('Pro relationship passport', () => {
  it('shows the shared counts without an opt-in and ignores a stored device choice', async () => {
    // A former opt-out on this device must no longer hide the counts.
    const formerChoice = passportStatisticsKey(
      'http://example.test',
      'account-1',
      'space-1',
    );
    window.localStorage.setItem(formerChoice, 'false');
    const { network } = setupPassport(true);
    await findMetrics();

    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByText(passportText('statisticsToggle'))).toBeNull();
    expect(screen.queryByText(passportText('statisticsHelp'))).toBeNull();
    expect(
      screen.getByRole('heading', { name: passportText('history') }),
    ).toBeTruthy();
    expect(metricRows()).toEqual([...baseMetricRows, noFulfilledWishesRow]);
    // Showing the counts neither reads a grant from nor writes one to storage.
    expect(window.localStorage.getItem(formerChoice)).toBe('false');
    expect(window.localStorage.length).toBe(1);
    // The former highlight blocks are gone with the opt-in.
    expect(screen.queryByText(passportText('rediscover'))).toBeNull();
    expect(screen.queryByText(passportText('nextExperience'))).toBeNull();
    expect(network).not.toHaveBeenCalled();
  });

  it('does not request aggregates or invent counts for Free', async () => {
    const { request, extraReads, network } = setupPassport(false);
    await screen.findByText(i18n.t('relationshipReflections.passport.locked'));
    expect(request).not.toHaveBeenCalled();
    expect(screen.queryByText('12')).toBeNull();
    expect(document.querySelector('.passport-metrics')).toBeNull();
    // None of the story reads behind the Pro page starts for Free either.
    for (const extraRead of Object.values(extraReads)) {
      expect(extraRead).not.toHaveBeenCalled();
    }
    expect(network).not.toHaveBeenCalled();
  });
  it('treats an unknown capability as an actionable error, not Free', async () => {
    const { request, extraReads } = setupPassport(
      new ClientProblemError('server'),
    );
    await screen.findByText(i18n.t('states.server.title'));
    expect(request).not.toHaveBeenCalled();
    expect(
      screen.queryByText(i18n.t('relationshipReflections.passport.locked')),
    ).toBeNull();
    for (const extraRead of Object.values(extraReads)) {
      expect(extraRead).not.toHaveBeenCalled();
    }
  });
  it('renders authorized lifetime counts as canonical content links without inferring duration', async () => {
    const { network } = setupPassport(true);
    await findMetrics();
    for (const row of baseMetricRows) {
      expect(
        screen.getByRole('link', { name: row.name }).getAttribute('href'),
      ).toBe(row.href);
    }
    expect(
      screen
        .getByRole('link', { name: /12 Erinnerungen/ })
        .getAttribute('href'),
    ).toBe('/story?tab=timeline&type=MEMORY');
    expect(
      screen
        .getByRole('link', { name: /2 gemeinsame Orte/ })
        .getAttribute('href'),
    ).toBe('/more/places');
    expect(screen.queryByText(/Tage gemeinsam/)).toBeNull();
    expect(document.querySelector('.passport-landmarks')).toBeNull();
    expect(document.querySelector('.passport-duration')?.textContent).toBe(
      passportText('shared'),
    );
    expect(network).not.toHaveBeenCalled();
  });
  it('counts fulfilled wishes across every page and links them to their list', async () => {
    const wish = (id: string) => ({ id }) as WishPage['items'][number];
    const { extraReads } = setupPassport(true, counts, {
      wishPages: [
        { items: [wish('w1'), wish('w2')], nextCursor: '1', hasMore: true },
        { items: [wish('w3'), wish('w4')], nextCursor: '2', hasMore: true },
        { items: [wish('w5')], nextCursor: null, hasMore: false },
      ],
    });
    const row = await screen.findByRole('link', {
      name: metricName('fulfilledWishes', 5),
    });
    expect(row.getAttribute('href')).toBe('/plan#fulfilled-wishes');
    expect(metricRows()).toEqual([
      ...baseMetricRows,
      {
        name: metricName('fulfilledWishes', 5),
        href: '/plan#fulfilled-wishes',
        number: '5',
        share: String(5 / 12),
        barHidden: 'true',
      },
    ]);
    expect(extraReads.wishes.mock.calls.map(([query]) => query)).toEqual([
      { spaceId: 'space-1', cursor: null, limit: 100, status: 'COMPLETED' },
      { spaceId: 'space-1', cursor: '1', limit: 100, status: 'COMPLETED' },
      { spaceId: 'space-1', cursor: '2', limit: 100, status: 'COMPLETED' },
    ]);
  });
  it('leaves the fulfilled-wishes row out instead of showing a zero when its read fails', async () => {
    const { extraReads } = setupPassport(true, counts, {
      wishPages: new ClientProblemError('server'),
    });
    await screen.findByRole('link', { name: metricName('memories', 12) });
    await waitFor(() => expect(extraReads.wishes).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    expect(metricRows()).toEqual(baseMetricRows);
    expect(screen.queryByText(i18n.t('states.server.title'))).toBeNull();
  });
  it('lists landmarks and the nearest three own occasions by days remaining', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-06-10T12:00:00Z'));
    const { extraReads } = setupPassport(
      true,
      {
        ...counts,
        partner: { id: 'account-2', displayName: 'Ben' },
        // 20 June 2024 plus 720 days is the pinned day, 10 June 2026.
        relationshipDuration: {
          startedOn: new Date('2024-06-20T00:00:00Z'),
          daysTogether: 720,
          displayMode: 'DAYS',
        } as RelationshipPassportView['relationshipDuration'],
      },
      {
        partnerBirthday: new Date('1990-06-12T00:00:00Z'),
        importantDates: [
          storyOccasion('late', 'Winter market', '2020-12-01'),
          storyOccasion('trip', 'Summer trip', '2026-07-10', DateRepeat.NONE),
          storyOccasion('gone', 'Past concert', '2026-03-01', DateRepeat.NONE),
          storyOccasion('first', 'First visit', '2019-06-15'),
          storyOccasion('first-again', 'First visit', '2021-06-15'),
        ],
      },
    );
    const birthdayLabel = i18n.t('importantDates.partnerBirthdayLabel', {
      name: 'Ben',
    });
    await screen.findByText(birthdayLabel);
    await screen.findByText('Summer trip');

    const rows = Array.from(
      document.querySelectorAll('.passport-landmarks dl > div'),
    ).map((row) => ({
      label: row.querySelector('dt')?.textContent,
      date: row.querySelector('time')?.getAttribute('datetime'),
      remaining: row.querySelector('.passport-remaining')?.textContent,
    }));
    expect(rows).toEqual([
      {
        label: birthdayLabel,
        date: '2026-06-12',
        remaining: passportText('remaining', { count: 2 }),
      },
      {
        label: 'First visit',
        date: '2026-06-15',
        remaining: passportText('remaining', { count: 5 }),
      },
      {
        label: passportText('anniversary', { count: 2 }),
        date: '2026-06-20',
        remaining: passportText('remaining', { count: 10 }),
      },
      {
        label: 'Summer trip',
        date: '2026-07-10',
        remaining: passportText('remaining', { count: 30 }),
      },
      {
        label: passportText('roundDay', { count: 800, days: '800' }),
        date: '2026-08-29',
        remaining: passportText('remaining', { count: 80 }),
      },
    ]);
    // Past, repeated and fourth-nearest occasions stay out of the list.
    expect(screen.queryByText('Past concert')).toBeNull();
    expect(screen.queryByText('Winter market')).toBeNull();
    for (const progress of document.querySelectorAll('.passport-progress')) {
      expect(progress.getAttribute('aria-hidden')).toBe('true');
    }
    expect(extraReads.importantDates).toHaveBeenCalledWith({
      spaceId: 'space-1',
    });
    expect(extraReads.profile).toHaveBeenCalledWith({
      spaceId: 'space-1',
      accountId: 'account-2',
    });
  });
  it('adds the story lifeline, dated chapters and the places map below the counts', async () => {
    const chapter = (
      id: string,
      title: string,
      startOn: string | null,
      endOn: string | null = null,
    ) =>
      ({
        id,
        title,
        startOn: startOn ? new Date(`${startOn}T00:00:00Z`) : null,
        endOn: endOn ? new Date(`${endOn}T00:00:00Z`) : null,
      }) as ChapterPageView['items'][number];
    const { extraReads, network } = setupPassport(true, counts, {
      chapters: [
        chapter('chapter-late', 'Second home', '2025-03-01'),
        chapter('chapter-undated', 'Someday', null),
        chapter('chapter-early', 'Long distance', '2023-01-15', '2024-02-01'),
      ],
      mapPages: [
        {
          items: [
            mapEntry('m1', 'Harbour', 53.5, 10),
            mapEntry('m2', 'Harbour', 53.5, 10),
          ],
          nextCursor: '1',
        },
        {
          items: [
            // The same memory twice must not count twice for its place.
            mapEntry('m2', 'Harbour', 53.5, 10),
            mapEntry('m3', 'Lake', 47.6, 9.4),
          ],
          nextCursor: null,
        },
      ],
    });
    await findMetrics();

    const timeline = document.querySelector<HTMLElement>('.passport-timeline');
    if (!timeline) throw new Error('story timeline not found');
    expect(
      within(timeline).getByRole('heading', {
        level: 3,
        name: i18n.t('m5s5.dashboard.storyLifelineAria'),
      }),
    ).toBeTruthy();
    expect(timeline.querySelector('.shared-story-summary')).not.toBeNull();
    expect(extraReads.lifeline).toHaveBeenCalledWith(
      { spaceId: 'space-1' },
      expect.anything(),
    );

    await within(timeline).findByRole('heading', {
      level: 4,
      name: passportText('chaptersTitle'),
    });
    // Oldest first; a chapter without a start has no place on the axis.
    expect(
      Array.from(
        timeline.querySelectorAll<HTMLAnchorElement>('.passport-chapters a'),
      ).map((link) => [
        link.querySelector('.passport-chapter-title')?.textContent,
        link.getAttribute('href'),
      ]),
    ).toEqual([
      ['Long distance', chapterDetailPath('chapter-early')],
      ['Second home', chapterDetailPath('chapter-late')],
    ]);
    expect(extraReads.chapters).toHaveBeenCalledWith({
      spaceId: 'space-1',
      limit: 50,
    });

    const map = await screen.findByTestId('story-places-map');
    const places = map.closest<HTMLElement>('.passport-places');
    if (!places) throw new Error('places section not found');
    expect(
      within(places).getByRole('heading', {
        level: 3,
        name: passportText('placesTitle'),
      }),
    ).toBeTruthy();
    expect(
      within(places)
        .getByRole('link', { name: i18n.t('memoryMap.title') })
        .getAttribute('href'),
    ).toBe('/story/map');
    expect(map.getAttribute('data-label')).toBe(i18n.t('memoryMap.title'));
    expect(JSON.parse(map.getAttribute('data-locations') ?? '[]')).toEqual([
      { label: 'Harbour', latitude: 53.5, longitude: 10, count: 2 },
      { label: 'Lake', latitude: 47.6, longitude: 9.4, count: 1 },
    ]);
    expect(places.querySelector('.passport-places-top')?.textContent).toContain(
      passportText('topPlace', { place: 'Harbour' }),
    );
    expect(places.querySelector('.passport-places-top')?.textContent).toContain(
      i18n.t('memoryMap.memoryCount', { count: 2 }),
    );
    expect(extraReads.memoryMap.mock.calls.map(([query]) => query)).toEqual([
      { spaceId: 'space-1', cursor: null, limit: 100 },
      { spaceId: 'space-1', cursor: '1', limit: 100 },
    ]);
    expect(network).not.toHaveBeenCalled();
  });
  it('leaves chapters and places out when the couple has none', async () => {
    setupPassport(true);
    await findMetrics();
    expect(document.querySelector('.passport-timeline')).not.toBeNull();
    expect(document.querySelector('.passport-chapters')).toBeNull();
    expect(document.querySelector('.passport-places')).toBeNull();
    expect(screen.queryByTestId('story-places-map')).toBeNull();
  });
  it('handles a server capability revocation without showing cached aggregates', async () => {
    const { extraReads } = setupPassport(
      true,
      new ClientProblemError('permission', 403, 'PREMIUM_ENTITLEMENT_REQUIRED'),
    );
    await screen.findByText(i18n.t('relationshipReflections.passport.locked'));
    expect(screen.queryByText('12')).toBeNull();
    expect(document.querySelector('.passport-metrics')).toBeNull();
    for (const extraRead of Object.values(extraReads)) {
      expect(extraRead).not.toHaveBeenCalled();
    }
  });
  it('keeps authorized content visible during a transient background read failure', async () => {
    const { request, client } = setupPassport(true);
    await findMetrics();
    request.mockRejectedValue(new ClientProblemError('server'));
    await act(async () => {
      await client.refetchQueries({
        queryKey: ['relationship-passport', 'read'],
      });
    });
    expect(metricRows()).toEqual([...baseMetricRows, noFulfilledWishesRow]);
    expect(document.querySelector('.passport-timeline')).not.toBeNull();
    expect(await screen.findByText(i18n.t('states.server.title'))).toBeTruthy();
    expect(
      screen.queryByText(i18n.t('relationshipReflections.passport.locked')),
    ).toBeNull();
  });
  it('removes previously loaded Pro content when a background read revokes access', async () => {
    const { request, client } = setupPassport(true, counts, {
      mapPages: [
        { items: [mapEntry('m1', 'Harbour', 53.5, 10)], nextCursor: null },
      ],
    });
    await findMetrics();
    await screen.findByTestId('story-places-map');
    request.mockRejectedValue(
      new ClientProblemError('permission', 403, 'PREMIUM_ENTITLEMENT_REQUIRED'),
    );
    await act(async () => {
      await client.refetchQueries({
        queryKey: ['relationship-passport', 'read'],
      });
    });
    await screen.findByText(i18n.t('relationshipReflections.passport.locked'));
    expect(screen.queryByText('12')).toBeNull();
    expect(document.querySelector('.passport-metrics')).toBeNull();
    expect(document.querySelector('.passport-identity')).toBeNull();
    expect(document.querySelector('.passport-timeline')).toBeNull();
    expect(document.querySelector('.passport-places')).toBeNull();
    expect(screen.queryByTestId('story-places-map')).toBeNull();
  });
  it('uses an honest empty state rather than treating errors as zeros', async () => {
    setupPassport(true, {
      ...counts,
      memories: 0,
      heartMoments: 0,
      milestones: 0,
      completedPlans: 0,
      places: 0,
    });
    await screen.findByText(i18n.t('relationshipReflections.passport.empty'));
    expect(
      screen.getByRole('link', {
        name: i18n.t('relationshipReflections.passport.start'),
      }),
    ).toBeTruthy();
    expect(document.querySelector('.passport-metrics')).toBeNull();
  });
});

describe('Discreet Plan countdown (#1790 F3)', () => {
  it('shows the neutral list title and the lock only', () => {
    render(
      <MemoryRouter>
        <AnticipationCard
          value={{
            planId: 'plan-1',
            title: '',
            daysRemaining: 8,
            eventOn: new Date('2099-11-21'),
            concealed: true,
          }}
        />
      </MemoryRouter>,
    );
    expect(
      screen.getByText(i18n.t('discreetPlans.fallbackTitle')),
    ).toBeTruthy();
    expect(
      screen.getByRole('img', { name: i18n.t('discreetPlans.lockLabel') }),
    ).toBeTruthy();
  });
});
