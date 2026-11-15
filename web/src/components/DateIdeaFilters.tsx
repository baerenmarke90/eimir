import { useId } from 'react';
import type { DateIdeaCatalog } from '../api/generated/models/DateIdeaCatalog';
import {
  BUDGET_LIMITS,
  type DateIdeasFilterState,
  formatEuros,
  formatMinutes,
  hasDateIdeasFilter,
  MINUTE_LIMITS,
  PLACE_FILTERS,
  secondaryFilterCount,
} from '../client/dateIdeas';
import { resolvedLocale, useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import { StatusScope } from './StatusScope';

const ALL = '__all__';

/**
 * Curated date-idea filters (#1892): category first, duration/budget/place in
 * a disclosure. Shared by discovery and the shared selection picker; every
 * choice applies immediately and one group combines with the others by AND.
 */
export function DateIdeaFilters({
  catalog,
  filter,
  matchCount,
  moreOpen,
  onMoreOpenChange,
  onChange,
}: {
  catalog: Pick<DateIdeaCatalog, 'categories' | 'placeTypes' | 'totalCount'>;
  filter: DateIdeasFilterState;
  matchCount: number;
  moreOpen: boolean;
  onMoreOpenChange: (open: boolean) => void;
  onChange: (filter: DateIdeasFilterState) => void;
}) {
  const { t } = useTranslation();
  const locale = resolvedLocale();
  const moreId = useId();
  const placeLabels = new Map(
    catalog.placeTypes.map((item) => [item.id, item.label]),
  );
  const moreCount = secondaryFilterCount(filter);
  const choose = (key: keyof DateIdeasFilterState, value: string) =>
    onChange({
      ...filter,
      [key]:
        value === ALL
          ? undefined
          : key === 'maxMinutes' || key === 'maxBudget'
            ? Number(value)
            : value,
    });
  return (
    <section
      className="date-ideas-filters"
      aria-label={t('dateIdeas.filters.label')}
    >
      <StatusScope
        label={t('dateIdeas.filters.categoryLegend')}
        value={filter.category ?? ALL}
        options={[
          { value: ALL, label: t('dateIdeas.filters.all') },
          ...catalog.categories.map((item) => ({
            value: item.id,
            label: item.label,
          })),
        ]}
        onChange={(value) => choose('category', value)}
      />
      <div className="date-ideas-filter-bar">
        <button
          type="button"
          className="tertiary date-ideas-more"
          aria-expanded={moreOpen}
          aria-controls={moreId}
          onClick={() => onMoreOpenChange(!moreOpen)}
        >
          <EimirIcon name="filter" />
          {moreCount
            ? t('dateIdeas.filters.moreActive', { count: moreCount })
            : t('dateIdeas.filters.more')}
        </button>
        <p className="date-ideas-count" role="status">
          {hasDateIdeasFilter(filter)
            ? t('dateIdeas.countFiltered', {
                count: matchCount,
                total: catalog.totalCount,
              })
            : t('dateIdeas.count', { count: catalog.totalCount })}
        </p>
      </div>
      <div
        id={moreId}
        className="date-ideas-more-filters eimir-motion-disclosure"
        hidden={!moreOpen}
      >
        <p className="date-ideas-filter-label" aria-hidden="true">
          {t('dateIdeas.filters.durationLegend')}
        </p>
        <StatusScope
          label={t('dateIdeas.filters.durationLegend')}
          value={String(filter.maxMinutes ?? ALL)}
          options={[
            { value: ALL, label: t('dateIdeas.filters.anyDuration') },
            ...MINUTE_LIMITS.map((limit) => ({
              value: String(limit),
              label: t('dateIdeas.filters.upTo', {
                value: formatMinutes(limit, locale),
              }),
            })),
          ]}
          onChange={(value) => choose('maxMinutes', value)}
        />
        <p className="date-ideas-filter-label" aria-hidden="true">
          {t('dateIdeas.filters.budgetLegend')}
        </p>
        <StatusScope
          label={t('dateIdeas.filters.budgetLegend')}
          value={String(filter.maxBudget ?? ALL)}
          options={[
            { value: ALL, label: t('dateIdeas.filters.anyBudget') },
            ...BUDGET_LIMITS.map((limit) => ({
              value: String(limit),
              label:
                limit === 0
                  ? t('dateIdeas.filters.free')
                  : t('dateIdeas.filters.upTo', {
                      value: formatEuros(limit, locale),
                    }),
            })),
          ]}
          onChange={(value) => choose('maxBudget', value)}
        />
        <p className="date-ideas-filter-label" aria-hidden="true">
          {t('dateIdeas.filters.placeLegend')}
        </p>
        <StatusScope
          label={t('dateIdeas.filters.placeLegend')}
          value={filter.place ?? ALL}
          options={[
            { value: ALL, label: t('dateIdeas.filters.anywhere') },
            ...PLACE_FILTERS.map((place) => ({
              value: place,
              label: placeLabels.get(place) ?? place,
            })),
          ]}
          onChange={(value) => choose('place', value)}
        />
      </div>
      {hasDateIdeasFilter(filter) ? (
        <button
          type="button"
          className="tertiary date-ideas-reset"
          onClick={() => {
            onMoreOpenChange(false);
            onChange({});
          }}
        >
          {t('dateIdeas.filters.reset')}
        </button>
      ) : null}
    </section>
  );
}
