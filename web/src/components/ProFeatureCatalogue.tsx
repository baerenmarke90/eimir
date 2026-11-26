import { useId } from 'react';
import type { MemoryWorldId } from '../api/generated/models/MemoryWorldId';
import { resolvedLocale, useTranslation } from '../i18n';
import { EimirIcon, type EimirIconName } from './EimirIcon';

/**
 * The ten Pro memory worlds in the order of the world choice. Story and Stapel
 * (`story`, `stack`) are Free. The catalogue names them through the existing
 * `memoryWorldSettings.worlds.*.name` keys instead of retyping them.
 */
export const PRO_MEMORY_WORLD_IDS = [
  'cloud',
  'mochi',
  'booth',
  'album',
  'stars',
  'post',
  'crate',
  'scratch',
  'jar',
  'fridge',
] as const satisfies readonly MemoryWorldId[];

/** Capabilities the catalogue marks as new (Pro showcase, #2310). */
const NEW_FEATURES: ReadonlySet<string> = new Set([
  'recaps',
  'games',
  'memoryWorlds',
  'storage',
]);

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
    features: ['wirDesigns', 'appIcons', 'personColours', 'memoryWorlds'],
  },
  {
    id: 'integrations',
    icon: 'photo-library',
    features: ['storage', 'photoSources', 'calendarSync'],
  },
] as const satisfies readonly {
  id: string;
  icon: EimirIconName;
  features: readonly string[];
}[];

export function ProFeatureCatalogue() {
  const { t } = useTranslation();
  const titleId = useId();
  const worlds = new Intl.ListFormat(resolvedLocale(), {
    type: 'conjunction',
  }).format(
    PRO_MEMORY_WORLD_IDS.map((id) => t(`memoryWorldSettings.worlds.${id}.name`)),
  );

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
                <dt>
                  <span>
                    {t(`proPaywall.catalogue.features.${feature}.title`)}
                  </span>
                  {NEW_FEATURES.has(feature) ? (
                    <span className="pro-feature-new">
                      {t('proPaywall.catalogue.new')}
                    </span>
                  ) : null}
                </dt>
                <dd>
                  {t(`proPaywall.catalogue.features.${feature}.body`, {
                    worlds,
                  })}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      ))}
    </section>
  );
}
