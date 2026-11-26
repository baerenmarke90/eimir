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
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerAdminProApi } from '../api/generated/apis/ServerAdminProApi';
import type { GiftCodeBatchView } from '../api/generated/models/GiftCodeBatchView';
import type { ProOverviewView } from '../api/generated/models/ProOverviewView';
import type { ServerAdminOverview } from '../api/generated/models/ServerAdminOverview';
import { resolvedLocale } from '../i18n';
import serverAdmin from '../i18n/locales/serverAdmin';
import { ServerAdminPage } from './ServerAdminPage';
import { ServerAdminProPanel } from './ServerAdminProPanel';
import { shortSpaceId } from './ServerAdminSpaceFile';
import { sectionHref } from './serverAdminAreas';

const copy = serverAdmin.pro;
const SPACE_SOON = '019b2e1a-7c3d-7f00-8a11-00000000000a';
const SPACE_LATER = '019b2e1a-7c3d-7f00-8a11-00000000000b';
const BATCH_ID = '019b2e1a-7c3d-7f00-8a11-0000000000b1';

function fill(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (text, [key, value]) =>
      text.replace(new RegExp(`{{${key}(, number)?}}`, 'g'), String(value)),
    template,
  );
}

function day(value: Date): string {
  return new Intl.DateTimeFormat(resolvedLocale(), {
    dateStyle: 'medium',
  }).format(value);
}

function proOverview(
  overrides: Partial<ProOverviewView> = {},
): ProOverviewView {
  return {
    spacesTotal: 212,
    spacesPremium: 38,
    premiumByPlay: 31,
    premiumByGift: 7,
    cancellations30d: 2,
    play: { active: 31, cancelledRunning: 3, paymentProblem: 1, ended30d: 4 },
    batches: [
      {
        id: BATCH_ID,
        createdAt: new Date('2026-11-20T10:00:00Z'),
        durationMonths: 3,
        note: 'Beta friends',
        redeemableUntil: new Date('2027-11-20T22:59:59Z'),
        total: 10,
        open: 4,
        handedOut: 3,
        redeemed: 2,
        revoked: 1,
        expired: 0,
        revokedAt: null,
      },
    ],
    // Deliberately out of order: the panel lists them by end date.
    runningGifts: [
      {
        spaceId: SPACE_LATER,
        origin: 'manual',
        batchNote: null,
        effectiveUntil: new Date('2027-05-01T10:00:00Z'),
      },
      {
        spaceId: SPACE_SOON,
        origin: 'code',
        batchNote: 'Beta friends',
        effectiveUntil: new Date('2027-01-15T10:00:00Z'),
      },
    ],
    runningGiftsTotal: 2,
    ...overrides,
  };
}

function createdBatch(): GiftCodeBatchView {
  return {
    id: BATCH_ID,
    createdAt: new Date('2026-11-26T10:00:00Z'),
    durationMonths: 6,
    note: 'Launch',
    redeemableUntil: new Date('2027-11-26T22:59:59Z'),
    total: 2,
    open: 2,
    handedOut: 0,
    redeemed: 0,
    revoked: 0,
    expired: 0,
    revokedAt: null,
    codes: [
      {
        id: 'c1',
        code: 'EIMIR-AAAA-BBBB',
        state: 'open',
        handedOutAt: null,
        redeemedAt: null,
        redeemedSpaceId: null,
      },
      {
        id: 'c2',
        code: 'EIMIR-CCCC-DDDD',
        state: 'open',
        handedOutAt: null,
        redeemedAt: null,
        redeemedSpaceId: null,
      },
    ],
  };
}

