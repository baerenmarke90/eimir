import { useCallback } from 'react';
import type { RecapSourceView } from '../api/generated/models/RecapSourceView';
import type { ReferenceApis } from '../client/referenceFlow';
import { loadAuthorizedStoryImage } from '../client/storyMediaLoader';
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
}: RecapMediaProps & { source: RecapSourceView; onSettled?: () => void }) {
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
      return loadAuthorizedStoryImage(
        mediaApis,
        spaceId,
        parentType,
        parentId,
        attachmentId,
        { signal, variant: 'thumbnail' },
      );
    },
    [mediaApis, spaceId, parentType],
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
      ])}
    />
  );
}
