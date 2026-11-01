import { useTranslation } from '../i18n';

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
      <p>{t('profiles.premium.gamesTitle')}</p>
      <ul>
        {(['experiences', 'history', 'personal', 'photos'] as const).map(
          (feature) => (
            <li key={feature}>
              <strong>{t(`profiles.premium.features.${feature}.title`)}</strong>
              <p>{t(`profiles.premium.features.${feature}.body`)}</p>
            </li>
          ),
        )}
      </ul>
      <p>
        <strong>{t('profiles.premium.detailsTitle')}</strong>
      </p>
      <p>{t('profiles.premium.detailsBody')}</p>
    </section>
  );
}
