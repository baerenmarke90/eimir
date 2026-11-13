import { focusManager } from '@tanstack/react-query';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AccountView } from '../api/generated/models/AccountView';
import type { SharingLevel } from '../api/generated/models/SharingLevel';
import {
  type BackgroundLocationStatus,
  backgroundLocationStatus,
  disableBackgroundSharing,
  enableBackgroundSharing,
  type LocationPermission,
  locationPermission,
  openLocationSettings,
  publishOwnPositionIfDue,
  requestBackgroundLocationPermission,
  requestLocationPermission,
  usesNativeLocationSettings,
} from '../client/approximateLocation';
import { isClientOnline } from '../client/connectivity';
import {
  currentSharingDuration,
  hasStoredSharing,
  isSharingActive,
  raisesVisibility,
  type SharedLevel,
  usePartnerLocationApi,
  usePartnerLocationCapability,
  usePartnerLocationSettings,
  usePartnerLocationWrites,
  usePartnerName,
} from '../client/partnerLocation';
import { usePartnerNickname } from '../client/partnerNickname';
import { clientProblemKind } from '../client/problemDetails';
import { PRO_INFORMATION_ROUTE } from '../client/routes';
import { postSnackbar } from '../client/snackbar';
import { useTranslation } from '../i18n';
import { PageHeader } from './PageHeader';
import {
  BackgroundLocationDisclosure,
  PartnerLocationShareSheet,
  useSharingEndLabel,
} from './PartnerLocationControls';
import { PreferenceSwitch } from './PreferenceSwitch';
import { ProMark } from './ProMark';
import './PartnerLocation.css';

const LEVELS: readonly {
  value: SharingLevel;
  label: string;
  hint: string;
}[] = [
  {
    value: 'OFF',
    label: 'partnerLocation.levelOff',
    hint: 'partnerLocation.levelOffHint',
  },
  {
    value: 'DISTANCE',
    label: 'partnerLocation.levelDistance',
    hint: 'partnerLocation.levelDistanceHint',
  },
  {
    value: 'DISTANCE_AND_MAP',
    label: 'partnerLocation.levelMap',
    hint: 'partnerLocation.levelMapHint',
  },
];

const PERMISSION_KEYS: Record<LocationPermission, string> = {
  granted: 'partnerLocation.permissionGranted',
  denied: 'partnerLocation.permissionDenied',
  prompt: 'partnerLocation.permissionPrompt',
  unsupported: 'partnerLocation.permissionUnsupported',
};

type Sheet =
  | { kind: 'confirm'; level: SharedLevel }
  | { kind: 'duration'; level: SharedLevel }
  | null;

