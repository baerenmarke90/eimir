import { Link } from 'react-router-dom';
import { REFERENCE_PRO_PLANS } from '../client/proBilling';
import { proPaywallPath } from '../client/routes';
import { resolvedLocale, useTranslation } from '../i18n';
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
        <p className="settings-pro-prices">
          {REFERENCE_PRO_PLANS.map((plan) =>
            t(`proPaywall.plans.${plan.id}.price`, {
              price: new Intl.NumberFormat(resolvedLocale(), {
                style: 'currency',
                currency: plan.currency,
              }).format(plan.amount),
            }),
          ).join(' · ')}
          {' · '}
          {t('proPaywall.forBoth')}
        </p>
        <Link className="button-link secondary-link" to={proPaywallPath()}>
          {t('proPaywall.settingsAction')}
        </Link>
      </div>
    </section>
  );
}