function renderPanel(
  data: ProOverviewView,
  extra: Record<string, unknown> = {},
) {
  const api = {
    getProOverview: vi.fn().mockResolvedValue(data),
    createGiftCodeBatch: vi.fn().mockResolvedValue(createdBatch()),
    getGiftCodeBatch: vi.fn().mockResolvedValue(createdBatch()),
    ...extra,
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ServerAdminProPanel
          api={api as unknown as ServerAdminProApi}
          publicBaseUrl="https://app.eimir.de"
        />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return api;
}

describe('ServerAdminProPanel', () => {
  afterEach(() => cleanup());

  it('shows the figures and the Google Play states as chips', async () => {
    renderPanel(proOverview());

    const spaces = await screen.findByText(copy.figures.spaces);
    expect(spaces.closest('div')?.textContent).toContain('212');
    expect(
      screen.getByText(copy.figures.premium).closest('div')?.textContent,
    ).toContain('38');
    expect(
      screen.getByText(copy.figures.cancellations).closest('div')?.textContent,
    ).toContain('2');

    const play = screen.getByRole('list', { name: copy.play.title });
    const chips = within(play)
      .getAllByRole('listitem')
      .map((item) => item.textContent);
    expect(chips).toEqual([
      `31 ${copy.play.active}`,
      `1 ${copy.play.paymentProblem}`,
      `3 ${copy.play.cancelledRunning}`,
      `4 ${copy.play.ended30d}`,
    ]);
    expect(screen.queryByText(copy.play.empty)).toBeNull();
  });

  it('shows the calm Play empty state while every Play figure is zero', async () => {
    renderPanel(
      proOverview({
        premiumByPlay: 0,
        play: {
          active: 0,
          cancelledRunning: 0,
          paymentProblem: 0,
          ended30d: 0,
        },
      }),
    );

    expect(await screen.findByText(copy.play.empty)).toBeTruthy();
    expect(screen.queryByRole('list', { name: copy.play.title })).toBeNull();
  });

  it('lists the batches with their counts and the totals', async () => {
    const [batch] = proOverview().batches;
    renderPanel(
      proOverview({
        batches: [
          batch,
          {
            ...batch,
            id: `${BATCH_ID.slice(0, -1)}2`,
            note: null,
            total: 5,
            open: 4,
            handedOut: 1,
            redeemed: 0,
            revoked: 0,
          },
        ],
      }),
    );

    const batches = await screen.findByRole('list', {
      name: copy.codes.batchesTitle,
    });
    const [row] = within(batches).getAllByRole('button');
    expect(row.textContent).toContain(
      fill(copy.codes.batchTitle_other, {
        count: 10,
        duration: fill(serverAdmin.giftSheet.months_other, { count: 3 }),
      }),
    );
    expect(row.textContent).toContain('Beta friends');
    expect(row.textContent).toContain(
      fill(copy.codes.batchCounts, { open: 4, handedOut: 3, redeemed: 2 }),
    );
    expect(
      screen.getByText(fill(copy.codes.totals, { handedOut: 4, redeemed: 2 }), {
        exact: false,
      }),
    ).toBeTruthy();
    expect(
      screen.getByText(fill(copy.codes.redeemAt, { host: 'app.eimir.de' }), {
        exact: false,
      }),
    ).toBeTruthy();
  });

  it('names an empty batch list', async () => {
    renderPanel(proOverview({ batches: [] }));
    expect(await screen.findByText(copy.codes.empty)).toBeTruthy();
  });

  it('marks a revoked batch', async () => {
    const [batch] = proOverview().batches;
    renderPanel(
      proOverview({
        batches: [{ ...batch, revokedAt: new Date('2026-11-25T10:00:00Z') }],
      }),
    );
    const batches = await screen.findByRole('list', {
      name: copy.codes.batchesTitle,
    });
    expect(within(batches).getByText(copy.codes.revoked)).toBeTruthy();
  });

  it('lists running gifts by end date with a link to the Space file', async () => {
    renderPanel(proOverview());

    const gifts = await screen.findByRole('list', { name: copy.gifts.title });
    const links = within(gifts).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      sectionHref('spaces', { space: SPACE_SOON }),
      sectionHref('spaces', { space: SPACE_LATER }),
    ]);
    expect(links[0].textContent).toContain(shortSpaceId(SPACE_SOON));
    const [first] = within(gifts).getAllByRole('listitem');
    expect(first.textContent).toContain(
      fill(copy.gifts.until, { date: day(new Date('2027-01-15T10:00:00Z')) }),
    );
    expect(first.textContent).toContain(
      fill(copy.gifts.fromCodeNote, { note: 'Beta friends' }),
    );
  });

  it('offers the gift durations of one to twelve months', async () => {
    renderPanel(proOverview());

    const duration = (await screen.findByLabelText(
      copy.codes.duration,
    )) as HTMLSelectElement;
    expect([...duration.options].map((option) => option.value)).toEqual([
      '1',
      '3',
      '6',
      '12',
    ]);
    const note = screen.getByLabelText(copy.codes.note) as HTMLInputElement;
    expect(note.maxLength).toBe(120);
  });

  it('refuses a count outside 1 to 100 without calling the server', async () => {
    const api = renderPanel(proOverview());

    const count = await screen.findByLabelText(copy.codes.count);
    for (const value of ['0', '101', '']) {
      fireEvent.change(count, { target: { value } });
      fireEvent.click(screen.getByRole('button', { name: copy.codes.create }));
      expect(screen.getByText(copy.codes.countInvalid)).toBeTruthy();
      expect(count.getAttribute('aria-invalid')).toBe('true');
    }
    expect(api.createGiftCodeBatch).not.toHaveBeenCalled();
  });

  it('creates a batch and opens the sheet with the new codes', async () => {
    const api = renderPanel(proOverview());

    fireEvent.change(await screen.findByLabelText(copy.codes.duration), {
      target: { value: '6' },
    });
    fireEvent.change(screen.getByLabelText(copy.codes.count), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByLabelText(copy.codes.note), {
      target: { value: '  Launch ' },
    });
    fireEvent.click(screen.getByRole('button', { name: copy.codes.create }));

    await waitFor(() =>
      expect(api.createGiftCodeBatch).toHaveBeenCalledWith({
        giftCodeBatchCreate: { durationMonths: 6, count: 2, note: 'Launch' },
      }),
    );
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('EIMIR-AAAA-BBBB')).toBeTruthy();
    expect(within(sheet).getByText('EIMIR-CCCC-DDDD')).toBeTruthy();
  });

  describe('redeemable until', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      // Local noon, so the local and the UTC date agree in every test zone.
      vi.setSystemTime(new Date(2026, 2, 10, 12, 0));
    });
    afterEach(() => vi.useRealTimers());

    it('offers a labelled date from tomorrow to the last day within 24 months', async () => {
      renderPanel(proOverview());

      const until = (await screen.findByLabelText(
        copy.codes.redeemableUntil,
      )) as HTMLInputElement;
      expect(until.type).toBe('date');
      expect(until.value).toBe('');
      expect(until.min).toBe('2026-03-11');
      // The server refuses an end beyond now + 24 months, which the end of
      // the 24-month day itself would be.
      expect(until.max).toBe('2028-03-09');
      const hint = document.getElementById(
        until.getAttribute('aria-describedby') ?? '',
      );
      expect(hint?.textContent).toBe(copy.codes.redeemableUntilHint);
    });

    it('sends the end of the chosen local day as the deadline', async () => {
      const api = renderPanel(proOverview());

      fireEvent.change(
        await screen.findByLabelText(copy.codes.redeemableUntil),
        { target: { value: '2026-06-30' } },
      );
      fireEvent.click(screen.getByRole('button', { name: copy.codes.create }));

      await waitFor(() => expect(api.createGiftCodeBatch).toHaveBeenCalled());
      const [{ giftCodeBatchCreate }] = api.createGiftCodeBatch.mock.calls[0];
      expect(giftCodeBatchCreate.redeemableUntil.toISOString()).toBe(
        new Date(2026, 5, 30, 23, 59, 59, 999).toISOString(),
      );
    });

    it('leaves the deadline to the server while the date is empty', async () => {
      const api = renderPanel(proOverview());

      fireEvent.click(
        await screen.findByRole('button', { name: copy.codes.create }),
      );

      await waitFor(() => expect(api.createGiftCodeBatch).toHaveBeenCalled());
      const [{ giftCodeBatchCreate }] = api.createGiftCodeBatch.mock.calls[0];
      expect(giftCodeBatchCreate).not.toHaveProperty('redeemableUntil');
    });
  });

  it('opens a listed batch in the sheet', async () => {
    const api = renderPanel(proOverview());

    const batches = await screen.findByRole('list', {
      name: copy.codes.batchesTitle,
    });
    fireEvent.click(within(batches).getByRole('button'));

    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(api.getGiftCodeBatch).toHaveBeenCalledWith({ batchId: BATCH_ID });
  });

  it('offers a retry when the overview fails', async () => {
    const api = renderPanel(proOverview(), {
      getProOverview: vi.fn().mockRejectedValue(new Error('down')),
    });

    expect(await screen.findByText(serverAdmin.states.errorTitle)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: serverAdmin.refresh }));
    await waitFor(() => expect(api.getProOverview).toHaveBeenCalledTimes(2));
  });
});

