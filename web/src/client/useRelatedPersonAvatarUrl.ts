import type { AttachmentsApi } from '../api/generated/apis/AttachmentsApi';
import { useObjectUrlResource } from './useObjectUrlResources';
import {
  captureMediaCacheLease,
  loadCachedMediaBlob,
} from './authorizedMediaCache';

export function useRelatedPersonAvatarUrl(
  attachmentsApi: AttachmentsApi | undefined | null,
  spaceId: string,
  avatarAttachmentId: string | null | undefined,
): { avatarUrl: string | null; loadFailed: boolean } {
  const resource = useObjectUrlResource(
    `related-person-avatar:${spaceId}`,
    attachmentsApi ? avatarAttachmentId : null,
    async (attachmentId, signal) => {
      if (!attachmentsApi) {
        throw new Error('Attachments API unavailable.');
      }
      return loadCachedMediaBlob(
        captureMediaCacheLease(attachmentsApi, spaceId),
        ['related-person-avatar', attachmentId],
        async (sharedSignal) => {
          const response = await attachmentsApi.getAttachmentContentRaw(
            { spaceId, attachmentId },
            { signal: sharedSignal },
          );
          return response.raw.blob();
        },
        signal,
      );
    },
  );

  return {
    avatarUrl: resource.url,
    loadFailed: resource.error !== null,
  };
}
