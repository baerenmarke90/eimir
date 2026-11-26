// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { createRef } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ServerAdminApi } from '../api/generated/apis/ServerAdminApi';
import type { ServerAdminSpaceFile as SpaceFile } from '../api/generated/models/ServerAdminSpaceFile';
import serverAdmin from '../i18n/locales/serverAdmin';
import { ServerAdminSpaceFile, shortSpaceId } from './ServerAdminSpaceFile';

const SPACE_ID = '019b2e1a-7c3d-7f00-8a11-0123456789ab';
const GB = 1024 ** 3;
const copy = serverAdmin;

function file(overrides: Partial<SpaceFile> = {}): SpaceFile {
  return {
    space: {
      id: SPACE_ID,
      createdAt: new Date('2026-03-01T10:00:00Z'),
      lifecycleStatus: 'active',
      membershipCount: 2,
      activeMembershipCount: 2,
      historicalMembershipCount: 0,
      leftMembershipCount: 0,
      removedMembershipCount: 0,
      firstMembershipAt: null,
      lastMembershipChangeAt: null,
      latestMembershipEndedAt: null,
      anomalyCodes: [],
    },
    members: [
      {
        accountId: 'a1',
        primaryEmail: 'lena@example.com',
        emailVerified: true,
        authMethods: ['PASSKEY'],
        membershipStatus: 'ACTIVE',
        since: new Date('2026-03-01T10:00:00Z'),
        endedAt: null,
      },
    ],
    storage: {
      usedBytes: 46 * GB,
      quotaBytes: 50 * GB,
      tierQuotaBytes: 50 * GB,
      override: null,
      byMediaType: [
        { mediaType: 'IMAGE', bytes: 31 * GB },
        { mediaType: 'VIDEO', bytes: 14 * GB },
      ],
    },
    entitlement: {
      spaceId: SPACE_ID,
      tier: 'FREE',
      status: 'ACTIVE',
      effectiveUntil: null,
      isInGracePeriod: false,
      capabilities: [],
      grants: [],
    },
    timeline: [
      {
        at: new Date('2026-11-22T10:00:00Z'),
        kind: 'space_storage_quota_set',
      },
    ],
    ...overrides,
  } as SpaceFile;
}

function renderFile(data: SpaceFile, extra: Partial<ServerAdminApi> = {}) {
  const api = {
    getServerAdminSpaceFile: vi.fn().mockResolvedValue(data),
    setServerAdminSpaceStorageQuota: vi.fn().mockResolvedValue(data.storage),
    clearServerAdminSpaceStorageQuota: vi.fn().mockResolvedValue(undefined),
    grantServerAdminSpaceEntitlementApiV1ServerAdminSpacesSpaceIdEntitlementGrantsPost:
      vi.fn().mockResolvedValue(data.entitlement),
    ...extra,
  } as unknown as ServerAdminApi;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ServerAdminSpaceFile
          api={api}
          spaceId={SPACE_ID}
          headingRef={createRef()}
          onClose={() => undefined}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return api as unknown as Record<string, ReturnType<typeof vi.fn>>;
}

describe('ServerAdminSpaceFile', () => {
  afterEach(() => cleanup());

  it('shortens the Space id', () => {
    expect(shortSpaceId(SPACE_ID)).toBe('019b…9ab');
  });

  it('shows members by email, storage split and timeline', async () => {
    renderFile(file());

    expect(await screen.findByText('lena@example.com')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe(
      '92',
    );
    expect(screen.getByText(/Fotos 31 GB · Videos 14 GB/)).toBeTruthy();
    expect(screen.getByText(copy.spaceFile.timeline.quotaSet)).toBeTruthy();
    expect(screen.queryByText(/displayName/)).toBeNull();
  });

  it('names an active individual quota and its end', async () => {
    renderFile(
      file({
        storage: {
          ...file().storage,
          quotaBytes: 80 * GB,
          override: {
            quotaBytes: 80 * GB,
            effectiveUntil: new Date('2026-12-31T22:59:59Z'),
            setAt: new Date('2026-11-26T10:00:00Z'),
          },
        },
      }),
    );

    const prefix = copy.spaceFile.overrideUntil
      .replace('{{quota}}', '80 GB')
      .split('{{date}}')[0];
    expect(
      await screen.findByText((text) => text.startsWith(prefix)),
    ).toBeTruthy();
  });

  it('hides the storage button when storage is unmetered', async () => {
    renderFile(
      file({
        storage: { ...file().storage, quotaBytes: null, tierQuotaBytes: null },
      }),
    );

    await screen.findByText('lena@example.com');
    expect(
      screen.queryByRole('button', { name: copy.spaceFile.adjustStorage }),
    ).toBeNull();
  });

  it('sets a quota and warns below the current usage', async () => {
    const api = renderFile(file());
    fireEvent.click(
      await screen.findByRole('button', { name: copy.spaceFile.adjustStorage }),
    );
    const input = screen.getByLabelText(copy.quotaSheet.amount);

    fireEvent.change(input, { target: { value: '0' } });
    expect(
      (
        screen.getByRole('button', {
          name: copy.quotaSheet.save,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    fireEvent.change(input, { target: { value: '20' } });
    expect(screen.getByRole('status').textContent).toContain('46 GB');

    fireEvent.change(input, { target: { value: '80' } });
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: copy.quotaSheet.save }));

    await waitFor(() =>
      expect(api.setServerAdminSpaceStorageQuota).toHaveBeenCalledWith({
        spaceId: SPACE_ID,
        serverAdminStorageQuotaRequest: { quotaGb: 80, effectiveUntil: null },
      }),
    );
  });

  it('removes an individual quota', async () => {
    const api = renderFile(
      file({
        storage: {
          ...file().storage,
          override: {
            quotaBytes: 80 * GB,
            effectiveUntil: null,
            setAt: new Date('2026-11-26T10:00:00Z'),
          },
        },
      }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: copy.spaceFile.adjustStorage }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: copy.quotaSheet.remove }),
    );

    await waitFor(() =>
      expect(api.clearServerAdminSpaceStorageQuota).toHaveBeenCalledWith({
        spaceId: SPACE_ID,
      }),
    );
  });

  it('gives Premium for the chosen months with a reason', async () => {
    const api = renderFile(file());
    fireEvent.click(
      await screen.findByRole('button', { name: copy.spaceFile.giftPremium }),
    );
    fireEvent.change(screen.getByLabelText(copy.giftSheet.duration), {
      target: { value: '6' },
    });
    fireEvent.change(screen.getByLabelText(copy.giftSheet.reason), {
      target: { value: 'Beta-Test' },
    });
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: copy.giftSheet.give,
      }),
    );

    const grant =
      api.grantServerAdminSpaceEntitlementApiV1ServerAdminSpacesSpaceIdEntitlementGrantsPost;
    await waitFor(() => expect(grant).toHaveBeenCalledTimes(1));
    const request = grant.mock.calls[0][0];
    expect(request.serverAdminEntitlementGrantRequest.reason).toBe('Beta-Test');
    const until: Date =
      request.serverAdminEntitlementGrantRequest.effectiveUntil;
    const months =
      (until.getFullYear() - new Date().getFullYear()) * 12 +
      until.getMonth() -
      new Date().getMonth();
    expect(months).toBe(6);
  });
});
