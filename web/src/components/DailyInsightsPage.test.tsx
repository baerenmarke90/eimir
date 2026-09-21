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
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DailyCheckInsApi } from '../api/generated/apis/DailyCheckInsApi';
import type { DashboardApi } from '../api/generated/apis/DashboardApi';
import type { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import type { AccountView } from '../api/generated/models/AccountView';
import type { DailyCheckInInsightDayView } from '../api/generated/models/DailyCheckInInsightDayView';
import type { DailyCheckInInsightsView } from '../api/generated/models/DailyCheckInInsightsView';
import { DailyVibe } from '../api/generated/models/DailyVibe';
import { ClientProblemError } from '../client/problemDetails';
import de from '../i18n/locales/de';
import dailyInsights from '../i18n/locales/dailyInsights';
import {
  HIDDEN_STATE_WORDING,
  JUDGING_WORDING,
} from '../i18n/locales/dailyInsightsWording';
import {
  DailyInsightsPage,
  type DailyInsightsViewId,
} from './DailyInsightsPage';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const TODAY = '2026-09-23'; // A Wednesday.

type Partner = DailyCheckInInsightDayView['partnerVibe'];

function dayView(
  date: string,
  extra: Partial<DailyCheckInInsightDayView> = {},
): DailyCheckInInsightDayView {
  return { checkedOn: new Date(date), ...extra };
}

function iso(date: Date | null | undefined): string {
  return (date as Date).toISOString().slice(0, 10);
}

function buildView(
  start: string,
  end: string,
  byDate: Record<string, Partial<DailyCheckInInsightDayView>>,
  flags: { vibeEnabled?: boolean; energyEnabled?: boolean } = {},
): DailyCheckInInsightsView {
  const days: DailyCheckInInsightDayView[] = [];
  for (
    let cursor = new Date(start);
    cursor <= new Date(end);
    cursor = new Date(cursor.getTime() + 86_400_000)
  ) {
    const date = cursor.toISOString().slice(0, 10);
    days.push(dayView(date, byDate[date] ?? {}));
  }
  return {
    startDate: new Date(start),
    endDate: new Date(end),
    dailyContextTimezone: 'Europe/Berlin',
    vibeEnabled: flags.vibeEnabled ?? true,
    energyEnabled: flags.energyEnabled ?? true,
    days,
    summary: {
      totalDays: days.length,
      daysWithOwnCheckIn: 0,
      daysWithPartnerCheckIn: 0,
      daysWithMutualCheckIn: 0,
    },
  };
}

const visibleVibe = (value: DailyVibe): Partner => ({
  state: 'VISIBLE',
  value,
});

const FULL_WEEK: Record<string, Partial<DailyCheckInInsightDayView>> = {
  '2026-09-21': {
    ownVibe: DailyVibe.GOOD,
    ownEnergy: 80,
    partnerVibe: visibleVibe(DailyVibe.GOOD),
    partnerEnergy: { state: 'VISIBLE', value: 70 },
  },
  '2026-09-22': {
    ownVibe: DailyVibe.OKAY,
    ownEnergy: 50,
    partnerVibe: visibleVibe(DailyVibe.STRESSED),
    partnerEnergy: { state: 'VISIBLE', value: 30 },
  },
  '2026-09-23': {
    ownVibe: DailyVibe.GOOD,
    ownEnergy: 90,
    partnerVibe: visibleVibe(DailyVibe.GOOD),
    partnerEnergy: { state: 'VISIBLE', value: 80 },
  },
};

interface Harness {
  entitlement: ReturnType<typeof vi.fn>;
  insights: ReturnType<typeof vi.fn>;
  dashboard: ReturnType<typeof vi.fn>;
}

function renderPage({
  view = 'week' as DailyInsightsViewId,
  capabilities = ['daily.insights'] as string[],
  entitlementError,
  data = FULL_WEEK,
  flags,
  insightsImpl,
  accountId = 'account-lea',
  spaceId = 'space-1',
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
}: {
  view?: DailyInsightsViewId;
  capabilities?: string[];
  entitlementError?: unknown;
  data?: Record<string, Partial<DailyCheckInInsightDayView>>;
  flags?: { vibeEnabled?: boolean; energyEnabled?: boolean };
  insightsImpl?: (request: {
    spaceId: string;
    startDate?: Date | null;
    endDate?: Date | null;
  }) => Promise<DailyCheckInInsightsView>;
  accountId?: string;
  spaceId?: string;
  client?: QueryClient;
} = {}): Harness & {
  rerenderWith: (next: Partial<{ accountId: string; spaceId: string }>) => void;
} {
  const entitlement = vi.fn(async () => {
    if (entitlementError) throw entitlementError;
    return {
      spaceId,
      capabilities,
      status: 'ACTIVE',
      tier: 'PRO',
      isInGracePeriod: false,
    };
  });
  const insights = vi.fn(
    insightsImpl ??
      (async (request: { startDate?: Date | null; endDate?: Date | null }) =>
        request.startDate && request.endDate
          ? buildView(iso(request.startDate), iso(request.endDate), data, flags)
          : buildView('2026-09-17', TODAY, data, flags)),
  );
  const dashboard = vi.fn(async () => ({
    space: {
      partner: { id: 'account-philipp', displayName: 'Philipp Beispiel' },
    },
  }));
  const entitlementApi = {
    getSpaceEntitlementsApiV1SpacesSpaceIdEntitlementsGet: entitlement,
  } as unknown as EntitlementsApi;
  const dailyCheckInsApi = {
    getDailyCheckInInsights: insights,
  } as unknown as DailyCheckInsApi;
  const dashboardApi = { getDashboard: dashboard } as unknown as DashboardApi;
  const element = (ids: { accountId: string; spaceId: string }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DailyInsightsPage
          key={`${ids.accountId}:${ids.spaceId}`}
          view={view}
          spaceId={ids.spaceId}
          account={
            { id: ids.accountId, displayName: 'Lea Beispiel' } as AccountView
          }
          dailyCheckInsApi={dailyCheckInsApi}
          entitlementApi={entitlementApi}
          dashboardApi={dashboardApi}
        />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const utils = render(element({ accountId, spaceId }));
  return {
    entitlement,
    insights,
    dashboard,
    rerenderWith: (next) =>
      utils.rerender(
        element({
          accountId: next.accountId ?? accountId,
          spaceId: next.spaceId ?? spaceId,
        }),
      ),
  };
}

describe('Pro insights: capability', () => {
  it('shows the week charts and statements when daily.insights is present', async () => {
    const { insights } = renderPage();
    expect(
      await screen.findByRole('heading', { name: /Euer Vibe/ }),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Eure Energie/ })).toBeTruthy();
    // The anchor read plus the Mon-Sun window including the previous week.
    const ranges = insights.mock.calls.map(([request]) => request);
    expect(ranges.some((request) => request.startDate === undefined)).toBe(
      true,
    );
    const window = ranges.find((request) => request.startDate !== undefined);
    expect(iso(window.startDate)).toBe('2026-09-14');
    expect(iso(window.endDate)).toBe('2026-09-27');
    expect(screen.getByText(/21\. September – 27\. September/)).toBeTruthy();
    // Descriptive statement from real projected values.
    expect(
      screen.getAllByText(/ging es euch beiden gut/).length,
    ).toBeGreaterThan(0);
  });

  it('shows a calm gated state and never calls insights without the capability', async () => {
    const { insights } = renderPage({ capabilities: [] });
    expect(
      await screen.findByText(/Euer Verlauf in Vibe & Energie/),
    ).toBeTruthy();
    expect(screen.getByText(dailyInsights.gate.freeNote)).toBeTruthy();
    expect(screen.getByText(dailyInsights.gate.keptNote)).toBeTruthy();
    expect(insights).not.toHaveBeenCalled();
    // No charts, no upgrade dialog, no destructive wording.
    expect(screen.queryByRole('heading', { name: /Euer Vibe/ })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.textContent).not.toMatch(
      /gelöscht|verloren|Jetzt upgraden/i,
    );
  });

  it('treats a server 403 PREMIUM_ENTITLEMENT_REQUIRED as the gated state', async () => {
    renderPage({
      insightsImpl: async () => {
        throw new ClientProblemError(
          'permission',
          403,
          'PREMIUM_ENTITLEMENT_REQUIRED',
        );
      },
    });
    expect(
      await screen.findByText(/Euer Verlauf in Vibe & Energie/),
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: /Erneut versuchen/ }),
    ).toBeNull();
  });

  it('does not infer Pro when the entitlement read fails; it offers retry', async () => {
    const { entitlement } = renderPage({
      entitlementError: new ClientProblemError('server', 500),
    });
    const retry = await screen.findByRole('button', {
      name: /Erneut versuchen/,
    });
    expect(screen.queryByText(/Euer Verlauf in Vibe & Energie/)).toBeNull();
    entitlement.mockResolvedValueOnce({
      spaceId: 'space-1',
      capabilities: ['daily.insights'],
      status: 'ACTIVE',
      tier: 'PRO',
      isInGracePeriod: false,
    });
    fireEvent.click(retry);
    expect(
      await screen.findByRole('heading', { name: /Euer Vibe/ }),
    ).toBeTruthy();
  });
});

