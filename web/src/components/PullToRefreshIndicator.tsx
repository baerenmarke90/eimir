import { useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
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
          <EimirIcon name="refresh" className="app-pull-refresh-icon" />
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
