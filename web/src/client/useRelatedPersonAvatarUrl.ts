import type { AttachmentsApi } from '../api/generated/apis/AttachmentsApi';
import { useObjectUrlResource } from './useObjectUrlResources';
import {
  captureMediaCacheLease,
  assertMediaCacheLease,
  loadCachedMediaBlob,
  mediaCacheScopeForClient,
} from './authorizedMediaCache';
import { acquireMediaObjectUrl } from './sharedMediaObjectUrls';

export function useRelatedPersonAvatarUrl(
  attachmentsApi: AttachmentsApi | undefined | null,
  spaceId: string,
  avatarAttachmentId: string | null | undefined,
): { avatarUrl: string | null; loadFailed: boolean } {
  const scope = attachmentsApi
    ? mediaCacheScopeForClient(attachmentsApi)
    : null;
  const resource = useObjectUrlResource(
    `related-person-avatar:${scope?.id}:${spaceId}`,
    attachmentsApi ? avatarAttachmentId : null,
    async (attachmentId, signal) => {
      if (!attachmentsApi) {
        throw new Error('Attachments API unavailable.');
      }
      const lease = captureMediaCacheLease(attachmentsApi, spaceId);
      const identity = ['related-person-avatar', attachmentId];
      const blob = await loadCachedMediaBlob(
        lease,
        identity,
        async (sharedSignal) => {
          const response = await attachmentsApi.getAttachmentContentRaw(
            { spaceId, attachmentId },
            { signal: sharedSignal },
          );
          return response.raw.blob();
        },
        signal,
      );
      signal.throwIfAborted();
      assertMediaCacheLease(lease);
      return acquireMediaObjectUrl(
        JSON.stringify([scope?.id, spaceId, ...identity]),
        blob,
      );
    },
  );

  return {
    avatarUrl: scope?.isCurrent(spaceId) ? resource.url : null,
    loadFailed: resource.error !== null,
  };
}
