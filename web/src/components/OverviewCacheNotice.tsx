import { useEffect, useRef, useState } from 'react';
import { resolvedLocale, useTranslation } from '../i18n';

/**
 * A saved read stays understandable while authoritative data refreshes. The
 * notice only appears when the refresh is genuinely slow or offline: a refresh
 * that lands within the grace period never shows it, so the entrance of the
 * page below is not pushed around by a banner that is gone a moment later.
 * When the live data arrives the notice collapses before leaving the DOM, so
 * the content below it eases up rather than jumping.
 */
/** Matches the longest standard transition; the notice leaves the DOM after it. */
export const NOTICE_COLLAPSE_MS = 320;
/** A saved read that is replaced within this time is not worth announcing. */
export const NOTICE_REVEAL_DELAY_MS = 1500;

export function OverviewCacheNotice({ cachedAt }: { cachedAt?: Date }) {
  const { t } = useTranslation();
  const lastShown = useRef<Date | undefined>(undefined);
  if (cachedAt) lastShown.current = cachedAt;
  const shown = lastShown.current;
  const open = Boolean(cachedAt);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => setRevealed(true), NOTICE_REVEAL_DELAY_MS);
      return () => clearTimeout(timer);
    }
    // Collapsing is a transition, so it can not report its end under reduced
    // motion; a timer retires the notice from the DOM either way.
    const timer = setTimeout(() => setRevealed(false), NOTICE_COLLAPSE_MS);
    return () => clearTimeout(timer);
  }, [open]);
  if (!shown || !revealed) return null;
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
