import { useEffect, useRef, useState } from 'react';
import { resolvedLocale, useTranslation } from '../i18n';

/**
 * A saved read stays understandable while authoritative data refreshes. When
 * the live data arrives the notice collapses before leaving the DOM, so the
 * content below it eases up rather than jumping.
 */
/** Matches the longest standard transition; the notice leaves the DOM after it. */
export const NOTICE_COLLAPSE_MS = 320;

export function OverviewCacheNotice({ cachedAt }: { cachedAt?: Date }) {
  const { t } = useTranslation();
  const lastShown = useRef<Date | undefined>(undefined);
  if (cachedAt) lastShown.current = cachedAt;
  const shown = lastShown.current;
  const open = Boolean(cachedAt);
  const [retired, setRetired] = useState(false);
  useEffect(() => {
    if (open) {
      setRetired(false);
      return undefined;
    }
    // Collapsing is a transition, so it can not report its end under reduced
    // motion; a timer retires the notice from the DOM either way.
    const timer = setTimeout(() => setRetired(true), NOTICE_COLLAPSE_MS);
    return () => clearTimeout(timer);
  }, [open]);
  if (!shown || (retired && !open)) return null;
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
