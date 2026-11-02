import { createContext } from 'react';
import {
  assertMediaCacheLease,
  captureMediaCacheLease,
} from './authorizedMediaCache';
import type { ReferenceApis } from './referenceFlow';

/** Operator availability is independent of Space entitlement. */
export const VideoProcessingContext = createContext(false);

export interface VideoSource {
  url: string;
  expiresAt: Date;
}

export async function loadVideoSource(
  apis: ReferenceApis,
  spaceId: string,
  parentType: 'MEMORY' | 'HEART_MOMENT',
  parentId: string,
  attachmentId: string,
  signal?: AbortSignal,
): Promise<VideoSource> {
  const lease = captureMediaCacheLease(apis.attachments, spaceId, [
    'attachment',
    parentType,
    parentId,
  ]);
  const result = await apis.attachments.createVideoPlaybackAccess(
    {
      spaceId,
      attachmentId,
      videoPlaybackRequest: { parentType, parentId },
    },
    { signal },
  );
  assertMediaCacheLease(lease);
  const base = new URL(
    apis.attachments.contentBaseUrl || '/',
    window.location.href,
  );
  const expected = new URL(
    `/api/v1/spaces/${spaceId}/attachments/${attachmentId}/playback`,
    base,
  );
  const url = new URL(result.url, base);
  if (
    url.origin !== expected.origin ||
    url.pathname !== expected.pathname ||
    url.username ||
    url.password ||
    url.hash ||
    !Number.isFinite(result.expiresAt.getTime()) ||
    result.expiresAt.getTime() <= Date.now() ||
    !url.searchParams.get('token') ||
    url.searchParams.getAll('token').length !== 1 ||
    [...url.searchParams.keys()].some((key) => key !== 'token')
  )
    throw new Error('Invalid video playback descriptor.');
  return { url: url.href, expiresAt: result.expiresAt };
}
