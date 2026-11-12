import { Link } from 'react-router-dom';
import type { DashboardSharedStorySummary } from '../api/generated/models/DashboardSharedStorySummary';
import { appRoutePath } from '../client/routes';
import { resolvedLocale, useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import './SharedStorySummary.css';

interface SharedStorySummaryProps {
  summary: DashboardSharedStorySummary;
  showEmpty?: boolean;
  includeEmptyCategories?: boolean;
}

export function sharedStorySummaryIsEligible(
  summary: DashboardSharedStorySummary,
): boolean {
  const values = [
    summary.memories,
    summary.heartMoments,
    summary.milestones,
  ].filter((value) => value > 0);
  return (
    values.length >= 2 && values.reduce((total, value) => total + value, 0) >= 5
  );
}

export function SharedStorySummary({
  summary,
  showEmpty = false,
  includeEmptyCategories = showEmpty,
}: SharedStorySummaryProps) {
  const { t } = useTranslation();
  if (!showEmpty && !sharedStorySummaryIsEligible(summary)) return null;

  const numberFormat = new Intl.NumberFormat(resolvedLocale());
  const storyBaseRoute = appRoutePath('story');
  const metrics = [
    {
      key: 'memories' as const,
      label: t('m5s5.dashboard.storySummaryMemories'),
      ariaLabel: t('m5s5.dashboard.storySummaryMemoriesCount', {
        count: summary.memories,
      }),
      value: summary.memories,
      to: `${storyBaseRoute}?tab=timeline&type=MEMORY`,
    },
    {
      key: 'heartMoments' as const,
      label: t('m5s5.dashboard.storySummaryHeartMoments'),
      ariaLabel: t('m5s5.dashboard.storySummaryHeartMomentsCount', {
        count: summary.heartMoments,
      }),
      value: summary.heartMoments,
      to: `${storyBaseRoute}?tab=timeline&type=HEART_MOMENT`,
    },
    {
      key: 'milestones' as const,
      label: t('m5s5.dashboard.storySummaryMilestones'),
      ariaLabel: t('m5s5.dashboard.storySummaryMilestonesCount', {
        count: summary.milestones,
      }),
      value: summary.milestones,
      to: `${storyBaseRoute}?tab=timeline&type=MILESTONE`,
    },
  ].filter((metric) => includeEmptyCategories || metric.value > 0);
  const total = metrics.reduce((sum, metric) => sum + metric.value, 0);

  return (
    <section
      className="shared-story-summary"
      aria-labelledby="shared-story-summary-heading"
    >
      <h2 id="shared-story-summary-heading" className="today-section-title">
        {t('m5s5.dashboard.storySummaryTitle')}
      </h2>
      <div className="shared-story-summary-card">
        {total > 0 ? (
          <p className="shared-story-summary-intro">
            <span className="shared-story-summary-heart" aria-hidden="true">
              <EimirIcon name="momente" />
            </span>
            <span>{t('m5s5.dashboard.storySummaryIntro')}</span>
          </p>
        ) : null}
        <p className="shared-story-summary-line">
          <strong className="shared-story-summary-total">
            {numberFormat.format(total)}
          </strong>{' '}
          {t('m5s5.dashboard.storySummaryTotalLabel', { count: total })}
        </p>
        {total > 0 ? (
          <div className="shared-story-summary-bar" aria-hidden="true">
            {metrics
              .filter((metric) => metric.value > 0)
              .map((metric) => (
                <span
                  key={metric.key}
                  className={`shared-story-summary-category-${metric.key}`}
                  style={{ flexGrow: metric.value }}
                />
              ))}
          </div>
        ) : null}
        <ul className="shared-story-summary-values">
          {metrics.map((metric) => (
            <li className="shared-story-summary-metric" key={metric.key}>
              <Link
                to={metric.to}
                className={`shared-story-summary-row shared-story-summary-category-${metric.key}`}
                aria-label={metric.ariaLabel}
              >
                <span className="shared-story-summary-dot" aria-hidden="true" />
                <span className="shared-story-summary-label">
                  <strong className="shared-story-summary-number">
                    {numberFormat.format(metric.value)}
                  </strong>{' '}
                  {metric.label}
                </span>
                <EimirIcon name="chevron-right" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
