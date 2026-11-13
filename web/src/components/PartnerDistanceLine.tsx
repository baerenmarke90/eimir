import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import type { PartnerLocationApi } from '../api/generated/apis/PartnerLocationApi';
import type { PartnerLocationSettingsView } from '../api/generated/models/PartnerLocationSettingsView';
import {
  deviceLanguages,
  distanceUnitFor,
  formatDistanceBand,
  isDistanceFresh,
  type PartnerDistanceLine as PartnerDistanceLineState,
  usePartnerDistanceLine,
  usePartnerDistanceOnWir,
} from '../client/partnerDistance';
import {
  PARTNER_LOCATION_CAPABILITY,
  partnerLocationSettingsQueryKey,
} from '../client/partnerLocation';
import {
  PARTNER_LOCATION_MAP_ROUTE,
  PARTNER_LOCATION_SETTINGS_ROUTE,
} from '../client/routes';
import {
  entitlementLoader,
  useSpaceCapability,
} from '../client/spaceEntitlement';
import { resolvedLocale, useTranslation } from '../i18n';
import './PartnerDistanceLine.css';

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(value: Date): number {
  const day = new Date(value);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

/** "heute, 9:40" / "gestern, 21:15" for an earlier sample time. */
export function useDistanceAsOfLabel() {
  const { t } = useTranslation();
  return (asOf: Date, now: Date = new Date()) => {
    const locale = resolvedLocale();
    const time = new Intl.DateTimeFormat(locale, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(asOf);
    const days = Math.round((startOfDay(now) - startOfDay(asOf)) / DAY_MS);
    if (days <= 0) return t('partnerLocation.distanceAsOfToday', { time });
    if (days === 1) return t('partnerLocation.distanceAsOfYesterday', { time });
    const date = new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
    }).format(asOf);
    return t('partnerLocation.distanceAsOfDate', { date, time });
  };
}

/** The band as the localized "… zwischen euch" sentence. */
export function useDistanceText() {
  const { t } = useTranslation();
  return (band: Parameters<typeof formatDistanceBand>[0]) => {
    const locale = resolvedLocale();
    const distance = formatDistanceBand(
      band,
      locale,
      distanceUnitFor(locale, deviceLanguages()),
    );
    return distance
      ? t('partnerLocation.distanceBetween', { distance })
      : t('partnerLocation.distanceNear');
  };
}

function Glyph({ kind }: { kind: 'heart' | 'clock' | 'pin' | 'chevron' }) {
  return (
    <svg
      className={`partner-distance-glyph is-${kind}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      {kind === 'heart' ? (
        <path d="M12 20.3 4.7 13a4.6 4.6 0 0 1 6.5-6.5l.8.8.8-.8a4.6 4.6 0 0 1 6.5 6.5Z" />
      ) : kind === 'clock' ? (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 7.5V12l3 2" />
        </>
      ) : kind === 'pin' ? (
        <>
          <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
          <circle cx="12" cy="10" r="2.3" />
        </>
      ) : (
        <path d="m10 6 6 6-6 6" />
      )}
    </svg>
  );
}

/**
 * The quiet distance signal inside the Wir couple hero (#1792). Absent
 * without a placeholder or reason whenever nothing may be shown.
 */
export function PartnerDistanceLine({
  line,
  now = new Date(),
}: {
  line: PartnerDistanceLineState;
  now?: Date;
}) {
  const { t } = useTranslation();
  const asOfLabel = useDistanceAsOfLabel();
  const distanceText = useDistanceText();

  if (line.kind === 'hidden') return null;

  if (line.kind === 'ownMissing') {
    return (
      <div className="partner-distance-signal">
        <Link
          className="partner-distance-line is-own-missing"
          to={PARTNER_LOCATION_SETTINGS_ROUTE}
          aria-label={t('partnerLocation.distanceOwnMissingLabel')}
        >
          <Glyph kind="pin" />
          <span className="partner-distance-value">
            {t('partnerLocation.distanceOwnMissing')}
          </span>
          <span className="partner-distance-meta" aria-hidden="true">
            · {t('partnerLocation.distanceOwnMissingAction')}
          </span>
        </Link>
      </div>
    );
  }

  const text = distanceText(line.band);
  const fresh = isDistanceFresh(line.asOf, now);
  const earlier = fresh ? null : asOfLabel(line.asOf, now);
  const description = earlier
    ? `${text}, ${t('partnerLocation.distanceAsOfLabel', { time: earlier })}`
    : text;
  const className = `partner-distance-line${fresh ? '' : ' is-earlier'}`;
  const content = (
    <>
      <Glyph kind={fresh ? 'heart' : 'clock'} />
      <span className="partner-distance-value">{text}</span>
      {earlier ? (
        <span className="partner-distance-meta" aria-hidden="true">
          · {earlier}
        </span>
      ) : null}
    </>
  );

  return (
    // Keyed by the visible value so a change cross-fades instead of counting.
    <div className="partner-distance-signal" key={`${text}:${earlier ?? ''}`}>
      {line.mapAvailable ? (
        <Link
          className={`${className} is-link`}
          to={PARTNER_LOCATION_MAP_ROUTE}
          aria-label={`${description}. ${t('partnerLocation.distanceOpenMap')}`}
        >
          {content}
          <Glyph kind="chevron" />
        </Link>
      ) : (
        <p className={className}>
          {earlier ? (
            <>
              <span className="partner-distance-visual" aria-hidden="true">
                {content}
              </span>
              <span className="sr-only">{description}</span>
            </>
          ) : (
            content
          )}
        </p>
      )}
    </div>
  );
}

/**
 * Wir orchestration (#1792): trigger = paired, `presence.location` held, the
 * feature available and the viewer's own display preference on; the server
 * decides the rest. Errors and offline reads leave the line absent.
 */
export function WirPartnerDistance({
  api,
  entitlementApi,
  instance,
  accountId,
  spaceId,
}: {
  api: Pick<PartnerLocationApi, 'getPartnerDistance' | 'getPartnerLocationMap'>;
  entitlementApi: EntitlementsApi | undefined;
  instance: string;
  accountId: string;
  spaceId: string;
}) {
  const preference = usePartnerDistanceOnWir({ instance, accountId, spaceId });
  const load = useMemo(
    () =>
      entitlementApi ? entitlementLoader(entitlementApi, spaceId) : undefined,
    [entitlementApi, spaceId],
  );
  const capability = useSpaceCapability({
    accountId,
    spaceId,
    load,
    capability: PARTNER_LOCATION_CAPABILITY,
  });
  // The app-level sync reads the owner's settings on open and resume; this
  // only observes that entry instead of adding another read.
  const settings = useQuery<PartnerLocationSettingsView>({
    queryKey: partnerLocationSettingsQueryKey(accountId, spaceId),
    enabled: false,
  }).data;
  const enabled =
    preference.shown &&
    capability.data === true &&
    !capability.isError &&
    settings?.available === true;
  const query = usePartnerDistanceLine({ api, accountId, spaceId, enabled });
  if (!enabled || query.isError || !query.data) return null;
  return <PartnerDistanceLine line={query.data} />;
}
