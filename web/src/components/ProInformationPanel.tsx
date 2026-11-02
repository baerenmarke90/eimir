import { useTranslation } from '../i18n';
import { EimirIcon, type EimirIconName } from './EimirIcon';

/** Product information only; capability checks remain server-owned. */
export function ProInformationPanel() {
  const { t } = useTranslation();
  return (
    <section
      id="eimir-pro"
      className="settings-pro-information"
      aria-labelledby="settings-pro-title"
    >
      <h2 id="settings-pro-title">{t('profiles.premium.title')}</h2>
      <div className="settings-pro-surface">
        <div className="settings-pro-lead">
          <EimirIcon name="pro" variant="duotone" />
          <div>
            <h3>{t('profiles.premium.detailsTitle')}</h3>
            <p>{t('profiles.premium.gamesTitle')}</p>
          </div>
        </div>
        <ul>
          {(
            [
              ['experiences', 'spiele'],
              ['history', 'erinnerungen'],
              ['personal', 'quote'],
              ['photos', 'foto'],
            ] satisfies [string, EimirIconName][]
          ).map(([feature, icon]) => (
            <li key={feature}>
              <EimirIcon name={icon} />
              <div>
                <strong>
                  {t(`profiles.premium.features.${feature}.title`)}
                </strong>
                <p>{t(`profiles.premium.features.${feature}.body`)}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="settings-pro-assurance">
          {t('profiles.premium.detailsBody')}
        </p>
      </div>
    </section>
  );
}
