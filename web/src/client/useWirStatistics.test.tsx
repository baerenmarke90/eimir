// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import { useWirStatistics } from './useWirStatistics';

afterEach(() => {
  cleanup();
  localStorage.clear();
});
it('defaults off, shares a deliberate personal opt-in, isolates owners and fails closed after downgrade', async () => {
  let pro = true;
  const api = {
    getSpaceEntitlementsApiV1SpacesSpaceIdEntitlementsGet: vi.fn(async () => ({
      capabilities: pro ? ['relationship.passport'] : [],
    })),
  } as unknown as EntitlementsApi;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result, rerender } = renderHook(
    ({ accountId }) =>
      useWirStatistics({
        api,
        instance: 'https://example.test',
        accountId,
        spaceId: 'space',
      }),
    { wrapper, initialProps: { accountId: 'a' } },
  );
  expect(result.current.allowed).toBe(false);
  expect(result.current.enabled).toBe(false);
  await waitFor(() => expect(result.current.allowed).toBe(true));
  act(() => result.current.setEnabled(true));
  expect(result.current.enabled).toBe(true);
  const second = renderHook(
    () =>
      useWirStatistics({
        api,
        instance: 'https://example.test',
        accountId: 'a',
        spaceId: 'space',
      }),
    { wrapper },
  );
  expect(second.result.current.enabled).toBe(true);
  rerender({ accountId: 'b' });
  expect(result.current.enabled).toBe(false);
  pro = false;
  await act(async () => {
    await client.invalidateQueries({ queryKey: ['wir-statistics-grant'] });
  });
  await waitFor(() => expect(second.result.current.allowed).toBe(false));
  expect(second.result.current.enabled).toBe(true);
  act(() => second.result.current.setEnabled(false));
  expect(second.result.current.enabled).toBe(true);
  expect(
    [...Array(localStorage.length)].map((_, index) =>
      localStorage.getItem(localStorage.key(index) ?? ''),
    ),
  ).toEqual(['true']);
});
