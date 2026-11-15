import type { DashboardExperience } from '../api/generated/models/DashboardExperience';
import { useAttentionReceipt } from '../client/attentionReceipt';
import { memoryDetailPath } from '../client/routes';
import { resolvedLocale, useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import { MomentDate } from './MomentDate';
import { TodayDestinationLink } from './TodayDestinationLink';
import './CoupleExperiences.css';

export function SharedExperienceReveal({
  entry,
  partnerName,
  scope = [],
}: {
  entry: DashboardExperience;
  partnerName: string;
  scope?: readonly string[];
}) {
  const { t } = useTranslation();
  const happiness = entry.kind === 'HAPPINESS';
  const receipt = useAttentionReceipt(
    scope,
    `experience:${entry.id}:${entry.createdAt.toISOString()}`,
    entry.createdAt.getTime() + 3 * 24 * 60 * 60_000,
  );
  if (!receipt.visible) return null;
  const senderName = partnerName.trim();
  const date = entry.happenedOn ?? entry.createdAt;
  const dateLabel = new Intl.DateTimeFormat(resolvedLocale(), {
    dateStyle: 'medium',
    ...(entry.happenedOn ? { timeZone: 'UTC' } : {}),
  }).format(date);
  return (
    <section
      className="today-section shared-experience-section"
      aria-labelledby="shared-experience-heading"
    >
      <div className="today-section-header">
        <h2 id="shared-experience-heading" className="today-section-title">
          {t(
            senderName
              ? 'coupleExperiences.incoming.from'
              : 'coupleExperiences.incoming.title',
            { name: senderName },
          )}
        </h2>
      </div>
      <div className="today-section-body">
        <article
          key={entry.id}
          className={`shared-experience-reveal ${happiness ? 'is-happiness' : 'is-time-travel'}`}
        >
          <div className="shared-experience-byline">
            <EimirIcon
              name={happiness ? 'highlights' : 'kapitel'}
              className="shared-experience-symbol"
            />
            <p className="shared-experience-from">
              {t(
                happiness
                  ? 'coupleExperiences.incoming.happiness'
                  : 'coupleExperiences.incoming.timeTravel',
              )}
            </p>
          </div>
          <p className="shared-experience-question">
            {entry.prompt?.trim() ||
              t(
                happiness
                  ? 'coupleExperiences.sharedHappiness'
                  : 'coupleExperiences.sharedTimeTravel',
              )}
          </p>
          <p
            className="shared-experience-words"
            data-long={entry.text.length > 180}
          >
            {entry.text}
          </p>
          <div className="shared-experience-footer">
            <MomentDate
              dateTime={
                entry.happenedOn
                  ? date.toISOString().slice(0, 10)
                  : date.toISOString()
              }
            >
              {dateLabel}
            </MomentDate>
            <TodayDestinationLink
              className="button-link"
              to={memoryDetailPath(entry.id)}
              onFollow={receipt.consume}
            >
              {t('coupleExperiences.incoming.open')}
            </TodayDestinationLink>
          </div>
        </article>
      </div>
    </section>
  );
}
