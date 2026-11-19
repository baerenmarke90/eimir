import type { MouseEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { HAPPINESS_ROUTE, TIME_TRAVEL_ROUTE } from '../client/routes';
import { useHideProFeatureMarks } from '../client/proPresentation';
import { useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import { ProMark } from './ProMark';
import './CoupleExperiences.css';

const ENTRIES = [
  { kind: 'happiness', path: HAPPINESS_ROUTE, icon: 'highlights' },
  { kind: 'timeTravel', path: TIME_TRAVEL_ROUTE, icon: 'kapitel' },
] as const;

/**
 * The Discover group of guided couple experiences (#1907 F4): one quiet list
 * whose rows share a single anatomy. A contextual lead, such as a new recap,
 * may sit above the list; the couple's story overview lives on Wir and More.
 */
export function CoupleExperienceLinks({
  onOpen,
  lead,
}: {
  onOpen: (event: MouseEvent<HTMLAnchorElement>, to: string) => void;
  /** Optional contextual card above the permanent rows. */
  lead?: ReactNode;
}) {
  const { t } = useTranslation();
  // Pro marks are only decorative; with Pro the row ends in a chevron instead.
  const proActive = useHideProFeatureMarks();
  return (
    <section
      className="couple-experience-links"
      aria-labelledby="couple-experiences-title"
    >
      <h2 id="couple-experiences-title">{t('coupleExperiences.title')}</h2>
      {lead}
      <ul className="couple-experience-list">
        {ENTRIES.map(({ kind, path, icon }) => (
          <li key={kind}>
            <Link to={path} onClick={(event) => onOpen(event, path)}>
              <span className="couple-experience-symbol" aria-hidden="true">
                <EimirIcon name={icon} />
              </span>
              <span className="couple-experience-copy">
                <strong>{t(`coupleExperiences.entries.${kind}.title`)}</strong>
                <span>
                  {t(`coupleExperiences.entries.${kind}.description`)}
                </span>
              </span>
              {proActive ? (
                <EimirIcon
                  name="chevron-right"
                  className="couple-experience-chevron"
                />
              ) : (
                <ProMark label={t('coupleExperiences.pro')} />
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
