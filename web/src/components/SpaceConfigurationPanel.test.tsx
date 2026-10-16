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
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SpacesApi } from '../api/generated/apis/SpacesApi';
import type { SpaceConfigurationView } from '../api/generated/models/SpaceConfigurationView';
import { ClientProblemError } from '../client/problemDetails';
import profileIdentity from '../i18n/locales/profileIdentity';
import { SpaceConfigurationPanel } from './SpaceConfigurationPanel';

afterEach(() => cleanup());

function configuration(
  overrides: Partial<SpaceConfigurationView> = {},
): SpaceConfigurationView {
  return {
    canManageSpaceConfiguration: true,
    dailyContextTimezone: 'Europe/Berlin',
    dailyQuestionsEnabled: true,
    energyCheckInEnabled: true,
    energyVisibilityMode: 'MUTUAL_REVEAL',
    loveNotesEnabled: true,
    sharedAchievementsEnabled: true,
    spaceId: 'space-1',
    supportGesturesEnabled: true,
    version: 7,
    vibeCheckEnabled: true,
    vibeVisibilityMode: 'MUTUAL_REVEAL',
    ...overrides,
  };
}

function rawResponse(value: SpaceConfigurationView, etag: string) {
  return {
    raw: new Response(null, { status: 200, headers: { ETag: etag } }),
    value: async () => value,
  };
}

