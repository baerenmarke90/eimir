import { useTranslation } from '../i18n';
import { StatusScope } from './StatusScope';

export type PlanningScope = 'OPEN' | 'COMPLETED';
/** Wishes also show the planned ones that are on their way (#1790 F2). */
export type WishScope = PlanningScope | 'PLANNED';

/** Plans and Wishes share one visible lifecycle-scope interaction. */
export function PlanningStatusScope(
  props:
    | {
        kind: 'plans';
        value: PlanningScope;
        onChange: (value: PlanningScope) => void;
      }
    | {
        kind: 'wishes';
        value: WishScope;
        onChange: (value: WishScope) => void;
      },
) {
  const { t } = useTranslation();
  if (props.kind === 'plans') {
    return (
      <StatusScope
        label={t('m5s3.overview.planScope')}
        value={props.value}
        onChange={props.onChange}
        options={(['OPEN', 'COMPLETED'] as const).map((status) => ({
          value: status,
          label: t(
            status === 'OPEN'
              ? 'm5s3.wish.status.OPEN'
              : 'm5s3.overview.experiencedPlans',
          ),
        }))}
      />
    );
  }
  return (
    <StatusScope
      label={t('m5s3.overview.wishScope')}
      value={props.value}
      onChange={props.onChange}
      options={(['OPEN', 'PLANNED', 'COMPLETED'] as const).map((status) => ({
        value: status,
        label: t(
          status === 'OPEN'
            ? 'm5s3.wish.status.OPEN'
            : status === 'PLANNED'
              ? 'wishJourney.scopePlanned'
              : 'm5s3.overview.fulfilledWishes',
        ),
      }))}
    />
  );
}
