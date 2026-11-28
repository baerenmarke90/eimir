import { demoOwnPosition } from '../client/demoLocation';
import { isDemoModeConfigured } from '../client/demoMode';
import { focusManager, useQuery } from '@tanstack/react-query';
import {
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { ProfilesApi } from '../api/generated/apis/ProfilesApi';
import type { AccountView } from '../api/generated/models/AccountView';
import {
  type ApproximatePosition,
  currentApproximatePosition,
  type LocationPrecision,
  locationPermission,
} from '../client/approximateLocation';
import { partnerConnectionStyle } from '../client/partnerConnection';
import {
  DISTANCE_RESUME_MIN_INTERVAL_MS,
  deviceLanguages,
  distanceBandWords,
  distanceUnitFor,
  formatDistanceBand,
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
import { prefersReducedMotion } from '../motion/reducedMotion';
import { PageHeader } from './PageHeader';
import { SingleAvatar } from './PartnerAvatarPair';
import { useDistanceAsOfLabel, useDistanceText } from './PartnerDistanceLine';
import type { MapArea, MapConnection, MapFocus } from './PlaceMapCanvas';
import { ProblemState } from './ProblemState';
import { TaskBackButton } from './TaskBackButton';
import { UiState } from './UiState';
import './PartnerLocationMap.css';

const MapCanvas = lazy(() => import('./PlaceMapCanvas'));

type PersonId = 'partner' | 'own';

/**
 * A person row of the sheet. While the person is on the map, the row is the
 * way to bring them into view (#2158), like their avatar on the map.
 */
function PersonRow({
  className = '',
  selectLabel,
  onSelect,
  children,
}: {
  className?: string;
  selectLabel?: string;
  onSelect?: () => void;
  children: ReactNode;
}) {
  return (
    <li className={`partner-map-person${className}`}>
      {onSelect && selectLabel ? (
        <button
          type="button"
          className="partner-map-person-button"
          onClick={onSelect}
        >
          {children}
          <span className="sr-only">{selectLabel}</span>
        </button>
      ) : (
        children
      )}
    </li>
  );
}

/**
 * The viewer's own position, measured once on open and on resume while the
 * map is shown. Held in component state only and never sent anywhere: the
 * map read needs no own position. Never opens the OS permission dialog.
 */
function useOwnPositionWhileOpen(
  enabled: boolean,
  precision: LocationPrecision,
) {
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
        const next = await currentApproximatePosition(undefined, precision);
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
  }, [enabled, precision]);
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
  const measuredOwnPosition = useOwnPositionWhileOpen(
    entitled,
    settings?.precision ?? 'APPROXIMATE',
  );
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
  // The person the camera follows (#2158); a new request flies there again.
  const [focusedPerson, setFocusedPerson] = useState<{
    id: PersonId;
    request: number;
  } | null>(null);
  const selectPerson = useCallback((id: string) => {
    if (id !== 'partner' && id !== 'own') return;
    setFocusedPerson((current) => ({
      id,
      request: (current?.request ?? 0) + 1,
    }));
  }, []);
  const surfaceRef = useRef<HTMLElement>(null);
  const selectPersonFromSheet = (id: PersonId) => {
    selectPerson(id);
    // The sheet can sit below the fold: the map comes into view with them.
    surfaceRef.current?.scrollIntoView?.({
      block: 'nearest',
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  };

  const shared = map.isSuccess && map.data.available ? map.data : null;
  // The partner's area only counts when it has a position and a radius; the
  // map itself works without it (own position, or the default view).
  const area =
    shared && shared.latitude != null && shared.radiusMeters != null
      ? shared
      : null;
  // The Demo has no device position: the viewer's example position stands in.
  const ownPosition = isDemoModeConfigured()
    ? demoOwnPosition(area)
    : measuredOwnPosition;
  const partnerZoomLabel = t('partnerLocation.mapZoomToPartner', {
    partner: partnerFirstName,
  });
  const ownZoomLabel = t('partnerLocation.mapZoomToOwn');
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
        selectLabel: partnerZoomLabel,
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
        selectLabel: ownZoomLabel,
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
  }, [
    area,
    ownAvatar,
    ownFirstName,
    ownPosition,
    ownZoomLabel,
    partnerAvatar,
    partnerName,
    partnerZoomLabel,
  ]);
  const focusedArea = areas.find(({ id }) => id === focusedPerson?.id);
  const focusLatitude = focusedArea?.latitude;
  const focusLongitude = focusedArea?.longitude;
  const focusRadius = focusedArea?.radiusMeters;
  const focusRequest = focusedPerson?.request;
  const focus = useMemo<MapFocus | undefined>(
    () =>
      focusLatitude != null && focusLongitude != null
        ? {
            latitude: focusLatitude,
            longitude: focusLongitude,
            radiusMeters: focusRadius,
            request: focusRequest,
          }
        : undefined,
    [focusLatitude, focusLongitude, focusRadius, focusRequest],
  );

  // Only while both currently share (#1907 H1); otherwise no line, no hint.
  const connectionStyle = partnerConnectionStyle({
    partnerArea:
      area?.latitude != null && area.longitude != null
        ? {
            latitude: area.latitude,
            longitude: area.longitude,
            capturedAt: area.capturedAt,
          }
        : null,
    ownPosition,
    ownSharingActive: settings?.state === 'ACTIVE',
    band: distanceLine?.kind === 'distance' ? distanceLine.band : null,
  });
  const connectionTier = connectionStyle?.tier;
  const connectionEarlier = connectionStyle?.earlier ?? false;
  const connection = useMemo<MapConnection | undefined>(
    () =>
      connectionTier
        ? {
            from: 'own',
            to: 'partner',
            tier: connectionTier,
            earlier: connectionEarlier,
            playRequest: showUs,
          }
        : undefined,
    [connectionEarlier, connectionTier, showUs],
  );

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

  if (capability.isPending) {
    return (
      <div className="page partner-map-page">
        {header}
        <UiState kind="loading" title={t('partnerLocation.mapLoading')} />
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
  const partnerAsOf = capturedAt ? asOfLabel(capturedAt) : null;
  const ownCapturedAt = ownPosition?.capturedAt;
  const ownAsOf =
    ownCapturedAt && Number.isFinite(ownCapturedAt.getTime())
      ? asOfLabel(ownCapturedAt)
      : null;
  const fresh = capturedAt ? isDistanceFresh(capturedAt) : false;
  const between =
    map.isSuccess && distanceLine?.kind === 'distance'
      ? distanceText(distanceLine.band)
      : null;
  // The map is the detailed view: a range band shown in words also keeps its
  // kilometres here, as on Wir only the words are shown (#1907 H4).
  const betweenKm =
    distanceLine?.kind === 'distance' && distanceBandWords(distanceLine.band)
      ? formatDistanceBand(distanceLine.band, locale, unit)
      : null;
  const ownShare =
    settings?.state === 'ACTIVE'
      ? settings.level === 'DISTANCE_AND_MAP'
        ? null
        : t('partnerLocation.mapOwnSharesDistance', {
            partner: partnerFirstName,
          })
      : t('partnerLocation.mapOwnSharesNothing');

  return (
    <div className="page partner-map-page">
      {header}
      <section
        ref={surfaceRef}
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
            focus={focus}
            onAreaSelect={selectPerson}
            showAreasRequest={showUs}
            connection={connection}
            ariaLabel={t('partnerLocation.mapPeopleLabel')}
          />
        </Suspense>
        {areas.length > 0 ? (
          <button
            type="button"
            className="secondary partner-map-show-us"
            onClick={() => {
              // Back to the two of you from a person in focus (#2158).
              setFocusedPerson(null);
              setShowUs((count) => count + 1);
            }}
          >
            {t('partnerLocation.mapShowUs')}
          </button>
        ) : null}
        <p className="sr-only">
          {area
            ? t('partnerLocation.mapAreaDescription', {
                partner: partnerFirstName,
                radius,
                time: partnerAsOf ?? '',
              })
            : map.isSuccess
              ? t('partnerLocation.mapPartnerNotSharing', {
                  partner: partnerFirstName,
                })
              : null}{' '}
          {ownPosition ? t('partnerLocation.mapOwnDescription') : null}
          {connection ? ' ' : null}
          {connection
            ? connection.tier === 'near'
              ? t('partnerLocation.mapConnectionNear')
              : t('partnerLocation.mapConnectionLine', {
                  partner: partnerFirstName,
                })
            : null}
        </p>
      </section>

      <section
        className="partner-map-sheet"
        aria-labelledby="partner-map-sheet-title"
      >
        <h2 id="partner-map-sheet-title" className="sr-only">
          {t('partnerLocation.mapPeopleLabel')}
        </h2>
        {between ? (
          <p className="partner-map-between">
            {between}
            {betweenKm ? (
              <span className="partner-map-between-km">{betweenKm}</span>
            ) : null}
          </p>
        ) : null}
        <ul className="partner-map-people">
          {map.isError ? (
            <li>
              <ProblemState
                error={map.error}
                onRetry={() => void map.refetch()}
              />
            </li>
          ) : (
            <PersonRow
              className={fresh || !area ? '' : ' is-earlier'}
              selectLabel={partnerZoomLabel}
              onSelect={
                area ? () => selectPersonFromSheet('partner') : undefined
              }
            >
              <span aria-hidden="true">
                <SingleAvatar
                  person={{ displayName: partnerName, imageUrl: partnerAvatar }}
                  size="small"
                />
              </span>
              <span className="partner-map-person-copy">
                <strong role={map.isPending ? 'status' : undefined}>
                  {map.isPending
                    ? t('states.loading.title')
                    : area
                      ? t('partnerLocation.mapPartnerArea', {
                          partner: partnerFirstName,
                        })
                      : t('partnerLocation.mapPartnerNotSharing', {
                          partner: partnerFirstName,
                        })}
                </strong>
                {map.isSuccess && !area ? (
                  <span>{t('partnerLocation.mapUnavailableBody')}</span>
                ) : null}
                {partnerAsOf ? (
                  <span>
                    {t('partnerLocation.mapAsOf', { time: partnerAsOf })}
                  </span>
                ) : null}
              </span>
            </PersonRow>
          )}
          <PersonRow
            selectLabel={ownZoomLabel}
            onSelect={
              ownPosition ? () => selectPersonFromSheet('own') : undefined
            }
          >
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
              {ownAsOf ? (
                <span>{t('partnerLocation.mapAsOf', { time: ownAsOf })}</span>
              ) : null}
              {ownShare && <span>{ownShare}</span>}
            </span>
          </PersonRow>
        </ul>
        {adjust}
      </section>
    </div>
  );
}
