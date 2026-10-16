import { useEffect, useRef, useState } from 'react';
import { SNACKBAR_EVENT, type SnackbarEventDetail } from '../client/snackbar';
import { useTranslation } from '../i18n';

const AUTO_DISMISS_MS = 6000;

/**
 * The `docs/COMPONENT-CONTRACTS.md` §9.2 Snackbar — a brief, non-critical
 * confirmation, at most one action (dismiss).
 *
 * Rendered once from `AppShell`, listening for `postSnackbar()` calls from
 * anywhere in the tree (`client/snackbar.ts`), the same decoupled
 * window-event pattern `productReadCache.ts` already uses for its
 * fallback/network events — a mutation's `onSuccess` should not need to
 * know or care which screen happens to be mounted when it completes.
 */
export function Snackbar() {
  const { t } = useTranslation();
  const [current, setCurrent] = useState<SnackbarEventDetail | null>(null);
  const dismissTimeout = useRef<number | null>(null);

  useEffect(() => {
    function onSnackbar(event: Event) {
      const detail = (event as CustomEvent<SnackbarEventDetail>).detail;
      if (detail) setCurrent(detail);
    }
    window.addEventListener(SNACKBAR_EVENT, onSnackbar);
    return () => window.removeEventListener(SNACKBAR_EVENT, onSnackbar);
  }, []);

  useEffect(() => {
    if (dismissTimeout.current !== null) {
      window.clearTimeout(dismissTimeout.current);
      dismissTimeout.current = null;
    }
    if (!current) return;
    dismissTimeout.current = window.setTimeout(
      () => setCurrent(null),
      AUTO_DISMISS_MS,
    );
    return () => {
      if (dismissTimeout.current !== null) {
        window.clearTimeout(dismissTimeout.current);
        dismissTimeout.current = null;
      }
    };
  }, [current]);

  if (!current) return null;

  return (
    <div className="snackbar" role="status" aria-live="polite">
      <span className="snackbar-message">
        {t(current.messageKey, current.messageOptions)}
      </span>
      <button
        type="button"
        className="snackbar-dismiss"
        onClick={() => setCurrent(null)}
        aria-label={t('snackbar.dismiss')}
      >
        ×
      </button>
    </div>
  );
}
