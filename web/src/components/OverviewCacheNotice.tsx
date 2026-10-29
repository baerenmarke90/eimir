import { resolvedLocale, useTranslation } from '../i18n';

export function OverviewCacheNotice({ cachedAt }: { cachedAt?: Date }) {
  const { t } = useTranslation();
  if (!cachedAt) return null;
  const timestamp = new Intl.DateTimeFormat(resolvedLocale(), {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(cachedAt);
  return (
    <p className="overview-cache-notice" role="status">
      {t('cacheRuntime.warmOverview', { timestamp })}
    </p>
  );
}
