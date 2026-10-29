import type { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import { useWirStatistics } from '../client/useWirStatistics';
import { useTranslation } from '../i18n';
import { PreferenceSwitch } from './PreferenceSwitch';
import { ProblemState } from './ProblemState';
import { ProMark } from './ProMark';

export function WirStatisticsSetting(props: {
  api: EntitlementsApi;
  instance: string;
  accountId: string;
  spaceId: string;
}) {
  const { t } = useTranslation();
  const preference = useWirStatistics(props);
  return (
    <section aria-labelledby="wir-statistics-setting">
      <h2 id="wir-statistics-setting">
        {t('relationshipReflections.passport.wirStatisticsTitle')}{' '}
        <ProMark label={t('relationshipReflections.passport.pro')} />
      </h2>
      <PreferenceSwitch
        label={t('relationshipReflections.passport.wirStatisticsToggle')}
        description={t('relationshipReflections.passport.wirStatisticsHelp')}
        checked={preference.enabled && preference.allowed}
        disabled={!preference.allowed}
        onCheckedChange={preference.setEnabled}
      />
      {preference.grant.error ? (
        <ProblemState
          error={preference.grant.error}
          onRetry={() => void preference.grant.refetch()}
        />
      ) : null}
      {!preference.grant.isPending &&
      !preference.allowed &&
      !preference.grant.error ? (
        <p>{t('relationshipReflections.passport.wirStatisticsPro')}</p>
      ) : null}
    </section>
  );
}
