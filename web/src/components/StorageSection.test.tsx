// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpaceStorageUsage } from '../api/generated/models/SpaceStorageUsage';
import { formatStorageBytes as formatBytes } from '../client/transferImport';
import storageQuota from '../i18n/locales/storageQuota';
import { StorageSection } from './StorageSection';

const GB = 1_000_000_000;
const getSpaceStorage = vi.hoisted(() => vi.fn());
const capabilities = vi.hoisted(() => ({ value: [] as string[] }));

vi.mock('../api/generated/apis/AttachmentsApi', () => ({
  AttachmentsApi: class {
    getSpaceStorage = getSpaceStorage;
  },
}));
vi.mock('../api/generated/apis/EntitlementsApi', () => ({
  EntitlementsApi: class {
    getSpaceEntitlementsApiV1SpacesSpaceIdEntitlementsGet = async () => ({
      spaceId: 'space-1',
      tier: capabilities.value.length ? 'PREMIUM' : 'FREE',
      status: 'ACTIVE',
      isInGracePeriod: false,
      capabilities: capabilities.value,
    });
  },
}));

/** Locale copy with its placeholders filled, sizes as Testing Library reads them. */
function fill(template: string, values: Record<string, number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    formatBytes(values[key], 'de-DE').replace(/ /g, ' '),
  );
}

function renderSection(usage: SpaceStorageUsage) {
  getSpaceStorage.mockResolvedValue(usage);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <StorageSection
          apiBaseUrl="https://api.example.test"
          accessToken="token"
          accountId="account-1"
          spaceId="space-1"
        />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function href(name: string): string | null {
  return screen.getByRole('link', { name }).getAttribute('href');
}

beforeEach(() => {
  getSpaceStorage.mockReset();
  capabilities.value = [];
});

describe('StorageSection', () => {
  it('shows a calm figure while there is room', async () => {
    renderSection({ used: 1.8 * GB, quota: 5 * GB, available: 3.2 * GB });

    expect(
      await screen.findByText(
        fill(storageQuota.used, { used: 1.8 * GB, quota: 5 * GB }),
      ),
    ).toBeTruthy();
    expect(screen.getByText(storageQuota.counts)).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('warns warmly from 80 percent with the ways out', async () => {
    renderSection({ used: 4.3 * GB, quota: 5 * GB, available: 0.7 * GB });

    expect(await screen.findByText(storageQuota.almostFull.title)).toBeTruthy();
    expect(
      screen.getByText(fill(storageQuota.free, { available: 0.7 * GB })),
    ).toBeTruthy();
    expect(href(storageQuota.viewMedia)).toBe('/story/photos');
    expect(href(storageQuota.morePro)).toBe('/more/pro?context=storage');
  });

  it('names a full storage without loss and leads to Pro', async () => {
    renderSection({ used: 5 * GB, quota: 5 * GB, available: 0 });

    expect(await screen.findByText(storageQuota.full.title)).toBeTruthy();
    expect(screen.getByText(storageQuota.full.body)).toBeTruthy();
    expect(href(storageQuota.morePro)).toBe('/more/pro?context=storage');
  });

  it('names Pro in words and offers no Pro link to a Pro couple', async () => {
    capabilities.value = ['storage.cloud_quota_50gb'];
    renderSection({ used: 50 * GB, quota: 50 * GB, available: 0 });

    expect(await screen.findByText(storageQuota.full.bodyPro)).toBeTruthy();
    expect(
      await screen.findByText(
        fill(storageQuota.proIncluded, { quota: 50 * GB }),
      ),
    ).toBeTruthy();
    expect(
      screen.queryByRole('link', { name: storageQuota.morePro }),
    ).toBeNull();
    expect(href(storageQuota.viewMedia)).toBe('/story/photos');
  });

  it('shows nothing where storage is unmetered', async () => {
    const { container } = renderSection({
      used: 9 * GB,
      quota: null,
      available: null,
    });

    await vi.waitFor(() => expect(getSpaceStorage).toHaveBeenCalled());
    expect(container.querySelector('.storage-section')).toBeNull();
  });
});
