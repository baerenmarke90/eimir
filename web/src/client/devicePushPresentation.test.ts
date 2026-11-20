import type { DevicePushController } from './devicePush';
import { devicePushDiagnostic } from './devicePushPresentation';

function controller(
  overrides: Partial<DevicePushController>,
): DevicePushController {
  return {
    available: true,
    state: 'error',
    error: null,
    registered: false,
    enable: async () => undefined,
    disable: async () => undefined,
    openSettings: async () => undefined,
    ...overrides,
  };
}

describe('devicePushDiagnostic', () => {
  it('shows the failure code and type only in Test builds', () => {
    const failed = controller({
      error: 'PUSH_REGISTRATION_FAILED',
      errorDetail: 'FirebaseException: SERVICE_NOT_AVAILABLE',
    });
    expect(devicePushDiagnostic(failed, false)).toBeNull();
    expect(devicePushDiagnostic(failed, true)).toBe(
      'PUSH_REGISTRATION_FAILED · FirebaseException: SERVICE_NOT_AVAILABLE',
    );
  });

  it('stays silent when the status text already names the cause', () => {
    expect(
      devicePushDiagnostic(controller({ error: 'NO_PUSH_DISTRIBUTOR' }), true),
    ).toBeNull();
  });

  it('stays silent outside the error state', () => {
    expect(
      devicePushDiagnostic(
        controller({ state: 'off', error: 'PUSH_REGISTRATION_FAILED' }),
        true,
      ),
    ).toBeNull();
  });
});
