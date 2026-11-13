import type { MouseEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { HAPPINESS_ROUTE, TIME_TRAVEL_ROUTE } from '../client/routes';
import { useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import { ProMark } from './ProMark';
import './CoupleExperiences.css';

export function CoupleExperienceLinks({
  onOpen,
  extra,
}: {
  onOpen: (event: MouseEvent<HTMLAnchorElement>, to: string) => void;
  /** Further rows of the same group, such as the recap entry. */
  extra?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <section
      className="couple-experience-links"
      aria-labelledby="couple-experiences-title"
    >
      <h2 id="couple-experiences-title">{t('coupleExperiences.title')}</h2>
      <div>
        {(['happiness', 'timeTravel'] as const).map((kind) => {
          const path =
            kind === 'happiness' ? HAPPINESS_ROUTE : TIME_TRAVEL_ROUTE;
          return (
            <Link key={kind} to={path} onClick={(event) => onOpen(event, path)}>
              <EimirIcon
                name={kind === 'happiness' ? 'highlights' : 'kapitel'}
              />
              <span>
                <strong>{t(`coupleExperiences.entries.${kind}.title`)}</strong>
                <span>
                  {t(`coupleExperiences.entries.${kind}.description`)}
                </span>
              </span>
              <ProMark label={t('coupleExperiences.pro')} />
            </Link>
          );
        })}
        {extra}
      </div>
    </section>
  );
}