describe('Pro insights: Space modules', () => {
  it('renders only the Energy chart when Vibe is disabled', async () => {
    renderPage({ flags: { vibeEnabled: false } });
    expect(
      await screen.findByRole('heading', { name: /Eure Energie/ }),
    ).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /Euer Vibe/ })).toBeNull();
    expect(screen.getByText(dailyInsights.modulesOff.vibeOff)).toBeTruthy();
  });

  it('renders only the Vibe chart when Energy is disabled', async () => {
    renderPage({ flags: { energyEnabled: false } });
    expect(
      await screen.findByRole('heading', { name: /Euer Vibe/ }),
    ).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /Eure Energie/ })).toBeNull();
    expect(screen.getByText(dailyInsights.modulesOff.energyOff)).toBeTruthy();
  });

  it('explains that Pro does not change disabled modules when both are off', async () => {
    renderPage({ flags: { vibeEnabled: false, energyEnabled: false } });
    expect(
      await screen.findByText(dailyInsights.modulesOff.title),
    ).toBeTruthy();
    expect(screen.getByText(/eimir\. Pro ändert daran nichts/)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /Euer Vibe/ })).toBeNull();
  });
});

describe('Pro insights: data states', () => {
  it('shows a calm empty state for a week without values', async () => {
    renderPage({ data: {} });
    expect(await screen.findByText(dailyInsights.empty.title)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /Euer Vibe/ })).toBeNull();
  });

  it('keeps charts and adds a sparse note for a partial week', async () => {
    renderPage({
      data: { '2026-09-22': { ownVibe: DailyVibe.OKAY, ownEnergy: 40 } },
    });
    expect(
      await screen.findByRole('heading', { name: /Euer Vibe/ }),
    ).toBeTruthy();
    expect(screen.getByText(dailyInsights.sparse)).toBeTruthy();
    // No invented statement without enough data.
    expect(screen.queryByText(/ging es euch beiden gut/)).toBeNull();
  });

  it('shows one neutral phrase for hidden and missing partner values', async () => {
    renderPage({
      data: {
        '2026-09-21': {
          ownVibe: DailyVibe.GOOD,
          partnerVibe: { state: 'HIDDEN_UNTIL_SELF_CHECK_IN' },
        },
        '2026-09-22': {
          ownVibe: DailyVibe.GOOD,
          partnerVibe: { state: 'NO_CHECK_IN' },
        },
      },
      flags: { energyEnabled: false },
    });
    await screen.findByRole('heading', { name: /Euer Vibe/ });
    const days = screen.getAllByRole('button', {
      name: /^(Montag|Dienstag), /,
    });
    const labels = days.map((button) =>
      (button.getAttribute('aria-label') ?? '').replace(
        /^[^:]+, \d+\. \w+: /,
        '',
      ),
    );
    expect(labels[0]).toBe(labels[1]);
    expect(labels[0]).toContain(`Philipp: ${dailyInsights.noValue}`);
    expect(document.body.textContent).not.toMatch(HIDDEN_STATE_WORDING);
  });

  it('reveals the values of a day as text on selection', async () => {
    renderPage();
    await screen.findByRole('heading', { name: /Eure Energie/ });
    const [monday] = screen.getAllByRole('button', {
      name: /^Montag, 21\. September/,
    });
    fireEvent.click(monday);
    const detail = screen
      .getAllByText(/Montag, 21\. September:/)
      .find((node) => node.className === 'insight-chart-detail');
    expect(detail?.textContent).toContain('Lea: Gut & entspannt');
    expect(monday.getAttribute('aria-pressed')).toBe('true');
  });

  it('retries after an insights error', async () => {
    let fail = true;
    const { insights } = renderPage({
      insightsImpl: async (request) => {
        if (fail) throw new ClientProblemError('server', 500);
        return request.startDate && request.endDate
          ? buildView(iso(request.startDate), iso(request.endDate), FULL_WEEK)
          : buildView('2026-09-17', TODAY, FULL_WEEK);
      },
    });
    const retry = await screen.findByRole('button', {
      name: /Erneut versuchen/,
    });
    fail = false;
    fireEvent.click(retry);
    expect(
      await screen.findByRole('heading', { name: /Euer Vibe/ }),
    ).toBeTruthy();
    expect(insights.mock.calls.length).toBeGreaterThan(1);
  });

  it('explains a missing Space day context instead of a generic conflict', async () => {
    renderPage({
      insightsImpl: async () => {
        throw new ClientProblemError(
          'conflict',
          409,
          'DAILY_CHECK_IN_CONTEXT_UNAVAILABLE',
        );
      },
    });
    expect(
      await screen.findByText(dailyInsights.contextUnavailable.title),
    ).toBeTruthy();
    expect(screen.queryByText(de.states.conflict.title)).toBeNull();
  });

  it('shows the offline problem state with retry', async () => {
    renderPage({
      insightsImpl: async () => {
        throw new ClientProblemError('offline');
      },
    });
    expect(
      await screen.findByRole('button', { name: /Erneut versuchen/ }),
    ).toBeTruthy();
  });
});

