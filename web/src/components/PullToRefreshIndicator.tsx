import { useTranslation } from '../i18n';
import {
  type PullToRefreshOptions,
  usePullToRefresh,
} from './usePullToRefresh';

export function PullToRefreshIndicator(options: PullToRefreshOptions) {
  const state = usePullToRefresh(options);
  const { t } = useTranslation();

  if (!options.enabled || !state.supported) return null;

  // The anchor takes no room in the page. The disc inside moves by transform
  // only (written by the hook), so a pull never reflows the content below it.
  return (
    <>
      <div
        className={`app-pull-refresh-indicator ${state.pulling || state.refreshing ? 'is-visible' : ''} ${state.ready ? 'is-ready' : ''} ${state.refreshing ? 'is-refreshing' : ''}`}
        aria-hidden="true"
      >
        <div className="app-pull-refresh-clip">
          <span className="app-pull-refresh-disc" ref={state.indicatorRef}>
            <svg
              className={`app-pull-refresh-icon inline-icon${state.refreshing ? ' eimir-motion-loading-spin' : ''}`}
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              {/* An open ring, as in the platform's own refresh spinners. */}
              <path d="M12 3a9 9 0 1 0 9 9" />
            </svg>
          </span>
        </div>
      </div>
      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {state.refreshing ? t('common.refreshing') : ''}
      </div>
    </>
  );
}
