import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { DashboardApi } from '../api/generated/apis/DashboardApi';
import { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import type { DashboardRelationshipDuration } from '../api/generated/models/DashboardRelationshipDuration';
import type { RelationshipPassportView } from '../api/generated/models/RelationshipPassportView';
import { Configuration } from '../client/apiConfiguration';
import { ProfilesApi } from '../client/mediaApis';
import { usePartnerNickname } from '../client/partnerNickname';
import {
  ClientProblemError,
  normalizeClientError,
} from '../client/problemDetails';
import { passportLandmarks } from '../client/relationshipPassport';
import { MORE_PLACES_ROUTE, PRO_INFORMATION_ROUTE } from '../client/routes';
import {
  entitlementLoader,
  useSpaceCapability,
} from '../client/spaceEntitlement';
import { useProfileAvatarUrl } from '../client/useProfileAvatarUrl';
import { OVERVIEW_GC_TIME } from '../client/useWarmOverviewQuery';
import { resolvedLocale, useTranslation } from '../i18n';
import { PartnerAvatarPair } from './PartnerAvatarPair';
import { ProblemState } from './ProblemState';
import type { ProfilePageProps } from './ProfilePage';
import { ProMark } from './ProMark';
import {
  StoryChapters,
  type StoryOccasion,
  StoryPlaces,
  useFulfilledWishes,
  useStoryOccasions,
} from './RelationshipStoryExtras';
import { SharedStorySummary } from './SharedStorySummary';
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
  const loadEntitlement = useMemo(
    () => entitlementLoader(apis.entitlements, props.spaceId),
    [apis.entitlements, props.spaceId],
  );
  // Reuses the session's single entitlement read from app start.
  const capability = useSpaceCapability({
    accountId: props.account.id,
    spaceId: props.spaceId,
    load: loadEntitlement,
    capability: CAPABILITY,
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
      <Link to={PRO_INFORMATION_ROUTE}>
        {t('relationshipReflections.passport.learnMore')}
      </Link>
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
      <div className="passport-timeline">
        <h3>{t('m5s5.dashboard.storyLifelineAria')}</h3>
        <SharedStorySummary
          summary={{
            memories: read.data.memories,
            heartMoments: read.data.heartMoments,
            milestones: read.data.milestones,
          }}
          accountId={props.account.id}
          spaceId={props.spaceId}
          dashboardApi={apis.dashboard}
        />
        <StoryChapters
          apiBaseUrl={props.apiBaseUrl}
          accessToken={props.accessToken}
          accountId={props.account.id}
          spaceId={props.spaceId}
          startedOn={read.data.relationshipDuration?.startedOn}
        />
      </div>
      <StoryPlaces
        apiBaseUrl={props.apiBaseUrl}
        accessToken={props.accessToken}
        accountId={props.account.id}
        spaceId={props.spaceId}
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
  const storyScope = {
    apiBaseUrl: props.apiBaseUrl,
    accessToken: props.accessToken,
    accountId: props.account.id,
    spaceId: props.spaceId,
  };
  const fulfilledWishes = useFulfilledWishes(storyScope);
  const occasions = useStoryOccasions(
    storyScope,
    partner
      ? {
          name: relationshipLabel(
            partner.id,
            partner.displayName,
            t('couplePresencePartnerFallback'),
          ),
          date: partnerProfile.data?.birthday,
        }
      : null,
  );
  const metricLabel = (key: string, count: number) =>
    key === 'fulfilledWishes'
      ? t('relationshipReflections.passport.fulfilledWishes', {
          count,
          defaultValue: count === 1 ? 'Erfüllter Wunsch' : 'Erfüllte Wünsche',
        })
      : t(`relationshipReflections.passport.${key}`, { count });
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
    ...(fulfilledWishes
      ? [
          {
            key: 'fulfilledWishes',
            count: fulfilledWishes.count,
            to: '/plan#fulfilled-wishes',
          },
        ]
      : []),
  ];
  const empty = metrics.every((metric) => metric.count === 0);
  const largestMetric = Math.max(1, ...metrics.map((metric) => metric.count));
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
      <PassportLandmarks
        duration={value.relationshipDuration}
        occasions={occasions}
      />
      {empty ? (
        <div>
          <p>{t('relationshipReflections.passport.empty')}</p>
          <Link to="/story">{t('relationshipReflections.passport.start')}</Link>
        </div>
      ) : (
        <div className="passport-history">
          <h3>{t('relationshipReflections.passport.history')}</h3>
          <ul className="passport-metrics">
            {metrics.map((metric) => (
              <li key={metric.key}>
                <Link
                  to={metric.to}
                  aria-label={`${numbers.format(metric.count)} ${metricLabel(metric.key, metric.count)}`}
                >
                  <span className="passport-metric-label">
                    {metricLabel(metric.key, metric.count)}
                  </span>
                  <span className="passport-number">
                    {numbers.format(metric.count)}
                  </span>
                  <span
                    className="passport-metric-bar"
                    aria-hidden="true"
                    style={{
                      ['--passport-share' as string]: String(
                        metric.count / largestMetric,
                      ),
                    }}
                  />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
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
  occasions,
}: {
  duration: DashboardRelationshipDuration | null;
  occasions: readonly StoryOccasion[];
}) {
  const { t } = useTranslation();
  const landmarks = passportLandmarks(duration);
  if (!landmarks) return null;
  const remaining = (count: number) =>
    count === 0
      ? t('relationshipReflections.passport.landmarkToday')
      : t('relationshipReflections.passport.remaining', { count });
  // One list, nearest first: the two relationship landmarks and the couple's
  // own occasions are the same kind of thing to look forward to.
  const rows = [
    {
      key: 'anniversary',
      label: t('relationshipReflections.passport.anniversary', {
        count: landmarks.anniversary.years,
      }),
      date: landmarks.anniversary.date,
      daysRemaining: landmarks.anniversary.daysRemaining,
      progress: 1 - landmarks.anniversary.daysRemaining / 365,
    },
    {
      key: 'roundDay',
      label: t('relationshipReflections.passport.roundDay', {
        count: landmarks.roundDay.days,
        days: new Intl.NumberFormat(resolvedLocale()).format(
          landmarks.roundDay.days,
        ),
      }),
      date: landmarks.roundDay.date,
      daysRemaining: landmarks.roundDay.daysRemaining,
      progress: 1 - landmarks.roundDay.daysRemaining / landmarks.roundDay.days,
    },
    ...occasions.map((occasion) => ({
      key: occasion.key,
      label: occasion.label,
      date: occasion.date,
      daysRemaining: occasion.daysRemaining,
      progress: 1 - occasion.daysRemaining / 365,
    })),
  ].sort((a, b) => a.daysRemaining - b.daysRemaining);
  return (
    <div className="passport-landmarks">
      <h3>{t('relationshipReflections.passport.nextChapter')}</h3>
      <dl>
        {rows.map((row) => (
          <div key={row.key}>
            <dt>{row.label}</dt>
            <dd>
              <time dateTime={row.date.toISOString().slice(0, 10)}>
                {passportDate(row.date)}
              </time>
            </dd>
            <dd className="passport-remaining">
              {remaining(row.daysRemaining)}
            </dd>
            <dd
              className="passport-progress"
              aria-hidden="true"
              style={{
                ['--passport-progress' as string]: String(
                  Math.min(1, Math.max(0, row.progress)),
                ),
              }}
            />
          </div>
        ))}
      </dl>
    </div>
  );
}
