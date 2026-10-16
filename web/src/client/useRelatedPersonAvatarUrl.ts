import type { AttachmentsApi } from '../api/generated/apis/AttachmentsApi';
import { useObjectUrlResource } from './useObjectUrlResources';

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
      const response = await attachmentsApi.getAttachmentContentRaw(
        { spaceId, attachmentId },
        { signal },
      );
      return response.raw.blob();
    },
  );

  return {
    avatarUrl: resource.url,
    loadFailed: resource.error !== null,
  };
}
