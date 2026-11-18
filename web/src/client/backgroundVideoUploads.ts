import {
  Capacitor,
  type PluginListenerHandle,
  registerPlugin,
} from '@capacitor/core';
import { useSyncExternalStore } from 'react';
import type { UploadDescriptor } from '../api/generated/models/UploadDescriptor';
import { isAndroidApp } from './config';
import type { ReferenceApis } from './referenceFlow';
import { uploadAttachmentBytesWithProgress } from './referenceFlow';
import { advanceUploadProgress } from './uploadProgress';

export interface VideoTransfer {
  attachmentId: string;
  phase: 'uploading' | 'processing' | 'failed';
  progress: number;
}
export type VideoTransferTarget = {
  targetType: 'MEMORY' | 'HEART_MOMENT';
  targetId: string;
};
export type VideoTransferOpen = VideoTransferTarget & {
  instance: string;
  accountId: string;
  spaceId: string;
  attachmentId: string;
};
interface NativeTransfers {
  bindTarget(options: VideoTransferOpen): Promise<void>;
  addListener(
    event: 'transferOpen',
    callback: (target: VideoTransferOpen) => void,
  ): Promise<PluginListenerHandle>;
  prepare(options: {
    instance: string;
    accountId: string;
    spaceId: string;
    attachmentId: string;
    sourceName: string;
    size: number;
    mimeType: string;
  }): Promise<NativePreparedVideo>;
  cancelPreparation(
    options: VideoTransferOwner & { attachmentId: string },
  ): Promise<void>;
  enqueue(options: {
    instance: string;
    accountId: string;
    spaceId: string;
    attachmentId: string;
    sourceName: string;
    size: number;
    mimeType: string;
    preparationId?: string;
  }): Promise<void>;
  list(options: {
    instance: string;
    accountId: string;
    spaceId: string;
  }): Promise<{ items: VideoTransfer[] }>;
  retry(options: {
    instance: string;
    accountId: string;
    spaceId: string;
    attachmentId: string;
  }): Promise<void>;
  cancel(options: {
    instance: string;
    accountId: string;
    spaceId: string;
    attachmentId: string;
  }): Promise<void>;
}
export const nativeVideoTransfers = registerPlugin<NativeTransfers>(
  'BackgroundMediaUploads',
);
const native = nativeVideoTransfers;
export const hasNativeVideoTransfers = () =>
  isAndroidApp() && Capacitor.isPluginAvailable('BackgroundMediaUploads');
export type VideoTransferOwner = {
  instance: string;
  accountId: string;
  spaceId: string;
};
export interface NativePreparedVideo {
  preparationId: string;
  name: string;
  type: 'video/mp4' | 'video/quicktime';
  size: number;
}

/** Prepare before reservation so byte/gallery limits use the real output size. */
export async function prepareNativeVideoForUpload(
  owner: VideoTransferOwner,
  file: File,
  signal?: AbortSignal,
): Promise<NativePreparedVideo | undefined> {
  if (!hasNativeVideoTransfers()) return undefined;
  if (signal?.aborted) throw new DOMException('Upload aborted.', 'AbortError');
  const generation = revision;
  const attachmentId = crypto.randomUUID();
  const cancel = () => {
    void native
      .cancelPreparation({ ...owner, attachmentId })
      .catch(() => undefined);
  };
  signal?.addEventListener('abort', cancel, { once: true });
  preparations.add(cancel);
  try {
    const prepared = await native.prepare({
      ...owner,
      attachmentId,
      sourceName: file.name,
      size: file.size,
      mimeType: file.type,
    });
    if (signal?.aborted || generation !== revision) {
      cancel();
      throw new DOMException('Upload aborted.', 'AbortError');
    }
    if (
      prepared.preparationId !== attachmentId ||
      !['video/mp4', 'video/quicktime'].includes(prepared.type) ||
      !Number.isSafeInteger(prepared.size) ||
      prepared.size <= 0 ||
      prepared.size > 250 * 1024 * 1024
    ) {
      cancel();
      throw new Error('Invalid prepared video.');
    }
    return prepared;
  } catch (error) {
    cancel();
    if (signal?.aborted || generation !== revision)
      throw new DOMException('Upload aborted.', 'AbortError');
    throw error;
  } finally {
    signal?.removeEventListener('abort', cancel);
    preparations.delete(cancel);
  }
}
export async function releasePreparedVideo(
  owner: VideoTransferOwner,
  prepared: NativePreparedVideo,
) {
  await native
    .cancelPreparation({ ...owner, attachmentId: prepared.preparationId })
    .catch(() => undefined);
}
type Transfer = VideoTransfer & {
  owner: VideoTransferOwner;
  native: boolean;
  controller?: AbortController;
  run?: (signal: AbortSignal) => Promise<void>;
  size: number;
};
const transfers = new Map<string, Transfer>();
const preparations = new Set<() => void>();
const listeners = new Set<() => void>();
let revision = 0;
let running = 0;
let poll: ReturnType<typeof setInterval> | undefined;
let nativeOwner: VideoTransferOwner | undefined;
let polling = false;

