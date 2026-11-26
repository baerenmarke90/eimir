// @vitest-environment jsdom
import '../i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { useQuietHint } from '../client/quietHints';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { PrimaryTabPanels } from './PrimaryTabPanels';
import { SharedPlanningOverviewPage } from './SharedPlanningOverviewPage';

// Only the page's own body reads this, once per render of that body.
vi.mock('../client/quietHints', async (original) => {
  const actual = await original<typeof import('../client/quietHints')>();
  return { ...actual, useQuietHint: vi.fn(actual.useQuietHint) };
});

let navigate: ReturnType<typeof useNavigate>;
function Navigator() {
  navigate = useNavigate();
  return null;
}

const PANELS = [
  {
    path: '/plan',
    element: (
      <SharedPlanningOverviewPage
        apis={{} as SharedPlanningApis}
        spaceId="space-1"
        accountId="account-1"
        apiBaseUrl="https://eimir.test"
      />
    ),
  },
  { path: '/story', element: <p>story</p> },
];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('does not run the Planning page again when a task opens while it is parked', async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/plan']}>
        <Navigator />
        <PrimaryTabPanels fallback={<p>failed</p>} panels={PANELS} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  // Parking the tab renders the page once (its tab state changed). Let that
  // and the page's own reads settle first.
  await act(() => navigate('/story'));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  const body = vi.mocked(useQuietHint);
  expect(body).toHaveBeenCalled();
  body.mockClear();

  await act(() => navigate('/story/memories/m1'));
  await act(() => navigate('/story/memories/m2'));
  expect(body).not.toHaveBeenCalled();
  queryClient.clear();
});
