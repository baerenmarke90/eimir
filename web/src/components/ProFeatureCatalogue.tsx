import { useId } from 'react';
import { useTranslation } from '../i18n';
import { EimirIcon, type EimirIconName } from './EimirIcon';

const FEATURE_GROUPS = [
  {
    id: 'memories',
    icon: 'erinnerungen',
    features: ['memoryMap', 'recaps', 'passport', 'video'],
  },
  {
    id: 'timeTogether',
    icon: 'planen',
    features: ['dateIdeas', 'games', 'experiences'],
  },
  {
    id: 'everyday',
    icon: 'wir',
    features: ['quote', 'gestures', 'onceMessages', 'location'],
  },
  {
    id: 'style',
    icon: 'pen',
    features: ['wirDesigns', 'appIcons', 'personColours'],
  },
  {
    id: 'integrations',
    icon: 'photo-library',
    features: ['photoSources', 'calendarSync'],
  },
] as const satisfies readonly {
  id: string;
  icon: EimirIconName;
  features: readonly string[];
}[];

export function ProFeatureCatalogue() {
  const { t } = useTranslation();
  const titleId = useId();

  return (
    <section className="pro-feature-catalogue" aria-labelledby={titleId}>
      <h2 id={titleId}>{t('proPaywall.catalogue.title')}</h2>
      {FEATURE_GROUPS.map(({ id, icon, features }) => (
        <details key={id}>
          <summary>
            <EimirIcon name={icon} />
            <span>{t(`proPaywall.catalogue.groups.${id}`)}</span>
            <EimirIcon name="chevron-right" className="pro-feature-chevron" />
          </summary>
          <dl>
            {features.map((feature) => (
              <div key={feature}>
                <dt>{t(`proPaywall.catalogue.features.${feature}.title`)}</dt>
                <dd>{t(`proPaywall.catalogue.features.${feature}.body`)}</dd>
              </div>
            ))}
          </dl>
        </details>
      ))}
    </section>
  );
}
