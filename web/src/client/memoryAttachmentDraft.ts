import { MediaType } from '../api/generated/models/MediaType';
import type { MemoryCreate } from '../api/generated/models/MemoryCreate';
import type { MemoryDetail } from '../api/generated/models/MemoryDetail';
import { i18n } from '../i18n';
import { ClientProblemError } from './problemDetails';
import {
  type ReferenceApis,
  ReferenceFlowError,
  uploadAttachmentBytesWithProgress,
  waitUntilAttachmentReady,
} from './referenceFlow';
import { selectedPhotoUnavailable } from './selectedMediaRetention';
import {
  startBackgroundVideoTransfer,
  cancelVideoTransfer,
} from './backgroundVideoUploads';

export type DraftUploadPhase = 'preparing' | 'uploading' | 'validating';

/** Uploaded and bindable; submitted video output is still server-owned. */
export interface ReadyDraftAttachment {
  processing?: boolean;
  attachmentId: string;
  hasThumbnail?: boolean;
  durationSeconds?: number | null;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Upload aborted.', 'AbortError');
}

export async function uploadMemoryDraftAttachment(
  apis: ReferenceApis,
  apiBaseUrl: string,
  accessToken: string,
  spaceId: string,
  file: File,
  onPhase?: (phase: DraftUploadPhase) => void,
  fetchApi: typeof fetch = fetch,
  options: {
    signal?: AbortSignal;
    onProgress?: (progress: number) => void;
    preserveMetadata?: boolean;
    accountId?: string;
  } = {},
): Promise<ReadyDraftAttachment> {
  if (selectedPhotoUnavailable(file))
    throw new ReferenceFlowError(
      i18n.t(
        file.type.startsWith('video/')
          ? 'video.missing'
          : 'memory.diary.photoUnavailable',
      ),
    );
  const video = file.type === 'video/mp4' || file.type === 'video/quicktime';
  if (!video && file.type.startsWith('video/'))
    throw new ReferenceFlowError(i18n.t('video.unsupported'));
  const audio = file.type.startsWith('audio/');
  if (!video && !audio && !file.type.startsWith('image/'))
    throw new ReferenceFlowError(i18n.t('flow.imageOnly'));
  if (video && file.size > 250 * 1024 * 1024)
    throw new ReferenceFlowError(i18n.t('video.tooLarge'));
  if (file.size === 0)
    throw new ReferenceFlowError(
      i18n.t(video ? 'video.empty' : 'flow.imageEmpty'),
    );

  let createdAttachment: { id: string; version: number } | null = null;
  try {
    throwIfAborted(options.signal);
    const uploadFile = file;
    onPhase?.('uploading');
    const upload = await apis.attachments.createAttachmentUpload({
      spaceId,
      attachmentUploadCreate: {
        expectedMimeType: uploadFile.type,
        expectedSize: uploadFile.size,
        mediaType: audio
          ? MediaType.AUDIO
          : video
            ? MediaType.VIDEO
            : MediaType.IMAGE,
        originalName: uploadFile.name,
        preserveMetadata:
          video || audio ? false : (options.preserveMetadata ?? false),
      },
    });
    createdAttachment = {
      id: upload.attachment.id,
      version: upload.attachment.version,
    };

    if (video && options.accountId) {
      await startBackgroundVideoTransfer({
        apis,
        apiBaseUrl,
        accessToken,
        accountId: options.accountId,
        spaceId,
        file: uploadFile,
        descriptor: upload,
        fetchApi,
      });
      if (options.signal?.aborted) {
        cancelVideoTransfer(upload.attachment.id);
        throwIfAborted(options.signal);
      }
      return {
        attachmentId: upload.attachment.id,
        processing: true,
        hasThumbnail: false,
      };
    }

    await uploadAttachmentBytesWithProgress(
      apiBaseUrl,
      accessToken,
      upload,
      uploadFile,
      options,
      fetchApi,
    );
    throwIfAborted(options.signal);
    onPhase?.('validating');
    const finalized = await apis.attachments.finalizeAttachmentUpload({
      spaceId,
      attachmentId: upload.attachment.id,
      body: {},
    });
    if (video)
      return {
        attachmentId: upload.attachment.id,
        processing: finalized.status !== 'READY',
        hasThumbnail: finalized.status === 'READY' && finalized.hasThumbnail,
        durationSeconds: finalized.durationSeconds,
      };
    const ready = await waitUntilAttachmentReady(
      apis,
      spaceId,
      upload.attachment.id,
      options.signal,
    );

    return {
      attachmentId: upload.attachment.id,
      ...(audio ? { durationSeconds: ready.durationSeconds } : {}),
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      if (createdAttachment) {
        try {
          await apis.attachments.deleteAttachment({
            spaceId,
            attachmentId: createdAttachment.id,
            ifMatch: String(createdAttachment.version),
          });
        } catch {
          // Server-side pending-upload cleanup remains the fallback.
        }
      }
      throw error;
    }
    if (error instanceof ReferenceFlowError) throw error;
    throw new ReferenceFlowError(i18n.t('flow.uploadFailed'));
  }
}

