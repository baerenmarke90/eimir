import { Link } from 'react-router-dom';
import type { DashboardSharedStorySummary } from '../api/generated/models/DashboardSharedStorySummary';
import { appRoutePath } from '../client/routes';
import { resolvedLocale, useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import './SharedStorySummary.css';

interface SharedStorySummaryProps {
  summary: DashboardSharedStorySummary;
  showEmpty?: boolean;
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
}: SharedStorySummaryProps) {
  const { t } = useTranslation();
  if (!showEmpty && !sharedStorySummaryIsEligible(summary)) return null;

  const numberFormat = new Intl.NumberFormat(resolvedLocale());
  const storyBaseRoute = appRoutePath('story');
  const metrics = [
    {
      key: 'memories' as const,
      icon: 'erinnerungen' as const,
      label: t('m5s5.dashboard.storySummaryMemories'),
      ariaLabel: t('m5s5.dashboard.storySummaryMemoriesCount', {
        count: summary.memories,
      }),
      value: summary.memories,
      to: `${storyBaseRoute}?tab=timeline&type=MEMORY`,
    },
    {
      key: 'heartMoments' as const,
      icon: 'denken' as const,
      label: t('m5s5.dashboard.storySummaryHeartMoments'),
      ariaLabel: t('m5s5.dashboard.storySummaryHeartMomentsCount', {
        count: summary.heartMoments,
      }),
      value: summary.heartMoments,
      to: `${storyBaseRoute}?tab=timeline&type=HEART_MOMENT`,
    },
    {
      key: 'milestones' as const,
      icon: 'meilensteine' as const,
      label: t('m5s5.dashboard.storySummaryMilestones'),
      ariaLabel: t('m5s5.dashboard.storySummaryMilestonesCount', {
        count: summary.milestones,
      }),
      value: summary.milestones,
      to: `${storyBaseRoute}?tab=timeline&type=MILESTONE`,
    },
  ].filter((metric) => showEmpty || metric.value > 0);

  return (
    <section
      className="shared-story-summary"
      aria-labelledby="shared-story-summary-heading"
    >
      <h2 id="shared-story-summary-heading" className="today-section-title">
        {t('m5s5.dashboard.storySummaryTitle')}
      </h2>
      <dl className="shared-story-summary-values">
        {metrics.map((metric) => (
          <div className="shared-story-summary-metric" key={metric.key}>
            <dt>{metric.label}</dt>
            <dd>
              <Link
                to={metric.to}
                className={`shared-story-summary-badge shared-story-summary-badge-${metric.key}`}
                aria-label={metric.ariaLabel}
              >
                <EimirIcon name={metric.icon} />
                <span className="shared-story-summary-number">
                  {numberFormat.format(metric.value)}
                </span>
              </Link>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
