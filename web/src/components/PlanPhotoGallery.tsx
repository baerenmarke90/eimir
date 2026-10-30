import { useCallback, useMemo } from 'react';
import type { PlanDetail } from '../api/generated/models/PlanDetail';
import { mediaCacheScopeForClient } from '../client/authorizedMediaCache';
import { createReferenceApis } from '../client/referenceFlow';
import { loadAuthorizedStoryImage } from '../client/storyMediaLoader';
import { planPhotos } from '../client/usePlanPhotoDrafts';
import { GalleryExpandAction, MediaGallery } from './MediaGallery';
import './PlanPhotoGallery.css';

export function PlanPhotoGallery({
  plan,
  spaceId,
  apiBaseUrl,
  accessToken,
}: {
  plan: PlanDetail;
  spaceId: string;
  apiBaseUrl?: string;
  accessToken?: string;
}) {
  const apis = useMemo(
    () => createReferenceApis(apiBaseUrl ?? '', accessToken ?? ''),
    [apiBaseUrl, accessToken],
  );
  const scope = `${mediaCacheScopeForClient(apis.attachments).id}:${spaceId}:PLAN:${plan.id}`;
  const loadImage = useCallback(
    (id: string, signal?: AbortSignal) => {
      if (!apiBaseUrl || !accessToken)
        return Promise.reject(new Error('Plan media API unavailable'));
      return loadAuthorizedStoryImage(apis, spaceId, 'PLAN', plan.id, id, {
        signal,
      });
    },
    [apis, spaceId, plan.id, apiBaseUrl, accessToken],
  );
  const photos = planPhotos(plan);
  if (!photos.length) return null;
  return (
    <div className="plan-photo-gallery photo-gallery">
      <MediaGallery
        items={photos.map(({ id, mediaType, isSensitive }) => ({
          id,
          mediaType,
          isSensitive,
        }))}
        loadMedia={loadImage}
        resourceScopeKey={scope}
        dismissWithHistory
        directSensitiveToggle
        renderPhotoActions={(_item, open, revealed) =>
          revealed ? <GalleryExpandAction onOpen={open} /> : null
        }
      />
    </div>
  );
}
