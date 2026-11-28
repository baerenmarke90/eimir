import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AttachmentsApi } from '../api/generated/apis/AttachmentsApi';
import { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import { Configuration } from '../client/apiConfiguration';
import { normalizeClientError } from '../client/problemDetails';
import { proPaywallPath, STORY_PHOTOS_ROUTE } from '../client/routes';
import {
  entitlementLoader,
  useSpaceCapability,
} from '../client/spaceEntitlement';
import {
  formatStorageBytes,
  storageLevel,
  storageShare,
} from '../client/storageQuota';
import { useTranslation } from '../i18n';
import './StorageSection.css';

/** The capability that lifts a Cloud Space to the Premium storage quota. */
const PREMIUM_STORAGE = 'storage.cloud_quota_50gb';

/**
 * How much of the Space's Cloud storage is used: the whole of Settings › Data
 * since the Transfer Bundle left the product (ADR 0020; #2141 Q5, approved UI
 * preflight states 1–4). Self-Hosted is unmetered and says so in one calm
 * sentence instead of leaving the page empty. Nothing is shown until the
 * figure is known: a missing or failed read is never a fabricated "0 GB".
 */
export function StorageSection({
  apiBaseUrl,
  accessToken,
  accountId,
  spaceId,
}: {
  apiBaseUrl: string;
  accessToken: string;
  accountId: string;
  spaceId: string;
}) {
  const { t } = useTranslation();
  const configuration = useMemo(
    () =>
      new Configuration({
        basePath: apiBaseUrl,
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    [apiBaseUrl, accessToken],
  );
  const storage = useQuery({
    queryKey: ['space-storage', accountId, spaceId],
    queryFn: async ({ signal }) => {
      try {
        return await new AttachmentsApi(configuration).getSpaceStorage(
          { spaceId },
          { signal },
        );
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    staleTime: 30_000,
    retry: false,
  });
  const load = useMemo(
    () => entitlementLoader(new EntitlementsApi(configuration), spaceId),
    [configuration, spaceId],
  );
  // Reuses the session's single entitlement read for the Pro mark.
  const premium = useSpaceCapability({
    accountId,
    spaceId,
    load,
    capability: PREMIUM_STORAGE,
  });

  const usage = storage.data;
  if (!usage) return null;
  const level = storageLevel(usage);
  if (level === null || usage.quota === null) {
    return (
      <section
        className="form-card storage-section"
        aria-labelledby="storage-heading"
      >
        <h2 id="storage-heading">{t('storageQuota.heading')}</h2>
        <div className="storage-surface">
          <p className="storage-muted">{t('storageQuota.unlimited')}</p>
        </div>
      </section>
    );
  }
  const isPremium = premium.data === true;
  const used = formatStorageBytes(usage.used);
  const quota = formatStorageBytes(usage.quota);
  const share = storageShare(usage);

  return (
    <section
      className="form-card storage-section"
      aria-labelledby="storage-heading"
      data-level={level}
    >
      <h2 id="storage-heading">{t('storageQuota.heading')}</h2>
      <div className="storage-surface">
        <p className="storage-figure">
          {t('storageQuota.used', { used, quota })}
        </p>
        {/* The figure above says it in words; the bar only shows it. */}
        <div className="storage-meter" aria-hidden="true">
          <span style={{ inlineSize: `${Math.round(share * 1000) / 10}%` }} />
        </div>
        {isPremium ? (
          // The Pro mark is an upgrade hint that Pro couples never see, so
          // their larger storage is said in words.
          <p className="storage-muted">
            {t('storageQuota.proIncluded', { quota })}
          </p>
        ) : null}
        {level === 'roomy' ? (
          <p className="storage-muted">{t('storageQuota.counts')}</p>
        ) : null}
        {level === 'almostFull' ? (
          <>
            <p className="storage-muted">
              {t('storageQuota.free', {
                available: formatStorageBytes(usage.available ?? 0),
              })}
            </p>
            <div className="storage-callout" data-tone="warn">
              <strong>{t('storageQuota.almostFull.title')}</strong>
              <span>{t('storageQuota.almostFull.body')}</span>
            </div>
          </>
        ) : null}
        {level === 'full' ? (
          <div className="storage-callout" data-tone="error">
            <strong>{t('storageQuota.full.title')}</strong>
            <span>
              {isPremium
                ? t('storageQuota.full.bodyPro')
                : t('storageQuota.full.body')}
            </span>
          </div>
        ) : null}
        {level !== 'roomy' ? (
          <div className="storage-actions">
            {level === 'full' && !isPremium ? (
              <Link className="button-link" to={proPaywallPath('storage')}>
                {t('storageQuota.morePro')}
              </Link>
            ) : null}
            <Link className="storage-link" to={STORY_PHOTOS_ROUTE}>
              {t('storageQuota.viewMedia')}
            </Link>
            {level === 'almostFull' && !isPremium ? (
              <Link className="storage-link" to={proPaywallPath('storage')}>
                {t('storageQuota.morePro')}
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
