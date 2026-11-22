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
import type { WeeklyBriefView } from '../api/generated/models/WeeklyBriefView';
import { ClientProblemError } from '../client/problemDetails';
import dailyInsights from '../i18n/locales/dailyInsights';
import {
  HIDDEN_STATE_WORDING,
  JUDGING_WORDING,
} from '../i18n/locales/dailyInsightsWording';
import de from '../i18n/locales/de';
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
  weeklyBrief: ReturnType<typeof vi.fn>;
}

function briefView(extra: Partial<WeeklyBriefView> = {}): WeeklyBriefView {
  return {
    weekStart: new Date('2026-09-21'),
    weekEnd: new Date('2026-09-27'),
    elapsedDays: 3,
    jointDays: 3,
    headline: 'SHARED_GOOD_DAYS',
    // The generated client delivers date array items as strings at runtime.
    goodDays: ['2026-09-21', '2026-09-23'] as unknown as Date[],
    sharedDays: ['2026-09-21', '2026-09-23'] as unknown as Date[],
    highlight: {
      memoryId: 'memory-1',
      title: 'Rheinufer',
      happenedOn: new Date('2026-09-23'),
      photoCount: 4,
    },
    attention: 'PARTNER_CLOSENESS',
    attentionDays: 2,
    wishes: [
      {
        wishId: 'wish-1',
        title: 'Fondue-Abend',
        own: false,
        createdOn: new Date('2026-08-10'),
      },
      {
        wishId: 'wish-2',
        title: 'Museum',
        own: true,
        createdOn: new Date('2026-09-01'),
      },
    ],
    suggestedDate: new Date('2026-10-02'),
    followUp: {
      planId: 'plan-1',
      title: 'Kochabend',
      concealed: false,
      plannedOn: new Date('2026-09-17'),
    },
    newObservations: [
      {
        key: 'weekday_lower',
        kind: 'WEEKDAY_LOWER',
        sampleCount: 20,
        weekday: 1,
      },
    ],
    ...extra,
  };
}

function renderPage({
  view = 'week' as DailyInsightsViewId,
  capabilities = ['daily.insights'] as string[],
  entitlementError,
  data = FULL_WEEK,
  flags,
  insightsImpl,
  brief = briefView(),
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
  brief?: WeeklyBriefView | (() => Promise<WeeklyBriefView>);
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
  const weeklyBrief = vi.fn(async () =>
    typeof brief === 'function' ? brief() : brief,
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
    getDailyCheckInWeeklyBrief: weeklyBrief,
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
    weeklyBrief,
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
      await screen.findByRole('heading', {
        name: dailyInsights.patterns.vibeRow,
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: dailyInsights.patterns.energyRow }),
    ).toBeTruthy();
    // The anchor read plus the Mon-Sun window including the previous week.
    const ranges = insights.mock.calls.map(([request]) => request);
    expect(ranges.some((request) => request.startDate === undefined)).toBe(
      true,
    );
    const window = ranges.find((request) => request.startDate !== undefined);
    expect(iso(window.startDate)).toBe('2026-09-14');
    expect(iso(window.endDate)).toBe('2026-09-27');
    expect(
      screen.getByRole('button', { name: /21\..*27\. Sept/, pressed: true }),
    ).toBeTruthy();
    // Descriptive statement from real projected values.
    expect(
      screen.getAllByText(dailyInsights.recap.highlightBothGood).length,
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
    expect(
      screen.queryByRole('heading', { name: dailyInsights.patterns.vibeRow }),
    ).toBeNull();
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
      await screen.findByRole('heading', {
        name: dailyInsights.patterns.vibeRow,
      }),
    ).toBeTruthy();
  });
});

