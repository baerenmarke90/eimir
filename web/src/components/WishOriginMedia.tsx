import { useQuery } from '@tanstack/react-query';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { useTranslation } from '../i18n';
import { WishLinkRow } from './WishLinkRow';
import { WishPhotoGallery } from './WishPhotoGallery';
import './WishLinkPhoto.css';

/**
 * The link and photo of the Wish a Plan came from, read through the Plan's
 * source Wish and shown read-only. Nothing is copied into the Plan, and a
 * Wish that cannot be read, or has neither, adds nothing to the page.
 */
export function WishOriginMedia({
  wishId,
  spaceId,
  apis,
  apiBaseUrl,
  accessToken,
}: {
  wishId: string;
  spaceId: string;
  apis: SharedPlanningApis;
  apiBaseUrl?: string;
  accessToken?: string;
}) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: authorSummaryQueryKeys.wishDetail(spaceId, wishId),
    queryFn: () => apis.wishes.getWish({ spaceId, wishId }),
    staleTime: 30_000,
    retry: false,
  });
  const wish = query.data;
  if (!wish || (!wish.linkUrl && !wish.photoAttachmentId)) return null;
  return (
    <section
      className="wish-origin-media"
      aria-label={t('m5s3.wish.origin.label')}
    >
      <p className="field-help">{t('m5s3.wish.origin.label')}</p>
      <WishLinkRow url={wish.linkUrl} />
      {wish.photoAttachmentId ? (
        <WishPhotoGallery
          wishId={wish.id}
          photoAttachmentId={wish.photoAttachmentId}
          spaceId={spaceId}
          apiBaseUrl={apiBaseUrl}
          accessToken={accessToken}
        />
      ) : null}
    </section>
  );
}
