import type { ReferenceApis } from './referenceFlow';
import {
  memoryOnlyPhotoDescriptor,
  retainPhotoInMemory,
  selectedPhotoUnavailable,
} from './selectedMediaRetention';

/** Read through current parent/owner guards; no browser media cache is used. */
export async function recoverSelectedPhoto(
  apis: ReferenceApis,
  spaceId: string,
  file: File,
  attachmentId: string | undefined,
  signal: AbortSignal,
): Promise<File> {
  if (!selectedPhotoUnavailable(file)) return file;
  if (!attachmentId) throw new Error('Selected photo needs reselection');
  const metadata = await apis.attachments.getAttachment(
    { spaceId, attachmentId },
    { signal, cache: 'no-store' },
  );
  if (metadata.status !== 'READY')
    throw new Error('Selected photo is not ready');
  // The stream endpoint resolves the actual parent itself, including a Memory
  // already created by an uncertain Save. Never assert an invented parent.
  const response = await apis.attachments.getAttachmentContentRaw(
    { spaceId, attachmentId },
    { signal, cache: 'no-store' },
  );
  const blob = await response.raw.blob();
  signal.throwIfAborted();
  if (
    !blob.type.startsWith('image/') ||
    !blob.size ||
    blob.size > 25 * 1024 * 1024
  )
    throw new Error('Selected photo is unsupported');
  const descriptor = memoryOnlyPhotoDescriptor(file);
  return retainPhotoInMemory(
    new File([blob], descriptor?.name ?? file.name, {
      type: blob.type,
      lastModified: descriptor?.lastModified ?? file.lastModified,
    }),
  );
}
