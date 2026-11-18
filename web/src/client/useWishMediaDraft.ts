import { useCallback, useMemo, useState } from 'react';
import type { ReferenceApis } from './referenceFlow';
import { useOrderedPhotoDrafts } from './useOrderedPhotoDrafts';
import {
  EMPTY_WISH_MEDIA,
  isWishMediaDirty,
  resolveWishPhoto,
  type WishMediaPatch,
  type WishMediaValue,
  wishCreateMedia,
  wishMediaPatch,
  wishPhotoSummary,
} from './wishLinkPhoto';

export interface WishMediaDraftOptions {
  apis: ReferenceApis;
  apiBaseUrl?: string;
  accessToken?: string;
  accountId?: string;
  spaceId: string;
  /** Separates the create editor from the edit editor of the same account. */
  resourceKey: string;
}

/**
 * The optional link and the one optional photo of a Wish editor. The link is
 * plain draft text; the photo goes through the shared attachment draft
 * pipeline. Nothing here saves: the editor's Save sends the {@link patch} or
 * {@link createMedia} once the photo is settled.
 */
export function useWishMediaDraft({
  apis,
  apiBaseUrl,
  accessToken,
  accountId,
  spaceId,
  resourceKey,
}: WishMediaDraftOptions) {
  const photos = useOrderedPhotoDrafts({
    apis,
    apiBaseUrl: apiBaseUrl ?? '',
    accessToken: accessToken ?? '',
    spaceId,
    accountId: accountId ?? '',
    resourceKey,
    maxItems: 1,
  });
  const [baseline, setBaseline] = useState<WishMediaValue>(EMPTY_WISH_MEDIA);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const loadPhotos = photos.load;
  const addFiles = photos.uploads.addFiles;
  const removePhoto = photos.remove;
  const items = photos.items;
  const selection = useMemo(
    () =>
      resolveWishPhoto(
        items.length,
        photos.entries.map((entry) => entry.attachmentId),
      ),
    [items.length, photos.entries],
  );

  /** Starts an editor from the saved values; drafts of an earlier editor go. */
  const reset = useCallback(
    (value: WishMediaValue) => {
      setBaseline(value);
      setLinkUrl(value.linkUrl);
      loadPhotos(
        value.photoAttachmentId
          ? [wishPhotoSummary(value.photoAttachmentId)]
          : [],
      );
    },
    [loadPhotos],
  );
  const clear = useCallback(() => reset(EMPTY_WISH_MEDIA), [reset]);

  /** Puts a new photo in place of whatever photo the editor holds. */
  const replacePhoto = useCallback(
    (file: File) => {
      for (const item of items) removePhoto(item);
      addFiles([file]);
    },
    [items, removePhoto, addFiles],
  );

  const blocked = !selection.settled;
  return {
    photos,
    baseline,
    linkUrl,
    setLinkUrl,
    reset,
    clear,
    replacePhoto,
    /** Preparing, uploading, validating or failed: Save must wait. */
    blocked,
    failed: photos.hasFailed,
    dirty: isWishMediaDirty(baseline, linkUrl, selection),
    /** Fields of an update that differ from the saved Wish. */
    patch: (): WishMediaPatch => wishMediaPatch(baseline, linkUrl, selection),
    /** Fields of a new Wish that the couple added. */
    createMedia: (): WishMediaPatch => wishCreateMedia(linkUrl, selection),
  };
}

export type WishMediaDraft = ReturnType<typeof useWishMediaDraft>;
