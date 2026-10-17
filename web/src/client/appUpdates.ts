import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle,
} from '@capacitor/core';

export type AppUpdatePhase =
  | 'idle'
  | 'checking'
  | 'noRelease'
  | 'current'
  | 'available'
  | 'downloading'
  | 'verifying'
  | 'ready'
  | 'permissionRequired'
  | 'installerOpened'
  | 'error'
  | 'cancelled';

export interface AppUpdateState {
  revision: number;
  phase: AppUpdatePhase;
  busy: boolean;
  versionName: string;
  versionCode: number;
  sourceRevision: string;
  progress: number;
  errorCode?: string | null;
  available?: {
    versionName: string;
    versionCode: number;
    releaseNotes: string;
  };
}

export interface AppUpdatesAdapter {
  getState(): Promise<AppUpdateState>;
  check(): Promise<AppUpdateState>;
  checkIfDue(): Promise<AppUpdateState>;
  download(): Promise<AppUpdateState>;
  cancel(): Promise<AppUpdateState>;
  install(): Promise<AppUpdateState>;
  addListener(
    event: 'stateChanged',
    listener: (state: AppUpdateState) => void,
  ): Promise<PluginListenerHandle>;
}

/** Static build guard: normal Web/Store bundles have no active update bridge. */
export function appUpdatesAvailable(): boolean {
  return (
    import.meta.env.VITE_EIMIR_TEST_UPDATES === 'true' &&
    Capacitor.getPlatform() === 'android' &&
    Capacitor.isPluginAvailable('EimirAppUpdates')
  );
}

let adapter: AppUpdatesAdapter | undefined;
export function appUpdatesAdapter(): AppUpdatesAdapter {
  if (!appUpdatesAvailable()) throw new Error('App updates are unavailable');
  adapter ??= registerPlugin<AppUpdatesAdapter>('EimirAppUpdates');
  return adapter;
}

export function checkAppUpdatesIfDue(): void {
  if (!appUpdatesAvailable()) return;
  // Native owns throttling/serialization across React StrictMode and resumes.
  void appUpdatesAdapter()
    .checkIfDue()
    .catch(() => undefined);
}
