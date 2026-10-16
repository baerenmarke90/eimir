// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach } from 'vitest';
import type { M4ProductApis } from '../client/m4Product';
import { dashboardPreferencesQueryKey } from '../client/dashboardPreferences';
import { TaskOriginProvider, useTaskOrigin } from '../client/taskOrigin';
import de from '../i18n/locales/de';
import m5s5 from '../i18n/locales/m5s5';
import { TodayPage } from './TodayPage';

afterEach(() => cleanup());

const dashboard = {
  space: {
    id: 'space-1',
    partner: { id: 'partner-1', displayName: 'Marie' },
  },
  relationshipDuration: null,
  upcoming: [
    {
      id: 'plan-1',
      type: 'PLAN',
      titleOrText: 'A trip to the coast together',
      occurredOn: null,
      createdAt: null,
      scheduledAt: new Date('2026-09-20T10:00:00Z'),
      previewAttachmentId: null,
    },
  ],
  keepsake: null,
  recentShared: [
    {
      id: 'memory-1',
      type: 'MEMORY',
      titleOrText: 'A quiet morning by the lake',
      occurredOn: new Date('2026-09-01'),
      createdAt: null,
      scheduledAt: null,
      previewAttachmentId: null,
    },
  ],
  retrospective: null,
  thinkingOfYouAvailableAt: null,
};

function DetailProbe({ title }: { title: string }) {
  const location = useLocation();
  const { requestReturn } = useTaskOrigin();
  const key = (location.state as { taskOriginKey?: unknown } | null)
    ?.taskOriginKey;
  return (
    <main>
      <h1>{title}</h1>
      <button type="button" onClick={() => requestReturn(key)}>
        Return to Today
      </button>
    </main>
  );
}

function renderJourney(apis: {
  activity: Pick<M4ProductApis['activity'], 'getActivity'>;
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(['m5-s5', 'dashboard', 'space-1'], dashboard);
  queryClient.setQueryData(
    dashboardPreferencesQueryKey('account-1', 'space-1'),
    { items: [] },
  );
  const productApis = {
    dashboard: {
      getDashboard: () => Promise.resolve(dashboard),
      listDashboardModulePreferences: () => Promise.resolve({ items: [] }),
    },
    ...apis,
  } as unknown as M4ProductApis;

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/today']}>
        <TaskOriginProvider accountId="account-1" spaceId="space-1">
          <Routes>
            <Route
              path="/today"
              element={
                <TodayPage
                  apis={productApis}
                  spaceId="space-1"
                  account={{ id: 'account-1', displayName: 'Alex' }}
                />
              }
            />
            <Route
              path="/story/memories/:memoryId"
              element={<DetailProbe title="Canonical memory detail" />}
            />
            <Route
              path="/plan/plans/:planId"
              element={<DetailProbe title="Canonical plan detail" />}
            />
          </Routes>
        </TaskOriginProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Today R4 origin and partial-failure behavior', () => {
  it('opens a text-first focal Memory at its canonical detail and returns through the F2 Today origin', async () => {
    const user = userEvent.setup();
    renderJourney({
      activity: {
        getActivity: () =>
          Promise.resolve({ items: [], nextCursor: null, hasMore: false }),
      },
    });

    const focal = await screen.findByRole('link', {
      name: /A quiet morning by the lake/i,
    });
    await user.click(focal);
    expect(
      screen.getByRole('heading', { name: 'Canonical memory detail' }),
    ).not.toBeNull();

    await user.click(screen.getByRole('button', { name: 'Return to Today' }));
    expect(
      await screen.findByRole('heading', { name: /Alex & Marie/i }),
    ).not.toBeNull();
  });

  it('opens the R3 Plan detail and returns through the same F2 Today origin', async () => {
    const user = userEvent.setup();
    renderJourney({
      activity: {
        getActivity: () =>
          Promise.resolve({ items: [], nextCursor: null, hasMore: false }),
      },
    });

    await user.click(
      await screen.findByRole('link', {
        name: /A trip to the coast together/i,
      }),
    );
    expect(
      screen.getByRole('heading', { name: 'Canonical plan detail' }),
    ).not.toBeNull();

    await user.click(screen.getByRole('button', { name: 'Return to Today' }));
    expect(
      await screen.findByRole('heading', { name: /Alex & Marie/i }),
    ).not.toBeNull();
  });

  it('retains trustworthy Today content and exposes retry when Activity alone fails', async () => {
    renderJourney({
      activity: {
        getActivity: () => Promise.reject(new Error('Activity unavailable')),
      },
    });

    expect(
      await screen.findByText(m5s5.today.partialActivityError),
    ).not.toBeNull();
    expect(screen.getByText('A quiet morning by the lake')).not.toBeNull();
    expect(
      screen
        .getByRole('button', { name: de.common.retry })
        .hasAttribute('disabled'),
    ).toBe(false);
    await waitFor(() => {
      expect(screen.queryByText(m5s5.dashboard.newSpaceIntro)).toBeNull();
    });
  });
});
