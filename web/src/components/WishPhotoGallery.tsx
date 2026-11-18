import { useCallback, useMemo } from 'react';
import { mediaCacheScopeForClient } from '../client/authorizedMediaCache';
import { createReferenceApis } from '../client/referenceFlow';
import { loadAuthorizedStoryImageResource } from '../client/storyMediaLoader';
import { GalleryExpandAction, MediaGallery } from './MediaGallery';
import './PlanPhotoGallery.css';
import './WishLinkPhoto.css';

/**
 * The one photo of a Wish as a cover image, opened in the shared full-screen
 * viewer. Read access is granted through the Wish itself (parent type WISH).
 */
export function WishPhotoGallery({
  wishId,
  photoAttachmentId,
  spaceId,
  apiBaseUrl,
  accessToken,
}: {
  wishId: string;
  photoAttachmentId: string;
  spaceId: string;
  apiBaseUrl?: string;
  accessToken?: string;
}) {
  const apis = useMemo(
    () => createReferenceApis(apiBaseUrl ?? '', accessToken ?? ''),
    [apiBaseUrl, accessToken],
  );
  const scope = `${mediaCacheScopeForClient(apis.attachments).id}:${spaceId}:WISH:${wishId}`;
  const loadImage = useCallback(
    (id: string, signal?: AbortSignal) => {
      if (!apiBaseUrl || !accessToken)
        return Promise.reject(new Error('Wish media API unavailable'));
      return loadAuthorizedStoryImageResource(
        apis,
        spaceId,
        'WISH',
        wishId,
        id,
        { signal },
      );
    },
    [apis, spaceId, wishId, apiBaseUrl, accessToken],
  );
  return (
    <div className="plan-photo-gallery photo-gallery wish-photo-gallery">
      <MediaGallery
        readingFrame
        presentation="composer"
        initialMediaId={photoAttachmentId}
        items={[
          { id: photoAttachmentId, mediaType: 'IMAGE', isSensitive: false },
        ]}
        loadMedia={loadImage}
        resourceScopeKey={scope}
        dismissWithHistory
        renderPhotoActions={(_item, open, revealed) =>
          revealed ? <GalleryExpandAction onOpen={open} /> : null
        }
      />
    </div>
  );
}
