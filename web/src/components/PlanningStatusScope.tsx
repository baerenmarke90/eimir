import { useTranslation } from '../i18n';
import { StatusScope } from './StatusScope';

export type PlanningScope = 'OPEN' | 'COMPLETED';

/** Plans and Wishes share one visible lifecycle-scope interaction. */
export function PlanningStatusScope({
  kind,
  value,
  onChange,
}: {
  kind: 'plans' | 'wishes';
  value: PlanningScope;
  onChange: (value: PlanningScope) => void;
}) {
  const { t } = useTranslation();
  return (
    <StatusScope
      label={t(
        kind === 'plans'
          ? 'm5s3.overview.planScope'
          : 'm5s3.overview.wishScope',
      )}
      value={value}
      onChange={onChange}
      options={(['OPEN', 'COMPLETED'] as const).map((status) => ({
        value: status,
        label: t(
          status === 'OPEN'
            ? 'm5s3.wish.status.OPEN'
            : kind === 'plans'
              ? 'm5s3.overview.experiencedPlans'
              : 'm5s3.overview.fulfilledWishes',
        ),
      }))}
    />
  );
}
