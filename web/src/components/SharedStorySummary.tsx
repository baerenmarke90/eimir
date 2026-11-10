import { Link } from 'react-router-dom';
import type { DashboardSharedStorySummary } from '../api/generated/models/DashboardSharedStorySummary';
import type { DashboardRelationshipDuration } from '../api/generated/models/DashboardRelationshipDuration';
import { calculateRelationshipDuration } from '../client/relationshipPreview';
import { appRoutePath } from '../client/routes';
import { resolvedLocale, useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import './SharedStorySummary.css';

interface SharedStorySummaryProps {
  summary: DashboardSharedStorySummary;
  showEmpty?: boolean;
  includeEmptyCategories?: boolean;
  relationshipDuration?: DashboardRelationshipDuration | null;
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
  relationshipDuration,
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
  // Use the server snapshot's reference day, also when viewing cached data.
  const start = relationshipDuration
    ? new Date(relationshipDuration.startedOn)
    : null;
  const duration =
    start && relationshipDuration
      ? calculateRelationshipDuration(
          start,
          new Date(
            start.getTime() + relationshipDuration.daysTogether * 86_400_000,
          ),
        )
      : null;
  const periodCount = duration
    ? duration.years || duration.months || duration.days
    : null;
  const periodUnit = duration?.years
    ? 'Years'
    : duration?.months
      ? 'Months'
      : 'Days';
  const period =
    periodCount === null
      ? null
      : t(`m5s5.dashboard.storySummaryPeriod${periodUnit}`, {
          count: periodCount,
          formattedCount: numberFormat.format(periodCount),
        });

  return (
    <section
      className="shared-story-summary"
      aria-labelledby="shared-story-summary-heading"
    >
      <h2 id="shared-story-summary-heading" className="today-section-title">
        {t('m5s5.dashboard.storySummaryTitle')}
      </h2>
      <div className="shared-story-summary-card">
        <p className="shared-story-summary-line">
          <strong className="shared-story-summary-total">
            {numberFormat.format(total)}
          </strong>{' '}
          {period === null
            ? t('m5s5.dashboard.storySummarySharedMemories', { count: total })
            : t('m5s5.dashboard.storySummaryMemoriesInPeriod', {
                count: total,
                period,
              })}
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
