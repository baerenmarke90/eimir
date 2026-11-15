import { Browser } from '@capacitor/browser';
import { PhotoSourcesApi } from '../api/generated/apis/PhotoSourcesApi';
import type { PhotoSelectionItemView } from '../api/generated/models/PhotoSelectionItemView';
import type { PhotoSelectionView } from '../api/generated/models/PhotoSelectionView';
import { isCapacitorNative } from '../pwa';
import { Configuration } from './apiConfiguration';
import { ClientProblemError } from './problemDetails';
import { retainPhotoInMemory } from './selectedMediaRetention';

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
    const milliseconds = Math.ceil(seconds * 1000);
    if (
      !Number.isFinite(milliseconds) ||
      milliseconds <= 0 ||
      milliseconds > 2_147_483_647
    ) {
      reject(new Error('Photo polling interval is invalid.'));
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, milliseconds);
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

export function photoFile(blob: Blob, index: number, memoryOnly = false): File {
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
  const file = new File([blob], `photo-${index + 1}.${extension}`, {
    type: blob.type,
  });
  return memoryOnly ? retainPhotoInMemory(file) : file;
}

export function selectionReady(view: PhotoSelectionView): boolean {
  if (['FAILED', 'EXPIRED', 'CANCELLED'].includes(view.status))
    throw new Error('Photo authorization ended.');
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
          { signal, cache: 'no-store' },
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

// ---- Typed items (#1467): per-item outcomes for photos and videos ------------------------

export type PhotoItemKind = 'IMAGE' | 'VIDEO' | 'OTHER';

/** Old servers and fixtures send only an id: such an item is an available photo. */
export function itemKind(item: PhotoSelectionItemView): PhotoItemKind {
  return item.kind ?? 'IMAGE';
}

export function itemAvailability(
  item: PhotoSelectionItemView,
): NonNullable<PhotoSelectionItemView['availability']> {
  return item.availability ?? 'AVAILABLE';
}

/** Only a selection that holds something other than plain photos needs the per-item list. */
export function selectionIsTyped(view: PhotoSelectionView): boolean {
  return (
    view.source === 'google' &&
    view.items.some(
      (item) =>
        itemKind(item) !== 'IMAGE' || itemAvailability(item) !== 'AVAILABLE',
    )
  );
}

export type ItemOutcome =
  | { state: 'waiting' | 'working' | 'done' }
  // A transient problem: one plain "try again" covers every such item.
  | { state: 'failed'; reason: string }
  // Final for this destination or file: a short plain reason, no retry.
  | { state: 'unsupported'; reason: string };

/** Fixed server codes for an item that cannot be added, mapped to plain wording. */
export function unavailableReason(code: string | null | undefined): string {
  switch (code) {
    case 'VIDEO_NOT_ALLOWED':
      return 'photoSources.itemNoVideo';
    case 'VIDEO_UNAVAILABLE':
      return 'photoSources.itemVideoOff';
    case 'UNAVAILABLE':
      return 'photoSources.itemGone';
    default:
      return 'photoSources.itemUnsupported';
  }
}

export function initialOutcomes(
  view: PhotoSelectionView,
): Record<string, ItemOutcome> {
  return Object.fromEntries(
    view.items.map((item): [string, ItemOutcome] =>
      itemAvailability(item) === 'UNAVAILABLE'
        ? [
            item.id,
            { state: 'unsupported', reason: unavailableReason(item.code) },
          ]
        : [item.id, { state: 'waiting' }],
    ),
  );
}

/** Classify a failed single-item import call; a gone selection is left to the caller. */
export function importFailure(error: unknown): ItemOutcome {
  const problem = error instanceof ClientProblemError ? error : undefined;
  switch (problem?.code) {
    case 'VIDEO_NOT_ALLOWED':
    case 'VIDEO_UNAVAILABLE':
    case 'UNAVAILABLE':
      return { state: 'unsupported', reason: unavailableReason(problem.code) };
    case 'PREMIUM_ENTITLEMENT_REQUIRED':
      return { state: 'unsupported', reason: 'photoSources.itemVideoOff' };
    case 'PHOTO_SOURCE_TOO_LARGE':
    case 'ATTACHMENT_TOO_LARGE':
      return { state: 'unsupported', reason: 'video.tooLarge' };
    case 'ATTACHMENT_TYPE_NOT_ALLOWED':
    case 'PHOTO_SOURCE_ITEM_INVALID':
      return { state: 'unsupported', reason: 'photoSources.itemUnsupported' };
    case 'NOT_READY':
      return { state: 'failed', reason: 'photoSources.itemNotReady' };
    default:
      return { state: 'failed', reason: 'photoSources.itemFailed' };
  }
}

/** The server's own verdict on the staged video (codec, length, size): final, plain. */
export function videoVerdictReason(code: string | undefined): string {
  if (code === 'VIDEO_DURATION_EXCEEDED') return 'video.tooLong';
  if (code === 'ATTACHMENT_TOO_LARGE') return 'video.tooLarge';
  return 'photoSources.itemVideoRejected';
}
