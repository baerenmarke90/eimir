import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useMemo, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import type { DailyCheckInsApi } from '../api/generated/apis/DailyCheckInsApi';
import type { DashboardApi } from '../api/generated/apis/DashboardApi';
import type { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import type { ProfilesApi } from '../api/generated/apis/ProfilesApi';
import type { AccountView } from '../api/generated/models/AccountView';
import {
  dailyInsightsEntitlementQueryKey,
  dailyInsightsQueryKey,
  isInsightsContextUnavailable,
  isInsightsEntitlementRequired,
  loadDailyInsights,
  loadDailyInsightsCapability,
} from '../client/dailyInsights';
import {
  addDays,
  daysInRange,
  type InsightDay,
  type IsoDate,
  mondayOf,
  monthEnd,
  monthStart,
  projectInsightDays,
  shiftMonth,
  toIsoDate,
  weekDates,
} from '../client/dailyInsightsModel';
import { dashboardQueryKey } from '../client/dashboardQueries';
import { firstNameFromDisplayName } from '../client/personalName';
import {
  appRoutePath,
  MORE_INSIGHTS_PATTERNS_ROUTE,
  MORE_INSIGHTS_RECAP_ROUTE,
  MORE_INSIGHTS_ROUTE,
  settingsCategoryPath,
} from '../client/routes';
import { useProfileAvatarUrl } from '../client/useProfileAvatarUrl';
import { useTranslation } from '../i18n';
import './DailyInsights.css';
import {
  formatDayMonth,
  formatMonthYear,
  Handwriting,
  InsightIcon,
  type InsightPerson,
  ProMark,
} from './DailyInsightsParts';
import { PatternsView, RecapView, WeekView } from './DailyInsightsViews';
import { ProblemState } from './ProblemState';
import { UiState } from './UiState';

export type DailyInsightsViewId = 'week' | 'patterns' | 'recap';

interface DailyInsightsPageProps {
  view: DailyInsightsViewId;
  spaceId: string;
  account: AccountView;
  dailyCheckInsApi: DailyCheckInsApi;
  entitlementApi: EntitlementsApi;
  dashboardApi: DashboardApi;
  profilesApi?: ProfilesApi;
}

const NAV_ITEMS = [
  {
    id: 'week',
    to: MORE_INSIGHTS_ROUTE,
    labelKey: 'dailyInsights.nav.week',
    end: true,
  },
  {
    id: 'patterns',
    to: MORE_INSIGHTS_PATTERNS_ROUTE,
    labelKey: 'dailyInsights.nav.patterns',
    end: false,
  },
  {
    id: 'recap',
    to: MORE_INSIGHTS_RECAP_ROUTE,
    labelKey: 'dailyInsights.nav.recap',
    end: false,
  },
] as const;

function PeriodPicker({
  label,
  text,
  previousLabel,
  nextLabel,
  canGoNext,
  onPrevious,
  onNext,
}: {
  label: string;
  text: string;
  previousLabel: string;
  nextLabel: string;
  canGoNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <fieldset className="insight-picker">
      <legend className="sr-only">{label}</legend>
      <button type="button" onClick={onPrevious} aria-label={previousLabel}>
        <span aria-hidden="true">‹</span>
      </button>
      <span className="insight-picker-text" aria-live="polite">
        {text}
      </span>
      <button
        type="button"
        onClick={onNext}
        aria-label={nextLabel}
        disabled={!canGoNext}
      >
        <span aria-hidden="true">›</span>
      </button>
    </fieldset>
  );
}

function GateCard() {
  const { t } = useTranslation();
  return (
    <section
      className="insight-card insight-gate"
      aria-labelledby="insight-gate-title"
    >
      <h2 id="insight-gate-title">{t('dailyInsights.gate.title')}</h2>
      <p>{t('dailyInsights.gate.body')}</p>
      <p className="insight-gate-reassurance">
        {t('dailyInsights.gate.freeNote')}
      </p>
      <p className="insight-gate-reassurance">
        {t('dailyInsights.gate.keptNote')}
      </p>
      <Link className="insight-link" to={appRoutePath('today')}>
        {t('dailyInsights.gate.back')}
      </Link>
    </section>
  );
}

function ModulesOffCard() {
  const { t } = useTranslation();
  return (
    <section
      className="insight-card insight-gate"
      aria-labelledby="insight-off-title"
    >
      <h2 id="insight-off-title">{t('dailyInsights.modulesOff.title')}</h2>
      <p>{t('dailyInsights.modulesOff.body')}</p>
      <Link className="insight-link" to={settingsCategoryPath('relationship')}>
        {t('dailyInsights.modulesOff.settings')}
      </Link>
    </section>
  );
}

/**
 * Pro Vibe/Energy insights (#1151).
 *
 * The Space's `daily.insights` capability comes from the server entitlement
 * projection, and the insights endpoint enforces it again; there is no local
 * Pro flag. Space modules stay a separate authority: this page only renders
 * the dimensions the server reports as enabled and never re-enables one.
 */
export function DailyInsightsPage({
  view,
  spaceId,
  account,
  dailyCheckInsApi,
  entitlementApi,
  dashboardApi,
  profilesApi,
}: DailyInsightsPageProps) {
  const { t } = useTranslation();
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);

  const capabilityQuery = useQuery({
    queryKey: dailyInsightsEntitlementQueryKey(account.id, spaceId),
    queryFn: ({ signal }) =>
      loadDailyInsightsCapability(entitlementApi, spaceId, signal),
    retry: false,
    gcTime: 0,
    refetchOnMount: 'always',
  });
  const capable = capabilityQuery.data === true;

  // Without an explicit range the server resolves "today" in the Space's own
  // time zone; that authoritative day anchors every calendar computation.
  const anchorQuery = useQuery({
    queryKey: dailyInsightsQueryKey(account.id, spaceId, null),
    queryFn: ({ signal }) =>
      loadDailyInsights(dailyCheckInsApi, spaceId, null, signal),
    enabled: capable,
    retry: false,
    gcTime: 0,
    refetchOnMount: 'always',
  });
  const today: IsoDate | null = anchorQuery.data
    ? toIsoDate(anchorQuery.data.endDate)
    : null;

  const range = useMemo(() => {
    if (today === null) return null;
    if (view === 'patterns') {
      const anchor = shiftMonth(today, monthOffset);
      return { start: monthStart(anchor), end: monthEnd(anchor) };
    }
    const monday = addDays(mondayOf(today), weekOffset * 7);
    // The previous week rides along for the recap's comparison.
    return { start: addDays(monday, -7), end: addDays(monday, 6) };
  }, [today, view, weekOffset, monthOffset]);

  const rangeQuery = useQuery({
    queryKey: dailyInsightsQueryKey(account.id, spaceId, range),
    queryFn: ({ signal }) =>
      loadDailyInsights(dailyCheckInsApi, spaceId, range, signal),
    enabled: capable && range !== null,
    retry: false,
    gcTime: 0,
    refetchOnMount: 'always',
  });

  const dashboardQuery = useQuery({
    queryKey: dashboardQueryKey(spaceId),
    queryFn: () => dashboardApi.getDashboard({ spaceId }),
    retry: false,
  });
  const partner = dashboardQuery.data?.space.partner ?? null;
  const ownProfileQuery = useQuery({
    queryKey: ['profile-identity', spaceId, account.id],
    queryFn: () =>
      profilesApi
        ? profilesApi.getPartnerProfileApiV1SpacesSpaceIdProfilesAccountIdGet({
            accountId: account.id,
            spaceId,
          })
        : null,
    enabled: Boolean(profilesApi),
    retry: false,
  });
  const partnerProfileQuery = useQuery({
    queryKey: ['profile-identity', spaceId, partner?.id],
    queryFn: () =>
      profilesApi && partner?.id
        ? profilesApi.getPartnerProfileApiV1SpacesSpaceIdProfilesAccountIdGet({
            accountId: partner.id,
            spaceId,
          })
        : null,
    enabled: Boolean(profilesApi && partner?.id),
    retry: false,
  });
  const ownAvatar = useProfileAvatarUrl(
    profilesApi,
    spaceId,
    account.id,
    ownProfileQuery.data?.profileAttachmentId,
  );
  const partnerAvatar = useProfileAvatarUrl(
    profilesApi,
    spaceId,
    partner?.id ?? '',
    partnerProfileQuery.data?.profileAttachmentId,
  );

  const allDays: InsightDay[] = useMemo(
    () => (rangeQuery.data ? projectInsightDays(rangeQuery.data) : []),
    [rangeQuery.data],
  );
  const partnerPresent =
    partner !== null ||
    allDays.some(
      (day) => day.partner.vibe !== null || day.partner.energy !== null,
    );
  const people: InsightPerson[] = [
    {
      key: 'own',
      name: firstNameFromDisplayName(
        account.displayName,
        t('dailyInsights.people.you'),
      ),
      imageUrl: ownAvatar.avatarUrl,
    },
    ...(partnerPresent
      ? [
          {
            key: 'partner' as const,
            name: firstNameFromDisplayName(
              partner?.displayName,
              t('dailyInsights.people.partnerFallback'),
            ),
            imageUrl: partnerAvatar.avatarUrl,
          },
        ]
      : []),
  ];

  const gated =
    capabilityQuery.data === false ||
    isInsightsEntitlementRequired(anchorQuery.error) ||
    isInsightsEntitlementRequired(rangeQuery.error);
  const modulesOff =
    anchorQuery.data !== undefined &&
    !anchorQuery.data.vibeEnabled &&
    !anchorQuery.data.energyEnabled;
  const modules = {
    vibe:
      rangeQuery.data?.vibeEnabled ?? anchorQuery.data?.vibeEnabled ?? false,
    energy:
      rangeQuery.data?.energyEnabled ??
      anchorQuery.data?.energyEnabled ??
      false,
  };

  const monday =
    today === null ? null : addDays(mondayOf(today), weekOffset * 7);
  const monthAnchor = today === null ? null : shiftMonth(today, monthOffset);

  const title =
    view === 'patterns'
      ? t('dailyInsights.patterns.title')
      : view === 'recap'
        ? t('dailyInsights.recap.title')
        : t('dailyInsights.week.title');
  const subtitle =
    view === 'patterns'
      ? t('dailyInsights.patterns.subtitle')
      : view === 'recap'
        ? t('dailyInsights.recap.subtitle')
        : t('dailyInsights.week.subtitle');
  const accent =
    view === 'patterns'
      ? t('dailyInsights.patterns.handwriting')
      : view === 'recap'
        ? t('dailyInsights.recap.handwriting')
        : t('dailyInsights.week.handwriting');

  let picker: ReactNode = null;
  if (monday !== null && view !== 'patterns') {
    picker = (
      <PeriodPicker
        label={t('dailyInsights.week.picker')}
        text={t('dailyInsights.week.range', {
          start: formatDayMonth(monday),
          end: formatDayMonth(addDays(monday, 6)),
        })}
        previousLabel={t('dailyInsights.week.previous')}
        nextLabel={t('dailyInsights.week.next')}
        canGoNext={weekOffset < 0}
        onPrevious={() => setWeekOffset((offset) => offset - 1)}
        onNext={() => setWeekOffset((offset) => Math.min(0, offset + 1))}
      />
    );
  } else if (monthAnchor !== null && view === 'patterns') {
    picker = (
      <PeriodPicker
        label={t('dailyInsights.patterns.monthPicker')}
        text={formatMonthYear(monthAnchor)}
        previousLabel={t('dailyInsights.patterns.previous')}
        nextLabel={t('dailyInsights.patterns.next')}
        canGoNext={monthOffset < 0}
        onPrevious={() => setMonthOffset((offset) => offset - 1)}
        onNext={() => setMonthOffset((offset) => Math.min(0, offset + 1))}
      />
    );
  }

  let body: ReactNode;
  if (capabilityQuery.isPending) {
    body = <UiState kind="loading" title={t('dailyInsights.loading')} />;
  } else if (capabilityQuery.error) {
    body = (
      <ProblemState
        error={capabilityQuery.error}
        onRetry={() => void capabilityQuery.refetch()}
      />
    );
  } else if (gated) {
    body = <GateCard />;
  } else if (isInsightsContextUnavailable(anchorQuery.error)) {
    body = (
      <UiState
        kind="empty"
        title={t('dailyInsights.contextUnavailable.title')}
        body={t('dailyInsights.contextUnavailable.body')}
      />
    );
  } else if (anchorQuery.error) {
    body = (
      <ProblemState
        error={anchorQuery.error}
        onRetry={() => void anchorQuery.refetch()}
      />
    );
  } else if (anchorQuery.isPending) {
    body = <UiState kind="loading" title={t('dailyInsights.loading')} />;
  } else if (modulesOff) {
    body = <ModulesOffCard />;
  } else if (rangeQuery.error) {
    body = (
      <ProblemState
        error={rangeQuery.error}
        onRetry={() => void rangeQuery.refetch()}
      />
    );
  } else if (!rangeQuery.data || monday === null || monthAnchor === null) {
    body = <UiState kind="loading" title={t('dailyInsights.loading')} />;
  } else if (view === 'patterns') {
    body = (
      <PatternsView
        key={monthAnchor}
        days={daysInRange(allDays, monthDates(monthAnchor))}
        people={people}
        modules={modules}
        monthDate={monthAnchor}
      />
    );
  } else {
    const current = daysInRange(allDays, weekDates(monday));
    const previous = daysInRange(allDays, weekDates(addDays(monday, -7)));
    body =
      view === 'recap' ? (
        <RecapView
          key={monday}
          days={current}
          previousDays={previous}
          people={people}
          modules={modules}
        />
      ) : (
        <WeekView
          key={monday}
          days={current}
          people={people}
          modules={modules}
        />
      );
  }

  const showSingleModuleNote =
    !gated &&
    !modulesOff &&
    rangeQuery.data !== undefined &&
    modules.vibe !== modules.energy;

  return (
    <div className="page daily-insights" data-view={view}>
      <header className="insight-header">
        <div className="insight-header-top">
          <ProMark />
          <Handwriting>{accent}</Handwriting>
        </div>
        <h1>{title}</h1>
        <p className="insight-subtitle">{subtitle}</p>
        {!gated ? picker : null}
      </header>

      {capable && !gated ? (
        <nav className="insight-nav" aria-label={t('dailyInsights.nav.label')}>
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.id} to={item.to} end={item.end}>
              {t(item.labelKey)}
            </NavLink>
          ))}
        </nav>
      ) : null}

      {showSingleModuleNote ? (
        <p className="insight-note">
          <InsightIcon name="sparkle" className="insight-title-icon" />
          {modules.vibe
            ? t('dailyInsights.modulesOff.energyOff')
            : t('dailyInsights.modulesOff.vibeOff')}
        </p>
      ) : null}

      <div className="insight-body">{body}</div>
    </div>
  );
}

function monthDates(anchor: IsoDate): IsoDate[] {
  const start = monthStart(anchor);
  const end = monthEnd(anchor);
  const dates: IsoDate[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) dates.push(date);
  return dates;
}
