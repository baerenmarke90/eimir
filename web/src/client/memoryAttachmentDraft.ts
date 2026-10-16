import { MediaType } from '../api/generated/models/MediaType';
import type { MemoryCreate } from '../api/generated/models/MemoryCreate';
import type { MemoryDetail } from '../api/generated/models/MemoryDetail';
import { ClientProblemError } from './problemDetails';
import { i18n } from '../i18n';
import {
  ReferenceFlowError,
  uploadAttachmentBytesWithProgress,
  type ReferenceApis,
} from './referenceFlow';

export type DraftUploadPhase = 'uploading' | 'validating';

export interface ReadyDraftAttachment {
  attachmentId: string;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Upload aborted.', 'AbortError');
}

async function waitUntilReady(
  apis: ReferenceApis,
  spaceId: string,
  attachmentId: string,
  signal?: AbortSignal,
): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    throwIfAborted(signal);
    const attachment = await apis.attachments.getAttachment({
      spaceId,
      attachmentId,
    });
    if (attachment.status === 'READY') return;
    if (
      attachment.status === 'FAILED' ||
      attachment.status === 'DELETE_FAILED' ||
      attachment.status === 'DELETING'
    ) {
      throw new ReferenceFlowError(
        i18n.t('flow.processingStatus', { status: attachment.status }),
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new ReferenceFlowError(i18n.t('flow.processingTimeout'));
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
  } = {},
): Promise<ReadyDraftAttachment> {
  if (!file.type.startsWith('image/'))
    throw new ReferenceFlowError(i18n.t('flow.imageOnly'));
  if (file.size === 0) throw new ReferenceFlowError(i18n.t('flow.imageEmpty'));

  let createdAttachment: { id: string; version: number } | null = null;
  try {
    throwIfAborted(options.signal);
    onPhase?.('uploading');
    const upload = await apis.attachments.createAttachmentUpload({
      spaceId,
      attachmentUploadCreate: {
        expectedMimeType: file.type,
        expectedSize: file.size,
        mediaType: MediaType.IMAGE,
        originalName: file.name,
      },
    });
    createdAttachment = {
      id: upload.attachment.id,
      version: upload.attachment.version,
    };

    await uploadAttachmentBytesWithProgress(
      apiBaseUrl,
      accessToken,
      upload,
      file,
      options,
      fetchApi,
    );
    throwIfAborted(options.signal);
    onPhase?.('validating');
    await apis.attachments.finalizeAttachmentUpload({
      spaceId,
      attachmentId: upload.attachment.id,
      body: {},
    });
    await waitUntilReady(apis, spaceId, upload.attachment.id, options.signal);

    return { attachmentId: upload.attachment.id };
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
): Promise<MemoryDetail> {
  try {
    let memory = created;
    if (reconcile) {
      memory = await apis.memories.getMemory({ spaceId, memoryId: created.id });
      const bound = [...memory.attachments]
        .sort((left, right) => left.position - right.position)
        .map((attachment) => attachment.id);
      if (
        bound.length === attachmentIds.length &&
        bound.every((id, index) => id === attachmentIds[index])
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
        attachments: attachmentIds.map((attachmentId, position) => ({
          attachmentId,
          position,
        })),
      },
    });
  } catch (error) {
    throw new MemoryAttachmentBindingError(created, [...attachmentIds], error);
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
  const savedMemory = attachmentIds.length
    ? await completeMemoryAttachmentBinding(
        apis,
        spaceId,
        memory,
        attachmentIds,
        options.reconcile ?? false,
      )
    : memory;
  // Projection refresh is a separate read; it cannot undo this confirmation.
  return { memory: savedMemory };
}
