import { Link } from 'react-router-dom';
import { STORY_RECAPS_ROUTE } from '../client/routes';
import { useTranslation } from '../i18n';
import { PageHeader } from './PageHeader';
import type { ProfilePageProps } from './ProfilePage';
import { RelationshipPassport } from './RelationshipPassport';
import './RelationshipStoryPage.css';

/**
 * "Eure Geschichte" as a place of its own.
 *
 * The couple's beginning, their next landmarks and what they have kept
 * together used to sit collapsed at the end of the recap library. Here it is
 * the destination behind the heart line on Wir.
 */
export function RelationshipStoryPage(props: ProfilePageProps) {
  const { t } = useTranslation();
  return (
    <div className="page relationship-story-page">
      <PageHeader title={t('relationshipReflections.passport.title')} />
      <RelationshipPassport {...props} />
      <nav
        className="relationship-story-links"
        aria-label={t('relationshipReflections.passport.title')}
      >
        <Link to="/story?tab=timeline">
          {t('relationshipReflections.passport.explore')}
        </Link>
        <Link to={STORY_RECAPS_ROUTE}>{t('recaps.shortTitle')}</Link>
        <Link to="/more/profile#relationship-profile-title">
          {t('m5s5.dashboard.openRelationshipSettings')}
        </Link>
      </nav>
    </div>
  );
}
