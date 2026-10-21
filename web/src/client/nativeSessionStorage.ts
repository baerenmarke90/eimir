import { Capacitor, registerPlugin } from '@capacitor/core';
import { isCapacitorNativePlatform, loadReferenceClientConfig } from './config';

interface NativeSessionStoragePlugin {
  read(options: { instance: string }): Promise<{ value?: string }>;
  write(options: { instance: string; value: string }): Promise<void>;
  clear(options: { instance: string }): Promise<void>;
}

const storage = registerPlugin<NativeSessionStoragePlugin>(
  'NativeSessionStorage',
);

export function isNativeSessionStorageAvailable(): boolean {
  return isCapacitorNativePlatform() && Capacitor.getPlatform() === 'android';
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
