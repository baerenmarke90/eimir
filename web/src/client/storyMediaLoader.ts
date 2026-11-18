import type { AttachmentReadRequestParentTypeEnum } from '../api/generated/models/AttachmentReadRequest';
import { ReadDescriptorMethodEnum } from '../api/generated/models/ReadDescriptor';
import {
  assertMediaCacheLease,
  captureMediaCacheLease,
  evictAuthorizedMedia,
  keepMediaInSession,
  loadCachedMediaBlob,
} from './authorizedMediaCache';
import type { OwnedObjectUrl } from './objectUrlResource';
import { clientProblemKind, normalizeClientError } from './problemDetails';
import type { ReferenceApis } from './referenceFlow';
import {
  acquireMediaObjectUrl,
  offerSynchronousMediaObjectUrl,
  reacquireMediaObjectUrl,
} from './sharedMediaObjectUrls';

export type StoryMediaParentType = Extract<
  AttachmentReadRequestParentTypeEnum,
  'MEMORY' | 'HEART_MOMENT' | 'PLAN' | 'WISH' | 'HEART_HUNT_ROUND'
>;

type StoryMediaLoaderOptions = {
  fetchApi?: typeof fetch;
  createObjectUrl?: (blob: Blob) => string;
  signal?: AbortSignal;
  variant?: 'original' | 'thumbnail';
  /**
   * `false` for an `OWNER_ONLY` parent: its bytes stay in session memory and
   * never reach the durable store (M2-D18 #3). Unbound uploads (`NONE`) have
   * no parent whose visibility is known yet and are never persisted.
   */
  persist?: boolean;
};

function keepPrivateParentInSession(
  lease: ReturnType<typeof captureMediaCacheLease>,
  parentType: StoryMediaParentType | 'NONE',
  parentIdentity: readonly string[],
  options: StoryMediaLoaderOptions,
): void {
  if (options.persist === false || parentType === 'NONE')
    keepMediaInSession(lease, parentIdentity);
}

/** A video reached an image surface; only its poster may be shown there. */
class VideoPosterRedirect extends Error {}

/**
 * Load media for timeline/story cards while preserving the attachment parent
 * binding used by the read-access contract. Signed URLs are fetched directly;
 * STREAM descriptors reuse the configured generated API client so its bearer
 * token and base path remain authoritative.
 *
 * Product Owner decision (2026-11-16): attachment bytes are immutable, and
 * whether they are shown is decided by the parent data the view renders. Bytes
 * already stored for this exact login, account, API origin, Space, parent,
 * attachment and variant are therefore shown without a new read grant. The
 * parent lists revalidate in the background; a denied list or read evicts.
 * A new read grant is requested only when the bytes are not stored yet.
 */
async function loadAuthorizedStoryBlob(
  apis: ReferenceApis,
  spaceId: string,
  parentType: StoryMediaParentType | 'NONE',
  parentId: string,
  attachmentId: string,
  options: StoryMediaLoaderOptions = {},
): Promise<{ blob: Blob; variant: 'original' | 'thumbnail' }> {
  const parentIdentity = ['attachment', parentType, parentId];
  const lease = captureMediaCacheLease(
    apis.attachments,
    spaceId,
    parentIdentity,
  );
  keepPrivateParentInSession(lease, parentType, parentIdentity, options);
  const variant = options.variant ?? 'original';
  const descriptorRequest = {
    spaceId,
    attachmentId,
    attachmentReadRequest: {
      parentType,
      parentId: parentType === 'NONE' ? undefined : parentId,
      ...(options.variant ? { variant: options.variant } : {}),
    },
  };
  try {
    const blob = await loadCachedMediaBlob(
      lease,
      [...parentIdentity, attachmentId, variant],
      async (signal) => {
        const access = await apis.attachments.createAttachmentReadAccess(
          descriptorRequest,
          { signal },
        );
        // Every existing image consumer remains bounded when its source becomes
        // a video. Playback has a distinct grant path; image caches own posters.
        if (access.mediaType === 'VIDEO' && variant !== 'thumbnail')
          throw new VideoPosterRedirect();
        if (access.method === ReadDescriptorMethodEnum.SIGNED_URL) {
          const fetchApi = options.fetchApi ?? fetch;
          const response = await fetchApi(access.url, { signal });
          if (!response.ok) {
            throw Object.assign(
              new Error(`Story media load failed: ${response.status}`),
              { status: response.status },
            );
          }
          return response.blob();
        }
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
      },
      options.signal,
    );
    assertMediaCacheLease(lease);
    return { blob, variant };
  } catch (error) {
    if (error instanceof VideoPosterRedirect)
      return loadAuthorizedStoryBlob(
        apis,
        spaceId,
        parentType,
        parentId,
        attachmentId,
        { ...options, variant: 'thumbnail' },
      );
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
  parentType: StoryMediaParentType | 'NONE',
  parentId: string,
  attachmentId: string,
  options: StoryMediaLoaderOptions = {},
): Promise<string> {
  const { blob } = await loadAuthorizedStoryBlob(
    apis,
    spaceId,
    parentType,
    parentId,
    attachmentId,
    options,
  );
  return (options.createObjectUrl ?? URL.createObjectURL)(blob);
}

function mediaObjectUrlKey(
  scopeId: number,
  spaceId: string,
  parentType: string,
  parentId: string,
  attachmentId: string,
  variant: 'original' | 'thumbnail',
): string {
  return JSON.stringify([
    scopeId,
    spaceId,
    'attachment',
    parentType,
    parentId,
    attachmentId,
    variant,
  ]);
}

/**
 * Reuse a decoded URL; views release handles, never shared URLs.
 *
 * An image this runtime already decoded for the exact key is also offered
 * synchronously, so a remounted view can render it in its first frame instead
 * of a skeleton followed by a fade (see `useObjectUrlResources`).
 */
export function loadAuthorizedStoryImageResource(
  apis: ReferenceApis,
  spaceId: string,
  parentType: StoryMediaParentType | 'NONE',
  parentId: string,
  attachmentId: string,
  options: StoryMediaLoaderOptions = {},
): Promise<OwnedObjectUrl> {
  let lease: ReturnType<typeof captureMediaCacheLease>;
  try {
    lease = captureMediaCacheLease(apis.attachments, spaceId, [
      'attachment',
      parentType,
      parentId,
    ]);
    assertMediaCacheLease(lease);
    // Before the decoded-URL shortcut, so a parent that became private also
    // leaves the durable store when its bytes are still decoded in memory.
    keepPrivateParentInSession(
      lease,
      parentType,
      ['attachment', parentType, parentId],
      options,
    );
  } catch (error) {
    return Promise.reject(error);
  }
  const knownKey = mediaObjectUrlKey(
    lease.scope.id,
    spaceId,
    parentType,
    parentId,
    attachmentId,
    options.variant ?? 'original',
  );
  const known =
    options.signal?.aborted === true ? null : reacquireMediaObjectUrl(knownKey);
  if (known) {
    offerSynchronousMediaObjectUrl(knownKey);
    return Promise.resolve(known);
  }
  return loadAuthorizedStoryBlob(
    apis,
    spaceId,
    parentType,
    parentId,
    attachmentId,
    options,
  ).then(({ blob, variant }) => {
    options.signal?.throwIfAborted();
    assertMediaCacheLease(lease);
    return acquireMediaObjectUrl(
      mediaObjectUrlKey(
        lease.scope.id,
        spaceId,
        parentType,
        parentId,
        attachmentId,
        variant,
      ),
      blob,
      variant === 'thumbnail' ? 'preview' : 'original',
    );
  });
}
