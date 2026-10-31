import type { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import { useWirStatistics } from '../client/useWirStatistics';
import { useTranslation } from '../i18n';
import { ProblemState } from './ProblemState';

export function WirStatisticsSetting(props: {
  api: EntitlementsApi;
  instance: string;
  accountId: string;
  spaceId: string;
}) {
  const { t } = useTranslation();
  const preference = useWirStatistics(props);
  return (
    <div className="dashboard-module-control">
      <label className="dashboard-module-switch">
        <input
          type="checkbox"
          aria-label={t('relationshipReflections.passport.wirStatisticsTitle')}
          checked={preference.enabled && preference.allowed}
          disabled={!preference.allowed}
          onChange={(event) => preference.setEnabled(event.target.checked)}
        />
      </label>
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
    </div>
  );
}
