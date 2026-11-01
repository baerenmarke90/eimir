import type { DashboardExperience } from '../api/generated/models/DashboardExperience';
import { memoryDetailPath } from '../client/routes';
import { useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import { TodayDestinationLink } from './TodayDestinationLink';
import './CoupleExperiences.css';

export function SharedExperienceReveal({
  entry,
  partnerName,
}: {
  entry: DashboardExperience;
  partnerName: string;
}) {
  const { t } = useTranslation();
  const happiness = entry.kind === 'HAPPINESS';
  return (
    <section
      className="today-section shared-experience-section"
      aria-labelledby="shared-experience-heading"
    >
      <div className="today-section-header">
        <h2 id="shared-experience-heading" className="today-section-title">
          {t(
            happiness
              ? 'coupleExperiences.incoming.happiness'
              : 'coupleExperiences.incoming.timeTravel',
          )}
        </h2>
      </div>
      <div className="today-section-body">
        <article
          key={entry.id}
          className={`shared-experience-reveal ${happiness ? 'is-happiness' : 'is-time-travel'}`}
        >
          <EimirIcon
            name={happiness ? 'highlights' : 'kapitel'}
            className="shared-experience-symbol"
          />
          <p className="shared-experience-from">
            {t('coupleExperiences.incoming.from', { name: partnerName })}
          </p>
          <p className="shared-experience-words">{entry.text}</p>
          <TodayDestinationLink
            className="button-link"
            to={memoryDetailPath(entry.id)}
          >
            {t('coupleExperiences.incoming.open')}
          </TodayDestinationLink>
        </article>
      </div>
    </section>
  );
}
