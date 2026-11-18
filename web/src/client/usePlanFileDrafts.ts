import { MediaType } from '../api/generated/models/MediaType';
import { i18n } from '../i18n';
import { MAX_MEMORY_ATTACHMENTS } from './attachmentLimits';
import type { uploadMemoryDraftAttachment } from './memoryAttachmentDraft';
import {
  ReferenceFlowError,
  uploadAttachmentBytesWithProgress,
  waitUntilAttachmentReady,
} from './referenceFlow';
import {
  type AttachmentDraftOptions,
  useAttachmentDrafts,
} from './useAttachmentDrafts';

const PDF_TYPE = 'application/pdf';
const MAX_PDF_BYTES = 25 * 1024 * 1024;

const uploadPdf: typeof uploadMemoryDraftAttachment = async (
  apis,
  apiBaseUrl,
  accessToken,
  spaceId,
  file,
  onPhase,
  fetchApi,
  options = {},
) => {
  const isPdf =
    file.type === PDF_TYPE ||
    ((!file.type || file.type === 'application/octet-stream') &&
      /\.pdf$/i.test(file.name));
  if (!isPdf || file.size === 0)
    throw new ReferenceFlowError(i18n.t('planFiles.invalidPdf'));
  if (file.size > MAX_PDF_BYTES)
    throw new ReferenceFlowError(i18n.t('planFiles.tooLarge'));

  try {
    options.signal?.throwIfAborted();
    const upload = await apis.attachments.createAttachmentUpload(
      {
        spaceId,
        attachmentUploadCreate: {
          expectedMimeType: PDF_TYPE,
          expectedSize: file.size,
          mediaType: MediaType.DOCUMENT,
          originalName: file.name,
        },
      },
      { signal: options.signal },
    );
    options.signal?.throwIfAborted();
    await uploadAttachmentBytesWithProgress(
      apiBaseUrl,
      accessToken,
      upload,
      file,
      options,
      fetchApi,
    );
    options.signal?.throwIfAborted();
    const attachmentId = upload.attachment.id;
    onPhase?.('validating');
    await apis.attachments.finalizeAttachmentUpload(
      { spaceId, attachmentId, body: {} },
      { signal: options.signal },
    );
    await waitUntilAttachmentReady(apis, spaceId, attachmentId, options.signal);
    return { attachmentId };
  } catch (error) {
    options.signal?.throwIfAborted();
    if (error instanceof ReferenceFlowError && error.code) throw error;
    throw new ReferenceFlowError(i18n.t('planFiles.uploadFailed'));
  }
};

export function usePlanFileDrafts(
  options: AttachmentDraftOptions,
  savedCount = 0,
) {
  const drafts = useAttachmentDrafts({
    ...options,
    uploadAttachmentFn: uploadPdf,
    createPreviews: false,
    maxAttachments: Math.max(0, MAX_MEMORY_ATTACHMENTS - savedCount),
  });
  return {
    ...drafts,
    hasFailed: drafts.items.some((item) => item.status === 'failed'),
  };
}
