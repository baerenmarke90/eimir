import type { DevicePushController } from './devicePush';

const DEVICE_ERROR_STATUS_KEYS: Readonly<Record<string, string>> = {
  NO_PUSH_DISTRIBUTOR: 'notificationSettings.deviceNoDistributor',
  NOTIFICATION_PERMISSION_DENIED: 'notificationSettings.devicePermissionDenied',
  PUSH_DEVICE_CLEANUP_PENDING: 'notificationSettings.deviceCleanupPending',
  PUSH_ENDPOINT_UNSUPPORTED: 'notificationSettings.deviceUnsupported',
  PUSH_DEVICE_STATUS_UNAVAILABLE:
    'notificationSettings.deviceStatusUnavailable',
};

const DEVICE_STATE_STATUS_KEYS: Readonly<
  Record<DevicePushController['state'], string>
> = {
  loading: 'notificationSettings.deviceLoading',
  unavailable: 'notificationSettings.deviceUnavailable',
  off: 'notificationSettings.deviceOff',
  connecting: 'notificationSettings.deviceConnecting',
  disconnecting: 'notificationSettings.deviceDisconnecting',
  on: 'notificationSettings.deviceOn',
  error: 'notificationSettings.deviceError',
};

export function devicePushStatusKey(devicePush: DevicePushController): string {
  return (
    (devicePush.error && DEVICE_ERROR_STATUS_KEYS[devicePush.error]) ||
    DEVICE_STATE_STATUS_KEYS[devicePush.state]
  );
}

/** One dominant action per state; retry only where it can succeed. */
export function devicePushAction(
  devicePush: DevicePushController,
): 'enable' | 'openSettings' | null {
  if (devicePush.error === 'NOTIFICATION_PERMISSION_DENIED') {
    return 'openSettings';
  }
  if (devicePush.error === 'PUSH_ENDPOINT_UNSUPPORTED') return null;
  return devicePush.state === 'off' || devicePush.state === 'error'
    ? 'enable'
    : null;
}
