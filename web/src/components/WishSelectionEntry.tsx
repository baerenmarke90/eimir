import { Link, useNavigate } from 'react-router-dom';
import { WISH_SELECTION_ROUTE } from '../client/routes';
import { useTaskOrigin } from '../client/taskOrigin';
import { useTranslation } from '../i18n';
import './WishSelection.css';

export function WishSelectionEntry({
  segment,
}: {
  segment: 'plans' | 'wishes';
}) {
  const { t } = useTranslation();
  const { captureOrigin } = useTaskOrigin();
  const navigate = useNavigate();
  return (
    <section
      className="wish-selection-entry"
      aria-labelledby={`wish-selection-entry-${segment}`}
    >
      <h2 id={`wish-selection-entry-${segment}`}>{t('wishSelection.title')}</h2>
      <div className="wish-selection-invitation">
        <p>{t('wishSelection.entryBody')}</p>
        <Link
          className="button-link"
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
          {t('wishSelection.entryAction')}
        </Link>
      </div>
    </section>
  );
}
