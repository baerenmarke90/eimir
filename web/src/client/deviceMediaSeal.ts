import { isAndroidApp } from './config';
import {
  clearNativeMediaKey,
  readNativeMediaKey,
} from './nativeSessionStorage';

/**
 * Product Owner decision (2026-11-16): the Android app keeps every stored
 * image, shared and private, sealed with AES-GCM under a per-login key that
 * Android Keystore wraps. Logout deletes that key natively, which makes every
 * sealed row unreadable even before the rows themselves are removed. Browsers
 * and iOS do not seal; there, private images stay in session memory.
 */
export interface SealedMedia {
  readonly iv: Uint8Array<ArrayBuffer>;
  readonly data: ArrayBuffer;
  readonly type: string;
}

let key: Promise<CryptoKey | null> | null = null;
let keyOperations: Promise<unknown> = Promise.resolve();

export function sealsDeviceMedia(): boolean {
  return isAndroidApp();
}

/** The current login's key, or null when this device cannot seal (fail closed). */
export function deviceMediaKey(): Promise<CryptoKey | null> {
  if (!sealsDeviceMedia()) return Promise.resolve(null);
  if (!key) {
    const next = keyOperations.then(async () => {
      try {
        const raw = await readNativeMediaKey();
        try {
          return await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, [
            'encrypt',
            'decrypt',
          ]);
        } finally {
          raw.fill(0);
        }
      } catch {
        return null;
      }
    });
    keyOperations = next;
    key = next;
  }
  return key;
}

/** Forget the key in memory and delete it natively; a new login gets a new key. */
export function forgetDeviceMediaKey(): void {
  key = null;
  if (!sealsDeviceMedia()) return;
  keyOperations = keyOperations.then(() =>
    clearNativeMediaKey().catch(() => undefined),
  );
}

function additionalData(rowKey: string, type: string): Uint8Array<ArrayBuffer> {
  // Binds each ciphertext to its row and type; rows cannot be swapped.
  return Uint8Array.from(new TextEncoder().encode(`${rowKey}\u0000${type}`));
}

export async function sealMedia(
  cryptoKey: CryptoKey,
  rowKey: string,
  blob: Blob,
): Promise<SealedMedia> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: additionalData(rowKey, blob.type) },
    cryptoKey,
    await blob.arrayBuffer(),
  );
  return { iv, data, type: blob.type };
}

export async function openMedia(
  cryptoKey: CryptoKey,
  rowKey: string,
  sealed: SealedMedia,
): Promise<Blob> {
  const data = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: sealed.iv,
      additionalData: additionalData(rowKey, sealed.type),
    },
    cryptoKey,
    sealed.data,
  );
  return new Blob([data], { type: sealed.type });
}