function changed() {
  for (const listener of listeners) listener();
}
function update(id: string, patch: Partial<VideoTransfer>) {
  const current = transfers.get(id);
  if (!current) return;
  const next = {
    ...current,
    ...patch,
    progress:
      patch.progress === undefined
        ? current.progress
        : advanceUploadProgress(current.progress, patch.progress),
  };
  if (next.phase === current.phase && next.progress === current.progress)
    return;
  transfers.set(id, next);
  changed();
}
async function readNative() {
  if (!nativeOwner || polling || !hasNativeVideoTransfers()) return;
  const owner = nativeOwner;
  const generation = revision;
  const observed = new Map(transfers);
  polling = true;
  try {
    const result = await native.list(owner);
    if (generation !== revision || owner !== nativeOwner) return;
    const ids = new Set(result.items.map((item) => item.attachmentId));
    // Native workers remove completed staging records. Retain the last known
    // processing phase for this session until the parent read catches up;
    // absence must not briefly turn accepted bytes into a new unknown upload.
    for (const [id, item] of transfers)
      if (
        item.native &&
        item.phase !== 'processing' &&
        JSON.stringify(item.owner) === JSON.stringify(owner) &&
        observed.get(id) === item &&
        !ids.has(id)
      )
        transfers.delete(id);
    for (const item of result.items) {
      const previous = transfers.get(item.attachmentId);
      // Admission, cancellation and retry may complete while the native list is
      // in flight. That older snapshot must not replace their new attempt.
      if (previous !== observed.get(item.attachmentId)) continue;
      const progress = advanceUploadProgress(
        previous?.progress ?? 0,
        item.progress,
      );
      const phase =
        previous?.phase === 'processing' && item.phase === 'uploading'
          ? previous.phase
          : item.phase;
      if (previous?.phase === phase && previous.progress === progress) continue;
      transfers.set(item.attachmentId, {
        ...item,
        phase,
        progress,
        owner,
        native: true,
        size: previous?.size ?? 0,
      });
    }
    changed();
  } catch {
    // The authenticated parent remains the source of media readiness.
  } finally {
    polling = false;
  }
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!poll && hasNativeVideoTransfers()) {
    void readNative();
    poll = setInterval(() => {
      if (document.visibilityState !== 'hidden') void readNative();
    }, 1500);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      clearInterval(poll);
      poll = undefined;
    }
  };
}
export function useVideoTransfer(id?: string) {
  return useSyncExternalStore(
    subscribe,
    () => (id ? transfers.get(id) : undefined),
    () => undefined,
  );
}

/** Set the authorized observation scope after login/resume; no upload is started. */
export function observeNativeVideoTransfers(owner: VideoTransferOwner) {
  if (!hasNativeVideoTransfers()) return;
  if (nativeOwner && JSON.stringify(nativeOwner) !== JSON.stringify(owner))
    clearBackgroundVideoTransfers();
  nativeOwner ??= owner;
  void readNative();
}

/** Only confirmed parent writes may update an active native notification target. */
export async function bindVideoTransferTargets(
  spaceId: string,
  target: VideoTransferTarget,
  attachmentIds: readonly string[],
) {
  await Promise.all(
    attachmentIds.map(async (attachmentId) => {
      const item = transfers.get(attachmentId);
      if (!item?.native || item.owner.spaceId !== spaceId) return;
      try {
        await native.bindTarget({ ...item.owner, ...target, attachmentId });
      } catch {
        // Revocation/completion can race binding; a confirmed save stays successful.
      }
    }),
  );
}

function pump() {
  if (running >= 2) return;
  const next = [...transfers.values()].find(
    (item) => item.run && !item.controller && item.phase === 'uploading',
  );
  if (!next?.run) return;
  const controller = new AbortController();
  next.controller = controller;
  running++;
  const generation = revision;
  void next
    .run(controller.signal)
    .then(
      () => {
        if (
          generation === revision &&
          transfers.get(next.attachmentId)?.controller === controller
        ) {
          transfers.delete(next.attachmentId);
          changed();
        }
      },
      () => {
        if (generation === revision && !controller.signal.aborted)
          update(next.attachmentId, { phase: 'failed' });
      },
    )
    .finally(() => {
      next.controller = undefined;
      if (generation !== revision) return;
      const current = transfers.get(next.attachmentId);
      if (current?.controller === controller)
        transfers.set(next.attachmentId, { ...current, controller: undefined });
      running = Math.max(0, running - 1);
      pump();
    });
  pump();
}

