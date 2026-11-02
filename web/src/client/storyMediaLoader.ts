import type { AttachmentReadRequestParentTypeEnum } from '../api/generated/models/AttachmentReadRequest';
import { ReadDescriptorMethodEnum } from '../api/generated/models/ReadDescriptor';
import type { ReferenceApis } from './referenceFlow';
import {
  captureMediaCacheLease,
  assertMediaCacheLease,
  evictAuthorizedMedia,
  loadCachedMediaBlob,
} from './authorizedMediaCache';
import { clientProblemKind, normalizeClientError } from './problemDetails';
import { acquireMediaObjectUrl } from './sharedMediaObjectUrls';
import type { OwnedObjectUrl } from './objectUrlResource';

export type StoryMediaParentType = Extract<
  AttachmentReadRequestParentTypeEnum,
  'MEMORY' | 'HEART_MOMENT' | 'PLAN'
>;

type StoryMediaLoaderOptions = {
  fetchApi?: typeof fetch;
  createObjectUrl?: (blob: Blob) => string;
  signal?: AbortSignal;
  variant?: 'original' | 'thumbnail';
};

/**
 * Load media for timeline/story cards while preserving the attachment parent
 * binding used by the read-access contract. Signed URLs are fetched directly;
 * STREAM descriptors reuse the configured generated API client so its bearer
 * token and base path remain authoritative.
 */
async function loadAuthorizedStoryBlob(
  apis: ReferenceApis,
  spaceId: string,
  parentType: StoryMediaParentType,
  parentId: string,
  attachmentId: string,
  options: StoryMediaLoaderOptions = {},
): Promise<Blob> {
  const parentIdentity = ['attachment', parentType, parentId];
  const lease = captureMediaCacheLease(
    apis.attachments,
    spaceId,
    parentIdentity,
  );
  const descriptorRequest = {
    spaceId,
    attachmentId,
    attachmentReadRequest: {
      parentType,
      parentId,
      ...(options.variant ? { variant: options.variant } : {}),
    },
  };
  try {
    const descriptor = options.signal
      ? await apis.attachments.createAttachmentReadAccess(descriptorRequest, {
          signal: options.signal,
        })
      : await apis.attachments.createAttachmentReadAccess(descriptorRequest);

    const blob = await loadCachedMediaBlob(
      lease,
      [...parentIdentity, attachmentId, options.variant ?? 'original'],
      async (signal) => {
        if (descriptor.method === ReadDescriptorMethodEnum.SIGNED_URL) {
          const fetchApi = options.fetchApi ?? fetch;
          const response = await fetchApi(descriptor.url, { signal });
          if (!response.ok) {
            throw Object.assign(
              new Error(`Story media load failed: ${response.status}`),
              { status: response.status },
            );
          }
          return response.blob();
        } else {
          const request = {
            spaceId,
            attachmentId,
            ...(options.variant ? { variant: options.variant } : {}),
          };
          const response = await apis.attachments.getAttachmentContentRaw(
            request,
            { signal },
          );
          return response.raw.blob();
        }
      },
      options.signal,
    );

    assertMediaCacheLease(lease);
    return blob;
  } catch (error) {
    const problem = await normalizeClientError(error);
    if (
      ['unauthorized', 'permission', 'notFound'].includes(
        clientProblemKind(problem),
      )
    ) {
      evictAuthorizedMedia(lease, parentIdentity);
    }
    throw error;
  }
}

/** Compatibility adapter for callers that still own a single string URL. */
export async function loadAuthorizedStoryImage(
  apis: ReferenceApis,
  spaceId: string,
  parentType: StoryMediaParentType,
  parentId: string,
  attachmentId: string,
  options: StoryMediaLoaderOptions = {},
): Promise<string> {
  const blob = await loadAuthorizedStoryBlob(
    apis,
    spaceId,
    parentType,
    parentId,
    attachmentId,
    options,
  );
  return (options.createObjectUrl ?? URL.createObjectURL)(blob);
}

/** Reuse a decoded URL after authorization; views release handles, never shared URLs. */
export async function loadAuthorizedStoryImageResource(
  apis: ReferenceApis,
  spaceId: string,
  parentType: StoryMediaParentType,
  parentId: string,
  attachmentId: string,
  options: StoryMediaLoaderOptions = {},
): Promise<OwnedObjectUrl> {
  const lease = captureMediaCacheLease(apis.attachments, spaceId, [
    'attachment',
    parentType,
    parentId,
  ]);
  const blob = await loadAuthorizedStoryBlob(
    apis,
    spaceId,
    parentType,
    parentId,
    attachmentId,
    options,
  );
  options.signal?.throwIfAborted();
  assertMediaCacheLease(lease);
  const key = JSON.stringify([
    lease.scope.id,
    spaceId,
    'attachment',
    parentType,
    parentId,
    attachmentId,
    options.variant ?? 'original',
  ]);
  return acquireMediaObjectUrl(
    key,
    blob,
    options.variant === 'thumbnail' ? 'preview' : 'original',
  );
}
