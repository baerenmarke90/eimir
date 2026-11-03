import { useTranslation } from '../i18n';

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
    <fieldset className="planen-status-scope">
      <legend className="sr-only">
        {t(
          kind === 'plans'
            ? 'm5s3.overview.planScope'
            : 'm5s3.overview.wishScope',
        )}
      </legend>
      {(['OPEN', 'COMPLETED'] as const).map((status) => (
        <button
          key={status}
          type="button"
          className={value === status ? 'secondary' : 'tertiary'}
          aria-pressed={value === status}
          onClick={() => onChange(status)}
        >
          {t(
            status === 'OPEN'
              ? 'm5s3.wish.status.OPEN'
              : kind === 'plans'
                ? 'm5s3.overview.experiencedPlans'
                : 'm5s3.overview.fulfilledWishes',
          )}
        </button>
      ))}
    </fieldset>
  );
}
