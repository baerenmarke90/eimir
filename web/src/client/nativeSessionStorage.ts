import { Capacitor, registerPlugin } from '@capacitor/core';
import { isAndroidApp, loadReferenceClientConfig } from './config';

interface NativeSessionStoragePlugin {
  read(options: { instance: string }): Promise<{ value?: string }>;
  write(options: { instance: string; value: string }): Promise<void>;
  clear(options: { instance: string }): Promise<void>;
  /** Android only: the per-login media key, created on first use. */
  mediaKey(options: { instance: string }): Promise<{ value: string }>;
  clearMediaKey(options: { instance: string }): Promise<void>;
}

const storage = registerPlugin<NativeSessionStoragePlugin>(
  'NativeSessionStorage',
);

export function isNativeSessionStorageAvailable(): boolean {
  return (
    isAndroidApp() ||
    (Capacitor.getPlatform() === 'ios' &&
      Capacitor.isPluginAvailable('NativeSessionStorage'))
  );
}

export async function readNativeSessionSnapshot(): Promise<string | null> {
  const instance = loadReferenceClientConfig().apiBaseUrl;
  return (await storage.read({ instance })).value ?? null;
}

export async function writeNativeSessionSnapshot(
  value: string | null,
): Promise<void> {
  const instance = loadReferenceClientConfig().apiBaseUrl;
  if (value === null) await storage.clear({ instance });
  else await storage.write({ instance, value });
}

/** Raw bytes of this login's device media key; Android Keystore wraps it. */
export async function readNativeMediaKey(): Promise<Uint8Array<ArrayBuffer>> {
  const instance = loadReferenceClientConfig().apiBaseUrl;
  const { value } = await storage.mediaKey({ instance });
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

export async function clearNativeMediaKey(): Promise<void> {
  const instance = loadReferenceClientConfig().apiBaseUrl;
  await storage.clearMediaKey({ instance });
}
