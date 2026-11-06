// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import type { SpaceEntitlementView } from '../api/generated/models/SpaceEntitlementView';
import { ProMark } from '../components/ProMark';
import { ApiRuntimeProvider } from './apiRuntimeContext';
import { ProPresentationProvider, proPresentationKey } from './proPresentation';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function tier(
  value: 'FREE' | 'PREMIUM',
  spaceId = 'space-a',
): SpaceEntitlementView {
  return {
    tier: value,
    status: 'ACTIVE',
    spaceId,
    isInGracePeriod: false,
    capabilities: [],
  };
}
function fixture(
  client: QueryClient,
  accountId = 'account-a',
  spaceId = 'space-a',
) {
  return (
    <QueryClientProvider client={client}>
      <ApiRuntimeProvider
        apiBaseUrl="https://example.test"
        accessToken="token"
        accountId={accountId}
        spaceId={spaceId}
      >
        <ProPresentationProvider>
          <ProMark label="Pro" />
          <span>Feature content</span>
        </ProPresentationProvider>
      </ApiRuntimeProvider>
    </QueryClientProvider>
  );
}

it('hides every mark after a Space upgrade and restores it after a downgrade without hiding content', async () => {
  const api = vi
    .spyOn(
      EntitlementsApi.prototype,
      'getSpaceEntitlementsApiV1SpacesSpaceIdEntitlementsGet',
    )
    .mockResolvedValue(tier('FREE'));
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(fixture(client));
  await screen.findByText('Pro');
  api.mockResolvedValue(tier('PREMIUM'));
  await act(async () => {
    await client.invalidateQueries({
      queryKey: proPresentationKey(
        'https://example.test',
        'account-a',
        'space-a',
      ),
    });
  });
  await waitFor(() => expect(screen.queryByText('Pro')).toBeNull());
  expect(screen.getByText('Feature content')).toBeDefined();
  api.mockResolvedValue(tier('FREE'));
  await act(async () => {
    await client.invalidateQueries({
      queryKey: proPresentationKey(
        'https://example.test',
        'account-a',
        'space-a',
      ),
    });
  });
  expect(await screen.findByText('Pro')).toBeDefined();
  client.clear();
});

it('never borrows the previous account or Space tier while the next scope is loading', async () => {
  const api = vi
    .spyOn(
      EntitlementsApi.prototype,
      'getSpaceEntitlementsApiV1SpacesSpaceIdEntitlementsGet',
    )
    .mockResolvedValue(tier('PREMIUM'));
  const client = new QueryClient();
  const view = render(fixture(client));
  await waitFor(() =>
    expect(
      client.getQueryData(
        proPresentationKey('https://example.test', 'account-a', 'space-a'),
      ),
    ).toBeDefined(),
  );
  let finish!: (value: SpaceEntitlementView) => void;
  api.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  view.rerender(fixture(client, 'account-b', 'space-b'));
  expect(screen.queryByText('Pro')).toBeNull();
  await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
  await act(async () => {
    finish(tier('FREE', 'space-b'));
  });
  expect(await screen.findByText('Pro')).toBeDefined();
  client.clear();
});

it('keeps feature content and avoids an upgrade assertion when no effective tier can be read', async () => {
  vi.spyOn(
    EntitlementsApi.prototype,
    'getSpaceEntitlementsApiV1SpacesSpaceIdEntitlementsGet',
  ).mockRejectedValue(new Error('Offline'));
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(fixture(client));
  await waitFor(() =>
    expect(
      client.getQueryState(
        proPresentationKey('https://example.test', 'account-a', 'space-a'),
      )?.status,
    ).toBe('error'),
  );
  expect(screen.queryByText('Pro')).toBeNull();
  expect(screen.getByText('Feature content')).toBeDefined();
  client.clear();
});
