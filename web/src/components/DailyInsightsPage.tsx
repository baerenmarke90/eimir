import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useEffect, useId, useMemo } from 'react';
import { Link, NavLink, useLocation, useSearchParams } from 'react-router-dom';
import type { DailyCheckInsApi } from '../api/generated/apis/DailyCheckInsApi';
import type { DashboardApi } from '../api/generated/apis/DashboardApi';
import type { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import type { ProfilesApi } from '../api/generated/apis/ProfilesApi';
import type { AccountView } from '../api/generated/models/AccountView';
import {
  DAILY_INSIGHTS_CAPABILITY,
  dailyInsightsQueryKey,
  isInsightsContextUnavailable,
  isInsightsEntitlementRequired,
  loadDailyInsights,
  loadWeeklyBrief,
  weeklyBriefQueryKey,
} from '../client/dailyInsights';
import {
  addDays,
  daysInRange,
  type InsightDay,
  type IsoDate,
  isoToDate,
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
import type { ReferenceApis } from '../client/referenceFlow';
import {
  appRoutePath,
  MORE_INSIGHTS_PATTERNS_ROUTE,
  MORE_INSIGHTS_ROUTE,
  MORE_INSIGHTS_WEEK_ROUTE,
  settingsCategoryPath,
} from '../client/routes';
import {
  entitlementLoader,
  useSpaceCapability,
} from '../client/spaceEntitlement';
import { useProfileAvatarUrl } from '../client/useProfileAvatarUrl';
import { useTranslation } from '../i18n';
import { BackSlotHost, TaskBackLink } from './TaskBackButton';
import './DailyInsights.css';
import {
  formatMonthYear,
  formatWeekRange,
  InsightIcon,
  type InsightPerson,
  ProMark,
} from './DailyInsightsParts';
import { PatternsView, WeekView } from './DailyInsightsViews';
import { NativeDateInput } from './NativeDateField';
import { ProblemState } from './ProblemState';
import { UiState } from './UiState';
import { WeeklyBrief } from './WeeklyBrief';
import {
  ClearWeeklyInsightFeedback,
  WeeklyInsightCard,
} from './WeeklyInsightCard';

export type DailyInsightsViewId = 'brief' | 'week' | 'patterns';

interface DailyInsightsPageProps {
  view: DailyInsightsViewId;
  spaceId: string;
  account: AccountView;
  dailyCheckInsApi: DailyCheckInsApi;
  entitlementApi: EntitlementsApi;
  dashboardApi: DashboardApi;
  profilesApi?: ProfilesApi;
  mediaApis?: ReferenceApis;
  apiBaseUrl?: string;
}

const NAV_ITEMS = [
  {
    id: 'brief',
    to: MORE_INSIGHTS_ROUTE,
    labelKey: 'dailyInsights.nav.brief',
    end: true,
  },
  {
    id: 'week',
    to: MORE_INSIGHTS_WEEK_ROUTE,
    labelKey: 'dailyInsights.nav.week',
    end: true,
  },
  {
    id: 'patterns',
    to: MORE_INSIGHTS_PATTERNS_ROUTE,
    labelKey: 'dailyInsights.nav.patterns',
    end: false,
  },
] as const;

function PeriodPicker({
  view,
  label,
  selected,
  current,
  today,
  onSelect,
}: {
  view: DailyInsightsViewId;
  label: string;
  selected: IsoDate;
  current: IsoDate;
  today: IsoDate;
  onSelect: (date: IsoDate) => void;
}) {
  const datePickerId = useId();
  const offsets = selected === current ? [-2, -1, 0] : [-1, 0, 1];
  const periods = offsets.map((offset) =>
    view === 'patterns'
      ? shiftMonth(selected, offset)
      : addDays(selected, offset * 7),
  );
  return (
    <fieldset className="insight-picker">
      <legend className="sr-only">{label}</legend>
      {periods.map((date) => (
        <button
          key={date}
          type="button"
          aria-pressed={date === selected}
          onClick={() => onSelect(date)}
        >
          {view === 'patterns'
            ? formatMonthYear(date)
            : formatWeekRange(date, addDays(date, 6))}
        </button>
      ))}
      <label className="insight-date-picker" htmlFor={datePickerId}>
        <InsightIcon name="calendar" />
        <NativeDateInput
          id={datePickerId}
          aria-label={label}
          value={selected}
          max={today}
          onChange={(event) => onSelect(event.currentTarget.value)}
        />
      </label>
    </fieldset>
  );
}

function validPeriod(value: string | null, today: IsoDate): value is IsoDate {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value > today)
    return false;
  const date = isoToDate(value);
  return Number.isFinite(date.getTime()) && toIsoDate(date) === value;
}

function GateCard({ children }: { children?: ReactNode }) {
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
      {children}
      <TaskBackLink to={appRoutePath('today')}>
        {t('dailyInsights.gate.back')}
      </TaskBackLink>
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
  mediaApis,
  apiBaseUrl = '',
}: DailyInsightsPageProps) {
  const { t } = useTranslation();
  const { hash } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const loadEntitlement = useMemo(
    () => entitlementLoader(entitlementApi, spaceId),
    [entitlementApi, spaceId],
  );
  // Reuses the session's single entitlement read from app start.
  const capabilityQuery = useSpaceCapability({
    accountId: account.id,
    spaceId,
    load: loadEntitlement,
    capability: DAILY_INSIGHTS_CAPABILITY,
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

  const weekDate = searchParams.get('week');
  const monthDate = searchParams.get('month');
  const monday = today
    ? mondayOf(validPeriod(weekDate, today) ? weekDate : today)
    : null;
  const month = today
    ? monthStart(validPeriod(monthDate, today) ? monthDate : today)
    : null;

  function selectPeriod(date: IsoDate) {
    if (!today || !validPeriod(date, today)) return;
    const nextParams = new URLSearchParams(searchParams);
    if (view === 'patterns') nextParams.set('month', monthStart(date));
    else nextParams.set('week', mondayOf(date));
    setSearchParams(nextParams, { replace: true });
  }

  const range = useMemo(() => {
    if (monday === null || month === null) return null;
    if (view === 'patterns') return { start: month, end: monthEnd(month) };
    // The previous week rides along for the recap's comparison.
    return { start: addDays(monday, -7), end: addDays(monday, 6) };
  }, [monday, month, view]);

  const rangeQuery = useQuery({
    queryKey: dailyInsightsQueryKey(account.id, spaceId, range),
    queryFn: ({ signal }) =>
      loadDailyInsights(dailyCheckInsApi, spaceId, range, signal),
    enabled: capable && range !== null,
    retry: false,
    gcTime: 0,
    refetchOnMount: 'always',
  });

  const briefQuery = useQuery({
    queryKey: weeklyBriefQueryKey(account.id, spaceId, monday ?? ''),
    queryFn: ({ signal }) =>
      loadWeeklyBrief(dailyCheckInsApi, spaceId, monday ?? '', signal),
    enabled: capable && view === 'brief' && monday !== null,
    retry: false,
    gcTime: 0,
    refetchOnMount: 'always',
  });

  useEffect(() => {
    if (hash !== '#wochenrueckblick' || !rangeQuery.isSuccess) return;
    document.getElementById('wochenrueckblick')?.scrollIntoView?.();
  }, [hash, rangeQuery.isSuccess]);

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
    isInsightsEntitlementRequired(rangeQuery.error) ||
    isInsightsEntitlementRequired(briefQuery.error);
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
    body = (
      <GateCard>
        <ClearWeeklyInsightFeedback
          key={`${apiBaseUrl}:${account.id}:${spaceId}`}
          api={dailyCheckInsApi}
          spaceId={spaceId}
        />
      </GateCard>
    );
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
  } else if (!rangeQuery.data || monday === null || month === null) {
    body = <UiState kind="loading" title={t('dailyInsights.loading')} />;
  } else if (view === 'brief') {
    if (briefQuery.error) {
      body = (
        <ProblemState
          error={briefQuery.error}
          onRetry={() => void briefQuery.refetch()}
        />
      );
    } else if (!briefQuery.data) {
      body = (
        <UiState kind="loading" title={t('dailyInsights.brief.loading')} />
      );
    } else {
      body = (
        <WeeklyBrief
          key={monday}
          brief={briefQuery.data}
          days={daysInRange(allDays, weekDates(monday))}
          people={people}
          modules={modules}
          spaceId={spaceId}
          mediaApis={mediaApis ?? null}
          historySearch={searchParams.toString()}
        />
      );
    }
  } else if (view === 'patterns') {
    body = (
      <PatternsView
        key={month}
        days={daysInRange(allDays, monthDates(month))}
        people={people}
        modules={modules}
        monthDate={month}
      />
    );
  } else {
    const current = daysInRange(allDays, weekDates(monday));
    const previous = daysInRange(allDays, weekDates(addDays(monday, -7)));
    body = (
      <WeekView
        weeklyReview={
          <WeeklyInsightCard
            key={`${apiBaseUrl}:${account.id}:${spaceId}:${monday}`}
            api={dailyCheckInsApi}
            instance={apiBaseUrl}
            accountId={account.id}
            spaceId={spaceId}
            monday={monday}
          />
        }
        key={monday}
        days={current}
        previousDays={previous}
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
        {/* Back, title and Pro mark share one row (#1907 C4). */}
        <div className="insight-header-top">
          <BackSlotHost />
          <h1>{t('dailyInsights.title')}</h1>
          <ProMark />
        </div>
        <p className="insight-subtitle">{t('dailyInsights.week.subtitle')}</p>
      </header>

      {capable && !gated ? (
        <nav className="insight-nav" aria-label={t('dailyInsights.nav.label')}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.id}
              to={{ pathname: item.to, search: searchParams.toString() }}
              end={item.end}
            >
              {t(item.labelKey)}
            </NavLink>
          ))}
        </nav>
      ) : null}

      {!gated && today && monday && month ? (
        <PeriodPicker
          view={view}
          label={t(
            view === 'patterns'
              ? 'dailyInsights.patterns.monthPicker'
              : 'dailyInsights.week.picker',
          )}
          selected={view === 'patterns' ? month : monday}
          current={view === 'patterns' ? monthStart(today) : mondayOf(today)}
          today={today}
          onSelect={selectPeriod}
        />
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
