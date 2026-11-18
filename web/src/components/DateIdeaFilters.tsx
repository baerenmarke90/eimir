import { useRef, useState } from 'react';
import type { DateIdeaCatalog } from '../api/generated/models/DateIdeaCatalog';
import {
  BUDGET_LIMITS,
  type DateIdeasFilterState,
  formatEuros,
  formatMinutes,
  hasDateIdeasFilter,
  MINUTE_LIMITS,
  PLACE_FILTERS,
} from '../client/dateIdeas';
import { resolvedLocale, useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import { ShortTaskSheet } from './ShortTaskSheet';
import { StatusScope } from './StatusScope';

const ALL = '__all__';

type FilterKey = keyof DateIdeasFilterState;

/**
 * Curated date-idea filters (#1892, #1907 J1): the count and one `Filtern`
 * action sit right above the ideas; category, duration, budget and place live
 * in one sheet. Active filters stay visible as removable chips. Every choice
 * applies immediately and the groups combine by AND. Shared by discovery and
 * the shared selection's pick mode.
 */
export function DateIdeaFilters({
  catalog,
  filter,
  matchCount,
  onChange,
}: {
  catalog: Pick<DateIdeaCatalog, 'categories' | 'placeTypes' | 'totalCount'>;
  filter: DateIdeasFilterState;
  matchCount: number;
  onChange: (filter: DateIdeasFilterState) => void;
}) {
  const { t } = useTranslation();
  const locale = resolvedLocale();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const categoryLabels = new Map(
    catalog.categories.map((item) => [item.id, item.label]),
  );
  const placeLabels = new Map(
    catalog.placeTypes.map((item) => [item.id, item.label]),
  );
  const minutesLabel = (limit: number) =>
    t('dateIdeas.filters.upTo', { value: formatMinutes(limit, locale) });
  const budgetLabel = (limit: number) =>
    limit === 0
      ? t('dateIdeas.filters.free')
      : t('dateIdeas.filters.upTo', { value: formatEuros(limit, locale) });
  const active: { key: FilterKey; label: string }[] = [
    ...(filter.category
      ? [
          {
            key: 'category' as const,
            label: categoryLabels.get(filter.category) ?? filter.category,
          },
        ]
      : []),
    ...(filter.maxMinutes !== undefined
      ? [{ key: 'maxMinutes' as const, label: minutesLabel(filter.maxMinutes) }]
      : []),
    ...(filter.maxBudget !== undefined
      ? [{ key: 'maxBudget' as const, label: budgetLabel(filter.maxBudget) }]
      : []),
    ...(filter.place
      ? [
          {
            key: 'place' as const,
            label: placeLabels.get(filter.place) ?? filter.place,
          },
        ]
      : []),
  ];
  const choose = (key: FilterKey, value: string) =>
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
      <div className="date-ideas-filter-bar">
        <p className="date-ideas-count" role="status">
          {hasDateIdeasFilter(filter)
            ? t('dateIdeas.countFiltered', {
                count: matchCount,
                total: catalog.totalCount,
              })
            : t('dateIdeas.count', { count: catalog.totalCount })}
        </p>
        <button
          ref={trigger}
          type="button"
          className="secondary date-ideas-filter-open"
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
        >
          <EimirIcon name="filter" />
          {active.length
            ? t('dateIdeas.filters.openActive', { count: active.length })
            : t('dateIdeas.filters.open')}
        </button>
      </div>
      {active.length ? (
        <ul
          className="date-ideas-active-filters"
          aria-label={t('dateIdeas.filters.active')}
        >
          {active.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                className="date-ideas-active-filter"
                aria-label={t('dateIdeas.filters.remove', {
                  label: item.label,
                })}
                onClick={() => choose(item.key, ALL)}
              >
                <span aria-hidden="true">{item.label}</span>
                <EimirIcon name="close" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <ShortTaskSheet
        open={open}
        title={t('dateIdeas.filters.label')}
        onClose={() => setOpen(false)}
        restoreFocusRef={trigger}
        className="date-ideas-filter-sheet"
        footer={
          <div className="date-ideas-filter-sheet-actions">
            <button type="button" onClick={() => setOpen(false)}>
              {t('dateIdeas.filters.show', { count: matchCount })}
            </button>
            {hasDateIdeasFilter(filter) ? (
              <button
                type="button"
                className="tertiary date-ideas-reset"
                onClick={() => onChange({})}
              >
                {t('dateIdeas.filters.reset')}
              </button>
            ) : null}
          </div>
        }
      >
        <div className="date-ideas-filter-groups">
          <p className="date-ideas-filter-label" aria-hidden="true">
            {t('dateIdeas.filters.categoryLegend')}
          </p>
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
                label: minutesLabel(limit),
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
                label: budgetLabel(limit),
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
      </ShortTaskSheet>
    </section>
  );
}