describe('Pro insights: navigation between weeks and accounts', () => {
  it('requests the previous week and disables forward navigation on the current one', async () => {
    const { insights } = renderPage();
    await screen.findByRole('heading', { name: /Euer Vibe/ });
    const next = screen.getByRole('button', {
      name: 'Nächste Woche',
    }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Vorherige Woche' }));
    await waitFor(() => {
      const starts = insights.mock.calls
        .map(([request]) => request.startDate && iso(request.startDate))
        .filter(Boolean);
      expect(starts).toContain('2026-09-07');
    });
  });

  it('does not reuse another account or Space read after a switch', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const harness = renderPage({ client });
    await screen.findByRole('heading', { name: /Euer Vibe/ });
    const before = harness.insights.mock.calls.length;
    harness.rerenderWith({ spaceId: 'space-2' });
    await waitFor(() => {
      expect(harness.insights.mock.calls.length).toBeGreaterThan(before);
    });
    const requestedSpaces = harness.insights.mock.calls.map(
      ([request]) => request.spaceId,
    );
    expect(requestedSpaces).toContain('space-2');
    // Insight reads carry a privacy-bounded partner projection and are never
    // retained once their consumer is gone (gcTime 0).
    await waitFor(() => {
      const keys = client
        .getQueryCache()
        .getAll()
        .filter((query) => query.queryKey[0] === 'daily-insights')
        .map((query) => JSON.stringify(query.queryKey));
      expect(keys.some((key) => key.includes('space-1'))).toBe(false);
      expect(keys.some((key) => key.includes('space-2'))).toBe(true);
    });
  });
});

