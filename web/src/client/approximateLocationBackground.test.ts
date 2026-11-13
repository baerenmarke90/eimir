import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  backgroundLocationStatus,
  disableBackgroundSharing,
  enableBackgroundSharing,
  requestLocationPermission,
  syncBackgroundSharing,
} from './approximateLocation';
import { isAndroidApp } from './config';

const native = vi.hoisted(() => ({
  status: { permission: 'granted', enabled: false },
  requestPermissions: vi.fn(async (_options: unknown) => ({
    location: 'granted',
  })),
  deviceId: vi.fn(async () => ({
    deviceId: '0b5b2b8e-6f8e-4f1e-9a51-6c1c5a8e2f10',
  })),
  enableBackground: vi.fn(async (_options: unknown) => undefined),
  disableBackground: vi.fn(async () => undefined),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isPluginAvailable: () => true },
  registerPlugin: () => ({
    requestPermissions: native.requestPermissions,
    deviceId: native.deviceId,
    backgroundStatus: async () => native.status,
    enableBackground: native.enableBackground,
    disableBackground: native.disableBackground,
  }),
}));

vi.mock('./config', () => ({ isAndroidApp: vi.fn(() => true) }));

const EXPIRES = new Date('2026-12-13T10:00:00Z');

function api() {
  return {
    issuePartnerLocationDeviceCredential: vi.fn(async () => ({
      credential: 'scoped-credential-value-123456',
      expiresAt: EXPIRES,
      consentGeneration: 3,
    })),
    revokePartnerLocationDeviceCredential: vi.fn(async () => undefined),
  };
}

beforeEach(() => {
  vi.mocked(isAndroidApp).mockReturnValue(true);
  native.status = { permission: 'granted', enabled: false };
});

afterEach(() => vi.clearAllMocks());

describe('background sharing bridge', () => {
  it('requests only the approximate grant in the foreground step', async () => {
    await requestLocationPermission();
    expect(native.requestPermissions).toHaveBeenCalledWith({
      permissions: ['location'],
    });
  });

  it('hands a freshly issued scoped credential to the native service', async () => {
    const client = api();
    await enableBackgroundSharing({
      api: client,
      spaceId: 'space',
      instance: 'https://eimir.example',
    });
    expect(client.issuePartnerLocationDeviceCredential).toHaveBeenCalledWith({
      spaceId: 'space',
      presenceDeviceCredentialRequest: {
        deviceId: '0b5b2b8e-6f8e-4f1e-9a51-6c1c5a8e2f10',
      },
    });
    expect(native.enableBackground).toHaveBeenCalledWith({
      instance: 'https://eimir.example',
      credential: 'scoped-credential-value-123456',
      expiresAt: EXPIRES.toISOString(),
    });
  });

  it('refuses to enable without the background permission', async () => {
    native.status = { permission: 'prompt', enabled: false };
    const client = api();
    await expect(
      enableBackgroundSharing({
        api: client,
        spaceId: 'space',
        instance: 'https://eimir.example',
      }),
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(client.issuePartnerLocationDeviceCredential).not.toHaveBeenCalled();
  });

  it('stops locally even when revoking on the server fails', async () => {
    const client = api();
    client.revokePartnerLocationDeviceCredential.mockRejectedValueOnce(
      new Error('offline'),
    );
    await disableBackgroundSharing({ api: client, spaceId: 'space' });
    expect(native.disableBackground).toHaveBeenCalled();
  });

  it('rotates an enabled credential and stops when sharing ended', async () => {
    const client = api();
    const request = {
      api: client,
      spaceId: 'space',
      instance: 'https://eimir.example',
    };
    expect(
      await syncBackgroundSharing({
        ...request,
        settings: { state: 'ACTIVE' },
      }),
    ).toBe('unchanged');

    native.status = { permission: 'granted', enabled: true };
    expect(
      await syncBackgroundSharing({
        ...request,
        settings: { state: 'ACTIVE' },
      }),
    ).toBe('enabled');
    expect(native.enableBackground).toHaveBeenCalledTimes(1);

    expect(
      await syncBackgroundSharing({
        ...request,
        settings: { state: 'EXPIRED' },
      }),
    ).toBe('disabled');
    expect(native.disableBackground).toHaveBeenCalledTimes(1);
  });

  it('reports unsupported outside the Android app', async () => {
    vi.mocked(isAndroidApp).mockReturnValue(false);
    expect(await backgroundLocationStatus()).toEqual({
      permission: 'unsupported',
      enabled: false,
    });
  });
});
