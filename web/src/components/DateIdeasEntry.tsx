import { Link, useNavigate } from 'react-router-dom';
import { DATE_IDEAS_ROUTE } from '../client/routes';
import { useTaskOrigin } from '../client/taskOrigin';
import { useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import { ProMark } from './ProMark';
import './DateIdeas.css';

/**
 * Quiet invitation in the Wishes mode of Planning (#1892). It is shown to every couple;
 * Free Spaces see the Pro mark and a calm explanation on the destination,
 * never a modal. The destination is a normal link, so modified clicks and deep
 * links keep working; an unmodified activation carries the hub's return context.
 */
export function DateIdeasEntry() {
  const { t } = useTranslation();
  const { captureOrigin } = useTaskOrigin();
  const navigate = useNavigate();
  return (
    <Link
      className="date-ideas-entry"
      to={DATE_IDEAS_ROUTE}
      onClick={(event) => {
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        const key = captureOrigin({ planningSegment: 'wishes' });
        void navigate(DATE_IDEAS_ROUTE, { state: { taskOriginKey: key } });
      }}
    >
      <EimirIcon name="sparkle" className="date-ideas-entry-icon" />
      <span className="date-ideas-entry-text">
        <span className="date-ideas-entry-title">
          {t('dateIdeas.entryAction')}
          <ProMark label={t('dateIdeas.pro')} />
        </span>
        <span className="date-ideas-entry-hint">
          {t('dateIdeas.entryHint')}
        </span>
      </span>
      <EimirIcon name="chevron-right" className="date-ideas-entry-chevron" />
    </Link>
  );
}
