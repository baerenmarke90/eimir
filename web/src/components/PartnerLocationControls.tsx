import { useId, useRef, useState } from 'react';
import type { PartnerLocationApi } from '../api/generated/apis/PartnerLocationApi';
import type { PartnerLocationSettingsView } from '../api/generated/models/PartnerLocationSettingsView';
import {
  publishOwnPositionIfDue,
  requestLocationPermission,
} from '../client/approximateLocation';
import { isClientOnline } from '../client/connectivity';
import {
  DEFAULT_SHARING_DURATION,
  SHARING_DURATIONS,
  type SharedLevel,
  type SharingDuration,
  type usePartnerLocationWrites,
} from '../client/partnerLocation';
import { postSnackbar } from '../client/snackbar';
import { resolvedLocale, useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import { ShortTaskSheet } from './ShortTaskSheet';
import './PartnerLocation.css';

type Writes = ReturnType<typeof usePartnerLocationWrites>;

const DURATION_LABELS: Record<SharingDuration, string> = {
  hour: 'partnerLocation.durationHour',
  evening: 'partnerLocation.durationEvening',
  indefinite: 'partnerLocation.durationIndefinite',
};

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** "today, 23:59" / "tomorrow, 23:59" for a bounded share (at most 24 h). */
export function useSharingEndLabel() {
  const { t } = useTranslation();
  return (expiresAt: Date, now: Date = new Date()) => {
    const time = new Intl.DateTimeFormat(resolvedLocale(), {
      hour: '2-digit',
      minute: '2-digit',
    }).format(expiresAt);
    return t(
      sameLocalDay(expiresAt, now)
        ? 'partnerLocation.endToday'
        : 'partnerLocation.endTomorrow',
      { time },
    );
  };
}

function SegmentedChoice<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
  disabled,
}: {
  legend: string;
  name: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="partner-location-segmented" disabled={disabled}>
      <legend className="partner-location-segmented-legend">{legend}</legend>
      <div className="partner-location-segmented-options">
        {options.map((option) => (
          <label
            key={option.value}
            className={
              option.value === value
                ? 'partner-location-segment is-selected'
                : 'partner-location-segment'
            }
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function DurationChoice({
  value,
  onChange,
  disabled,
}: {
  value: SharingDuration;
  onChange: (value: SharingDuration) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const name = useId();
  return (
    <div className="partner-location-duration">
      <SegmentedChoice
        legend={t('partnerLocation.durationLegend')}
        name={name}
        value={value}
        onChange={onChange}
        disabled={disabled}
        options={SHARING_DURATIONS.map((duration) => ({
          value: duration,
          label: t(DURATION_LABELS[duration]),
        }))}
      />
      {value === 'indefinite' ? (
        <p className="partner-location-hint" aria-live="polite">
          {t('partnerLocation.durationIndefiniteHint')}
        </p>
      ) : null}
    </div>
  );
}

export function LevelChoice({
  value,
  onChange,
  disabled,
}: {
  value: SharedLevel;
  onChange: (value: SharedLevel) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const name = useId();
  return (
    <SegmentedChoice
      legend={t('partnerLocation.levelLegend')}
      name={name}
      value={value}
      onChange={onChange}
      disabled={disabled}
      options={[
        { value: 'DISTANCE', label: t('partnerLocation.levelDistance') },
        {
          value: 'DISTANCE_AND_MAP',
          label: t('partnerLocation.levelMapShort'),
        },
      ]}
    />
  );
}

export type ShareOutcome = 'shared' | 'unmeasured' | 'permission' | 'failed';

/**
 * Asks for the approximate OS permission only now (after the explicit choice),
 * stores the consent and publishes one approximate position.
 */
export async function shareWithPermission({
  api,
  writes,
  accountId,
  spaceId,
  level,
  duration,
}: {
  api: Pick<PartnerLocationApi, 'publishPartnerLocationSnapshot'>;
  writes: Writes;
  accountId: string;
  spaceId: string;
  level: SharedLevel;
  duration: SharingDuration;
}): Promise<ShareOutcome> {
  const permission = await requestLocationPermission();
  if (permission !== 'granted') return 'permission';
  let view: PartnerLocationSettingsView;
  try {
    view = await writes.share(level, duration);
  } catch {
    return 'failed';
  }
  try {
    const published = await publishOwnPositionIfDue({
      api,
      spaceId,
      accountId,
      settings: view,
    });
    if (published) writes.store(published);
  } catch {
    // Consent is stored; the next open or resume measures again.
    return 'unmeasured';
  }
  return 'shared';
}

export function sharedSnackbar(level: SharedLevel): void {
  postSnackbar(
    level === 'DISTANCE_AND_MAP'
      ? 'partnerLocation.sharedMap'
      : 'partnerLocation.shared',
  );
}

/**
 * Confirmation for a wider share (naming what becomes newly visible) or a
 * duration change of the active share.
 */
export function PartnerLocationShareSheet({
  open,
  mode,
  level,
  partner,
  initialDuration = DEFAULT_SHARING_DURATION,
  api,
  writes,
  accountId,
  spaceId,
  onClose,
  onOutcome,
}: {
  open: boolean;
  mode: 'confirm' | 'duration';
  level: SharedLevel;
  partner: string;
  initialDuration?: SharingDuration;
  api: Pick<PartnerLocationApi, 'publishPartnerLocationSnapshot'>;
  writes: Writes;
  accountId: string;
  spaceId: string;
  onClose: () => void;
  onOutcome: (outcome: ShareOutcome) => void;
}) {
  const { t } = useTranslation();
  const [duration, setDuration] = useState(initialDuration);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);

  async function confirm() {
    if (busy) return;
    if (!isClientOnline()) {
      setMessage(t('partnerLocation.onboardingOffline'));
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      if (mode === 'duration') {
        try {
          await writes.share(level, duration);
          postSnackbar('partnerLocation.durationSaved');
          onOutcome('shared');
          onClose();
        } catch {
          setMessage(t('partnerLocation.writeFailed'));
        }
        return;
      }
      const outcome = await shareWithPermission({
        api,
        writes,
        accountId,
        spaceId,
        level,
        duration,
      });
      if (outcome === 'permission') {
        setMessage(t('partnerLocation.permissionNeeded'));
      } else if (outcome === 'failed') {
        setMessage(t('partnerLocation.writeFailed'));
      } else {
        sharedSnackbar(level);
        onOutcome(outcome);
        onClose();
      }
    } finally {
      setBusy(false);
    }
  }

  const title =
    mode === 'duration'
      ? t('partnerLocation.durationTitle')
      : level === 'DISTANCE_AND_MAP'
        ? t('partnerLocation.confirmMapTitle')
        : t('partnerLocation.confirmDistanceTitle');

  return (
    <ShortTaskSheet
      open={open}
      title={title}
      onClose={() => {
        if (!busy) onClose();
      }}
      isCloseBlocked={busy}
      initialFocusRef={primaryRef}
      className="partner-location-sheet"
      footer={
        <div className="partner-location-sheet-actions">
          <button
            ref={primaryRef}
            type="button"
            className="button-link button-link-primary partner-location-primary"
            disabled={busy}
            aria-busy={busy || undefined}
            onClick={() => void confirm()}
          >
            {mode === 'duration'
              ? t('partnerLocation.durationSave')
              : level === 'DISTANCE_AND_MAP'
                ? t('partnerLocation.confirmShareMap')
                : t('partnerLocation.confirmShare')}
          </button>
          <button
            type="button"
            className="tertiary partner-location-quiet"
            disabled={busy}
            onClick={onClose}
          >
            {t('common.cancel')}
          </button>
        </div>
      }
    >
      {mode === 'confirm' ? (
        <p className="partner-location-sheet-lead">
          {level === 'DISTANCE_AND_MAP'
            ? t('partnerLocation.confirmMapBody')
            : t('partnerLocation.confirmDistanceBody', { partner })}
        </p>
      ) : null}
      <DurationChoice value={duration} onChange={setDuration} disabled={busy} />
      {message ? (
        <p className="partner-location-sheet-message" role="alert">
          {message}
        </p>
      ) : null}
    </ShortTaskSheet>
  );
}

export function DisclosurePoint({
  icon,
  children,
}: {
  icon: 'bolt' | 'shield' | 'off';
  children: string;
}) {
  return (
    <li>
      <EimirIcon
        name={icon === 'off' ? 'minus-circle' : icon}
        className="inline-icon"
      />
      <span>{children}</span>
    </li>
  );
}

/**
 * Google Play prominent disclosure (#1802) shown in-app before Android's
 * "Allow all the time" step. It is a separate, second step after sharing.
 */
export function BackgroundLocationDisclosure({
  open,
  level,
  partner,
  busy,
  onContinue,
  onForegroundOnly,
}: {
  open: boolean;
  level: SharedLevel;
  partner: string;
  busy: boolean;
  onContinue: () => void;
  onForegroundOnly: () => void;
}) {
  const { t } = useTranslation();
  const continueRef = useRef<HTMLButtonElement>(null);
  return (
    <ShortTaskSheet
      open={open}
      title={t('partnerLocation.disclosureTitle')}
      onClose={() => {
        if (!busy) onForegroundOnly();
      }}
      isCloseBlocked={busy}
      initialFocusRef={continueRef}
      className="partner-location-sheet"
      footer={
        <div className="partner-location-sheet-actions">
          <button
            ref={continueRef}
            type="button"
            className="button-link button-link-primary partner-location-primary"
            disabled={busy}
            aria-busy={busy || undefined}
            onClick={onContinue}
          >
            {t('partnerLocation.disclosureContinue')}
          </button>
          <button
            type="button"
            className="tertiary partner-location-quiet"
            disabled={busy}
            onClick={onForegroundOnly}
          >
            {t('partnerLocation.disclosureForegroundOnly')}
          </button>
        </div>
      }
    >
      <p className="partner-location-sheet-lead">
        {t(
          level === 'DISTANCE_AND_MAP'
            ? 'partnerLocation.disclosureBodyMap'
            : 'partnerLocation.disclosureBody',
          { partner },
        )}
      </p>
      <ul className="partner-location-points">
        <DisclosurePoint icon="bolt">
          {t('partnerLocation.disclosurePassive')}
        </DisclosurePoint>
        <DisclosurePoint icon="shield">
          {t('partnerLocation.disclosurePurpose', { partner })}
        </DisclosurePoint>
        <DisclosurePoint icon="off">
          {t('partnerLocation.disclosureStop')}
        </DisclosurePoint>
      </ul>
      <p className="partner-location-hint">
        {t('partnerLocation.disclosureAndroidHint')}
      </p>
    </ShortTaskSheet>
  );
}
