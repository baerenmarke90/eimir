import { useEffect, useRef, useState } from 'react';
import { isClientOnline } from '../client/connectivity';
import {
  DEFAULT_SHARING_DURATION,
  hasStoredSharing,
  partnerLocationOnboardingKey,
  rememberPartnerLocationOnboardingAnswer,
  type SharedLevel,
  type SharingDuration,
  usePartnerLocationApi,
  usePartnerLocationCapability,
  usePartnerLocationSettings,
  usePartnerLocationWrites,
  usePartnerName,
  wasPartnerLocationOnboardingAnswered,
} from '../client/partnerLocation';
import { usePartnerNickname } from '../client/partnerNickname';
import { useDocumentLeaveBlocked } from '../client/useDocumentLeaveGuard';
import { useTranslation } from '../i18n';
import {
  DisclosurePoint,
  DurationChoice,
  LevelChoice,
  sharedSnackbar,
  shareWithPermission,
} from './PartnerLocationControls';
import { ShortTaskSheet } from './ShortTaskSheet';
import './PartnerLocation.css';

/**
 * One-time, optional introduction to partner distance (#1792). It follows
 * the push prompt, appears only for a paired, entitled Space where the feature
 * is available, and never mentions what the partner shares. The OS location
 * dialog appears only after "Share distance".
 */
export function PartnerLocationOnboarding({
  apiBaseUrl,
  accessToken,
  accountId,
  spaceId,
  ready,
}: {
  apiBaseUrl: string;
  accessToken: string;
  accountId: string;
  spaceId: string;
  /** The preceding start prompt (push) is settled. */
  ready: boolean;
}) {
  const { t } = useTranslation();
  const owner = { apiBaseUrl, accessToken, accountId, spaceId };
  const decisionKey = partnerLocationOnboardingKey(apiBaseUrl, accountId);
  const [answered, setAnswered] = useState(() =>
    wasPartnerLocationOnboardingAnswered(decisionKey),
  );
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState<SharedLevel>('DISTANCE');
  const [duration, setDuration] = useState<SharingDuration>(
    DEFAULT_SHARING_DURATION,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const shareRef = useRef<HTMLButtonElement>(null);
  const blocked = useDocumentLeaveBlocked();

  const capability = usePartnerLocationCapability(owner);
  const api = usePartnerLocationApi(owner);
  const writes = usePartnerLocationWrites({ api, accountId, spaceId });
  const settingsQuery = usePartnerLocationSettings({
    ...owner,
    api,
    enabled: ready && !answered && capability.data === true,
  });
  const settings = settingsQuery.data;
  const { relationshipLabel } = usePartnerNickname();
  const partnerInfo = usePartnerName({
    ...owner,
    enabled: open || settings?.available === true,
  });
  const partner = partnerInfo.id
    ? relationshipLabel(
        partnerInfo.id,
        partnerInfo.name ?? '',
        t('partnerLocation.partnerFallback'),
      )
    : t('partnerLocation.partnerFallback');

  useEffect(() => {
    if (answered || open || !ready || blocked || !settings) return;
    if (hasStoredSharing(settings)) {
      // A choice already exists (for example from another device).
      rememberPartnerLocationOnboardingAnswer(decisionKey);
      setAnswered(true);
      return;
    }
    // The partner's name is known before the sheet appears.
    if (settings.available && partnerInfo.paired && isClientOnline())
      setOpen(true);
  }, [
    answered,
    blocked,
    decisionKey,
    open,
    partnerInfo.paired,
    ready,
    settings,
  ]);

  function answer() {
    rememberPartnerLocationOnboardingAnswer(decisionKey);
    setAnswered(true);
  }

  function later() {
    if (busy) return;
    answer();
    setOpen(false);
  }

  async function share() {
    if (busy) return;
    if (!isClientOnline()) {
      setMessage(t('partnerLocation.onboardingOffline'));
      return;
    }
    answer();
    setBusy(true);
    setMessage(null);
    try {
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
        setOpen(false);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <ShortTaskSheet
      open={open}
      title={t('partnerLocation.onboardingTitle')}
      onClose={later}
      isCloseBlocked={busy}
      initialFocusRef={shareRef}
      className="partner-location-sheet"
      footer={
        <div className="partner-location-sheet-actions">
          <button
            ref={shareRef}
            type="button"
            className="button-link button-link-primary partner-location-primary"
            disabled={busy}
            aria-busy={busy || undefined}
            onClick={() => void share()}
          >
            {t('partnerLocation.onboardingShare')}
          </button>
          <button
            type="button"
            className="tertiary partner-location-quiet"
            disabled={busy}
            onClick={later}
          >
            {t('partnerLocation.onboardingLater')}
          </button>
        </div>
      }
    >
      <p className="partner-location-sheet-lead">
        {t('partnerLocation.onboardingIntro', { partner })}
      </p>
      <ul className="partner-location-points">
        <DisclosurePoint icon="shield">
          {t('partnerLocation.onboardingCoarse')}
        </DisclosurePoint>
        <DisclosurePoint icon="bolt">
          {t('partnerLocation.onboardingEnergy')}
        </DisclosurePoint>
        <DisclosurePoint icon="off">
          {t('partnerLocation.onboardingStop')}
        </DisclosurePoint>
      </ul>
      <LevelChoice value={level} onChange={setLevel} disabled={busy} />
      <DurationChoice value={duration} onChange={setDuration} disabled={busy} />
      {message ? (
        <p className="partner-location-sheet-message" role="alert">
          {message}
        </p>
      ) : null}
    </ShortTaskSheet>
  );
}
