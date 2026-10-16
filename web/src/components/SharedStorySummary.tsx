import { Link } from 'react-router-dom';
import type { DashboardSharedStorySummary } from '../api/generated/models/DashboardSharedStorySummary';
import { appRoutePath } from '../client/routes';
import { resolvedLocale, useTranslation } from '../i18n';
import './SharedStorySummary.css';

interface SharedStorySummaryProps {
  summary: DashboardSharedStorySummary;
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

function PolaroidMotif() {
  return (
    <span
      className="story-badge-motif story-badge-motif-polaroid"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 28 32"
        width="26"
        height="30"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        focusable="false"
        className="motif-svg"
      >
        <rect
          x="1"
          y="1"
          width="26"
          height="30"
          rx="2"
          className="polaroid-frame"
        />
        <rect
          x="3"
          y="3"
          width="22"
          height="18"
          rx="1"
          className="polaroid-photo"
        />
        <circle cx="18" cy="7.5" r="1.75" className="polaroid-sun" />
        <path
          d="M3 19.5L8.5 13L14 18L18 14L25 20.5V21H3V19.5Z"
          className="polaroid-hills"
        />
      </svg>
    </span>
  );
}

function HeartMotif() {
  return (
    <span
      className="story-badge-motif story-badge-motif-heart"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 30 26"
        width="28"
        height="24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        focusable="false"
        className="motif-svg"
      >
        <path
          d="M12 5C10 2.8 6.8 2.5 4.3 4.5C1.8 6.6 1.5 10 3.3 12.6C5.9 16.3 12 20.5 12 20.5C12 20.5 18.1 16.3 20.7 12.6C22.5 10 22.2 6.6 19.7 4.5C17.2 2.5 14 2.8 12 5Z"
          className="heart-main"
        />
        <path
          d="M22 17C21.2 16 19.8 15.8 18.8 16.6C17.8 17.4 17.6 18.8 18.4 19.8C19.5 21.3 22.2 23.2 22.2 23.2C22.2 23.2 24.9 21.3 26 19.8C26.8 18.8 26.6 17.4 25.6 16.6C24.6 15.8 23.2 16 22.4 17L22.2 17.2L22 17Z"
          className="heart-companion"
        />
      </svg>
    </span>
  );
}

function PennantMotif() {
  return (
    <span
      className="story-badge-motif story-badge-motif-pennant"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 36"
        width="22"
        height="32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        focusable="false"
        className="motif-svg"
      >
        <line
          x1="4"
          y1="34"
          x2="7.5"
          y2="3"
          strokeLinecap="round"
          className="pennant-pole"
        />
        <path d="M7 5L22 11.5L6 17Z" className="pennant-banner" />
        <path
          d="M12.5 9.5C12.1 8.9 11.3 8.8 10.7 9.2C10.1 9.7 10 10.5 10.4 11.1C11 11.9 12.5 13 12.5 13C12.5 13 14 11.9 14.6 11.1C15 10.5 14.9 9.7 14.3 9.2C13.7 8.8 12.9 8.9 12.5 9.5Z"
          className="pennant-heart"
        />
      </svg>
    </span>
  );
}

function StoryBadgeAccents({ metricKey }: { metricKey: string }) {
  if (metricKey === 'memories') {
    return (
      <span
        className="story-badge-accents story-badge-accents-memories"
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 32 32"
          width="26"
          height="26"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          focusable="false"
          className="accents-sparks-left"
        >
          <line x1="24" y1="24" x2="16" y2="16" strokeLinecap="round" />
          <line x1="28" y1="17" x2="18" y2="12" strokeLinecap="round" />
          <line x1="17" y1="28" x2="12" y2="18" strokeLinecap="round" />
        </svg>
        <svg
          viewBox="0 0 16 16"
          width="12"
          height="12"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          focusable="false"
          className="accents-heart-left"
        >
          <path d="M8 4.2C7 2.5 4.8 2 3 3.4C1.2 4.8 1 7.2 2.2 9C4 11.5 8 14.2 8 14.2C8 14.2 12 11.5 13.8 9C15 7.2 14.8 4.8 13 3.4C11.2 2 9 2.5 8 4.2Z" />
        </svg>
      </span>
    );
  }

  if (metricKey === 'heartMoments') {
    return (
      <span
        className="story-badge-accents story-badge-accents-heart"
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          focusable="false"
          className="accents-sparks-top-left"
        >
          <line x1="20" y1="20" x2="12" y2="12" strokeLinecap="round" />
          <line x1="22" y1="13" x2="13" y2="8" strokeLinecap="round" />
        </svg>
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          focusable="false"
          className="accents-sparks-top-right"
        >
          <line x1="4" y1="20" x2="12" y2="12" strokeLinecap="round" />
          <line x1="2" y1="13" x2="11" y2="8" strokeLinecap="round" />
        </svg>
      </span>
    );
  }

  if (metricKey === 'milestones') {
    return (
      <span
        className="story-badge-accents story-badge-accents-milestones"
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 32 32"
          width="26"
          height="26"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          focusable="false"
          className="accents-sparks-right"
        >
          <line x1="8" y1="24" x2="16" y2="16" strokeLinecap="round" />
          <line x1="4" y1="17" x2="14" y2="12" strokeLinecap="round" />
          <line x1="15" y1="28" x2="20" y2="18" strokeLinecap="round" />
        </svg>
        <svg
          viewBox="0 0 16 16"
          width="12"
          height="12"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          focusable="false"
          className="accents-heart-right"
        >
          <path d="M8 4.2C7 2.5 4.8 2 3 3.4C1.2 4.8 1 7.2 2.2 9C4 11.5 8 14.2 8 14.2C8 14.2 12 11.5 13.8 9C15 7.2 14.8 4.8 13 3.4C11.2 2 9 2.5 8 4.2Z" />
        </svg>
      </span>
    );
  }

  return null;
}

export function SharedStorySummary({ summary }: SharedStorySummaryProps) {
  const { t } = useTranslation();
  if (!sharedStorySummaryIsEligible(summary)) return null;

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
  ].filter((metric) => metric.value > 0);

  return (
    <section
      className="shared-story-summary"
      aria-labelledby="shared-story-summary-heading"
    >
      <h2 id="shared-story-summary-heading">
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
                {metric.key === 'memories' && <PolaroidMotif />}
                {metric.key === 'heartMoments' && <HeartMotif />}
                {metric.key === 'milestones' && <PennantMotif />}
                <span className="shared-story-summary-number">
                  {numberFormat.format(metric.value)}
                </span>
                <StoryBadgeAccents metricKey={metric.key} />
              </Link>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
