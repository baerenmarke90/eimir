import { Link } from 'react-router-dom';
import { DATE_IDEAS_ROUTE } from '../client/routes';
import { useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import { ProMark } from './ProMark';
import './DateIdeas.css';

/**
 * Solo browsing keeps a home in the Wish composer (#1907 J1): a quiet line
 * that opens the date-idea catalog, where an idea can still be remembered as a
 * Wish or planned. The link stays ordinary for modified clicks; an unmodified
 * activation lets the composer close safely first.
 */
export function DateIdeasComposerHint({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation();
  return (
    <Link
      className="date-ideas-composer-hint"
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
        onOpen();
      }}
    >
      <EimirIcon name="sparkle" className="date-ideas-composer-hint-icon" />
      <span className="date-ideas-composer-hint-text">
        {t('dateIdeas.composerHint')}{' '}
        <strong>{t('dateIdeas.composerHintAction')}</strong>
        <ProMark label={t('dateIdeas.pro')} />
      </span>
      <EimirIcon
        name="chevron-right"
        className="date-ideas-composer-hint-chevron"
      />
    </Link>
  );
}
