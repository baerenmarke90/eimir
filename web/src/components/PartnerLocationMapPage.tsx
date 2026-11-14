import { focusManager, useQuery } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { ProfilesApi } from '../api/generated/apis/ProfilesApi';
import type { AccountView } from '../api/generated/models/AccountView';
import {
  type ApproximatePosition,
  currentApproximatePosition,
  locationPermission,
} from '../client/approximateLocation';
import {
  DISTANCE_RESUME_MIN_INTERVAL_MS,
  deviceLanguages,
  distanceUnitFor,
  isDistanceFresh,
  type PartnerDistanceLine,
  partnerDistanceQueryKey,
  usePartnerMapArea,
} from '../client/partnerDistance';
import {
  usePartnerLocationApi,
  usePartnerLocationCapability,
  usePartnerLocationSettings,
  usePartnerName,
} from '../client/partnerLocation';
import { usePartnerNickname } from '../client/partnerNickname';
import { firstNameFromDisplayName } from '../client/personalName';
import {
  DEFAULT_APP_ROUTE,
  PARTNER_LOCATION_SETTINGS_ROUTE,
} from '../client/routes';
import { useTaskOrigin } from '../client/taskOrigin';
import { useProfileAvatarUrl } from '../client/useProfileAvatarUrl';
import { resolvedLocale, useTranslation } from '../i18n';
import { PageHeader } from './PageHeader';
import { SingleAvatar } from './PartnerAvatarPair';
import { useDistanceAsOfLabel, useDistanceText } from './PartnerDistanceLine';
import type { MapArea } from './PlaceMapCanvas';
import { ProblemState } from './ProblemState';
import { TaskBackButton } from './TaskBackButton';
import { UiState } from './UiState';
import './PartnerLocationMap.css';

const MapCanvas = lazy(() => import('./PlaceMapCanvas'));

/**
 * The viewer's own position, measured once on open and on resume while the
 * map is shown. Held in component state only and never sent anywhere: the
 * map read needs no own position. Never opens the OS permission dialog.
 */
function useOwnPositionWhileOpen(enabled: boolean) {
  const [position, setPosition] = useState<ApproximatePosition | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let lastRun = Number.NEGATIVE_INFINITY;
    const measure = async (force: boolean) => {
      const now = Date.now();
      if (!force && now - lastRun < DISTANCE_RESUME_MIN_INTERVAL_MS) return;
      lastRun = now;
      try {
        if ((await locationPermission()) !== 'granted') {
          if (!disposed) setPosition(null);
          return;
        }
        const next = await currentApproximatePosition();
        if (!disposed) setPosition(next);
      } catch {
        if (!disposed) setPosition(null);
      }
    };
    void measure(true);
    const unsubscribe = focusManager.subscribe((focused) => {
      if (focused) void measure(false);
    });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [enabled]);
  return position;
}

function useProfileAvatar(
  profilesApi: ProfilesApi | undefined,
  spaceId: string,
  accountId: string | undefined,
) {
  const profile = useQuery({
    // Shares the Wir hero's profile identity entry.
    queryKey: ['profile-identity', spaceId, accountId],
    queryFn: () =>
      profilesApi && accountId
        ? profilesApi.getPartnerProfileApiV1SpacesSpaceIdProfilesAccountIdGet({
            accountId,
            spaceId,
          })
        : null,
    enabled: Boolean(profilesApi && accountId && spaceId),
    retry: false,
  });
  return useProfileAvatarUrl(
    profilesApi,
    spaceId,
    accountId ?? '',
    profile.data?.profileAttachmentId,
  ).avatarUrl;
}

