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
import { giftEnd } from './ServerAdminPremiumGiftSheet';
import { ServerAdminSpaceFile, shortSpaceId } from './ServerAdminSpaceFile';
import germanUi from '../i18n/locales/de';

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
          name: germanUi.common.save,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    // Below the plan's 50 GB the plan applies, so nothing is refused.
    fireEvent.change(input, { target: { value: '20' } });
    expect(
      screen.getByText(/50 GB/, { selector: '.server-admin-sheet-note' }),
    ).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();

    fireEvent.change(input, { target: { value: '80' } });
    expect(
      screen.queryByText(/50 GB/, { selector: '.server-admin-sheet-note' }),
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: germanUi.common.save }));

    await waitFor(() =>
      expect(api.setServerAdminSpaceStorageQuota).toHaveBeenCalledWith({
        spaceId: SPACE_ID,
        serverAdminStorageQuotaRequest: { quotaGb: 80, effectiveUntil: null },
      }),
    );
  });

  it('warns when the higher value is still below the current usage', async () => {
    renderFile(
      file({
        storage: { ...file().storage, usedBytes: 70 * GB },
      }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: copy.spaceFile.adjustStorage }),
    );
    const input = screen.getByLabelText(copy.quotaSheet.amount);

    fireEvent.change(input, { target: { value: '60' } });
    expect(screen.getByRole('status').textContent).toContain('70 GB');

    fireEvent.change(input, { target: { value: '80' } });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('says when the plan is higher than the individual value', async () => {
    renderFile(
      file({
        storage: {
          ...file().storage,
          override: {
            quotaBytes: 20 * GB,
            effectiveUntil: null,
            setAt: new Date('2026-11-26T10:00:00Z'),
          },
        },
      }),
    );

    expect(
      await screen.findByText(
        copy.spaceFile.overrideBelowPlan.replace('{{quota}}', '20 GB'),
      ),
    ).toBeTruthy();
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

  it('keeps the lifecycle status and names an anomaly', async () => {
    renderFile(
      file({
        space: {
          ...file().space,
          activeMembershipCount: 3,
          anomalyCodes: ['too_many_active_memberships'],
        },
      }),
    );

    expect(
      await screen.findByText(copy.spaces.anomalies.tooManyActive),
    ).toBeTruthy();
    expect(screen.getByText(copy.spaces.lifecycle.active)).toBeTruthy();
  });

  it('shows the real percentage when a Space is over its quota', async () => {
    renderFile(
      file({
        storage: { ...file().storage, usedBytes: 3 * GB, quotaBytes: 1 * GB },
      }),
    );

    expect(await screen.findByText(/· 300 %/)).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe(
      '100',
    );
  });

  it('announces only loading and errors, not the whole file', async () => {
    renderFile(file());

    await screen.findByText('lena@example.com');
    const live = document.querySelectorAll('[aria-live]');
    for (const region of live) {
      expect(region.textContent).not.toContain('lena@example.com');
    }
  });

  it('ends a gift with its own reason, not the one typed for a new gift', async () => {
    const revoke = vi.fn().mockResolvedValue(file().entitlement);
    renderFile(
      file({
        entitlement: {
          ...file().entitlement,
          grants: [
            {
              id: 'g1',
              sourceType: 'ADMIN_GRANT',
              status: 'ACTIVE',
              tier: 'PREMIUM',
              effectiveFrom: new Date('2026-11-01T10:00:00Z'),
              effectiveUntil: new Date('2099-01-01T10:00:00Z'),
              capabilities: null,
              externalReference: null,
              createdAt: new Date('2026-11-01T10:00:00Z'),
            },
          ],
        },
      } as Partial<SpaceFile>),
      {
        revokeServerAdminSpaceEntitlementGrantApiV1ServerAdminSpacesSpaceIdEntitlementGrantsGrantIdRevokePost:
          revoke,
      } as Partial<ServerAdminApi>,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: copy.spaceFile.manageGift }),
    );
    fireEvent.change(screen.getByLabelText(copy.giftSheet.reason), {
      target: { value: 'Neuer Grund' },
    });
    fireEvent.click(screen.getByRole('button', { name: copy.giftSheet.end }));

    await waitFor(() => expect(revoke).toHaveBeenCalledTimes(1));
    expect(
      revoke.mock.calls[0][0].serverAdminEntitlementRevokeRequest.reason,
    ).toBe('ended by operator');
  });
});

describe('giftEnd', () => {
  it('stays in the target month at the end of a long month', () => {
    const end = giftEnd(1, new Date(2027, 0, 31, 12));
    expect([end.getFullYear(), end.getMonth(), end.getDate()]).toEqual([
      2027, 1, 28,
    ]);
  });
});
