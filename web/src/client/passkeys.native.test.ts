// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({
  isAvailable: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
}));
const apis = vi.hoisted(() => ({
  startAuthentication: vi.fn(),
  finishAuthentication: vi.fn(),
  startRegistration: vi.fn(),
  finishRegistration: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
  registerPlugin: () => bridge,
}));
vi.mock('./referenceFlow', () => ({
  createReferenceApis: () => ({
    auth: {
      startPasskeyAuthenticationApiV1AuthPasskeysAuthenticationStartPost:
        apis.startAuthentication,
      finishPasskeyAuthenticationApiV1AuthPasskeysAuthenticationFinishPost:
        apis.finishAuthentication,
      startPasskeyRegistrationApiV1AuthPasskeysRegistrationStartPost:
        apis.startRegistration,
      finishPasskeyRegistrationApiV1AuthPasskeysRegistrationFinishPost:
        apis.finishRegistration,
    },
  }),
}));

const options = { challenge: 'abc', rpId: 'app.eimir.de' };

async function load() {
  vi.resetModules();
  return import('./passkeys');
}

describe('native passkeys through Credential Manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apis.startAuthentication.mockResolvedValue(options);
    apis.startRegistration.mockResolvedValue(options);
  });
  afterEach(() => vi.resetModules());

  it('offers passkeys only after the app reported itself available', async () => {
    bridge.isAvailable.mockResolvedValue({ available: true });
    const passkeys = await load();
    expect(passkeys.passkeysAvailable()).toBe(false);
    await passkeys.primePasskeyAvailability();
    expect(passkeys.passkeysAvailable()).toBe(true);
  });

  it('offers nothing when the bridge is missing or unavailable', async () => {
    bridge.isAvailable.mockRejectedValue(new Error('not implemented'));
    const passkeys = await load();
    await passkeys.primePasskeyAvailability();
    expect(passkeys.passkeysAvailable()).toBe(false);
  });

  it('hands the server options to the platform and its answer back unchanged', async () => {
    const credential = { id: 'cred', type: 'public-key', response: {} };
    bridge.get.mockResolvedValue({ responseJson: JSON.stringify(credential) });
    apis.finishAuthentication.mockResolvedValue({ account: { id: 'a' } });
    const passkeys = await load();

    await passkeys.signInWithPasskey('https://app.eimir.de');

    expect(bridge.get).toHaveBeenCalledWith({
      requestJson: JSON.stringify(options),
    });
    expect(apis.finishAuthentication).toHaveBeenCalledWith({
      passkeyAuthenticationRequest: {
        credential,
        deviceName: 'eimir. Android',
        platform: 'android',
      },
    });
  });

  it('registers a passkey with the platform response', async () => {
    const credential = { id: 'cred', type: 'public-key', response: {} };
    bridge.create.mockResolvedValue({
      responseJson: JSON.stringify(credential),
    });
    apis.finishRegistration.mockResolvedValue({});
    const passkeys = await load();

    await passkeys.registerPasskey('https://app.eimir.de', 'token', 'Pixel');

    expect(bridge.create).toHaveBeenCalledWith({
      requestJson: JSON.stringify(options),
    });
    expect(apis.finishRegistration).toHaveBeenCalledWith({
      passkeyRegistrationRequest: { credential, name: 'Pixel' },
    });
  });

  it('treats a closed system sheet as a cancellation', async () => {
    bridge.get.mockRejectedValue({ code: 'CANCELLED' });
    const passkeys = await load();
    await expect(
      passkeys.signInWithPasskey('https://app.eimir.de'),
    ).rejects.toBeInstanceOf(passkeys.PasskeyCancelledError);
    expect(apis.finishAuthentication).not.toHaveBeenCalled();
  });

  it('reports a device without a passkey for this service', async () => {
    bridge.get.mockRejectedValue({ code: 'NO_CREDENTIAL' });
    const passkeys = await load();
    await expect(
      passkeys.signInWithPasskey('https://app.eimir.de'),
    ).rejects.toBeInstanceOf(passkeys.PasskeyNotOnDeviceError);
  });
});
