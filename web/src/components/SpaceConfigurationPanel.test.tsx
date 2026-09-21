// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
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
    dailyContextTimezone: null,
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

  it('shows a partner the shared state without any write affordance', async () => {
    const spacesApi = {
      getSpaceConfigurationRaw: vi.fn().mockResolvedValue(
        rawResponse(
          configuration({ canManageSpaceConfiguration: false }),
          '"7"',
        ),
      ),
    } as unknown as SpacesApi;

    renderPanel(spacesApi);

    expect(await screen.findByText(profileIdentity.spaceModuleOn)).not.toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
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
      getSpaceConfigurationRaw: vi.fn().mockImplementation(
        ({ spaceId }: { spaceId: string }) =>
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
      (await screen.findByRole('switch')).getAttribute('aria-checked'),
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
      expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe(
        'false',
      );
    });
  });
});
