import { Link, useNavigate } from 'react-router-dom';
import { WISH_SELECTION_ROUTE } from '../client/routes';
import { useTaskOrigin } from '../client/taskOrigin';
import { useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import './WishSelection.css';

export function WishSelectionEntry({
  segment,
  compact = false,
}: {
  segment: 'plans' | 'wishes';
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const { captureOrigin } = useTaskOrigin();
  const navigate = useNavigate();
  return (
    <section
      className={`wish-selection-entry${compact ? ' is-compact' : ''}`}
      aria-labelledby={`wish-selection-entry-${segment}`}
    >
      {!compact ? (
        <h2 id={`wish-selection-entry-${segment}`}>
          {t('wishSelection.title')}
        </h2>
      ) : null}
      <div className="wish-selection-invitation">
        {!compact ? <p>{t('wishSelection.entryBody')}</p> : null}
        <Link
          id={compact ? `wish-selection-entry-${segment}` : undefined}
          className={compact ? 'wish-selection-compact-link' : 'button-link'}
          to={WISH_SELECTION_ROUTE}
          onClick={(event) => {
            // Keep the ordinary link/deep-link destination. Only an unmodified
            // activation carries the current hub's bounded return context.
            if (
              event.button !== 0 ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            )
              return;
            event.preventDefault();
            const key = captureOrigin({ planningSegment: segment });
            void navigate(WISH_SELECTION_ROUTE, {
              state: { taskOriginKey: key },
            });
          }}
        >
          {compact ? <EimirIcon name="gemeinsam" /> : null}
          {t(
            compact
              ? 'wishSelection.compactEntryAction'
              : 'wishSelection.entryAction',
          )}
        </Link>
      </div>
    </section>
  );
}
