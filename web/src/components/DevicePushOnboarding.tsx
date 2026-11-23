import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { isClientOnline } from '../client/connectivity';
import type { DevicePushController } from '../client/devicePush';
import {
  devicePushAction,
  devicePushStatusKey,
} from '../client/devicePushPresentation';
import { postSnackbar } from '../client/snackbar';
import { useDocumentLeaveBlocked } from '../client/useDocumentLeaveGuard';
import { useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import { ShortTaskSheet } from './ShortTaskSheet';
import './DevicePushOnboarding.css';

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
  onPreparePrompts,
  onEnablePrompts,
  onSettled,
}: {
  devicePush: DevicePushController;
  accountId: string;
  apiBaseUrl: string;
  onPreparePrompts?: () => void;
  onEnablePrompts?: () => Promise<void>;
  /** Called once the push start prompt is answered or not needed. */
  onSettled?: () => void;
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
  const [pendingAction, setPendingAction] =
    useState<ReturnType<typeof devicePushAction>>(null);
  const consentRequested = useRef(false);
  const continuingAfterClose = useRef(false);
  const consentPending = useRef(false);
  const consentFailed = useRef(false);
  const [promptError, setPromptError] = useState(false);
  const [promptBusy, setPromptBusy] = useState(false);
  const activateRef = useRef<HTMLButtonElement>(null);
  const deviceStatus = devicePushStatusKey(devicePush);
  const confirmed =
    devicePush.available && devicePush.state === 'on' && devicePush.registered;
  const confirmedDevice = useRef<{ decisionKey: string } | null>(null);

  useLayoutEffect(() => {
    if (confirmed) {
      // Each registration owns its preference result, even for the same account.
      confirmedDevice.current = { decisionKey };
      return () => {
        confirmedDevice.current = null;
      };
    }
    if (consentPending.current || consentFailed.current) {
      consentRequested.current = false;
      consentPending.current = false;
      consentFailed.current = false;
      continuingAfterClose.current = false;
      setPromptBusy(false);
      setPromptError(false);
    }
  }, [confirmed, decisionKey]);

  useEffect(() => {
    if (!devicePush.available) return;
    if (
      continuingAfterClose.current &&
      (devicePush.error ||
        devicePush.state === 'error' ||
        devicePush.state === 'unavailable')
    ) {
      continuingAfterClose.current = false;
      consentRequested.current = false;
      postSnackbar(deviceStatus);
    }
    if (devicePush.state === 'on' && devicePush.registered) {
      if (consentPending.current || consentFailed.current || promptError)
        return;
      if (consentRequested.current && onEnablePrompts) {
        const device = confirmedDevice.current;
        if (device?.decisionKey !== decisionKey) return;
        consentPending.current = true;
        setPromptBusy(true);
        void onEnablePrompts()
          .then(() => {
            if (device !== confirmedDevice.current) return;
            consentRequested.current = false;
            continuingAfterClose.current = false;
            rememberAnswer(decisionKey);
            setAnswered(true);
            setOpen(false);
            postSnackbar('notificationSettings.deviceOn');
          })
          .catch(() => {
            if (device !== confirmedDevice.current) return;
            if (continuingAfterClose.current) {
              continuingAfterClose.current = false;
              postSnackbar('notificationSettings.onboardingPromptsFailed');
            }
            consentFailed.current = true;
            setPromptError(true);
          })
          .finally(() => {
            if (device !== confirmedDevice.current) return;
            consentPending.current = false;
            setPromptBusy(false);
          });
        return;
      }
      rememberAnswer(decisionKey);
      setAnswered(true);
      if (open || continuingAfterClose.current) {
        continuingAfterClose.current = false;
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
    devicePush.error,
    devicePush.registered,
    devicePush.state,
    deviceStatus,
    open,
    onEnablePrompts,
    promptError,
  ]);

  useEffect(() => {
    if (answered && !open) onSettled?.();
  }, [answered, open, onSettled]);

  function answer() {
    rememberAnswer(decisionKey);
    setAnswered(true);
  }

  function dismiss() {
    if (busy) continuingAfterClose.current = consentRequested.current;
    else consentRequested.current = false;
    answer();
    setOpen(false);
  }

  async function activate() {
    if (activationPending.current) return;
    const action = devicePushAction(devicePush);
    if (!action) return;
    if (!isClientOnline()) {
      setOffline(true);
      return;
    }
    setOffline(false);
    activationPending.current = true;
    setPendingAction(action);
    answer();
    try {
      if (!consentRequested.current) {
        consentRequested.current = true;
        onPreparePrompts?.();
      }
      if (action === 'openSettings') await devicePush.openSettings();
      else await devicePush.enable();
    } finally {
      activationPending.current = false;
      setPendingAction(null);
    }
  }

  const busy =
    pendingAction !== null ||
    promptBusy ||
    devicePush.state === 'connecting' ||
    devicePush.state === 'disconnecting' ||
    devicePush.state === 'loading';
  const action = pendingAction ?? devicePushAction(devicePush);
  let buttonLabel = 'notificationSettings.onboardingActivate';
  if (promptBusy) buttonLabel = 'notificationSettings.onboardingSavingPrompts';
  else if (action === 'openSettings')
    buttonLabel = 'notificationSettings.deviceOpenSettings';
  else if (busy) buttonLabel = 'notificationSettings.onboardingActivating';
  else if (devicePush.error) buttonLabel = 'common.retry';
  let status = deviceStatus;
  if (offline) status = 'notificationSettings.onboardingOffline';
  else if (promptBusy) status = 'notificationSettings.onboardingPushReady';
  else if (
    pendingAction === 'enable' &&
    devicePush.state === 'off' &&
    !devicePush.error
  )
    status = 'notificationSettings.deviceConnecting';
  const showStatus =
    !promptError &&
    (offline || answered || devicePush.error || devicePush.state !== 'off');

  return (
    <ShortTaskSheet
      open={open}
      title={t('notificationSettings.onboardingTitle')}
      onClose={dismiss}
      initialFocusRef={activateRef}
      footer={
        <div className="push-onboarding-feedback">
          <p
            className={showStatus ? undefined : 'sr-only'}
            role="status"
            aria-live="polite"
          >
            {showStatus ? t(status) : null}
          </p>
          {promptError ? (
            <p role="alert">
              {t('notificationSettings.onboardingPromptsFailed')}
            </p>
          ) : null}
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
            {!promptError && (action || busy) && (
              <button
                ref={activateRef}
                type="button"
                className="button-link"
                disabled={busy}
                aria-busy={busy || undefined}
                onClick={() => void activate()}
              >
                {busy && (
                  <EimirIcon
                    name="rotate"
                    className="eimir-motion-loading-spin"
                  />
                )}
                {t(buttonLabel)}
              </button>
            )}
            <button
              type="button"
              className="button-link secondary-link"
              onClick={dismiss}
            >
              {t(
                busy
                  ? 'notificationSettings.onboardingContinue'
                  : 'notificationSettings.onboardingLater',
              )}
            </button>
          </div>
        </div>
      }
    >
      <p>{t('notificationSettings.onboardingIntro')}</p>
      <p className="muted">
        {t(
          devicePush.neutralPreview
            ? 'notificationSettings.iosDeviceIntro'
            : 'notificationSettings.deviceIntro',
        )}
      </p>
    </ShortTaskSheet>
  );
}
