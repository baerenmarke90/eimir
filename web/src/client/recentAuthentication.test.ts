import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@capacitor/app';
import { AuthApi } from '../api/generated/apis/AuthApi';
import { RecentAuthenticationClient } from '../api/generated/models/RecentAuthenticationClient';
import { isCapacitorNative } from '../pwa';
import { ClientProblemError } from './problemDetails';
import {
  authenticateRecentPasskey,
  authenticateServerAdminRecentPassword,
  isRecentAuthRequired,
  loadRecentAuthenticationCapabilities,
  loadServerAdminRecentAuthenticationCapabilities,
  parseOidcCallbackUrl,
  waitForCapacitorOidcCallback,
} from './recentAuthentication';

vi.mock('../pwa', () => ({
  isCapacitorNative: vi.fn(),
  canRegisterProductionServiceWorker: vi.fn(),
  registerProductionServiceWorker: vi.fn(),
}));

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(),
    getLaunchUrl: vi.fn(),
  },
}));

vi.mock('@capacitor/browser', () => ({
  Browser: {
    open: vi.fn(),
    close: vi.fn(),
  },
}));

describe('OIDC callback parsing and Capacitor integration', () => {
  it('parses valid OIDC callback URL matching expected state', () => {
    const validUrl =
      'de.sidebyside.app://recent-authentication/oidc?code=auth-code-123&state=expected-state-456';
    const result = parseOidcCallbackUrl(validUrl, 'expected-state-456');
    expect(result).toEqual({
      code: 'auth-code-123',
      state: 'expected-state-456',
    });
  });

  it('rejects callback with state mismatch', () => {
    const mismatchUrl =
      'de.sidebyside.app://recent-authentication/oidc?code=auth-code-123&state=wrong-state';
    const result = parseOidcCallbackUrl(mismatchUrl, 'expected-state-456');
    expect(result).toBeNull();
  });

  it('rejects callback with non-matching scheme or host', () => {
    const wrongScheme =
      'https://recent-authentication/oidc?code=123&state=expected-state-456';
    expect(parseOidcCallbackUrl(wrongScheme, 'expected-state-456')).toBeNull();

    const wrongHost =
      'de.sidebyside.app://other-host/oidc?code=123&state=expected-state-456';
    expect(parseOidcCallbackUrl(wrongHost, 'expected-state-456')).toBeNull();
  });

  it('throws error when provider returns error parameter', () => {
    const errorUrl =
      'de.sidebyside.app://recent-authentication/oidc?error=access_denied&state=expected-state-456';
    expect(() =>
      parseOidcCallbackUrl(errorUrl, 'expected-state-456'),
    ).toThrowError(/The identity provider rejected reauthentication/);
  });

  it('resolves callback from App.getLaunchUrl cold start', async () => {
    const launchUrl =
      'de.sidebyside.app://recent-authentication/oidc?code=cold-start-code&state=cold-state';
    vi.mocked(App.getLaunchUrl).mockResolvedValueOnce({ url: launchUrl });
    vi.mocked(App.addListener).mockResolvedValueOnce({ remove: vi.fn() });

    const result = await waitForCapacitorOidcCallback('cold-state');
    expect(result).toEqual({
      code: 'cold-start-code',
      state: 'cold-state',
    });
  });

  it('resolves callback from appUrlOpen event while app was running', async () => {
    vi.mocked(App.getLaunchUrl).mockResolvedValueOnce(undefined);

    let listenerCallback: ((event: { url: string }) => void) | undefined;
    vi.mocked(App.addListener).mockImplementationOnce(((
      eventName: string,
      cb: (event: { url: string }) => void,
    ) => {
      listenerCallback = cb;
      return Promise.resolve({ remove: vi.fn() });
    }) as any);

    const promise = waitForCapacitorOidcCallback('active-state');

    // Simulate intent firing
    listenerCallback?.({
      url: 'de.sidebyside.app://recent-authentication/oidc?code=active-code&state=active-state',
    });

    const result = await promise;
    expect(result).toEqual({
      code: 'active-code',
      state: 'active-state',
    });
  });
});

