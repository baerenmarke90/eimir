// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { SpaceEntitlementView } from '../api/generated/models/SpaceEntitlementView';
import {
  spaceEntitlementQueryKey,
  useSpaceCapability,
  useSpaceEntitlement,
  withdrawSpaceCapability,
} from './spaceEntitlement';

afterEach(cleanup);

function view(capabilities: string[]): SpaceEntitlementView {
  return {
    tier: capabilities.length ? 'PREMIUM' : 'FREE',
    status: 'ACTIVE',
    spaceId: 'space-a',
    isInGracePeriod: false,
    capabilities,
  };
}

function client() {
  // Mirrors the app defaults that would otherwise refetch on mount/focus.
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 60_000,
        refetchOnMount: true,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
    },
  });
}

function Session({ load }: { load: () => Promise<SpaceEntitlementView> }) {
  const query = useSpaceEntitlement({
    accountId: 'account-a',
    spaceId: 'space-a',
    load,
  });
  return <span>{query.data ? `tier:${query.data.tier}` : 'tier:unknown'}</span>;
}

function Feature({
  capability,
  load,
}: {
  capability: string;
  load: () => Promise<SpaceEntitlementView>;
}) {
  const query = useSpaceCapability({
    accountId: 'account-a',
    spaceId: 'space-a',
    load,
    capability,
  });
  if (query.isPending) return <span>{`${capability}:pending`}</span>;
  if (query.isError) return <span>{`${capability}:error`}</span>;
  return <span>{`${capability}:${query.data ? 'granted' : 'locked'}`}</span>;
}

function Shell({
  queryClient,
  load,
  features,
}: {
  queryClient: QueryClient;
  load: () => Promise<SpaceEntitlementView>;
  features: string[];
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <Session load={load} />
      {features.map((capability) => (
        <Feature key={capability} capability={capability} load={load} />
      ))}
    </QueryClientProvider>
  );
}

it('reads once at session start and serves every later Pro surface from that read', async () => {
  const load = vi.fn(async () => view(['daily.quote', 'games.couple']));
  const queryClient = client();
  const shell = render(
    <Shell queryClient={queryClient} load={load} features={[]} />,
  );
  await screen.findByText('tier:PREMIUM');
  expect(load).toHaveBeenCalledTimes(1);

  // Opening tabs, detail routes and sheets mounts and unmounts consumers.
  for (const features of [
    ['daily.quote'],
    [],
    ['games.couple', 'relationship.passport'],
    ['daily.quote'],
  ]) {
    shell.rerender(
      <Shell queryClient={queryClient} load={load} features={features} />,
    );
  }
  expect(screen.getByText('daily.quote:granted')).toBeDefined();
  shell.rerender(
    <Shell
      queryClient={queryClient}
      load={load}
      features={['relationship.passport']}
    />,
  );
  expect(screen.getByText('relationship.passport:locked')).toBeDefined();
  act(() => {
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('online'));
  });
  expect(load).toHaveBeenCalledTimes(1);
  queryClient.clear();
});

it('reads again only when the startup read did not complete', async () => {
  const load = vi
    .fn<() => Promise<SpaceEntitlementView>>()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue(view(['daily.quote']));
  const queryClient = client();
  const shell = render(
    <Shell queryClient={queryClient} load={load} features={[]} />,
  );
  await waitFor(() =>
    expect(
      queryClient.getQueryState(
        spaceEntitlementQueryKey('account-a', 'space-a'),
      )?.status,
    ).toBe('error'),
  );
  shell.rerender(
    <Shell queryClient={queryClient} load={load} features={['daily.quote']} />,
  );
  expect(await screen.findByText('daily.quote:granted')).toBeDefined();
  expect(load).toHaveBeenCalledTimes(2);
  queryClient.clear();
});

it('withdraws a capability the server denied without another read', async () => {
  const load = vi.fn(async () => view(['daily.quote', 'games.couple']));
  const queryClient = client();
  render(
    <Shell
      queryClient={queryClient}
      load={load}
      features={['daily.quote', 'games.couple']}
    />,
  );
  await screen.findByText('daily.quote:granted');
  act(() =>
    withdrawSpaceCapability(queryClient, 'account-a', 'space-a', 'daily.quote'),
  );
  expect(await screen.findByText('daily.quote:locked')).toBeDefined();
  expect(screen.getByText('games.couple:granted')).toBeDefined();
  expect(load).toHaveBeenCalledTimes(1);
  queryClient.clear();
});

it('never shares a read across Accounts or Spaces', () => {
  expect(spaceEntitlementQueryKey('account-a', 'space-a')).not.toEqual(
    spaceEntitlementQueryKey('account-b', 'space-a'),
  );
  expect(spaceEntitlementQueryKey('account-a', 'space-a')).not.toEqual(
    spaceEntitlementQueryKey('account-a', 'space-b'),
  );
});