/** Owner-only sharing settings for partner distance (#1792). */
export function PartnerLocationSettingsPage({
  apiBaseUrl,
  accessToken,
  account,
  spaceId,
}: {
  apiBaseUrl: string;
  accessToken: string;
  account: AccountView;
  spaceId: string;
}) {
  const { t } = useTranslation();
  const owner = { apiBaseUrl, accessToken, accountId: account.id, spaceId };
  const api = usePartnerLocationApi(owner);
  const settingsQuery = usePartnerLocationSettings({ ...owner, api });
  const capability = usePartnerLocationCapability(owner);
  const writes = usePartnerLocationWrites({
    api,
    accountId: account.id,
    spaceId,
  });
  const { relationshipLabel } = usePartnerNickname();
  const partnerInfo = usePartnerName(owner);
  const partner = partnerInfo.id
    ? relationshipLabel(
        partnerInfo.id,
        partnerInfo.name ?? '',
        t('partnerLocation.partnerFallback'),
      )
    : t('partnerLocation.partnerFallback');
  const endLabel = useSharingEndLabel();
  const levelName = useId();
  const native = usesNativeLocationSettings();

  const [sheet, setSheet] = useState<Sheet>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [stopPending, setStopPending] = useState(false);
  const [permission, setPermission] = useState<LocationPermission | null>(null);
  const [background, setBackground] = useState<BackgroundLocationStatus>({
    permission: 'unsupported',
    enabled: false,
  });
  const [disclosureOpen, setDisclosureOpen] = useState(false);
  const [backgroundBusy, setBackgroundBusy] = useState(false);
  const [backgroundDenied, setBackgroundDenied] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refreshDevice = useCallback(async () => {
    const [nextPermission, nextBackground] = await Promise.all([
      locationPermission().catch(() => 'unsupported' as const),
      backgroundLocationStatus().catch(() => ({
        permission: 'unsupported' as const,
        enabled: false,
      })),
    ]);
    if (!mounted.current) return;
    setPermission(nextPermission);
    setBackground(nextBackground);
  }, []);

  // Returning from the Android settings re-reads the device state.
  useEffect(() => {
    void refreshDevice();
    return focusManager.subscribe((focused) => {
      if (focused) void refreshDevice();
    });
  }, [refreshDevice]);

  const settings = settingsQuery.data;
  const entitled = capability.data === true;
  const available = settings?.available === true;
  const active = isSharingActive(settings);
  const effectiveLevel: SharingLevel =
    active && settings ? settings.level : 'OFF';
  const stored = hasStoredSharing(settings);

  const stop = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    // Stop background updates on this device first; this needs no server.
    void disableBackgroundSharing({ api, spaceId })
      .catch(() => undefined)
      .then(() => refreshDevice());
    try {
      await writes.stop();
      if (!mounted.current) return;
      setStopPending(false);
      postSnackbar('partnerLocation.stopped');
    } catch (error) {
      if (!mounted.current) return;
      if (!isClientOnline() || clientProblemKind(error) === 'offline') {
        setStopPending(true);
      } else {
        setMessage(t('partnerLocation.writeFailed'));
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [api, refreshDevice, spaceId, t, writes]);

  // A pending Stop is sent as soon as the connection returns.
  useEffect(() => {
    if (!stopPending) return;
    const retry = () => void stop();
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [stop, stopPending]);

  async function chooseLevel(next: SharingLevel) {
    if (busy || next === effectiveLevel) return;
    setMessage(null);
    if (next === 'OFF') {
      await stop();
      return;
    }
    if (raisesVisibility(effectiveLevel, next) || !settings) {
      setSheet({ kind: 'confirm', level: next });
      return;
    }
    // Narrowing takes effect immediately and keeps the chosen end.
    setBusy(true);
    try {
      await writes.narrow(next, settings);
      postSnackbar('partnerLocation.levelSaved');
    } catch {
      setMessage(t('partnerLocation.writeFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function allowLocation() {
    const next = await requestLocationPermission();
    setPermission(next);
    if (next !== 'granted' || !settings) return;
    try {
      const view = await publishOwnPositionIfDue({
        api,
        spaceId,
        accountId: account.id,
        settings,
      });
      if (view) writes.store(view);
    } catch {
      setMessage(t('partnerLocation.locationUnavailable'));
    }
  }

  async function turnOnBackground() {
    setBackgroundBusy(true);
    setBackgroundDenied(false);
    try {
      const granted = await requestBackgroundLocationPermission();
      if (granted !== 'granted') {
        setBackgroundDenied(true);
        return;
      }
      await enableBackgroundSharing({ api, spaceId, instance: apiBaseUrl });
      postSnackbar('partnerLocation.backgroundOn');
    } catch {
      setBackgroundDenied(true);
    } finally {
      setDisclosureOpen(false);
      setBackgroundBusy(false);
      void refreshDevice();
    }
  }

  async function turnOffBackground() {
    setBackgroundBusy(true);
    try {
      await disableBackgroundSharing({ api, spaceId });
      postSnackbar('partnerLocation.backgroundOff');
    } finally {
      setBackgroundBusy(false);
      void refreshDevice();
    }
  }

  const header = (
    <PageHeader
      eyebrow={t('partnerLocation.settingsEyebrow')}
      title={t('partnerLocation.settingsTitle')}
      titleContext={<ProMark label={t('partnerLocation.pro')} />}
    />
  );

  if (settingsQuery.isPending) {
    return (
      <div className="page settings-page settings-category-page partner-location-page">
        {header}
        <p className="partner-location-hint" role="status">
          {t('partnerLocation.loading')}
        </p>
      </div>
    );
  }

  if (settingsQuery.isError || !settings) {
    return (
      <div className="page settings-page settings-category-page partner-location-page">
        {header}
        <div className="partner-location-problem" role="alert">
          <p>{t('partnerLocation.loadFailed')}</p>
          <button
            type="button"
            className="secondary"
            onClick={() => void settingsQuery.refetch()}
          >
            {t('common.retry')}
          </button>
        </div>
      </div>
    );
  }

  const canChoose = available && entitled;
  const sharedLevel: SharedLevel =
    settings.level === 'OFF' ? 'DISTANCE' : settings.level;

  let statusLine: string | null = null;
  if (stopPending) statusLine = t('partnerLocation.statusStopPending');
  else if (active)
    statusLine =
      settings.indefinite || !settings.expiresAt
        ? t('partnerLocation.statusActiveIndefinite')
        : t('partnerLocation.statusActiveUntil', {
            end: endLabel(settings.expiresAt),
          });
  else if (settings.state === 'EXPIRED')
    statusLine = t('partnerLocation.statusExpired');
  else if (settings.state === 'SUSPENDED')
    statusLine = entitled
      ? t('partnerLocation.statusSuspendedConfirm')
      : t('partnerLocation.statusSuspended');
  else if (settings.state === 'PARTNER_CHANGED')
    statusLine = t('partnerLocation.statusPartnerChanged');

  const showStop = (stored || stopPending) && settings.state !== 'EXPIRED';
  const canShareAgain =
    canChoose &&
    !active &&
    !stopPending &&
    (settings.state === 'EXPIRED' || settings.state === 'SUSPENDED');

  return (
    <div className="page settings-page settings-category-page partner-location-page">
      {header}

      <section
        className="settings-section partner-location-section"
        aria-labelledby="partner-location-level-heading"
      >
        <div className="settings-section-head">
          <h2 id="partner-location-level-heading">
            {t('partnerLocation.levelTitle', { partner })}
          </h2>
          <p className="settings-section-intro">
            {t('partnerLocation.levelIntro', { partner })}
          </p>
        </div>

        {!entitled && capability.isSuccess ? (
          <div className="partner-location-pro">
            <p className="partner-location-pro-title">
              {t('partnerLocation.proTitle')}
            </p>
            <p>{t('partnerLocation.proBody')}</p>
            <Link
              className="button-link secondary-link"
              to={PRO_INFORMATION_ROUTE}
            >
              {t('partnerLocation.proAction')}
            </Link>
          </div>
        ) : null}

        {canChoose ? (
          <fieldset
            className="partner-location-levels"
            disabled={busy}
            aria-describedby={message ? 'partner-location-message' : undefined}
          >
            <legend className="sr-only">
              {t('partnerLocation.levelTitle', { partner })}
            </legend>
            {LEVELS.map((level) => (
              <label
                key={level.value}
                className={
                  level.value === effectiveLevel
                    ? 'partner-location-level is-selected'
                    : 'partner-location-level'
                }
              >
                <input
                  type="radio"
                  name={levelName}
                  value={level.value}
                  checked={level.value === effectiveLevel}
                  onChange={() => void chooseLevel(level.value)}
                />
                <span className="partner-location-level-copy">
                  <strong>{t(level.label)}</strong>
                  <span>{t(level.hint)}</span>
                </span>
              </label>
            ))}
          </fieldset>
        ) : entitled && capability.isSuccess && !stored ? (
          <p className="partner-location-hint">
            {t('partnerLocation.unavailable')}
          </p>
        ) : null}

        {statusLine || showStop ? (
          <div
            className={
              active && !stopPending
                ? 'partner-location-status is-active'
                : 'partner-location-status'
            }
          >
            {statusLine ? (
              <p role="status" aria-live="polite">
                {active && !stopPending ? (
                  <span
                    className="partner-location-status-dot"
                    aria-hidden="true"
                  />
                ) : null}
                {statusLine}
              </p>
            ) : null}
            <div className="partner-location-status-actions">
              {active && canChoose && !stopPending ? (
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    setSheet({ kind: 'duration', level: sharedLevel })
                  }
                >
                  {t('partnerLocation.changeDuration')}
                </button>
              ) : null}
              {canShareAgain ? (
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    setSheet({ kind: 'confirm', level: sharedLevel })
                  }
                >
                  {t('partnerLocation.shareAgain')}
                </button>
              ) : null}
              {showStop ? (
                <button
                  type="button"
                  className="secondary partner-location-stop"
                  disabled={busy}
                  aria-busy={busy || undefined}
                  onClick={() => void stop()}
                >
                  {t('partnerLocation.stop')}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {message ? (
          <p
            id="partner-location-message"
            className="partner-location-sheet-message"
            role="alert"
          >
            {message}
          </p>
        ) : null}
      </section>

      {canChoose || background.enabled ? (
        <section
          className="settings-section partner-location-section"
          aria-labelledby="partner-location-device-heading"
        >
          <div className="settings-section-head">
            <h2 id="partner-location-device-heading">
              {t(
                native
                  ? 'partnerLocation.deviceTitleApp'
                  : 'partnerLocation.deviceTitleBrowser',
              )}
            </h2>
          </div>
          <div className="partner-location-device">
            {background.permission !== 'unsupported' ? (
              <div className="partner-location-device-row">
                <PreferenceSwitch
                  label={t('partnerLocation.backgroundLabel')}
                  description={
                    active
                      ? t('partnerLocation.backgroundHint')
                      : `${t('partnerLocation.backgroundHint')} ${t('partnerLocation.backgroundNeedsSharing')}`
                  }
                  checked={background.enabled && active}
                  disabled={backgroundBusy || (!active && !background.enabled)}
                  onCheckedChange={(checked) => {
                    if (checked) setDisclosureOpen(true);
                    else void turnOffBackground();
                  }}
                />
                {backgroundDenied ? (
                  <p className="partner-location-hint" role="status">
                    {t('partnerLocation.backgroundDenied')}
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="partner-location-device-row partner-location-permission">
              <span className="partner-location-permission-copy">
                <strong>
                  {permission ? t(PERMISSION_KEYS[permission]) : ' '}
                </strong>
                {native ? (
                  <button
                    type="button"
                    className="tertiary partner-location-inline-action"
                    onClick={() => void openLocationSettings()}
                  >
                    {t('partnerLocation.permissionChangeApp')}
                  </button>
                ) : permission !== 'unsupported' ? (
                  <span>{t('partnerLocation.permissionChangeBrowser')}</span>
                ) : null}
              </span>
              {permission === 'granted' ? (
                <svg
                  className="partner-location-permission-mark"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  focusable="false"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="m8 12.5 2.7 2.7L16 9.8" />
                </svg>
              ) : permission === 'prompt' && active ? (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void allowLocation()}
                >
                  {t('partnerLocation.permissionAllow')}
                </button>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {sheet ? (
        <PartnerLocationShareSheet
          open
          mode={sheet.kind}
          level={sheet.level}
          partner={partner}
          initialDuration={
            sheet.kind === 'duration'
              ? currentSharingDuration(settings)
              : undefined
          }
          api={api}
          writes={writes}
          accountId={account.id}
          spaceId={spaceId}
          onClose={() => setSheet(null)}
          onOutcome={(outcome) => {
            if (outcome === 'unmeasured')
              setMessage(t('partnerLocation.locationUnavailable'));
            void refreshDevice();
          }}
        />
      ) : null}

      <BackgroundLocationDisclosure
        open={disclosureOpen}
        level={sharedLevel}
        partner={partner}
        busy={backgroundBusy}
        onContinue={() => void turnOnBackground()}
        onForegroundOnly={() => setDisclosureOpen(false)}
      />
    </div>
  );
}
