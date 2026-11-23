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
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M20 11a8 8 0 1 0-2.34 5.66" />
              <path d="M20 4v7h-7" />
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
