import type { DashboardAnticipation } from '../api/generated/models/DashboardAnticipation';
import { planDetailPath } from '../client/routes';
import { formatCalendarDate } from '../client/formatRecency';
import { useTranslation } from '../i18n';
import { TodayDestinationLink } from './TodayDestinationLink';
import './RelationshipReflections.css';

/** One server-selected special Plan; ordinary agenda items keep their own form. */
export function AnticipationCard({ value }: { value: DashboardAnticipation }) {
  const { t } = useTranslation();
  const days = value.daysRemaining;
  if (!Number.isInteger(days) || days < 0) return null;
  return (
    <TodayDestinationLink
      to={planDetailPath(value.planId)}
      className="anticipation-card"
    >
      <span className="eyebrow">
        {t('relationshipReflections.anticipation.kicker')}
      </span>
      <span className="anticipation-countdown">
        {t(
          days === 0
            ? 'relationshipReflections.anticipation.today'
            : days === 1
              ? 'relationshipReflections.anticipation.tomorrow'
              : 'relationshipReflections.anticipation.days',
          { count: days },
        )}
      </span>
      <strong>{value.title}</strong>
      <span className="anticipation-date">
        {formatCalendarDate(value.eventOn)}
        <span aria-hidden="true"> →</span>
      </span>
    </TodayDestinationLink>
  );
}