function renderPanel(
  spacesApi: SpacesApi,
  {
    accountId = 'account-1',
    spaceId = 'space-1',
  }: { accountId?: string; spaceId?: string } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <SpaceConfigurationPanel
        spacesApi={spacesApi}
        accountId={accountId}
        spaceId={spaceId}
      />
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

describe('SpaceConfigurationPanel', () => {
  it('lets the manager update Support Gestures with the exact ETag', async () => {
    const updatedConfiguration = configuration({
      supportGesturesEnabled: false,
      version: 8,
    });
    const getSpaceConfigurationRaw = vi
      .fn()
      .mockResolvedValueOnce(rawResponse(configuration(), '"7"'))
      .mockResolvedValue(rawResponse(updatedConfiguration, '"8"'));
    const updateSpaceConfigurationRaw = vi
      .fn()
      .mockResolvedValue(rawResponse(updatedConfiguration, '"8"'));
    const spacesApi = {
      getSpaceConfigurationRaw,
      updateSpaceConfigurationRaw,
    } as unknown as SpacesApi;

    renderPanel(spacesApi);

    const toggle = await screen.findByRole('switch', {
      name: profileIdentity.supportGesturesToggle,
    });
    expect(toggle.getAttribute('aria-checked')).toBe('true');

    fireEvent.click(toggle);

    await waitFor(() => {
      expect(updateSpaceConfigurationRaw).toHaveBeenCalledWith({
        spaceId: 'space-1',
        ifMatch: '"7"',
        spaceConfigurationUpdate: { supportGesturesEnabled: false },
      });
    });
    await waitFor(() => {
      expect(toggle.getAttribute('aria-checked')).toBe('false');
    });
    expect(getSpaceConfigurationRaw).toHaveBeenCalledTimes(2);
  });

  it('lets the manager disable Shared Achievements through the typed Space configuration contract', async () => {
    const updatedConfiguration = configuration({
      sharedAchievementsEnabled: false,
      version: 8,
    });
    const getSpaceConfigurationRaw = vi
      .fn()
      .mockResolvedValueOnce(rawResponse(configuration(), '"7"'))
      .mockResolvedValue(rawResponse(updatedConfiguration, '"8"'));
    const updateSpaceConfigurationRaw = vi
      .fn()
      .mockResolvedValue(rawResponse(updatedConfiguration, '"8"'));
    const spacesApi = {
      getSpaceConfigurationRaw,
      updateSpaceConfigurationRaw,
    } as unknown as SpacesApi;

    renderPanel(spacesApi);

    const toggle = await screen.findByRole('switch', {
      name: profileIdentity.sharedAchievementsToggle,
    });
    expect(toggle.getAttribute('aria-checked')).toBe('true');

    fireEvent.click(toggle);

    await waitFor(() => {
      expect(updateSpaceConfigurationRaw).toHaveBeenCalledWith({
        spaceId: 'space-1',
        ifMatch: '"7"',
        spaceConfigurationUpdate: { sharedAchievementsEnabled: false },
      });
    });
    await waitFor(() => {
      expect(toggle.getAttribute('aria-checked')).toBe('false');
    });
  });

  it('lets the manager disable Vibe Check through the same configuration contract', async () => {
    const updatedConfiguration = configuration({
      vibeCheckEnabled: false,
      version: 8,
    });
    const getSpaceConfigurationRaw = vi
      .fn()
      .mockResolvedValueOnce(rawResponse(configuration(), '"7"'))
      .mockResolvedValue(rawResponse(updatedConfiguration, '"8"'));
    const updateSpaceConfigurationRaw = vi
      .fn()
      .mockResolvedValue(rawResponse(updatedConfiguration, '"8"'));
    const spacesApi = {
      getSpaceConfigurationRaw,
      updateSpaceConfigurationRaw,
    } as unknown as SpacesApi;

    renderPanel(spacesApi);

    const toggle = await screen.findByRole('switch', {
      name: profileIdentity.vibeCheckToggle,
    });
    expect(toggle.getAttribute('aria-checked')).toBe('true');

    fireEvent.click(toggle);

    await waitFor(() => {
      expect(updateSpaceConfigurationRaw).toHaveBeenCalledWith({
        spaceId: 'space-1',
        ifMatch: '"7"',
        spaceConfigurationUpdate: { vibeCheckEnabled: false },
      });
    });
    await waitFor(() => {
      expect(toggle.getAttribute('aria-checked')).toBe('false');
    });
    expect(getSpaceConfigurationRaw).toHaveBeenCalledTimes(2);
  });

  it('shows a partner the shared state without any write affordance', async () => {
    const spacesApi = {
      getSpaceConfigurationRaw: vi
        .fn()
        .mockResolvedValue(
          rawResponse(
            configuration({ canManageSpaceConfiguration: false }),
            '"7"',
          ),
        ),
    } as unknown as SpacesApi;

    renderPanel(spacesApi);

    expect(
      await screen.findAllByText(profileIdentity.spaceModuleOn),
    ).toHaveLength(4);
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(
      screen.getAllByText(
        profileIdentity.visibilityReadOnly.replace(
          '{{mode}}',
          profileIdentity.visibilityMutualReveal,
        ),
      ),
    ).toHaveLength(2);
    expect(
      screen.getByText(
        profileIdentity.dailyContextTimezoneReadOnly.replace(
          '{{timezone}}',
          'Europe/Berlin',
        ),
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText(profileIdentity.spaceModulesKeepDataNote),
    ).toBeNull();
  });

  it('lets the manager switch Energy off and on through the same contract', async () => {
    const off = configuration({ energyCheckInEnabled: false, version: 8 });
    const getSpaceConfigurationRaw = vi
      .fn()
      .mockResolvedValueOnce(rawResponse(configuration(), '"7"'))
      .mockResolvedValue(rawResponse(off, '"8"'));
    const updateSpaceConfigurationRaw = vi
      .fn()
      .mockResolvedValue(rawResponse(off, '"8"'));
    const spacesApi = {
      getSpaceConfigurationRaw,
      updateSpaceConfigurationRaw,
    } as unknown as SpacesApi;

    renderPanel(spacesApi);
    const toggle = await screen.findByRole('switch', {
      name: profileIdentity.energyCheckInToggle,
    });
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(updateSpaceConfigurationRaw).toHaveBeenCalledWith({
        spaceId: 'space-1',
        ifMatch: '"7"',
        spaceConfigurationUpdate: { energyCheckInEnabled: false },
      });
    });
    await waitFor(() => {
      expect(toggle.getAttribute('aria-checked')).toBe('false');
    });
    // Vibe and Support Gestures are independent choices and stay untouched.
    expect(
      screen
        .getByRole('switch', { name: profileIdentity.vibeCheckToggle })
        .getAttribute('aria-checked'),
    ).toBe('true');
  });

  it('carries the shared day zone in the first Daily module enable instead of failing without one', async () => {
    const zone = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(
      () =>
        ({
          resolvedOptions: () => ({ timeZone: 'Europe/Vienna' }),
        }) as Intl.DateTimeFormat,
    );
    const fresh = configuration({
      dailyContextTimezone: null,
      energyCheckInEnabled: false,
      vibeCheckEnabled: false,
    });
    const enabled = configuration({
      dailyContextTimezone: 'Europe/Vienna',
      energyCheckInEnabled: true,
      vibeCheckEnabled: false,
      version: 8,
    });
    const getSpaceConfigurationRaw = vi
      .fn()
      .mockResolvedValueOnce(rawResponse(fresh, '"7"'))
      .mockResolvedValue(rawResponse(enabled, '"8"'));
    const updateSpaceConfigurationRaw = vi
      .fn()
      .mockResolvedValue(rawResponse(enabled, '"8"'));
    const spacesApi = {
      getSpaceConfigurationRaw,
      updateSpaceConfigurationRaw,
    } as unknown as SpacesApi;

    try {
      renderPanel(spacesApi);
      expect(screen.queryByRole('combobox')).toBeNull();
      fireEvent.click(
        await screen.findByRole('switch', {
          name: profileIdentity.energyCheckInToggle,
        }),
      );

      await waitFor(() => {
        expect(updateSpaceConfigurationRaw).toHaveBeenCalledWith({
          spaceId: 'space-1',
          ifMatch: '"7"',
          spaceConfigurationUpdate: {
            energyCheckInEnabled: true,
            dailyContextTimezone: 'Europe/Vienna',
          },
        });
      });
      const select = await screen.findByRole('combobox', {
        name: profileIdentity.dailyContextTimezoneLabel,
      });
      expect((select as HTMLSelectElement).value).toBe('Europe/Vienna');
    } finally {
      zone.mockRestore();
    }
  });

  it('lets the manager change the Vibe and Energy visibility independently', async () => {
    const vibeImmediate = configuration({
      vibeVisibilityMode: 'IMMEDIATE',
      version: 8,
    });
    const bothImmediate = configuration({
      vibeVisibilityMode: 'IMMEDIATE',
      energyVisibilityMode: 'IMMEDIATE',
      version: 9,
    });
    const getSpaceConfigurationRaw = vi
      .fn()
      .mockResolvedValueOnce(rawResponse(configuration(), '"7"'))
      .mockResolvedValueOnce(rawResponse(vibeImmediate, '"8"'))
      .mockResolvedValue(rawResponse(bothImmediate, '"9"'));
    const updateSpaceConfigurationRaw = vi
      .fn()
      .mockResolvedValueOnce(rawResponse(vibeImmediate, '"8"'))
      .mockResolvedValueOnce(rawResponse(bothImmediate, '"9"'));
    const spacesApi = {
      getSpaceConfigurationRaw,
      updateSpaceConfigurationRaw,
    } as unknown as SpacesApi;

    renderPanel(spacesApi);
    const vibeGroup = await screen.findByRole('group', {
      name: profileIdentity.visibilityLegend.replace(
        '{{module}}',
        profileIdentity.vibeCheckTitle,
      ),
    });
    const energyGroup = screen.getByRole('group', {
      name: profileIdentity.visibilityLegend.replace(
        '{{module}}',
        profileIdentity.energyCheckInTitle,
      ),
    });
    const immediate = { name: new RegExp(profileIdentity.visibilityImmediate) };

    fireEvent.click(within(vibeGroup).getByRole('radio', immediate));
    await waitFor(() =>
      expect(updateSpaceConfigurationRaw).toHaveBeenLastCalledWith({
        spaceId: 'space-1',
        ifMatch: '"7"',
        spaceConfigurationUpdate: { vibeVisibilityMode: 'IMMEDIATE' },
      }),
    );
    await waitFor(() =>
      expect(
        (within(vibeGroup).getByRole('radio', immediate) as HTMLInputElement)
          .checked,
      ).toBe(true),
    );
    // Energy keeps its own mode until it is changed on its own.
    expect(
      (within(energyGroup).getByRole('radio', immediate) as HTMLInputElement)
        .checked,
    ).toBe(false);

    fireEvent.click(within(energyGroup).getByRole('radio', immediate));
    await waitFor(() =>
      expect(updateSpaceConfigurationRaw).toHaveBeenLastCalledWith({
        spaceId: 'space-1',
        ifMatch: '"8"',
        spaceConfigurationUpdate: { energyVisibilityMode: 'IMMEDIATE' },
      }),
    );
  });

  it('offers no visibility choice for a module that is switched off', async () => {
    const spacesApi = {
      getSpaceConfigurationRaw: vi
        .fn()
        .mockResolvedValue(
          rawResponse(configuration({ energyCheckInEnabled: false }), '"7"'),
        ),
    } as unknown as SpacesApi;

    renderPanel(spacesApi);
    await screen.findByRole('switch', {
      name: profileIdentity.energyCheckInToggle,
    });

    expect(screen.getAllByRole('group')).toHaveLength(1);
    expect(
      screen.queryByRole('group', {
        name: profileIdentity.visibilityLegend.replace(
          '{{module}}',
          profileIdentity.energyCheckInTitle,
        ),
      }),
    ).toBeNull();
  });

  it('explains a refused time zone change while today already has Daily Check-in state', async () => {
    const getSpaceConfigurationRaw = vi
      .fn()
      .mockResolvedValue(rawResponse(configuration(), '"7"'));
    const updateSpaceConfigurationRaw = vi
      .fn()
      .mockRejectedValue(
        new ClientProblemError(
          'conflict',
          409,
          'SPACE_DAILY_CONTEXT_TIMEZONE_ACTIVE_CHECK_IN',
        ),
      );
    const spacesApi = {
      getSpaceConfigurationRaw,
      updateSpaceConfigurationRaw,
    } as unknown as SpacesApi;

    renderPanel(spacesApi);
    fireEvent.change(
      await screen.findByRole('combobox', {
        name: profileIdentity.dailyContextTimezoneLabel,
      }),
      { target: { value: 'Europe/Paris' } },
    );

    expect(
      await screen.findByText(profileIdentity.dailyContextTimezoneLocked),
    ).toBeTruthy();
    expect(updateSpaceConfigurationRaw).toHaveBeenCalledWith({
      spaceId: 'space-1',
      ifMatch: '"7"',
      spaceConfigurationUpdate: { dailyContextTimezone: 'Europe/Paris' },
    });
    await waitFor(() => {
      expect(
        (
          screen.getByRole('combobox', {
            name: profileIdentity.dailyContextTimezoneLabel,
          }) as HTMLSelectElement
        ).value,
      ).toBe('Europe/Berlin');
    });
  });

  it('refreshes authoritative state after an ETag conflict without retrying the write', async () => {
    const getSpaceConfigurationRaw = vi
      .fn()
      .mockResolvedValueOnce(rawResponse(configuration(), '"7"'))
      .mockResolvedValue(
        rawResponse(
          configuration({ supportGesturesEnabled: false, version: 8 }),
          '"8"',
        ),
      );
    const updateSpaceConfigurationRaw = vi
      .fn()
      .mockRejectedValue(
        new ClientProblemError('conflict', 409, 'RESOURCE_VERSION_CONFLICT'),
      );
    const spacesApi = {
      getSpaceConfigurationRaw,
      updateSpaceConfigurationRaw,
    } as unknown as SpacesApi;

    renderPanel(spacesApi);
    const toggle = await screen.findByRole('switch', {
      name: profileIdentity.supportGesturesToggle,
    });
    fireEvent.click(toggle);

    await waitFor(() =>
      expect(getSpaceConfigurationRaw).toHaveBeenCalledTimes(2),
    );
    expect(updateSpaceConfigurationRaw).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(toggle.getAttribute('aria-checked')).toBe('false');
    });
  });

  it('does not reuse configuration state when the active Space changes', async () => {
    const spacesApi = {
      getSpaceConfigurationRaw: vi
        .fn()
        .mockImplementation(({ spaceId }: { spaceId: string }) =>
          Promise.resolve(
            rawResponse(
              configuration({
                spaceId,
                supportGesturesEnabled: spaceId === 'space-1',
              }),
              '"7"',
            ),
          ),
        ),
    } as unknown as SpacesApi;

    const { rerender, queryClient } = renderPanel(spacesApi);
    expect(
      (
        await screen.findByRole('switch', {
          name: profileIdentity.supportGesturesToggle,
        })
      ).getAttribute('aria-checked'),
    ).toBe('true');

    rerender(
      <QueryClientProvider client={queryClient}>
        <SpaceConfigurationPanel
          spacesApi={spacesApi}
          accountId="account-1"
          spaceId="space-2"
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(
        screen
          .getByRole('switch', {
            name: profileIdentity.supportGesturesToggle,
          })
          .getAttribute('aria-checked'),
      ).toBe('false');
    });
  });
});
