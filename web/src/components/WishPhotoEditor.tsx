import { createPortal } from 'react-dom';
import type { WishMediaDraft } from '../client/useWishMediaDraft';
import { useTranslation } from '../i18n';
import { ComposerTool } from './PageComposer';
import { PlanPhotosEditor } from './PlanPhotosEditor';
import './WishLinkPhoto.css';

/**
 * The one optional photo of a Wish inside its editor. It reuses the shared
 * photo draft pipeline restricted to a single image: a new selection replaces
 * the current photo, and a failed upload keeps Save blocked until the couple
 * retries or removes it.
 */
export function WishPhotoEditor({
  media,
  spaceId,
  wishId,
  apiBaseUrl,
  accessToken,
  accountId,
  toolHost,
  disabled,
}: {
  media: WishMediaDraft;
  spaceId: string;
  wishId?: string;
  apiBaseUrl?: string;
  accessToken?: string;
  accountId?: string;
  toolHost: HTMLElement | null;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const photos = media.photos;
  const canUpload = Boolean(apiBaseUrl && accessToken);
  return (
    <div className="wish-photo-editor">
      <PlanPhotosEditor
        single
        controller={photos}
        spaceId={spaceId}
        planId={wishId}
        parentType="WISH"
        disabled={disabled}
        canUpload={canUpload}
        presentation="tools"
        pageWideDrop
        mediaTrigger={(open) =>
          toolHost
            ? createPortal(
                <ComposerTool
                  icon="foto"
                  label={t('composer.photo')}
                  active={Boolean(photos.items.length)}
                  disabled={disabled || !canUpload}
                  onClick={open}
                />,
                toolHost,
              )
            : null
        }
        photoSourceContext={
          apiBaseUrl && accessToken && accountId
            ? { apiBaseUrl, accessToken, accountId }
            : undefined
        }
        onChange={() => {}}
      />
      {media.failed ? (
        <p className="field-help" role="alert">
          {t('m5s3.wish.photo.failedHint')}
        </p>
      ) : null}
    </div>
  );
}