/** Admission returns after native staging, before transfer; the editor owns no worker. */
export async function startBackgroundVideoTransfer({
  apis,
  apiBaseUrl,
  accessToken,
  accountId,
  spaceId,
  file,
  prepared,
  descriptor,
  fetchApi = fetch,
}: {
  apis: ReferenceApis;
  apiBaseUrl: string;
  accessToken: string;
  accountId: string;
  spaceId: string;
  file: File;
  prepared?: NativePreparedVideo;
  descriptor: UploadDescriptor;
  fetchApi?: typeof fetch;
}): Promise<void> {
  const owner = { instance: apiBaseUrl, accountId, spaceId };
  const attachmentId = descriptor.attachment.id;
  const generation = revision;
  const nativeTransfer = hasNativeVideoTransfers();
  if (prepared && !nativeTransfer)
    throw new Error('Prepared video transport unavailable.');
  const selected = prepared ?? file;
  const active = [...transfers.values()].filter((item) => item.run);
  if (
    active.length >= 20 ||
    active.reduce((bytes, item) => bytes + item.size, selected.size) >
      500 * 1024 * 1024
  )
    throw new Error('The device transfer staging budget is full.');
  if (nativeTransfer)
    await native.enqueue({
      ...owner,
      attachmentId,
      sourceName: selected.name,
      size: selected.size,
      mimeType: selected.type,
      ...(prepared ? { preparationId: prepared.preparationId } : {}),
    });
  if (generation !== revision) {
    if (nativeTransfer)
      void native.cancel({ ...owner, attachmentId }).catch(() => undefined);
    throw new DOMException('Transfer ownership changed.', 'AbortError');
  }
  const observed = transfers.get(attachmentId);
  const continuingNative =
    nativeTransfer &&
    observed?.native &&
    JSON.stringify(observed.owner) === JSON.stringify(owner);
  const entry: Transfer = {
    attachmentId,
    owner,
    native: nativeTransfer,
    phase: continuingNative ? observed.phase : 'uploading',
    progress: continuingNative ? observed.progress : 0,
    size: selected.size,
  };
  if (!nativeTransfer)
    entry.run = async (signal) => {
      if (signal.aborted)
        throw new DOMException('Upload aborted.', 'AbortError');
      const current = await apis.attachments.getAttachment(
        { spaceId, attachmentId },
        { signal },
      );
      if (['READY', 'PROCESSING'].includes(current.status)) return;
      await uploadAttachmentBytesWithProgress(
        apiBaseUrl,
        accessToken,
        descriptor,
        file,
        {
          signal,
          onProgress: (progress) => {
            if (!signal.aborted) update(attachmentId, { progress });
          },
        },
        fetchApi,
      );
      signal.throwIfAborted();
      update(attachmentId, { phase: 'processing', progress: 100 });
      await apis.attachments.finalizeAttachmentUpload(
        { spaceId, attachmentId, body: {} },
        { signal },
      );
    };
  transfers.set(attachmentId, entry);
  nativeOwner = owner;
  changed();
  if (!nativeTransfer) pump();
}

export async function retryVideoTransfer(attachmentId: string) {
  const item = transfers.get(attachmentId);
  if (item?.phase !== 'failed') return;
  if (item.native) await native.retry({ ...item.owner, attachmentId });
  if (transfers.get(attachmentId) !== item) return;
  transfers.set(attachmentId, { ...item, phase: 'uploading', progress: 0 });
  changed();
  pump();
}
export function cancelVideoTransfer(attachmentId: string) {
  const item = transfers.get(attachmentId);
  if (!item) return;
  item.controller?.abort();
  transfers.delete(attachmentId);
  if (item.native)
    void native.cancel({ ...item.owner, attachmentId }).catch(() => undefined);
  changed();
}
export function clearBackgroundVideoTransfers() {
  revision++;
  for (const cancel of preparations) cancel();
  preparations.clear();
  for (const item of transfers.values()) item.controller?.abort();
  transfers.clear();
  running = 0;
  nativeOwner = undefined;
  clearInterval(poll);
  poll = undefined;
  changed();
  // Native session revocation separately cancels its files, jobs and sockets.
}
