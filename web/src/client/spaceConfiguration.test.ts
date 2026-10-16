import { describe, expect, it, vi } from 'vitest';
import type { SpacesApi } from '../api/generated/apis/SpacesApi';
import type { SpaceConfigurationView } from '../api/generated/models/SpaceConfigurationView';
import {
  dailyContextTimezoneOptions,
  dailyModuleToggleUpdate,
  loadSpaceConfiguration,
  spaceConfigurationQueryKey,
  updateSpaceConfiguration,
} from './spaceConfiguration';

const configuration: SpaceConfigurationView = {
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
};

function rawResponse(value: SpaceConfigurationView, etag: string) {
  return {
    raw: new Response(null, { status: 200, headers: { ETag: etag } }),
    value: async () => value,
  };
}

describe('space configuration query contract', () => {
  it('isolates caller-specific management authority by account and space', () => {
    expect(spaceConfigurationQueryKey('account-1', 'space-1')).toEqual([
      'space-configuration',
      'account-1',
      'space-1',
    ]);
    expect(spaceConfigurationQueryKey('account-2', 'space-1')).not.toEqual(
      spaceConfigurationQueryKey('account-1', 'space-1'),
    );
    expect(spaceConfigurationQueryKey('account-1', 'space-2')).not.toEqual(
      spaceConfigurationQueryKey('account-1', 'space-1'),
    );
  });

  it('preserves the response ETag unchanged for the next If-Match write', async () => {
    const getSpaceConfigurationRaw = vi
      .fn()
      .mockResolvedValue(rawResponse(configuration, '"7"'));
    const updateSpaceConfigurationRaw = vi
      .fn()
      .mockResolvedValue(
        rawResponse(
          { ...configuration, supportGesturesEnabled: false, version: 8 },
          '"8"',
        ),
      );
    const spacesApi = {
      getSpaceConfigurationRaw,
      updateSpaceConfigurationRaw,
    } as unknown as SpacesApi;

    const current = await loadSpaceConfiguration(spacesApi, 'space-1');
    expect(current.etag).toBe('"7"');

    const updated = await updateSpaceConfiguration(
      spacesApi,
      'space-1',
      current.etag,
      { supportGesturesEnabled: false },
    );

    expect(updateSpaceConfigurationRaw).toHaveBeenCalledWith({
      spaceId: 'space-1',
      ifMatch: '"7"',
      spaceConfigurationUpdate: { supportGesturesEnabled: false },
    });
    expect(updated.etag).toBe('"8"');
    expect(updated.configuration.supportGesturesEnabled).toBe(false);
  });

  describe('Daily module toggles', () => {
    const fresh = {
      ...configuration,
      energyCheckInEnabled: false,
      vibeCheckEnabled: false,
    };

    it('sends the shared day zone atomically with the first enable', () => {
      expect(
        dailyModuleToggleUpdate(fresh, 'vibeCheckEnabled', 'Europe/Berlin'),
      ).toEqual({
        vibeCheckEnabled: true,
        dailyContextTimezone: 'Europe/Berlin',
      });
    });

    it('never overwrites an existing shared day zone or sends one when disabling', () => {
      const zoned = { ...fresh, dailyContextTimezone: 'UTC' };
      expect(
        dailyModuleToggleUpdate(zoned, 'energyCheckInEnabled', 'Europe/Berlin'),
      ).toEqual({ energyCheckInEnabled: true });
      expect(
        dailyModuleToggleUpdate(
          { ...configuration, dailyContextTimezone: null },
          'vibeCheckEnabled',
          'Europe/Berlin',
        ),
      ).toEqual({ vibeCheckEnabled: false });
    });

    it('leaves the zone out when the device offers none so the server stays the authority', () => {
      expect(dailyModuleToggleUpdate(fresh, 'vibeCheckEnabled', null)).toEqual({
        vibeCheckEnabled: true,
      });
    });

    it('keeps an unlisted current zone selectable', () => {
      expect(dailyContextTimezoneOptions('Mars/Olympus')).toContain(
        'Mars/Olympus',
      );
      expect(dailyContextTimezoneOptions('Europe/Berlin')).toContain(
        'Europe/Berlin',
      );
    });
  });
});
