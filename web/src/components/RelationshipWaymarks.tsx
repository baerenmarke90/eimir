import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { milestoneDetailPath } from '../client/routes';
import {
  type MilestoneRef,
  reachedWaymarks,
  type Waymark,
  type WaymarkDuration,
  waymarkToday,
} from '../client/storyWaymarks';
import { resolvedLocale, useTranslation } from '../i18n';
import './RelationshipWaymarks.css';

/** How many waymarks stay visible before the rest is opened in place. */
const COLLAPSED_COUNT = 4;

export function passportDate(value: Date): string {
  return new Intl.DateTimeFormat(resolvedLocale(), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(value);
}

/** The words of one waymark, shared by the thread and the next-chapter card. */
export function useWaymarkLabel() {
  const { t } = useTranslation();
  return (waymark: Waymark): string => {
    switch (waymark.kind) {
      case 'roundDay':
        return t('relationshipReflections.passport.roundDay', {
          count: waymark.days,
          days: new Intl.NumberFormat(resolvedLocale()).format(waymark.days),
        });
      case 'relationshipAnniversary':
        return t('relationshipReflections.passport.anniversary', {
          count: waymark.years,
        });
      case 'milestoneAnniversary':
        return t('relationshipReflections.waymarks.milestoneYears', {
          count: waymark.years,
          title: waymark.title,
        });
    }
  };
}

/**
 * "Eure Wegmarken": the round days and anniversaries the couple has already
 * reached, newest first, as one quiet thread. Derived from the passport's
 * day count and the Milestones list; omitted while nothing is reached.
 */
export function PassportWaymarks({
  duration,
  milestones,
}: {
  duration: WaymarkDuration | null;
  milestones: readonly MilestoneRef[];
}) {
  const { t } = useTranslation();
  const label = useWaymarkLabel();
  const [expanded, setExpanded] = useState(false);
  const moreId = useId();
  const waymarks = useMemo(
    () =>
      reachedWaymarks({
        duration,
        milestones,
        today: waymarkToday(duration),
      }),
    [duration, milestones],
  );
  if (waymarks.length === 0) return null;
  const visible = waymarks.slice(0, COLLAPSED_COUNT);
  const rest = waymarks.slice(COLLAPSED_COUNT);
  const row = (waymark: Waymark, index: number) => {
    const isTail =
      index === waymarks.length - 1 ||
      (!expanded && index === COLLAPSED_COUNT - 1);
    const content = (
      <>
        <span className="passport-waymark-dot" aria-hidden="true" />
        <span className="passport-waymark-copy">
          <span className="passport-waymark-label">{label(waymark)}</span>
          <time dateTime={waymark.date.toISOString().slice(0, 10)}>
            {passportDate(waymark.date)}
          </time>
        </span>
      </>
    );
    return (
      <li
        key={waymark.key}
        className="passport-waymark"
        data-kind={waymark.kind}
        data-newest={index === 0 ? 'true' : undefined}
        data-tail={isTail ? 'true' : undefined}
      >
        {waymark.kind === 'milestoneAnniversary' ? (
          <Link to={milestoneDetailPath(waymark.milestoneId)}>{content}</Link>
        ) : (
          <div>{content}</div>
        )}
      </li>
    );
  };
  return (
    <section
      className="passport-waymarks"
      aria-labelledby="passport-waymarks-title"
    >
      <h3 id="passport-waymarks-title">
        {t('relationshipReflections.waymarks.title')}
      </h3>
      <div className="passport-waymarks-card">
        <ol className="passport-waymarks-list">{visible.map(row)}</ol>
        {rest.length > 0 ? (
          <div
            id={moreId}
            className="passport-waymarks-more"
            data-expanded={expanded ? 'true' : 'false'}
            // Collapsed rows are neither read out nor reachable by keyboard.
            inert={!expanded}
          >
            <ol className="passport-waymarks-list" start={COLLAPSED_COUNT + 1}>
              {rest.map((waymark, index) =>
                row(waymark, index + COLLAPSED_COUNT),
              )}
            </ol>
          </div>
        ) : null}
      </div>
      {rest.length > 0 ? (
        <button
          type="button"
          className="passport-waymarks-toggle"
          aria-expanded={expanded}
          aria-controls={moreId}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded
            ? t('relationshipReflections.waymarks.showFewer')
            : t('relationshipReflections.waymarks.showAll', {
                count: waymarks.length,
              })}
        </button>
      ) : null}
    </section>
  );
}
