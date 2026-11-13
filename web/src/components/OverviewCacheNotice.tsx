import { useRef } from 'react';
import { resolvedLocale, useTranslation } from '../i18n';

/**
 * A saved read stays understandable while authoritative data refreshes. When
 * the live data arrives the notice collapses instead of vanishing, so the
 * content below it eases up rather than jumping.
 */
export function OverviewCacheNotice({ cachedAt }: { cachedAt?: Date }) {
  const { t } = useTranslation();
  const lastShown = useRef<Date | undefined>(undefined);
  if (cachedAt) lastShown.current = cachedAt;
  const shown = lastShown.current;
  if (!shown) return null;
  const open = Boolean(cachedAt);
  const timestamp = new Intl.DateTimeFormat(resolvedLocale(), {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(shown);
  return (
    <div
      className="overview-cache-notice-slot"
      data-open={open}
      aria-hidden={open ? undefined : true}
    >
      <div className="overview-cache-notice-clip">
        <p className="overview-cache-notice" role={open ? 'status' : undefined}>
          {t('cacheRuntime.warmOverview', { timestamp })}
        </p>
      </div>
    </div>
  );
}
