import { Browser } from '@capacitor/browser';
import { PhotoSourcesApi } from '../api/generated/apis/PhotoSourcesApi';
import type { PhotoSelectionView } from '../api/generated/models/PhotoSelectionView';
import { isCapacitorNative } from '../pwa';
import { Configuration } from './apiConfiguration';

export function photoSourcesApi(apiBaseUrl: string, accessToken: string) {
  return new PhotoSourcesApi(
    new Configuration({
      basePath: apiBaseUrl,
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  );
}

/** The provider's advised polling interval, with abort-owned timer disposal. */
export function waitForPhotoPoll(seconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(
      () => {
        signal.removeEventListener('abort', abort);
        resolve();
      },
      Math.min(60, Math.max(3, seconds)) * 1000,
    );
    signal.addEventListener('abort', abort, { once: true });
  });
}

export function preparePhotoBrowser(): Window | null {
  if (isCapacitorNative()) return null;
  const popup = window.open(
    'about:blank',
    '_blank',
    'popup,width=520,height=720',
  );
  if (popup) popup.opener = null;
  return popup;
}

export async function openPhotoBrowser(url: string, popup: Window | null) {
  const parsed = new URL(url);
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    !['accounts.google.com', 'photos.google.com'].includes(parsed.hostname)
  ) {
    throw new Error('Photo authorization origin is invalid.');
  }
  if (isCapacitorNative()) await Browser.open({ url });
  else {
    if (!popup || popup.closed)
      throw new Error('Photo authorization window is unavailable.');
    popup.location.replace(parsed.href);
  }
}

export async function closePhotoBrowser(popup: Window | null) {
  popup?.close();
  if (isCapacitorNative()) await Browser.close().catch(() => {});
}

export function photoFile(blob: Blob, index: number): File {
  const extension = (
    {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/heic': 'heic',
      'image/heif': 'heif',
    } as Record<string, string>
  )[blob.type];
  if (!extension || blob.size === 0 || blob.size > 25 * 1024 * 1024) {
    throw new Error('Selected photo is unsupported.');
  }
  return new File([blob], `photo-${index + 1}.${extension}`, {
    type: blob.type,
  });
}

export function selectionReady(view: PhotoSelectionView): boolean {
  if (view.status === 'FAILED') throw new Error('Photo authorization failed.');
  return view.status === 'READY';
}

// Only visible thumbnail tasks queue here. Aborted queued work releases its
// references immediately; active requests retain their normal abort contract.
let thumbnailActive = 0;
const thumbnailQueue: Array<() => void> = [];
function pumpThumbnails() {
  while (thumbnailActive < 2 && thumbnailQueue.length)
    thumbnailQueue.shift()?.();
}
export function readPhotoThumbnail(
  api: PhotoSourcesApi,
  spaceId: string,
  selectionId: string,
  itemId: string,
  signal: AbortSignal,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const abort = () => {
      const index = thumbnailQueue.indexOf(run);
      if (index >= 0) thumbnailQueue.splice(index, 1);
      reject(signal.reason);
    };
    const run = () => {
      signal.removeEventListener('abort', abort);
      if (signal.aborted) {
        reject(signal.reason);
        return;
      }
      thumbnailActive++;
      void api
        .readSelectedPhoto(
          { spaceId, selectionId, itemId, thumbnail: true },
          { signal },
        )
        .then(resolve, reject)
        .finally(() => {
          thumbnailActive--;
          pumpThumbnails();
        });
    };
    signal.addEventListener('abort', abort, { once: true });
    thumbnailQueue.push(run);
    pumpThumbnails();
  });
}
