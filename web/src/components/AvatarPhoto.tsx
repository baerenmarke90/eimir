import {
  type ReactNode,
  type Ref,
  useCallback,
  useImperativeHandle,
} from 'react';
import { MediaType } from '../api/generated/models/MediaType';
import { useTranslation } from '../i18n';
import { MediaGallery } from './MediaGallery';
import { personInitials } from './PersonIdentity';

export interface AvatarPhotoHandle {
  open: () => void;
}

function PhotoTrigger({
  open,
  handleRef,
  children,
}: {
  open: () => void;
  handleRef?: Ref<AvatarPhotoHandle>;
  children: ReactNode;
}) {
  useImperativeHandle(handleRef, () => ({ open }), [open]);
  return children;
}

/** Borrow a hook-owned authorized URL; the gallery must not revoke its lease. */
export function AvatarPhoto({
  name,
  url,
  identity,
  large = false,
  renderTrigger,
  ref,
}: {
  name: string;
  url: string | null;
  identity: string;
  large?: boolean;
  renderTrigger?: (open: () => void) => ReactNode;
  ref?: Ref<AvatarPhotoHandle>;
}) {
  const { t } = useTranslation();
  const load = useCallback(async () => {
    if (!url) throw new Error('Avatar unavailable');
    return { url, dispose() {} };
  }, [url]);
  const className = `people-portrait ${large ? 'people-portrait-large' : ''}`;
  if (!url)
    return (
      <span
        className={className}
        role="img"
        aria-label={t('people.avatarAlt', { name })}
      >
        {personInitials(name)}
      </span>
    );
  return (
    <MediaGallery
      items={[{ id: identity, mediaType: MediaType.IMAGE, isSensitive: false }]}
      loadMedia={load}
      resourceScopeKey={identity}
      renderPreviews={(open) => (
        <PhotoTrigger open={() => open(0)} handleRef={ref}>
          {renderTrigger ? (
            renderTrigger(() => open(0))
          ) : (
            <button
              type="button"
              className={className}
              onClick={() => open(0)}
              aria-label={t('people.viewPhoto', { name })}
            >
              <img src={url} alt="" />
            </button>
          )}
        </PhotoTrigger>
      )}
      renderCaption={() => <span>{t('people.avatarAlt', { name })}</span>}
    />
  );
}