/** The dedicated "where we are" map task (#1792), not a memory-map layer. */
export function PartnerLocationMapPage({
  apiBaseUrl,
  accessToken,
  account,
  spaceId,
  profilesApi,
}: {
  apiBaseUrl: string;
  accessToken: string;
  account: AccountView;
  spaceId: string;
  profilesApi?: ProfilesApi;
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const { requestReturn } = useTaskOrigin();
  const originKey = (location.state as { taskOriginKey?: unknown } | null)
    ?.taskOriginKey;
  const owner = { apiBaseUrl, accessToken, accountId: account.id, spaceId };
  const api = usePartnerLocationApi(owner);
  const capability = usePartnerLocationCapability(owner);
  const entitled = capability.data === true && !capability.isError;
  const settings = usePartnerLocationSettings({
    ...owner,
    api,
    enabled: entitled,
  }).data;
  const partnerIdentity = usePartnerName(owner);
  const { relationshipLabel } = usePartnerNickname();
  const partnerName = relationshipLabel(
    partnerIdentity.id,
    partnerIdentity.name,
    t('partnerLocation.partnerFallback'),
  );
  const partnerFirstName = firstNameFromDisplayName(partnerName, partnerName);
  // The same initials as the Wir hero, which shows first names.
  const ownFirstName = firstNameFromDisplayName(
    account.displayName,
    t('couplePresenceYouFallback'),
  );
  const map = usePartnerMapArea({
    api,
    accountId: account.id,
    spaceId,
    enabled: entitled,
  });
  const ownPosition = useOwnPositionWhileOpen(entitled);
  // The Wir line's band, if it was read; no additional distance request.
  const distanceLine = useQuery<PartnerDistanceLine>({
    queryKey: partnerDistanceQueryKey(account.id, spaceId),
    enabled: false,
  }).data;
  const ownAvatar = useProfileAvatar(profilesApi, spaceId, account.id);
  const partnerAvatar = useProfileAvatar(
    profilesApi,
    spaceId,
    partnerIdentity.id,
  );
  const asOfLabel = useDistanceAsOfLabel();
  const distanceText = useDistanceText();
  const [showUs, setShowUs] = useState(0);

  const shared = map.data?.available ? map.data : null;
  // The partner's area only counts when it has a position and a radius; the
  // map itself works without it (own position, or the default view).
  const area =
    shared && shared.latitude != null && shared.radiusMeters != null
      ? shared
      : null;
  const areas = useMemo<MapArea[]>(() => {
    const result: MapArea[] = [];
    if (
      area?.latitude != null &&
      area.longitude != null &&
      area.radiusMeters != null
    ) {
      result.push({
        id: 'partner',
        tone: 'partner',
        latitude: area.latitude,
        longitude: area.longitude,
        radiusMeters: area.radiusMeters,
        marker: (
          <SingleAvatar
            person={{ displayName: partnerName, imageUrl: partnerAvatar }}
            size="small"
          />
        ),
      });
    }
    if (ownPosition) {
      result.push({
        id: 'own',
        tone: 'own',
        latitude: ownPosition.latitude,
        longitude: ownPosition.longitude,
        radiusMeters: 0,
        marker: (
          <SingleAvatar
            person={{
              displayName: ownFirstName,
              imageUrl: ownAvatar,
            }}
            size="small"
          />
        ),
      });
    }
    return result;
  }, [area, ownAvatar, ownFirstName, ownPosition, partnerAvatar, partnerName]);

  const header = (
    <PageHeader
      title={t('partnerLocation.mapTitle')}
      before={
        <TaskBackButton
          onClick={() => requestReturn(originKey, DEFAULT_APP_ROUTE)}
        />
      }
    />
  );
  const adjust = (
    <Link
      className="button-link secondary-link partner-map-adjust"
      to={PARTNER_LOCATION_SETTINGS_ROUTE}
    >
      {t('partnerLocation.mapAdjust')}
    </Link>
  );

  if (capability.isPending || (entitled && map.isPending)) {
    return (
      <div className="page partner-map-page">
        {header}
        <UiState kind="loading" title={t('partnerLocation.mapLoading')} />
      </div>
    );
  }
  if (entitled && map.isError) {
    return (
      <div className="page partner-map-page">
        {header}
        <ProblemState error={map.error} onRetry={() => void map.refetch()} />
      </div>
    );
  }
  if (!entitled) {
    return (
      <div className="page partner-map-page">
        {header}
        <UiState
          kind="empty"
          title={t('partnerLocation.mapUnavailableTitle')}
          body={t('partnerLocation.mapUnavailableBody')}
          action={adjust}
        />
      </div>
    );
  }

  const locale = resolvedLocale();
  const unit = distanceUnitFor(locale, deviceLanguages());
  const radiusKm = (area?.radiusMeters ?? 0) / 1000;
  const radius = new Intl.NumberFormat(locale, {
    style: 'unit',
    unit,
    unitDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(unit === 'mile' ? radiusKm / 1.609344 : radiusKm);
  const capturedAt = area?.capturedAt ?? null;
  const asOf = capturedAt ? asOfLabel(capturedAt) : null;
  const fresh = capturedAt ? isDistanceFresh(capturedAt) : false;
  const between =
    distanceLine?.kind === 'distance' ? distanceText(distanceLine.band) : null;
  const ownShare =
    settings?.state === 'ACTIVE'
      ? settings.level === 'DISTANCE_AND_MAP'
        ? t('partnerLocation.mapOwnSharesMap', { partner: partnerFirstName })
        : t('partnerLocation.mapOwnSharesDistance', {
            partner: partnerFirstName,
          })
      : t('partnerLocation.mapOwnSharesNothing');

  return (
    <div className="page partner-map-page">
      {header}
      <section
        className="partner-map-surface"
        aria-label={t('partnerLocation.mapPeopleLabel')}
      >
        <Suspense
          fallback={
            <div className="partner-map-loading" role="status">
              {t('partnerLocation.mapLoading')}
            </div>
          }
        >
          <MapCanvas
            areas={areas}
            showAreasRequest={showUs}
            ariaLabel={t('partnerLocation.mapPeopleLabel')}
          />
        </Suspense>
        {areas.length > 0 ? (
          <button
            type="button"
            className="secondary partner-map-show-us"
            onClick={() => setShowUs((count) => count + 1)}
          >
            {t('partnerLocation.mapShowUs')}
          </button>
        ) : null}
        <p className="sr-only">
          {area
            ? t('partnerLocation.mapAreaDescription', {
                partner: partnerFirstName,
                radius,
                time: asOf ?? '',
              })
            : t('partnerLocation.mapPartnerNotSharing', {
                partner: partnerFirstName,
              })}{' '}
          {ownPosition ? t('partnerLocation.mapOwnDescription') : null}
        </p>
      </section>

      <section
        className="partner-map-sheet"
        aria-labelledby="partner-map-sheet-title"
      >
        <h2 id="partner-map-sheet-title" className="sr-only">
          {t('partnerLocation.mapPeopleLabel')}
        </h2>
        {between ? <p className="partner-map-between">{between}</p> : null}
        <ul className="partner-map-people">
          <li
            className={`partner-map-person${fresh || !area ? '' : ' is-earlier'}`}
          >
            <span aria-hidden="true">
              <SingleAvatar
                person={{ displayName: partnerName, imageUrl: partnerAvatar }}
                size="small"
              />
            </span>
            <span className="partner-map-person-copy">
              <strong>
                {area
                  ? t('partnerLocation.mapPartnerArea', {
                      partner: partnerFirstName,
                    })
                  : t('partnerLocation.mapPartnerNotSharing', {
                      partner: partnerFirstName,
                    })}
              </strong>
              {area ? (
                asOf ? (
                  <span>
                    {t('partnerLocation.mapPartnerAsOf', { time: asOf })}
                  </span>
                ) : null
              ) : (
                <span>{t('partnerLocation.mapUnavailableBody')}</span>
              )}
            </span>
          </li>
          <li className="partner-map-person">
            <span aria-hidden="true">
              <SingleAvatar
                person={{
                  displayName: ownFirstName,
                  imageUrl: ownAvatar,
                }}
                size="small"
              />
            </span>
            <span className="partner-map-person-copy">
              <strong>
                {ownPosition
                  ? t('partnerLocation.mapYou')
                  : t('partnerLocation.mapYouMissing')}
              </strong>
              <span>{ownShare}</span>
            </span>
          </li>
        </ul>
        {adjust}
      </section>
    </div>
  );
}
