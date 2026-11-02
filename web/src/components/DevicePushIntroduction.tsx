import { useCallback, useEffect, useRef, useState } from 'react';
import type { DevicePushController } from '../client/devicePush';
import {
  devicePushAction,
  devicePushStatusKey,
} from '../client/devicePushPresentation';
import { postSnackbar } from '../client/snackbar';
import { useDocumentLeaveBlocked } from '../client/useDocumentLeaveGuard';
import { useTranslation } from '../i18n';
import { ShortTaskSheet } from './ShortTaskSheet';
import './DevicePushIntroduction.css';

function acknowledgmentKey(accountId: string, apiBaseUrl: string): string {
  return `eimir:device-push-introduction:v1:${apiBaseUrl}:${accountId}`;
}

function wasAcknowledged(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === 'seen';
  } catch {
    return false;
  }
}

/** Account/API ownership must remount the bounded consent task. */
export function DevicePushIntroduction({
  accountId,
  apiBaseUrl,
  devicePush,
}: {
  accountId: string;
  apiBaseUrl: string;
  devicePush: DevicePushController;
}) {
  return (
    <Introduction
      key={acknowledgmentKey(accountId, apiBaseUrl)}
      storageKey={acknowledgmentKey(accountId, apiBaseUrl)}
      devicePush={devicePush}
    />
  );
}

function Introduction({
  storageKey,
  devicePush,
}: {
  storageKey: string;
  devicePush: DevicePushController;
}) {
  const { t } = useTranslation();
  const blocked = useDocumentLeaveBlocked();
  const [acknowledged, setAcknowledged] = useState(() =>
    wasAcknowledged(storageKey),
  );
  const [open, setOpen] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const activationPending = useRef(false);
  const allowRef = useRef<HTMLButtonElement>(null);
  const remember = useCallback(() => {
    setAcknowledged(true);
    try {
      window.localStorage.setItem(storageKey, 'seen');
    } catch {
      // Consent remains optional and dismissible in this mounted session.
    }
  }, [storageKey]);

  useEffect(() => {
    if (devicePush.state === 'on') {
      remember();
      setOpen(false);
      if (attempted && open) postSnackbar('notificationSettings.deviceOn');
      return;
    }
    if (
      !acknowledged &&
      !blocked &&
      devicePush.available &&
      !devicePush.registered &&
      devicePush.state === 'off' &&
      !devicePush.error
    )
      setOpen(true);
  }, [
    acknowledged,
    attempted,
    blocked,
    devicePush.available,
    devicePush.error,
    devicePush.registered,
    devicePush.state,
    open,
    remember,
  ]);

  function dismiss() {
    remember();
    setOpen(false);
  }

  async function enable() {
    if (activationPending.current || devicePush.state === 'connecting') return;
    activationPending.current = true;
    remember();
    setAttempted(true);
    try {
      await devicePush.enable();
    } finally {
      activationPending.current = false;
    }
  }

  const busy =
    devicePush.state === 'connecting' || devicePush.state === 'disconnecting';
  const action = devicePushAction(devicePush);
  return (
    <ShortTaskSheet
      open={open && !blocked}
      title={t('notificationSettings.introductionTitle')}
      onClose={dismiss}
      initialFocusRef={allowRef}
      className="device-push-introduction"
    >
      <p>{t('notificationSettings.introductionBody')}</p>
      <p className="device-push-introduction-hint">
        {t('notificationSettings.introductionLater')}
      </p>
      <details>
        <summary>{t('notificationSettings.introductionPrivacy')}</summary>
        <p>{t('notificationSettings.deviceIntro')}</p>
      </details>
      {attempted && (
        <p role="status" aria-live="polite">
          {t(devicePushStatusKey(devicePush))}
        </p>
      )}
      <div className="device-push-introduction-actions" aria-busy={busy}>
        {action === 'openSettings' ? (
          <button type="button" onClick={() => void devicePush.openSettings()}>
            {t('notificationSettings.deviceOpenSettings')}
          </button>
        ) : action === 'enable' || busy ? (
          <button
            type="button"
            ref={allowRef}
            disabled={busy}
            onClick={() => void enable()}
          >
            {t(
              attempted
                ? 'common.retry'
                : 'notificationSettings.introductionAllow',
            )}
          </button>
        ) : null}
        <button type="button" className="secondary" onClick={dismiss}>
          {t(
            attempted
              ? 'notificationSettings.introductionClose'
              : 'notificationSettings.introductionSkip',
          )}
        </button>
      </div>
    </ShortTaskSheet>
  );
}
