import { useEffect, useRef, useState } from 'react';
import { isClientOnline } from '../client/connectivity';
import type { DevicePushController } from '../client/devicePush';
import {
  devicePushAction,
  devicePushStatusKey,
} from '../client/devicePushPresentation';
import { postSnackbar } from '../client/snackbar';
import { useDocumentLeaveBlocked } from '../client/useDocumentLeaveGuard';
import { useTranslation } from '../i18n';
import { ShortTaskSheet } from './ShortTaskSheet';

const answeredInSession = new Set<string>();

function wasAnswered(key: string): boolean {
  if (answeredInSession.has(key)) return true;
  try {
    return window.localStorage.getItem(key) === 'answered';
  } catch {
    // Do not repeatedly ask when this device cannot retain the decision.
    return true;
  }
}

function rememberAnswer(key: string): void {
  answeredInSession.add(key);
  if (answeredInSession.size > 32)
    answeredInSession.delete(answeredInSession.values().next().value as string);
  try {
    window.localStorage.setItem(key, 'answered');
  } catch {
    // The in-memory decision still survives remounts during this session.
  }
}

/** Optional consent after authorized entry; the shared controller owns setup. */
export function DevicePushOnboarding({
  devicePush,
  accountId,
  apiBaseUrl,
  onEnablePrompts,
}: {
  devicePush: DevicePushController;
  accountId: string;
  apiBaseUrl: string;
  onEnablePrompts?: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const decisionKey = `eimir-device-push-onboarding-v1:${apiBaseUrl}:${accountId}`;
  const [answered, setAnswered] = useState(
    () => !devicePush.available || wasAnswered(decisionKey),
  );
  const [open, setOpen] = useState(false);
  const [offline, setOffline] = useState(false);
  const blocked = useDocumentLeaveBlocked();
  const activationPending = useRef(false);
  const consentRequested = useRef(false);
  const consentPending = useRef(false);
  const consentFailed = useRef(false);
  const [promptError, setPromptError] = useState(false);
  const [promptBusy, setPromptBusy] = useState(false);
  const activateRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!devicePush.available) return;
    if (devicePush.state === 'on' && devicePush.registered) {
      if (consentPending.current || consentFailed.current || promptError)
        return;
      if (consentRequested.current && onEnablePrompts) {
        consentPending.current = true;
        setPromptBusy(true);
        void onEnablePrompts()
          .then(() => {
            consentRequested.current = false;
            rememberAnswer(decisionKey);
            setAnswered(true);
            setOpen(false);
            postSnackbar('notificationSettings.deviceOn');
          })
          .catch(() => {
            consentFailed.current = true;
            setPromptError(true);
          })
          .finally(() => {
            consentPending.current = false;
            setPromptBusy(false);
          });
        return;
      }
      rememberAnswer(decisionKey);
      setAnswered(true);
      if (open) {
        setOpen(false);
        postSnackbar('notificationSettings.deviceOn');
      }
    } else if (
      !answered &&
      !blocked &&
      !devicePush.registered &&
      devicePush.state === 'off' &&
      isClientOnline()
    ) {
      setOpen(true);
    }
  }, [
    answered,
    blocked,
    decisionKey,
    devicePush.available,
    devicePush.registered,
    devicePush.state,
    open,
    onEnablePrompts,
    promptError,
  ]);

  function answer() {
    rememberAnswer(decisionKey);
    setAnswered(true);
  }

  function dismiss() {
    answer();
    setOpen(false);
  }

  async function activate() {
    if (activationPending.current) return;
    if (!isClientOnline()) {
      setOffline(true);
      return;
    }
    setOffline(false);
    activationPending.current = true;
    consentRequested.current = true;
    answer();
    try {
      if (devicePushAction(devicePush) === 'openSettings')
        await devicePush.openSettings();
      else await devicePush.enable();
    } finally {
      activationPending.current = false;
    }
  }

  const busy =
    promptBusy ||
    devicePush.state === 'connecting' ||
    devicePush.state === 'disconnecting' ||
    devicePush.state === 'loading';
  const action = busy ? 'enable' : devicePushAction(devicePush);

  return (
    <ShortTaskSheet
      open={open}
      title={t('notificationSettings.onboardingTitle')}
      onClose={dismiss}
      initialFocusRef={activateRef}
      footer={
        <div className="form-actions">
          {promptError ? (
            <button
              type="button"
              disabled={promptBusy}
              onClick={() => {
                consentFailed.current = false;
                setPromptError(false);
              }}
            >
              {t('common.retry')}
            </button>
          ) : null}
          {action && (
            <button
              ref={activateRef}
              type="button"
              className="button-link"
              disabled={busy}
              onClick={() => void activate()}
            >
              {t(
                action === 'openSettings'
                  ? 'notificationSettings.deviceOpenSettings'
                  : 'notificationSettings.onboardingActivate',
              )}
            </button>
          )}
          <button
            type="button"
            className="button-link secondary-link"
            onClick={dismiss}
          >
            {t('notificationSettings.onboardingLater')}
          </button>
        </div>
      }
    >
      <p>{t('notificationSettings.onboardingIntro')}</p>
      <p className="muted">{t('notificationSettings.deviceIntro')}</p>
      {promptError ? (
        <p role="alert">{t('notificationSettings.onboardingPromptsFailed')}</p>
      ) : null}
      {(offline || devicePush.state !== 'off') && (
        <p role="status" aria-live="polite">
          {t(
            offline
              ? 'notificationSettings.onboardingOffline'
              : devicePushStatusKey(devicePush),
          )}
        </p>
      )}
    </ShortTaskSheet>
  );
}
