import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { DashboardApi } from '../api/generated/apis/DashboardApi';
import { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import { ProfilesApi } from '../client/mediaApis';
import type { ProfilePageProps } from './ProfilePage';
import type { RelationshipPassportView } from '../api/generated/models/RelationshipPassportView';
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
    gcTime: 0,
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
      {capability.isPending || capability.isFetching ? (
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
    gcTime: 0,
    refetchOnMount: 'always',
  });
  if (
    read.error instanceof ClientProblemError &&
    read.error.code === 'PREMIUM_ENTITLEMENT_REQUIRED'
  )
    return <PassportProEntry />;
  if (read.error)
    return (
      <ProblemState error={read.error} onRetry={() => void read.refetch()} />
    );
  if (!read.data) return <p role="status">{t('states.loading.title')}</p>;
  return (
    <PassportContent {...props} profiles={apis.profiles} value={read.data} />
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
        <div>
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
        </div>
      </div>
      {empty ? (
        <div>
          <p>{t('relationshipReflections.passport.empty')}</p>
          <Link to="/story">{t('relationshipReflections.passport.start')}</Link>
        </div>
      ) : (
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
                <span>
                  {t(`relationshipReflections.passport.${metric.key}`, {
                    count: metric.count,
                  })}
                </span>
                <span aria-hidden="true">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
