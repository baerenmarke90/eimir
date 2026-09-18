import { useTranslation } from '../i18n';
import type { PullToRefreshState } from './usePullToRefresh';

export function PullToRefreshIndicator({
  state,
}: {
  state: PullToRefreshState;
}) {
  const { t } = useTranslation();

  if (!state.supported) return null;

  return (
    <>
      <div
        className={`app-pull-refresh-indicator ${state.pullDistance > 0 ? 'is-visible' : ''} ${state.ready ? 'is-ready' : ''} ${state.refreshing ? 'is-refreshing' : ''}`}
        style={{
          height: `${state.refreshing ? 52 : state.pullDistance}px`,
        }}
        aria-hidden="true"
      >
        <span className="app-pull-refresh-disc">
          <svg
            className="app-pull-refresh-icon"
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M20 11a8 8 0 1 0-2.34 5.66" />
            <path d="M20 4v7h-7" />
          </svg>
        </span>
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
