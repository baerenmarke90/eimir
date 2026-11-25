// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  publishOwnPositionIfDue,
  syncBackgroundSharing,
} from '../client/approximateLocation';
import { partnerLocationSettingsQueryKey } from '../client/partnerLocation';
import { PartnerLocationSync } from './PartnerLocationSync';

const settings = { state: 'ACTIVE', available: true, precision: 'APPROXIMATE' };

vi.mock('../client/approximateLocation', () => ({
  backgroundLocationStatus: vi.fn(async () => ({ enabled: false })),
  clearPublicationMemory: vi.fn(),
  publishOwnPositionIfDue: vi.fn(async () => null),
  syncBackgroundSharing: vi.fn(async () => undefined),
}));

vi.mock('../client/partnerLocation', async (original) => ({
  ...(await original<typeof import('../client/partnerLocation')>()),
  usePartnerLocationApi: () => ({}),
  usePartnerLocationCapability: () => ({ data: true, isFetched: true }),
  readPartnerLocationSettings: vi.fn(async () => settings),
}));

const DEMO_KEY = 'eimir-demo-mode';

function renderSync() {
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <PartnerLocationSync
        apiBaseUrl="http://api.example.test"
        accessToken="token"
        accountId="account"
        spaceId="space"
      />
    </QueryClientProvider>,
  );
  return queryClient;
}

beforeEach(() => {
  window.sessionStorage.clear();
  vi.mocked(publishOwnPositionIfDue).mockClear();
  vi.mocked(syncBackgroundSharing).mockClear();
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

describe('the app-level partner location sync', () => {
  it('reads the settings and publishes the own position on a normal deployment', async () => {
    const queryClient = renderSync();
    await waitFor(() =>
      expect(publishOwnPositionIfDue).toHaveBeenCalledTimes(1),
    );
    expect(syncBackgroundSharing).toHaveBeenCalledTimes(1);
    expect(
      queryClient.getQueryData(
        partnerLocationSettingsQueryKey('account', 'space'),
      ),
    ).toEqual(settings);
  });

  it('still reads the settings in the Demo, because the Wir distance line depends on them', async () => {
    window.sessionStorage.setItem(DEMO_KEY, 'true');
    const queryClient = renderSync();
    await waitFor(() =>
      expect(
        queryClient.getQueryData(
          partnerLocationSettingsQueryKey('account', 'space'),
        ),
      ).toEqual(settings),
    );
  });

  it('never publishes a visitor position or rotates a credential in the Demo', async () => {
    window.sessionStorage.setItem(DEMO_KEY, 'true');
    const queryClient = renderSync();
    await waitFor(() =>
      expect(
        queryClient.getQueryData(
          partnerLocationSettingsQueryKey('account', 'space'),
        ),
      ).toEqual(settings),
    );
    // Let the sync finish its run before asserting what it did not do.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(publishOwnPositionIfDue).not.toHaveBeenCalled();
    expect(syncBackgroundSharing).not.toHaveBeenCalled();
  });
});