const pageApi = vi.hoisted(() => ({
  getOverview: vi.fn(),
  getProOverview: vi.fn(),
}));

vi.mock('../client/serverAdmin', () => ({
  createServerAdminApis: () => ({
    auth: {},
    serverAdmin: {
      getServerAdminOverviewApiV1ServerAdminOverviewGet: pageApi.getOverview,
    },
    supportReports: {},
    pro: { getProOverview: pageApi.getProOverview },
  }),
}));

function adminOverview(proAreaAvailable: boolean): ServerAdminOverview {
  return {
    accountCount: 4,
    accountsLast24h: 0,
    accountsLast30d: 1,
    accountsLast7d: 0,
    activeSessionCount: 2,
    activeSpaceCount: 2,
    applicationStatus: 'ok',
    buildRevision: 'test',
    databaseProvider: 'postgresql',
    databaseStatus: 'ok',
    demoMode: false,
    deployment: 'cloud',
    enabledAccountCount: 4,
    environment: 'test',
    jobsFailed: 0,
    jobsPending: 0,
    jobsRunning: 0,
    lastSuccessfulJobAt: null,
    localPasswordAccountCount: 4,
    mailTransport: 'smtp',
    mediaObjectCount: 0,
    mediaStatus: 'ok',
    mediaStore: 'filesystem',
    mediaStoredBytes: 0,
    oidcAccountCount: 0,
    oidcConnectionCount: 0,
    oldestPendingJobAt: null,
    passkeyAccountCount: 0,
    processStartedAt: new Date('2026-11-23T08:00:00Z'),
    publicBaseUrl: 'https://app.eimir.test',
    recentFailedJobs: [],
    serverAdminAllowlistCount: 1,
    serverAdminVerifiedMatchCount: 1,
    workerLastSeenAt: null,
    videoWorkerStatus: 'no_heartbeat_signal',
    emailFailuresLastHour: 0,
    pushFailuresLastHour: 0,
    backupStatus: 'not_configured',
    storagePressure: [],
    storagePressureCount: 0,
    expiringAdminGrants: [],
    expiringAdminGrantCount: 0,
    supportReportsNew: 0,
    proAreaAvailable,
    supportReportsOperatorAvailable: false,
    suspendedAccountCount: 0,
    unverifiedPrimaryEmailCount: 0,
    verifiedPrimaryEmailCount: 4,
    warningCodes: [],
    workerStatus: 'ok',
  } as ServerAdminOverview;
}

