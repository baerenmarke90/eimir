// @vitest-environment jsdom
import '../i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { dashboardPreferencesQueryKey } from '../client/dashboardPreferences';
import { dashboardQueryKey } from '../client/dashboardQueries';
import type { M4ProductApis } from '../client/m4Product';
import { useResumeSettling } from '../client/useResumeSettling';
import { PrimaryTabPanels } from './PrimaryTabPanels';
import { TodayPage } from './TodayPage';

// Only the page's own body reads this, once per render of that body.
vi.mock('../client/useResumeSettling', async (original) => {
  const actual = await original<typeof import('../client/useResumeSettling')>();
  return { ...actual, useResumeSettling: vi.fn(actual.useResumeSettling) };
});

let navigate: ReturnType<typeof useNavigate>;
function Navigator() {
  navigate = useNavigate();
  return null;
}

const PANELS = [
  {
    path: '/today',
    element: (
      <TodayPage
        apis={{} as M4ProductApis}
        spaceId="space-1"
        account={{ id: 'account-1', displayName: 'Alex' }}
      />
    ),
  },
  { path: '/story', element: <p>story</p> },
];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('does not run the Wir page again when another tab or a task opens', async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(dashboardQueryKey('space-1'), {
    space: { id: 'space-1', partner: null },
    relationshipDuration: null,
    upcoming: [],
    recentShared: [],
    retrospective: null,
  });
  queryClient.setQueryData(
    dashboardPreferencesQueryKey('account-1', 'space-1'),
    { items: [] },
  );
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/today']}>
        <Navigator />
        <PrimaryTabPanels fallback={<p>failed</p>} panels={PANELS} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  // Let the page's own reads and reveals settle first.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  const body = vi.mocked(useResumeSettling);
  expect(body).toHaveBeenCalled();
  body.mockClear();

  await act(() => navigate('/story'));
  await act(() => navigate('/story/memories/m1'));
  expect(body).not.toHaveBeenCalled();
  queryClient.clear();
});
