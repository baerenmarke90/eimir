import { useEffect, useState } from 'react';
import type { DashboardAnticipation } from '../api/generated/models/DashboardAnticipation';
import { planDetailPath } from '../client/routes';
import { formatCalendarDate } from '../client/formatRecency';
import { resolvedLocale, useTranslation } from '../i18n';
import { TodayDestinationLink } from './TodayDestinationLink';
import './RelationshipReflections.css';

/** One server-selected special Plan; ordinary agenda items keep their own form. */
export function AnticipationCard({ value }: { value: DashboardAnticipation }) {
  const { t } = useTranslation();
  const target = value.eventAt?.getTime();
  const [now, setNow] = useState(Date.now);
  const timed = target !== undefined && Number.isFinite(target);
  const remaining = timed ? Math.max(0, Math.ceil((target - now) / 1000)) : 0;
  useEffect(() => {
    if (target === undefined || !Number.isFinite(target)) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const refresh = () => {
      const instant = Date.now();
      setNow(instant);
      if (instant >= target) clearInterval(timer);
    };
    const resume = () => {
      clearInterval(timer);
      if (document.visibilityState === 'hidden') return;
      refresh();
      if (Date.now() < target) timer = setInterval(refresh, 1000);
    };
    resume();
    document.addEventListener('visibilitychange', resume);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [target]);

  const days = value.daysRemaining;
  if (!Number.isInteger(days) || days < 0) return null;
  const number = new Intl.NumberFormat(resolvedLocale(), {
    minimumIntegerDigits: 2,
    useGrouping: false,
  });
  const units = [
    ['timerDays', Math.floor(remaining / 86400)],
    ['timerHours', Math.floor((remaining % 86400) / 3600)],
    ['timerMinutes', Math.floor((remaining % 3600) / 60)],
    ['timerSeconds', remaining % 60],
  ] as const;
  return (
    <TodayDestinationLink
      to={planDetailPath(value.planId)}
      className="anticipation-card"
    >
      <span className="anticipation-heading">
        <span className="anticipation-event">
          <strong>{value.title}</strong>
          <time
            className="anticipation-date"
            dateTime={value.eventOn.toISOString().slice(0, 10)}
          >
            {formatCalendarDate(value.eventOn)}
          </time>
        </span>
        <span className="anticipation-open" aria-hidden="true">
          →
        </span>
      </span>
      {timed && remaining > 0 ? (
        <span
          className="anticipation-timer"
          role="timer"
          aria-live="off"
          aria-label={t('relationshipReflections.anticipation.timerLabel', {
            title: value.title,
          })}
        >
          {units.map(([unit, count]) => (
            <span className="anticipation-unit" key={unit}>
              <span className="anticipation-digit" key={count}>
                {number.format(count)}
              </span>
              <span className="anticipation-unit-label">
                {t(`relationshipReflections.anticipation.${unit}`)}
              </span>
            </span>
          ))}
        </span>
      ) : (
        <span className="anticipation-countdown">
          {t(
            timed
              ? 'relationshipReflections.anticipation.now'
              : days === 0
                ? 'relationshipReflections.anticipation.today'
                : days === 1
                  ? 'relationshipReflections.anticipation.tomorrow'
                  : 'relationshipReflections.anticipation.days',
            { count: days },
          )}
        </span>
      )}
    </TodayDestinationLink>
  );
}