describe('ServerAdmin Pro area on the page', () => {
  beforeEach(() => {
    pageApi.getOverview.mockReset();
    pageApi.getProOverview.mockReset();
    pageApi.getProOverview.mockResolvedValue(proOverview());
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function renderPage() {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/server-admin?section=pro']}>
          <ServerAdminPage
            apiBaseUrl="http://api.test"
            accessToken="token"
            onLogout={() => undefined}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it('opens the Pro area when the overview offers it', async () => {
    pageApi.getOverview.mockResolvedValue(adminOverview(true));
    renderPage();

    expect(await screen.findByText(copy.title)).toBeTruthy();
    expect(
      screen.getAllByRole('link', { name: serverAdmin.areas.pro }),
    ).toHaveLength(2);
    expect(
      screen.getByText(fill(copy.codes.redeemAt, { host: 'app.eimir.test' }), {
        exact: false,
      }),
    ).toBeTruthy();
  });

  it('falls back to the overview when Pro is unavailable', async () => {
    pageApi.getOverview.mockResolvedValue(adminOverview(false));
    renderPage();

    expect(await screen.findByText(serverAdmin.usage.title)).toBeTruthy();
    expect(screen.queryByText(copy.title)).toBeNull();
    expect(
      screen.queryAllByRole('link', { name: serverAdmin.areas.pro }),
    ).toHaveLength(0);
    expect(pageApi.getProOverview).not.toHaveBeenCalled();
  });
});
