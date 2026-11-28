// @vitest-environment jsdom
import '../i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { useQuietHint } from '../client/quietHints';
import type { ReferenceApis } from '../client/referenceFlow';
import { PrimaryTabPanels } from './PrimaryTabPanels';
import { StoryProductPage } from './StoryProductPage';

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

const loadMemoryImage = () => new Promise<never>(() => undefined);
const PANELS = [
  {
    path: '/story',
    element: (
      <StoryProductPage
        apis={{} as ReferenceApis}
        spaceId="space-1"
        accountId="account-1"
        loadMemoryImage={loadMemoryImage}
      />
    ),
  },
  { path: '/plan', element: <p>plan</p> },
];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('does not run the Momente page again when a task opens while it is parked', async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/story']}>
        <Navigator />
        <PrimaryTabPanels fallback={<p>failed</p>} panels={PANELS} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  // Parking the tab renders the page once (its tab state changed). Let that
  // and the page's own reads settle first.
  await act(() => navigate('/plan'));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  const body = vi.mocked(useQuietHint);
  expect(body).toHaveBeenCalled();
  body.mockClear();

  await act(() => navigate('/plan/wishes/w1'));
  await act(() => navigate('/plan/wishes/w2'));
  expect(body).not.toHaveBeenCalled();
  queryClient.clear();
});
