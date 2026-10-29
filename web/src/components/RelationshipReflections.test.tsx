// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DashboardApi } from '../api/generated/apis/DashboardApi';
import { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import type { PlanDetail } from '../api/generated/models/PlanDetail';
import type { RelationshipPassportView } from '../api/generated/models/RelationshipPassportView';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { ClientProblemError } from '../client/problemDetails';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { i18n } from '../i18n';
import { AnticipationCard } from './AnticipationCard';
import { PlanProductPage } from './PlanProductPage';
import { RelationshipPassport } from './RelationshipPassport';

afterEach(() => {
  cleanup();
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
    plans: { getPlan: vi.fn(async () => saved), updatePlan: update },
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
  it('uses one confirmed versioned write and updates the actual Plan reading view', async () => {
    const { update } = setupPlan();
    const toggle = screen.getByRole('switch', { name: label() });
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(
        screen
          .getByRole('switch', { name: label() })
          .getAttribute('aria-checked'),
      ).toBe('true'),
    );
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]?.[0]).toMatchObject({
      spaceId: 'space-1',
      planId: 'plan-1',
      ifMatch: '1',
      planUpdate: { anticipationEnabled: true },
    });
  });

  it('leaves the confirmed switch unchanged on failure and provides deliberate retry', async () => {
    const { update } = setupPlan(async () => {
      throw new ClientProblemError('server');
    });
    fireEvent.click(screen.getByRole('switch', { name: label() }));
    await screen.findByText(i18n.t('states.server.title'));
    expect(
      screen
        .getByRole('switch', { name: label() })
        .getAttribute('aria-checked'),
    ).toBe('false');
    expect(
      screen.queryByText(i18n.t('relationshipReflections.anticipation.saved')),
    ).toBeNull();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('never queues an offline toggle for reconnect', async () => {
    const { update } = setupPlan();
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    fireEvent.click(screen.getByRole('switch', { name: label() }));
    await screen.findByText(i18n.t('states.offline.title'));
    expect(update).not.toHaveBeenCalled();
  });

  it('does not reverse the original intent when retry observes an already-confirmed value', async () => {
    const { client, key, update, plan } = setupPlan(async () => {
      throw new ClientProblemError('server');
    });
    fireEvent.click(screen.getByRole('switch', { name: label() }));
    await screen.findByText(i18n.t('states.server.title'));
    client.setQueryData(key, {
      ...plan,
      anticipationEnabled: true,
      version: 2,
    });
    await waitFor(() =>
      expect(
        screen
          .getByRole('switch', { name: label() })
          .getAttribute('aria-checked'),
      ).toBe('true'),
    );
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('common.retry') }),
    );
    await waitFor(() =>
      expect(screen.queryByText(i18n.t('states.server.title'))).toBeNull(),
    );
    expect(update).toHaveBeenCalledTimes(1);
    expect(
      screen
        .getByRole('switch', { name: label() })
        .getAttribute('aria-checked'),
    ).toBe('true');
  });

  it('rechecks read authorization after cancellation before dispatch', async () => {
    const { client, key, update } = setupPlan();
    vi.spyOn(client, 'cancelQueries').mockImplementation(async () => {
      client
        .getQueryCache()
        .find({ queryKey: key, exact: true })
        ?.setState({
          error: new ClientProblemError('permission'),
          status: 'error',
        });
    });
    fireEvent.click(screen.getByRole('switch', { name: label() }));
    await waitFor(() => expect(client.isMutating()).toBe(0));
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
function setupPassport(
  capability: boolean | Error,
  read: RelationshipPassportView | Error = counts,
) {
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
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(['profile-identity', 'space-1', 'account-1'], {
    profileAttachmentId: null,
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
  return { request, client };
}

describe('Pro relationship passport', () => {
  it('does not request aggregates or invent counts for Free', async () => {
    const { request } = setupPassport(false);
    await screen.findByText(i18n.t('relationshipReflections.passport.locked'));
    expect(request).not.toHaveBeenCalled();
    expect(screen.queryByText('12')).toBeNull();
  });
  it('treats an unknown capability as an actionable error, not Free', async () => {
    const { request } = setupPassport(new ClientProblemError('server'));
    await screen.findByText(i18n.t('states.server.title'));
    expect(request).not.toHaveBeenCalled();
    expect(
      screen.queryByText(i18n.t('relationshipReflections.passport.locked')),
    ).toBeNull();
  });
  it('renders authorized lifetime counts as canonical content links without inferring duration', async () => {
    setupPassport(true);
    await screen.findByText('12');
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
  });
  it('handles a server capability revocation without showing cached aggregates', async () => {
    setupPassport(
      true,
      new ClientProblemError('permission', 403, 'PREMIUM_ENTITLEMENT_REQUIRED'),
    );
    await screen.findByText(i18n.t('relationshipReflections.passport.locked'));
    expect(screen.queryByText('12')).toBeNull();
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
  });
});