describe('Pro insights: Space modules', () => {
  it('renders only the Energy chart when Vibe is disabled', async () => {
    renderPage({ flags: { vibeEnabled: false } });
    expect(
      await screen.findByRole('heading', {
        name: dailyInsights.patterns.energyRow,
      }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('heading', { name: dailyInsights.patterns.vibeRow }),
    ).toBeNull();
    expect(screen.getByText(dailyInsights.modulesOff.vibeOff)).toBeTruthy();
  });

  it('renders only the Vibe chart when Energy is disabled', async () => {
    renderPage({ flags: { energyEnabled: false } });
    expect(
      await screen.findByRole('heading', {
        name: dailyInsights.patterns.vibeRow,
      }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('heading', { name: dailyInsights.patterns.energyRow }),
    ).toBeNull();
    expect(screen.getByText(dailyInsights.modulesOff.energyOff)).toBeTruthy();
  });

  it('explains that Pro does not change disabled modules when both are off', async () => {
    renderPage({ flags: { vibeEnabled: false, energyEnabled: false } });
    expect(
      await screen.findByText(dailyInsights.modulesOff.title),
    ).toBeTruthy();
    expect(screen.getByText(/eimir\. Pro ändert daran nichts/)).toBeTruthy();
    expect(
      screen.queryByRole('heading', { name: dailyInsights.patterns.vibeRow }),
    ).toBeNull();
  });
});

describe('Pro insights: data states', () => {
  it('shows a calm empty state for a week without values', async () => {
    renderPage({ data: {} });
    expect(await screen.findByText(dailyInsights.empty.title)).toBeTruthy();
    expect(
      screen.queryByRole('heading', { name: dailyInsights.patterns.vibeRow }),
    ).toBeNull();
  });

  it('keeps charts and adds a sparse note for a partial week', async () => {
    renderPage({
      data: { '2026-09-22': { ownVibe: DailyVibe.OKAY, ownEnergy: 40 } },
    });
    expect(
      await screen.findByRole('heading', {
        name: dailyInsights.patterns.vibeRow,
      }),
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
    await screen.findByRole('heading', {
      name: dailyInsights.patterns.vibeRow,
    });
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
    await screen.findByRole('heading', {
      name: dailyInsights.patterns.energyRow,
    });
    const group = screen.getByRole('group', {
      name: dailyInsights.chart.dayGroup,
    });
    expect(within(group).getAllByRole('button')).toHaveLength(7);
    const monday = within(group).getByRole('button', {
      name: /^Montag, 21\. September/,
    });
    fireEvent.click(monday);
    const detail = screen
      .getByRole('heading', { name: /^Montag, 21\. September/ })
      .closest('.insight-week-detail');
    expect(detail?.textContent).toContain('Entspannt');
    expect(detail?.textContent).toContain('80 %');
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
      await screen.findByRole('heading', {
        name: dailyInsights.patterns.vibeRow,
      }),
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
  it('selects a nearby week or jumps to a past week by date', async () => {
    const { insights } = renderPage();
    await screen.findByRole('heading', {
      name: dailyInsights.patterns.vibeRow,
    });
    const picker = screen.getByRole('group', {
      name: dailyInsights.week.picker,
    });
    const periods = within(picker).getAllByRole('button');
    expect(periods).toHaveLength(3);
    expect(periods[2].getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(periods[1]);
    await waitFor(() => {
      expect(
        insights.mock.calls.some(
          ([request]) =>
            request.startDate && iso(request.startDate) === '2026-09-07',
        ),
      ).toBe(true);
    });
    fireEvent.change(
      screen.getByLabelText(dailyInsights.week.picker, { selector: 'input' }),
      {
        target: { value: '2025-11-16' },
      },
    );
    await waitFor(() => {
      expect(
        insights.mock.calls.some(
          ([request]) =>
            request.startDate && iso(request.startDate) === '2025-11-03',
        ),
      ).toBe(true);
    });
  });

  it('does not reuse another account or Space read after a switch', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const harness = renderPage({ client });
    await screen.findByRole('heading', {
      name: dailyInsights.patterns.vibeRow,
    });
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
  it('offers three views and shows the derived highlights in the week', async () => {
    renderPage();
    const recap = await screen.findByRole('region', {
      name: dailyInsights.week.summary,
    });
    const nav = screen.getByRole('navigation', {
      name: dailyInsights.nav.label,
    });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual([
      dailyInsights.nav.brief,
      dailyInsights.nav.week,
      dailyInsights.nav.patterns,
    ]);
    expect(
      within(recap).getByText(dailyInsights.recap.highlightBothGood),
    ).toBeTruthy();
    const [monday] = within(recap).getAllByRole('button');
    expect(within(recap).getAllByRole('button')).toHaveLength(2);
    fireEvent.click(monday);
    const group = screen.getByRole('group', {
      name: dailyInsights.chart.dayGroup,
    });
    expect(
      within(group)
        .getByRole('button', { pressed: true })
        .getAttribute('aria-label'),
    ).toMatch(/^Montag, 21\. September/);
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
      screen.getByLabelText(dailyInsights.patterns.monthPicker, {
        selector: 'input',
      }),
    ).toBeTruthy();
  });

  it('never uses scoring, judging or causal wording anywhere on the pages', async () => {
    for (const view of ['brief', 'week', 'patterns'] as const) {
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

describe('Pro insights: weekly brief (#2169)', () => {
  const brief = dailyInsights.brief;

  it('reads as one flow from good days through attention to one impulse', async () => {
    const { weeklyBrief } = renderPage({ view: 'brief' });
    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: brief.headline.SHARED_GOOD_DAYS.title,
      }),
    ).toBeTruthy();
    expect(weeklyBrief).toHaveBeenCalledWith(
      { spaceId: 'space-1', weekStart: new Date('2026-09-21') },
      expect.anything(),
    );
    expect(
      screen.getByText(
        brief.headline.SHARED_GOOD_DAYS.body.replace(
          '{{days}}',
          new Intl.ListFormat('de', {
            style: 'long',
            type: 'conjunction',
          }).format(['Montag', 'Mittwoch']),
        ),
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        brief.coverage.replace('{{count}}', '3').replace('{{total}}', '3'),
      ),
    ).toBeTruthy();
    const moment = screen.getByRole('link', { name: /Rheinufer/ });
    expect(moment.getAttribute('href')).toBe('/story/memories/memory-1');
    expect(
      screen.getByText(
        'An 2 Tagen wünschte sich Philipp Nähe, während du eher Ruhe wolltest.',
      ),
    ).toBeTruthy();
    expect(screen.getByText(brief.attention.prompt)).toBeTruthy();
    expect(screen.getByText('Fondue-Abend')).toBeTruthy();
    expect(
      screen.getByText(new RegExp(`^${dailyInsights.weekdayAdverb[4]} `)),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: brief.impulse.plan }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: brief.impulse.next }));
    expect(screen.getByText('Museum')).toBeTruthy();
    expect(screen.getByText(/Kochabend/)).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: brief.followUp.open })
        .getAttribute('href'),
    ).toBe('/plan/plans/plan-1');
    expect(screen.getByText(brief.newPatterns.title)).toBeTruthy();
  });

  it('discloses the calculation basis only on request', async () => {
    renderPage({ view: 'brief' });
    const toggle = await screen.findByRole('button', {
      name: brief.basisToggle,
    });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByText(brief.basis).hidden).toBe(true);
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(brief.basis).hidden).toBe(false);
  });

  it('omits unsupported sections and offers a wish when none is open', async () => {
    renderPage({
      view: 'brief',
      brief: briefView({
        headline: 'SPARSE',
        jointDays: 1,
        goodDays: [],
        sharedDays: [],
        highlight: null,
        attention: null,
        attentionDays: 0,
        wishes: [],
        suggestedDate: null,
        followUp: null,
        newObservations: [],
      }),
    });
    expect(
      await screen.findByRole('heading', {
        name: brief.headline.SPARSE.title,
      }),
    ).toBeTruthy();
    expect(screen.queryByText(brief.attention.title)).toBeNull();
    expect(screen.queryByText(brief.newPatterns.title)).toBeNull();
    expect(screen.queryByText(brief.followUp.title)).toBeNull();
    expect(
      screen
        .getByRole('link', { name: brief.impulse.addWish })
        .getAttribute('href'),
    ).toBe('/plan/wishes/new');
    expect(document.body.textContent).not.toMatch(HIDDEN_STATE_WORDING);
  });

  it('shows a retryable problem when the brief cannot be read', async () => {
    renderPage({
      view: 'brief',
      brief: async () => {
        throw new ClientProblemError('server', 503);
      },
    });
    expect(
      await screen.findByRole('button', { name: de.common.retry }),
    ).toBeTruthy();
  });
});
