import { useCallback } from 'react';
import type { RecapSourceView } from '../api/generated/models/RecapSourceView';
import type { ReferenceApis } from '../client/referenceFlow';
import { loadAuthorizedStoryImageResource } from '../client/storyMediaLoader';
import { MemoryPreview } from './MemoryPreview';

export type RecapMediaProps = {
  mediaApis: ReferenceApis;
  spaceId: string;
  account: { id: string };
};

/** One authorized media lifecycle for library, invitation and reader previews. */
export function RecapMedia({
  source,
  mediaApis,
  spaceId,
  account,
  onSettled,
  quality = 'thumbnail',
}: RecapMediaProps & {
  source: RecapSourceView;
  onSettled?: () => void;
  /** Full-bleed reader scenes read the original; small covers stay light. */
  quality?: 'thumbnail' | 'original';
}) {
  const parentType =
    source.kind === 'MEMORY' ||
    source.kind === 'HEART_MOMENT' ||
    source.kind === 'PLAN'
      ? source.kind
      : null;
  const load = useCallback(
    (parentId: string, attachmentId: string, signal?: AbortSignal) => {
      if (!parentType)
        return Promise.reject(new Error('No authorized media parent.'));
      return loadAuthorizedStoryImageResource(
        mediaApis,
        spaceId,
        parentType,
        parentId,
        attachmentId,
        { signal, variant: quality },
      );
    },
    [mediaApis, spaceId, parentType, quality],
  );
  if (!source.available || !source.previewAttachmentId || !parentType)
    return null;
  return (
    <MemoryPreview
      memoryId={source.id}
      attachmentId={source.previewAttachmentId}
      loadImage={load}
      isSensitive={source.previewIsSensitive}
      allowReveal
      loadingMode="near-viewport"
      onSettled={onSettled}
      resourceScopeKey={JSON.stringify([
        'recap-media',
        account.id,
        spaceId,
        source.key,
        quality,
      ])}
    />
  );
}
