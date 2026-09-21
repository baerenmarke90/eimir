import { Link } from 'react-router-dom';
import { MORE_INSIGHTS_ROUTE } from '../client/routes';
import { useTranslation } from '../i18n';
import './DailyInsights.css';
import { InsightIcon, ProMark } from './DailyInsightsParts';

/**
 * Quiet Today (Wir) entry into the longitudinal Pro insights (#1151).
 *
 * It is an ordinary link: no capability check, no modal and no upgrade
 * prompt on Today. The Free daily ritual stays untouched; the Pro context is
 * explained on the destination, where the person chose to look at history.
 */
export function DailyInsightsEntry() {
  const { t } = useTranslation();
  return (
    <Link
      className="insight-entry"
      to={MORE_INSIGHTS_ROUTE}
      aria-label={t('dailyInsights.entry.aria')}
    >
      <span className="insight-entry-icon">
        <InsightIcon name="bars" />
      </span>
      <span className="insight-entry-copy">
        <strong>{t('dailyInsights.entry.title')}</strong>
        <span>{t('dailyInsights.entry.subline')}</span>
      </span>
      <ProMark />
      <span className="insight-entry-chevron" aria-hidden="true">
        ›
      </span>
    </Link>
  );
}