describe('Pro insights: views', () => {
  it('links the week view to the recap and the recap to the month', async () => {
    renderPage();
    const link = await screen.findByRole('link', {
      name: /Wochenrückblick ansehen/,
    });
    expect(link.getAttribute('href')).toBe('/more/insights/recap');
    cleanup();
    renderPage({ view: 'recap' });
    const month = await screen.findByRole('link', { name: /Monat ansehen/ });
    expect(month.getAttribute('href')).toBe('/more/insights/patterns');
  });

  it('renders the recap hero, noticed statements and highlights from real values', async () => {
    renderPage({ view: 'recap' });
    expect(await screen.findByText(dailyInsights.recap.heroLabel)).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: dailyInsights.recap.noticedTitle }),
    ).toBeTruthy();
    const highlights = screen
      .getByRole('heading', { name: 'Eure Highlights' })
      .closest('section') as HTMLElement;
    expect(within(highlights).getAllByText('Beiden ging es gut').length).toBe(
      2,
    );
  });

  it('renders the month patterns with a numbered statement area and calm note', async () => {
    renderPage({ view: 'patterns' });
    expect(
      await screen.findByRole('heading', {
        name: dailyInsights.patterns.glanceTitle,
      }),
    ).toBeTruthy();
    expect(screen.getByText(dailyInsights.patterns.calmNote)).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Vorheriger Monat' }),
    ).toBeTruthy();
  });

  it('never uses scoring, judging or causal wording anywhere on the pages', async () => {
    for (const view of ['week', 'patterns', 'recap'] as const) {
      renderPage({ view });
      await screen.findByRole('heading', { level: 1 });
      await waitFor(() =>
        expect(screen.queryByText(dailyInsights.loading)).toBeNull(),
      );
      expect(document.body.textContent).not.toMatch(JUDGING_WORDING);
      cleanup();
    }
  });
});
