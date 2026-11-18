import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import type { PartnerLocationApi } from '../api/generated/apis/PartnerLocationApi';
import type { PartnerLocationSettingsView } from '../api/generated/models/PartnerLocationSettingsView';
import {
  type DistanceWords,
  deviceLanguages,
  distanceBandWords,
  distanceUnitFor,
  formatCloseBand,
  formatDistanceBand,
  isDistanceFresh,
  type PartnerDistanceLine as PartnerDistanceLineState,
  usePartnerDistanceLine,
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

/** A today/yesterday label with the time for an earlier sample. */
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

const WORDS = {
  aroundCorner: {
    sentence: 'partnerLocation.distanceAroundCorner',
    short: 'partnerLocation.distanceAroundCornerShort',
  },
  stonesThrow: {
    sentence: 'partnerLocation.distanceStonesThrow',
    short: 'partnerLocation.distanceStonesThrowShort',
  },
  notFar: {
    sentence: 'partnerLocation.distanceNotFar',
    short: 'partnerLocation.distanceNotFarShort',
  },
  shortTrip: {
    sentence: 'partnerLocation.distanceShortTrip',
    short: 'partnerLocation.distanceShortTripShort',
  },
} as const satisfies Record<DistanceWords, { sentence: string; short: string }>;

/**
 * The band as a localized sentence: words for nearby and range bands
 * (#1907 H4), otherwise `partnerLocation.distanceBetween` with the value.
 */
export function useDistanceText() {
  const { t } = useTranslation();
  return (band: Parameters<typeof formatDistanceBand>[0]) => {
    const words = distanceBandWords(band);
    if (words) return t(WORDS[words].sentence);
    const locale = resolvedLocale();
    const close = formatCloseBand(
      band,
      locale,
      distanceUnitFor(locale, deviceLanguages()),
    );
    if (close) {
      return close.under
        ? t('partnerLocation.distanceCloseUnder', { distance: close.value })
        : t('partnerLocation.distanceBetween', { distance: close.value });
    }
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
      className={`inline-icon partner-distance-glyph is-${kind}`}
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
 * The value on the Wir hero axis. A changed value fades over: the previous one
 * leaves as a short-lived copy while the new one arrives, instead of the text
 * jumping. The leaving copy exists only under `no-preference` (it is
 * `display: none` otherwise), so it never lingers with reduced motion. The
 * first value and a re-render with the same value do not animate.
 */
function HeroDistanceValue({ value }: { value: string }) {
  const [shown, setShown] = useState(value);
  const [leaving, setLeaving] = useState<string | null>(null);
  const [swapped, setSwapped] = useState(false);
  if (value !== shown) {
    // Derived during render so the old text never flashes in its final state.
    setLeaving(shown);
    setShown(value);
    setSwapped(true);
  }
  return (
    <span className="wir-hero-distance-value" aria-hidden="true">
      {leaving === null ? null : (
        <span
          className="wir-hero-distance-leaving"
          onAnimationEnd={() => setLeaving(null)}
        >
          {leaving}
        </span>
      )}
      <span key={shown} className={swapped ? 'is-arriving' : undefined}>
        {shown}
      </span>
    </span>
  );
}

/**
 * The quiet distance signal inside the Wir couple hero (#1792). Absent
 * without a placeholder or reason whenever nothing may be shown.
 */
export function PartnerDistanceLine({
  line,
  partnerName,
  now = new Date(),
  compact = false,
}: {
  line: PartnerDistanceLineState;
  partnerName: string;
  now?: Date;
  /** The "Verbunden" Wir hero: only the value, on the axis between the two. */
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const asOfLabel = useDistanceAsOfLabel();
  const distanceText = useDistanceText();

  if (line.kind === 'hidden') return null;

  if (compact) {
    if (line.kind === 'sharing') return null;
    if (line.kind === 'ownMissing') {
      return (
        <Link
          className="wir-hero-distance is-action"
          to={PARTNER_LOCATION_SETTINGS_ROUTE}
          aria-label={t('partnerLocation.distanceOwnMissingLabel')}
        >
          {t('partnerLocation.distanceShareShort')}
        </Link>
      );
    }
    const locale = resolvedLocale();
    const words = distanceBandWords(line.band);
    const close = formatCloseBand(
      line.band,
      locale,
      distanceUnitFor(locale, deviceLanguages()),
    );
    const value = words
      ? t(WORDS[words].short)
      : close
        ? close.under
          ? t('partnerLocation.distanceCloseUnderShort', {
              distance: close.value,
            })
          : close.value
        : (formatDistanceBand(
            line.band,
            locale,
            distanceUnitFor(locale, deviceLanguages()),
          ) ?? t('partnerLocation.distanceNearShort'));
    const compactFresh = isDistanceFresh(line.asOf, now);
    const compactDescription = compactFresh
      ? distanceText(line.band)
      : `${distanceText(line.band)}, ${t('partnerLocation.distanceAsOfLabel', {
          time: asOfLabel(line.asOf, now),
        })}`;
    const compactContent = (
      <>
        {/* Always the familiar distance pin (Product Owner, 2026-11-16); an
            earlier value is named in the accessible description. */}
        <Glyph kind="pin" />
        <HeroDistanceValue value={value} />
      </>
    );
    // A current position is marked (pin colour, one quiet ring); an earlier
    // one stays grey and still.
    const heroClass = `wir-hero-distance ${compactFresh ? 'is-fresh' : 'is-earlier'}`;
    return line.mapAvailable ? (
      <Link
        className={heroClass}
        to={PARTNER_LOCATION_MAP_ROUTE}
        aria-label={`${compactDescription}. ${t('partnerLocation.distanceOpenMap')}`}
      >
        {compactContent}
      </Link>
    ) : (
      <p className={heroClass}>
        {compactContent}
        <span className="sr-only">{compactDescription}</span>
      </p>
    );
  }

  if (line.kind === 'sharing') {
    return (
      <div className="partner-distance-signal">
        <Link
          className="partner-distance-line is-sharing is-link"
          to={PARTNER_LOCATION_SETTINGS_ROUTE}
          aria-label={t('partnerLocation.distanceSharingLabel', {
            partner: partnerName,
          })}
        >
          <Glyph kind="heart" />
          <span className="partner-distance-value">
            {t('partnerLocation.distanceSharing', { partner: partnerName })}
          </span>
          <Glyph kind="chevron" />
        </Link>
      </div>
    );
  }

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
 * Wir orchestration (#1792): trigger = paired, `presence.location` held and the
 * feature available; the Wir module preference (`partner_distance`) decides
 * whether and where it appears. The server decides the rest. Errors and
 * offline reads leave the line absent.
 */
export function WirPartnerDistance({
  api,
  entitlementApi,
  accountId,
  spaceId,
  partnerName,
  compact = false,
}: {
  api: Pick<PartnerLocationApi, 'getPartnerDistance' | 'getPartnerLocationMap'>;
  entitlementApi: EntitlementsApi | undefined;
  accountId: string;
  spaceId: string;
  partnerName: string;
  compact?: boolean;
}) {
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
    capability.data === true &&
    !capability.isError &&
    settings?.available === true;
  const query = usePartnerDistanceLine({ api, accountId, spaceId, enabled });
  if (!enabled || query.isError || !query.data) return null;
  return (
    <PartnerDistanceLine
      line={query.data}
      partnerName={partnerName}
      compact={compact}
    />
  );
}

/**
 * The band as the short H4 word or value, for compact captions such as the
 * Herzversteck flight (#1907 H3); never more precise than the server band.
 */
export function useDistanceShortText() {
  const { t } = useTranslation();
  return (band: Parameters<typeof formatDistanceBand>[0]) => {
    const words = distanceBandWords(band);
    if (words) return t(WORDS[words].short);
    const locale = resolvedLocale();
    const close = formatCloseBand(
      band,
      locale,
      distanceUnitFor(locale, deviceLanguages()),
    );
    if (close) {
      return close.under
        ? t('partnerLocation.distanceCloseUnderShort', {
            distance: close.value,
          })
        : close.value;
    }
    const distance = formatDistanceBand(
      band,
      locale,
      distanceUnitFor(locale, deviceLanguages()),
    );
    return distance ?? t('partnerLocation.distanceNearShort');
  };
}
