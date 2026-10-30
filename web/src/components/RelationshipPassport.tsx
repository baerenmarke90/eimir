import { dashboardItemTitle } from '../client/dashboardPresentation';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { DashboardApi } from '../api/generated/apis/DashboardApi';
import { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import { ProfilesApi } from '../client/mediaApis';
import type { ProfilePageProps } from './ProfilePage';
import type { RelationshipPassportView } from '../api/generated/models/RelationshipPassportView';
import type { DashboardRelationshipDuration } from '../api/generated/models/DashboardRelationshipDuration';
import { dashboardItemPath } from '../client/m4Product';
import {
  passportHighlights,
  passportLandmarks,
} from '../client/relationshipPassport';
import { textExcerpt } from '../client/textExcerpt';
import { OVERVIEW_GC_TIME } from '../client/useWarmOverviewQuery';
import { Configuration } from '../client/apiConfiguration';
import {
  ClientProblemError,
  normalizeClientError,
} from '../client/problemDetails';
import { usePartnerNickname } from '../client/partnerNickname';
import { useProfileAvatarUrl } from '../client/useProfileAvatarUrl';
import { MORE_PLACES_ROUTE } from '../client/routes';
import { resolvedLocale, useTranslation } from '../i18n';
import { PartnerAvatarPair } from './PartnerAvatarPair';
import { ProMark } from './ProMark';
import { PreferenceSwitch } from './PreferenceSwitch';
import {
  passportStatisticsKey,
  readPassportStatisticsPreference,
  savePassportStatisticsPreference,
} from '../client/passportPreferences';
import { ProblemState } from './ProblemState';
import './RelationshipReflections.css';

const CAPABILITY = 'relationship.passport';
export function RelationshipPassport(props: ProfilePageProps) {
  const { t } = useTranslation();
  const apis = useMemo(() => {
    const configuration = new Configuration({
      basePath: props.apiBaseUrl,
      headers: { Authorization: `Bearer ${props.accessToken}` },
    });
    return {
      dashboard: new DashboardApi(configuration),
      entitlements: new EntitlementsApi(configuration),
      profiles: new ProfilesApi(configuration),
    };
  }, [props.apiBaseUrl, props.accessToken]);
  const capability = useQuery({
    queryKey: [
      'relationship-passport',
      'entitlement',
      props.account.id,
      props.spaceId,
    ],
    queryFn: async ({ signal }) => {
      try {
        const view =
          await apis.entitlements.getSpaceEntitlementsApiV1SpacesSpaceIdEntitlementsGet(
            { spaceId: props.spaceId },
            { signal },
          );
        return view.capabilities.includes(CAPABILITY);
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    retry: false,
    gcTime: OVERVIEW_GC_TIME,
    refetchOnMount: 'always',
  });
  return (
    <section
      className="relationship-passport"
      aria-labelledby="relationship-passport-title"
    >
      <div className="passport-title">
        <h2 id="relationship-passport-title">
          {t('relationshipReflections.passport.title')}
        </h2>
        <ProMark label={t('relationshipReflections.passport.pro')} />
      </div>
      {capability.isPending ? (
        <p role="status">{t('states.loading.title')}</p>
      ) : capability.error ? (
        <ProblemState
          error={capability.error}
          onRetry={() => void capability.refetch()}
        />
      ) : capability.data === true ? (
        <PassportRead
          key={`${props.account.id}:${props.spaceId}`}
          {...props}
          apis={apis}
        />
      ) : (
        <PassportProEntry />
      )}
    </section>
  );
}

function PassportProEntry() {
  const { t } = useTranslation();
  return (
    <div className="passport-pro-entry">
      <p>{t('relationshipReflections.passport.locked')}</p>
      <p className="passport-support">
        {t('relationshipReflections.passport.dataRights')}
      </p>
      <a href="#profile-premium">
        {t('relationshipReflections.passport.learnMore')}
      </a>
    </div>
  );
}

function PassportRead({
  apis,
  ...props
}: ProfilePageProps & {
  apis: { dashboard: DashboardApi; profiles: ProfilesApi };
}) {
  const { t } = useTranslation();
  const read = useQuery({
    queryKey: [
      'relationship-passport',
      'read',
      props.account.id,
      props.spaceId,
    ],
    queryFn: async ({ signal }) => {
      try {
        return await apis.dashboard.getRelationshipPassport(
          { spaceId: props.spaceId },
          { signal },
        );
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    retry: false,
    gcTime: OVERVIEW_GC_TIME,
    refetchOnMount: 'always',
  });
  if (
    read.error instanceof ClientProblemError &&
    read.error.code === 'PREMIUM_ENTITLEMENT_REQUIRED'
  )
    return <PassportProEntry />;
  if (
    read.error &&
    (!read.data ||
      (read.error instanceof ClientProblemError &&
        ['unauthorized', 'permission', 'notFound'].includes(read.error.kind)))
  )
    return (
      <ProblemState error={read.error} onRetry={() => void read.refetch()} />
    );
  if (!read.data) return <p role="status">{t('states.loading.title')}</p>;
  return (
    <>
      {read.error ? (
        <ProblemState error={read.error} onRetry={() => void read.refetch()} />
      ) : null}
      <PassportContent {...props} profiles={apis.profiles} value={read.data} />
      <PassportStory
        dashboard={apis.dashboard}
        spaceId={props.spaceId}
        accountId={props.account.id}
      />
    </>
  );
}

function PassportContent({
  value,
  profiles,
  ...props
}: ProfilePageProps & {
  profiles: ProfilesApi;
  value: RelationshipPassportView;
}) {
  const { t } = useTranslation();
  const { relationshipLabel } = usePartnerNickname();
  const statisticsKey = passportStatisticsKey(
    props.apiBaseUrl,
    props.account.id,
    props.spaceId,
  );
  const [statisticsPreference, setStatisticsPreference] = useState(() => ({
    key: statisticsKey,
    enabled: readPassportStatisticsPreference(statisticsKey),
  }));
  const showStatistics =
    statisticsPreference.key === statisticsKey && statisticsPreference.enabled;
  const partner = value.partner;
  const ownProfile = useQuery({
    queryKey: ['profile-identity', props.spaceId, props.account.id],
    queryFn: () =>
      profiles.getPartnerProfileApiV1SpacesSpaceIdProfilesAccountIdGet({
        spaceId: props.spaceId,
        accountId: props.account.id,
      }),
    retry: false,
  });
  const partnerProfile = useQuery({
    queryKey: ['profile-identity', props.spaceId, partner?.id],
    queryFn: () =>
      partner
        ? profiles.getPartnerProfileApiV1SpacesSpaceIdProfilesAccountIdGet({
            spaceId: props.spaceId,
            accountId: partner.id,
          })
        : null,
    enabled: Boolean(partner),
    retry: false,
  });
  const ownAvatar = useProfileAvatarUrl(
    profiles,
    props.spaceId,
    props.account.id,
    ownProfile.data?.profileAttachmentId,
  );
  const partnerAvatar = useProfileAvatarUrl(
    profiles,
    props.spaceId,
    partner?.id ?? '',
    partnerProfile.data?.profileAttachmentId,
  );
  const numbers = new Intl.NumberFormat(resolvedLocale());
  const metrics = [
    {
      key: 'memories',
      count: value.memories,
      to: '/story?tab=timeline&type=MEMORY',
    },
    {
      key: 'heartMoments',
      count: value.heartMoments,
      to: '/story?tab=timeline&type=HEART_MOMENT',
    },
    {
      key: 'milestones',
      count: value.milestones,
      to: '/story?tab=timeline&type=MILESTONE',
    },
    { key: 'completedPlans', count: value.completedPlans, to: '/plan#plans' },
    { key: 'places', count: value.places, to: MORE_PLACES_ROUTE },
  ];
  const empty = metrics.every((metric) => metric.count === 0);
  return (
    <>
      <div className="passport-identity">
        <PartnerAvatarPair
          size="small"
          status="unknown"
          primaryPerson={{
            displayName: props.account.displayName,
            imageUrl: ownAvatar.avatarUrl,
          }}
          secondaryPerson={
            partner
              ? {
                  displayName: relationshipLabel(
                    partner.id,
                    partner.displayName,
                    t('couplePresencePartnerFallback'),
                  ),
                  imageUrl: partnerAvatar.avatarUrl,
                }
              : null
          }
        />
        <div className="passport-identity-copy">
          <p className="passport-couple-name">
            {partner
              ? t('relationshipReflections.passport.couple', {
                  own: props.account.displayName,
                  partner: relationshipLabel(
                    partner.id,
                    partner.displayName,
                    t('couplePresencePartnerFallback'),
                  ),
                })
              : props.account.displayName}
          </p>
          <p className="passport-duration">
            {value.relationshipDuration
              ? t('relationshipReflections.passport.days', {
                  count: value.relationshipDuration.daysTogether,
                })
              : t('relationshipReflections.passport.shared')}
          </p>
          <p className="passport-support">
            {t('relationshipReflections.passport.intro')}
          </p>
          {value.relationshipDuration ? (
            <p className="passport-since">
              {t('relationshipReflections.passport.since', {
                date: passportDate(value.relationshipDuration.startedOn),
              })}
            </p>
          ) : null}
        </div>
      </div>
      <PassportLandmarks duration={value.relationshipDuration} />
      <PreferenceSwitch
        label={t('relationshipReflections.passport.statisticsToggle')}
        description={t('relationshipReflections.passport.statisticsHelp')}
        checked={showStatistics}
        onCheckedChange={(enabled) => {
          setStatisticsPreference({ key: statisticsKey, enabled });
          savePassportStatisticsPreference(statisticsKey, enabled);
        }}
      />
      {empty ? (
        <div>
          <p>{t('relationshipReflections.passport.empty')}</p>
          <Link to="/story">{t('relationshipReflections.passport.start')}</Link>
        </div>
      ) : showStatistics ? (
        <div className="passport-history">
          <h3>{t('relationshipReflections.passport.history')}</h3>
          <ul className="passport-metrics">
            {metrics.map((metric) => (
              <li key={metric.key}>
                <Link
                  to={metric.to}
                  aria-label={`${numbers.format(metric.count)} ${t(`relationshipReflections.passport.${metric.key}`, { count: metric.count })}`}
                >
                  <span className="passport-number">
                    {numbers.format(metric.count)}
                  </span>
                  <span className="passport-metric-label">
                    {t(`relationshipReflections.passport.${metric.key}`, {
                      count: metric.count,
                    })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}

function passportDate(value: Date): string {
  return new Intl.DateTimeFormat(resolvedLocale(), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(value);
}

function PassportLandmarks({
  duration,
}: {
  duration: DashboardRelationshipDuration | null;
}) {
  const { t } = useTranslation();
  const landmarks = passportLandmarks(duration);
  if (!landmarks) return null;
  const remaining = (count: number) =>
    count === 0
      ? t('relationshipReflections.passport.landmarkToday')
      : t('relationshipReflections.passport.remaining', { count });
  return (
    <div className="passport-landmarks">
      <h3>{t('relationshipReflections.passport.nextChapter')}</h3>
      <dl>
        <div>
          <dt>
            {t('relationshipReflections.passport.anniversary', {
              count: landmarks.anniversary.years,
            })}
          </dt>
          <dd>
            <time
              dateTime={landmarks.anniversary.date.toISOString().slice(0, 10)}
            >
              {passportDate(landmarks.anniversary.date)}
            </time>
          </dd>
          <dd className="passport-remaining">
            {remaining(landmarks.anniversary.daysRemaining)}
          </dd>
        </div>
        <div>
          <dt>
            {t('relationshipReflections.passport.roundDay', {
              count: landmarks.roundDay.days,
              days: new Intl.NumberFormat(resolvedLocale()).format(
                landmarks.roundDay.days,
              ),
            })}
          </dt>
          <dd>
            <time dateTime={landmarks.roundDay.date.toISOString().slice(0, 10)}>
              {passportDate(landmarks.roundDay.date)}
            </time>
          </dd>
          <dd className="passport-remaining">
            {remaining(landmarks.roundDay.daysRemaining)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function PassportStory({
  dashboard,
  spaceId,
  accountId,
}: {
  dashboard: DashboardApi;
  spaceId: string;
  accountId: string;
}) {
  const { t } = useTranslation();
  const read = useQuery({
    queryKey: ['relationship-passport', 'highlights', accountId, spaceId],
    queryFn: async ({ signal }) => {
      try {
        return await dashboard.getDashboard({ spaceId }, { signal });
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    staleTime: 60_000,
    gcTime: OVERVIEW_GC_TIME,
    retry: false,
  });
  // An authoritative failure must never keep an older shared preview visible.
  const denied =
    read.error instanceof ClientProblemError &&
    ['unauthorized', 'permission', 'notFound'].includes(read.error.kind);
  const highlights = denied ? [] : passportHighlights(read.data);
  const nextPlan = denied
    ? undefined
    : read.data?.upcoming.find((item) => item.type === 'PLAN');
  const nextPath = nextPlan
    ? dashboardItemPath(nextPlan.type, nextPlan.id)
    : null;
  return (
    <div className="passport-story">
      {read.isPending ? (
        <p role="status">
          {t('relationshipReflections.passport.highlightsLoading')}
        </p>
      ) : null}
      {read.error ? (
        <ProblemState error={read.error} onRetry={() => void read.refetch()} />
      ) : null}
      {highlights.length ? (
        <div className="passport-rediscover">
          <h3>{t('relationshipReflections.passport.rediscover')}</h3>
          <ul>
            {highlights.map((item) => (
              <li key={`${item.type}:${item.id}`}>
                <Link to={dashboardItemPath(item.type, item.id) ?? '/story'}>
                  <span>
                    <strong>
                      {textExcerpt(dashboardItemTitle(item, t).title, 100)}
                    </strong>
                    {item.occurredOn &&
                    !dashboardItemTitle(item, t).titleIsDate ? (
                      <time
                        dateTime={item.occurredOn.toISOString().slice(0, 10)}
                      >
                        {passportDate(item.occurredOn)}
                      </time>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {nextPlan && nextPath ? (
        <div className="passport-next-experience">
          <h3>{t('relationshipReflections.passport.nextExperience')}</h3>
          <Link to={nextPath}>
            <strong>
              {textExcerpt(
                nextPlan.titleOrText || t('m5s5.dashboard.itemFallback'),
                100,
              )}
            </strong>
          </Link>
        </div>
      ) : null}
      <Link className="passport-story-action" to="/story?tab=timeline">
        {t('relationshipReflections.passport.explore')}{' '}
      </Link>
    </div>
  );
}
