import { Link } from 'react-router-dom';
import { STORY_CHAPTERS_ROUTE, STORY_YEARS_ROUTE } from '../client/routes';
import { useTranslation } from '../i18n';

const MILESTONES_BROWSE_ROUTE = '/story?tab=timeline&type=MILESTONE';

export function StoryBrowseLayer() {
  const { t } = useTranslation();

  return (
    <nav className="momente-browse-layer" aria-label={t('story.browseTitle')}>
      <p className="momente-browse-heading">{t('story.browseTitle')}</p>
      <div className="momente-browse-links">
        <Link to={MILESTONES_BROWSE_ROUTE} className="momente-browse-link">
          <svg
            className="momente-browse-icon"
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
            <path d="M5 21V4" />
            <path d="M5 5h11l-2 4 2 4H5" />
          </svg>
          <span>{t('story.browseMilestones')}</span>
        </Link>
        <Link to={STORY_CHAPTERS_ROUTE} className="momente-browse-link">
          <svg
            className="momente-browse-icon"
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
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z" />
          </svg>
          <span>{t('story.browseChapters')}</span>
        </Link>
        <Link to={STORY_YEARS_ROUTE} className="momente-browse-link">
          <svg
            className="momente-browse-icon"
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
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
          <span>{t('story.browseYears')}</span>
        </Link>
      </div>
    </nav>
  );
}