describe('Recent authentication capabilities and native passkey gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requests default/web capabilities on Web and preserves passkey availability', async () => {
    vi.mocked(isCapacitorNative).mockReturnValue(false);

    const apiSpy = vi
      .spyOn(
        AuthApi.prototype,
        'capabilitiesApiV1AuthRecentAuthenticationAccountDeletionGet',
      )
      .mockResolvedValueOnce({
        expiresInSeconds: 300,
        localPassword: true,
        passkey: true,
        oidcConnections: ['provider-web-only', 'provider-universal'],
      });

    const result = await loadRecentAuthenticationCapabilities(
      'https://api.example.com',
      'test-token',
    );

    expect(apiSpy).toHaveBeenCalledWith({
      client: undefined,
    });
    expect(result.passkey).toBe(true);
    expect(result.oidcConnections).toEqual([
      'provider-web-only',
      'provider-universal',
    ]);
  });

  it('requests client=android in native Capacitor container and suppresses direct passkeys', async () => {
    vi.mocked(isCapacitorNative).mockReturnValue(true);

    const apiSpy = vi
      .spyOn(
        AuthApi.prototype,
        'capabilitiesApiV1AuthRecentAuthenticationAccountDeletionGet',
      )
      .mockResolvedValueOnce({
        expiresInSeconds: 300,
        localPassword: true,
        passkey: true,
        oidcConnections: ['provider-universal'],
      });

    const result = await loadRecentAuthenticationCapabilities(
      'https://api.example.com',
      'test-token',
    );

    expect(apiSpy).toHaveBeenCalledWith({
      client: RecentAuthenticationClient.android,
    });
    // In native mode, passkey is explicitly gated to false
    expect(result.passkey).toBe(false);
    // Only universal connections (with android redirect uri) returned
    expect(result.oidcConnections).toEqual(['provider-universal']);
  });

  it('filters out OIDC connections without android_redirect_uri when querying native client', async () => {
    vi.mocked(isCapacitorNative).mockReturnValue(true);

    // Simulating backend behavior where client=android returns only connections with mobile redirect
    vi.spyOn(
      AuthApi.prototype,
      'capabilitiesApiV1AuthRecentAuthenticationAccountDeletionGet',
    ).mockImplementationOnce(async ({ client } = {}) => {
      if (client === RecentAuthenticationClient.android) {
        return {
          expiresInSeconds: 300,
          localPassword: true,
          passkey: true,
          oidcConnections: ['provider-universal'],
        };
      }
      return {
        expiresInSeconds: 300,
        localPassword: true,
        passkey: true,
        oidcConnections: ['provider-web-only', 'provider-universal'],
      };
    });

    const result = await loadRecentAuthenticationCapabilities(
      'https://api.example.com',
      'test-token',
    );
    expect(result.oidcConnections).not.toContain('provider-web-only');
    expect(result.oidcConnections).toContain('provider-universal');
  });

  it('rejects direct passkey authentication in native Capacitor container', async () => {
    vi.mocked(isCapacitorNative).mockReturnValue(true);

    await expect(
      authenticateRecentPasskey('https://api.example.com', 'test-token'),
    ).rejects.toThrow(
      'Direct passkey authentication is not supported in the native Android container.',
    );
  });
});

describe('ServerAdmin recent authentication routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isCapacitorNative).mockReturnValue(false);
  });

  it('loads capabilities from the ServerAdmin recent-auth endpoint', async () => {
    const apiSpy = vi
      .spyOn(
        AuthApi.prototype,
        'serverAdminCapabilitiesApiV1AuthRecentAuthenticationServerAdminGet',
      )
      .mockResolvedValueOnce({
        expiresInSeconds: 300,
        localPassword: true,
        passkey: false,
        oidcConnections: ['admin-oidc'],
      });

    const result = await loadServerAdminRecentAuthenticationCapabilities(
      'https://api.example.com',
      'admin-token',
    );

    expect(apiSpy).toHaveBeenCalledWith({ client: undefined });
    expect(result.oidcConnections).toEqual(['admin-oidc']);
  });

  it('routes password step-up to the ServerAdmin purpose endpoint', async () => {
    const response = {
      achievedAt: new Date('2026-09-19T18:00:00Z'),
      expiresAt: new Date('2026-09-19T18:05:00Z'),
      method: 'LOCAL_PASSWORD',
      purpose: 'SERVER_ADMIN_ACTION',
    };
    const apiSpy = vi
      .spyOn(
        AuthApi.prototype,
        'serverAdminPasswordApiV1AuthRecentAuthenticationServerAdminPasswordPost',
      )
      .mockResolvedValueOnce(response);

    await expect(
      authenticateServerAdminRecentPassword(
        'https://api.example.com',
        'admin-token',
        'current-password',
      ),
    ).resolves.toEqual(response);

    expect(apiSpy).toHaveBeenCalledWith({
      passwordRequest: { password: 'current-password' },
    });
  });

  it('recognizes only the structured recent-auth challenge', () => {
    expect(
      isRecentAuthRequired(
        new ClientProblemError(
          'permission',
          403,
          'RECENT_AUTHENTICATION_REQUIRED',
        ),
      ),
    ).toBe(true);
    expect(
      isRecentAuthRequired(
        new ClientProblemError('permission', 403, 'FORBIDDEN'),
      ),
    ).toBe(false);
    expect(
      isRecentAuthRequired(
        new ClientProblemError(
          'unauthorized',
          401,
          'RECENT_AUTHENTICATION_REQUIRED',
        ),
      ),
    ).toBe(false);
  });
});