/** A known-created Memory must never be retried as another create. */
export class MemoryAttachmentBindingError extends Error {
  constructor(
    readonly memory: MemoryDetail,
    readonly attachmentIds: readonly string[],
    readonly cause: unknown,
    readonly attachmentSensitivity: readonly boolean[] = [],
    readonly selectedCoverPosition?: number | null,
  ) {
    super('Memory created; attachment association is not confirmed.');
    this.name = 'MemoryAttachmentBindingError';
  }
}

export async function completeMemoryAttachmentBinding(
  apis: ReferenceApis,
  spaceId: string,
  created: MemoryDetail,
  attachmentIds: readonly string[],
  reconcile = false,
  attachmentSensitivity: readonly boolean[] = [],
  selectedCoverPosition?: number | null,
): Promise<MemoryDetail> {
  try {
    let memory = created;
    if (reconcile) {
      memory = await apis.memories.getMemory({ spaceId, memoryId: created.id });
      const bound = [...memory.attachments]
        .sort((left, right) => left.position - right.position)
        .map((attachment) => attachment.id);
      if (
        (selectedCoverPosition === undefined ||
          (memory.selectedCoverAttachmentId ?? null) ===
            (selectedCoverPosition === null
              ? null
              : attachmentIds[selectedCoverPosition])) &&
        bound.length === attachmentIds.length &&
        bound.every((id, index) => id === attachmentIds[index]) &&
        (!attachmentSensitivity.length ||
          [...memory.attachments]
            .sort((a, b) => a.position - b.position)
            .every(
              (attachment, index) =>
                attachment.isSensitive === attachmentSensitivity[index],
            ))
      ) {
        return memory;
      }
      // Do not overwrite another edit while reconciling a lost bind response.
      if (memory.version !== created.version || bound.length > 0) {
        throw new ClientProblemError('conflict', 409);
      }
    }
    return await apis.memories.replaceMemoryAttachments({
      spaceId,
      memoryId: memory.id,
      ifMatch: String(memory.version),
      memoryAttachmentSet: {
        ...(selectedCoverPosition !== undefined
          ? {
              selectedCoverAttachmentId:
                selectedCoverPosition === null
                  ? null
                  : attachmentIds[selectedCoverPosition],
            }
          : {}),
        attachments: attachmentIds.map((attachmentId, position) => ({
          attachmentId,
          position,
          ...(attachmentSensitivity.length
            ? { isSensitive: attachmentSensitivity[position] }
            : {}),
        })),
      },
    });
  } catch (error) {
    throw new MemoryAttachmentBindingError(
      created,
      [...attachmentIds],
      error,
      attachmentSensitivity,
      selectedCoverPosition,
    );
  }
}

export async function createMemoryWithReadyAttachments(
  apis: ReferenceApis,
  spaceId: string,
  memoryCreate: MemoryCreate,
  attachmentIds: readonly string[],
  options: {
    /** Names this save on the server so a lost response can be reconciled. */
    idempotencyKey?: string;
    attachmentSensitivity?: readonly boolean[];
    selectedCoverPosition?: number | null;
    /**
     * The request is a replay after an unknown outcome. The Memory that comes
     * back may already carry an association, so binding first re-reads it and
     * never overwrites another edit.
     */
    reconcile?: boolean;
  } = {},
): Promise<{ memory: MemoryDetail }> {
  const memory = await apis.memories.createMemory({
    spaceId,
    memoryCreate,
    idempotencyKey: options.idempotencyKey,
  });
  if (memoryCreate.attachments !== undefined) return { memory };
  const savedMemory = attachmentIds.length
    ? await completeMemoryAttachmentBinding(
        apis,
        spaceId,
        memory,
        attachmentIds,
        options.reconcile ?? false,
        options.attachmentSensitivity,
        options.selectedCoverPosition,
      )
    : memory;
  // Projection refresh is a separate read; it cannot undo this confirmation.
  return { memory: savedMemory };
}
