import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { NotificationsApi } from '../api/generated/apis/NotificationsApi';
import { NotificationChannel } from '../api/generated/models/NotificationChannel';
import type { NotificationChannelCapability } from '../api/generated/models/NotificationChannelCapability';
import { NotificationKind } from '../api/generated/models/NotificationKind';
import type { NotificationPreferencesView } from '../api/generated/models/NotificationPreferencesView';
import { assertOnlineWrite } from '../client/connectivity';
import { normalizeClientError } from '../client/problemDetails';
import { captureAuthorizedQuery } from '../client/queryIdentity';
import { settingsCategoryPath } from '../client/routes';
import type { DevicePushController } from '../client/devicePush';
import { useTranslation } from '../i18n';
import { PreferenceSwitch } from './PreferenceSwitch';
import { ProblemState } from './ProblemState';
import { QuietHoursSettings } from './QuietHoursSettings';
import './NotificationSettingsPanel.css';

const CHANNELS = [
  NotificationChannel.IN_APP,
  NotificationChannel.PUSH,
  NotificationChannel.EMAIL,
] as const;

const GROUPS = [
  {
    key: 'sharedActivity',
    kinds: [NotificationKind.COMMENT_CREATED, NotificationKind.REMINDER_DUE],
  },
  {
    key: 'closeness',
    kinds: [
      NotificationKind.THINKING_OF_YOU,
      NotificationKind.COUPLE_EXPERIENCE_SHARED,
      NotificationKind.PARTNER_KISS,
      NotificationKind.PARTNER_CHECK_IN,
    ],
  },
] as const;

const KIND_KEYS = {
  [NotificationKind.COMMENT_CREATED]: 'comment',
  [NotificationKind.REMINDER_DUE]: 'reminder',
  [NotificationKind.THINKING_OF_YOU]: 'thinking',
  [NotificationKind.COUPLE_EXPERIENCE_SHARED]: 'experience',
  [NotificationKind.PARTNER_KISS]: 'kiss',
  [NotificationKind.PARTNER_CHECK_IN]: 'checkIn',
} as const;

const CHANNEL_KEYS = {
  [NotificationChannel.IN_APP]: 'inApp',
  [NotificationChannel.PUSH]: 'push',
  [NotificationChannel.EMAIL]: 'email',
} as const;

type Choice = {
  kind: NotificationKind;
  channel: NotificationChannel;
  enabled: boolean;
};

const DEVICE_ERROR_STATUS_KEYS: Readonly<Record<string, string>> = {
  NO_PUSH_DISTRIBUTOR: 'notificationSettings.deviceNoDistributor',
  NOTIFICATION_PERMISSION_DENIED: 'notificationSettings.devicePermissionDenied',
  PUSH_DEVICE_CLEANUP_PENDING: 'notificationSettings.deviceCleanupPending',
  PUSH_ENDPOINT_UNSUPPORTED: 'notificationSettings.deviceUnsupported',
  PUSH_DEVICE_STATUS_UNAVAILABLE:
    'notificationSettings.deviceStatusUnavailable',
};

const DEVICE_STATE_STATUS_KEYS: Readonly<
  Record<DevicePushController['state'], string>
> = {
  loading: 'notificationSettings.deviceLoading',
  unavailable: 'notificationSettings.deviceUnavailable',
  off: 'notificationSettings.deviceOff',
  connecting: 'notificationSettings.deviceConnecting',
  disconnecting: 'notificationSettings.deviceDisconnecting',
  on: 'notificationSettings.deviceOn',
  error: 'notificationSettings.deviceError',
};

function deviceStatusKey(devicePush: DevicePushController): string {
  return (
    (devicePush.error && DEVICE_ERROR_STATUS_KEYS[devicePush.error]) ||
    DEVICE_STATE_STATUS_KEYS[devicePush.state]
  );
}

/** One dominant action per state; retry only where it can succeed. */
function deviceAction(
  devicePush: DevicePushController,
): 'enable' | 'openSettings' | null {
  if (devicePush.error === 'NOTIFICATION_PERMISSION_DENIED') {
    return 'openSettings';
  }
  if (devicePush.error === 'PUSH_ENDPOINT_UNSUPPORTED') return null;
  return devicePush.state === 'off' || devicePush.state === 'error'
    ? 'enable'
    : null;
}

export function NotificationSettingsPanel({
  notificationsApi,
  accountId,
  devicePush,
}: {
  notificationsApi: NotificationsApi;
  accountId: string;
  devicePush?: DevicePushController;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const queryKey = ['notification-preferences', accountId];
  const [feedback, setFeedback] = useState<string | null>(null);
  const writeLock = useRef(false);
  const preferences = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      notificationsApi.getOwnNotificationPreferences({ signal }),
    retry: false,
    gcTime: 0,
  });
  const mutation = useMutation({
    retry: false,
    networkMode: 'always',
    mutationFn: async (choices: Choice[]) => {
      const isCurrent = captureAuthorizedQuery(queryClient, queryKey);
      await queryClient.cancelQueries({ queryKey, exact: true });
      assertOnlineWrite();
      for (const choice of choices) {
        if (!isCurrent())
          throw new Error('Notification preference owner changed.');
        let updated: Awaited<
          ReturnType<NotificationsApi['updateOwnNotificationPreference']>
        >;
        try {
          updated = await notificationsApi.updateOwnNotificationPreference({
            kind: choice.kind,
            channel: choice.channel,
            notificationPreferenceUpdate: { enabled: choice.enabled },
          });
        } catch (error) {
          throw await normalizeClientError(error);
        }
        if (!isCurrent()) return;
        queryClient.setQueryData<NotificationPreferencesView>(
          queryKey,
          (current) =>
            current && {
              ...current,
              items: current.items.map((item) =>
                item.kind === updated.kind
                  ? {
                      ...item,
                      channels: item.channels.map((channel) =>
                        channel.channel === updated.channel
                          ? { ...channel, enabled: updated.enabled }
                          : channel,
                      ),
                    }
                  : item,
              ),
            },
        );
      }
      return isCurrent();
    },
    onSuccess: (isCurrent) => {
      if (isCurrent) setFeedback(t('notificationSettings.groupSaved'));
    },
    onError: () => {
      setFeedback(t('notificationSettings.groupFailed'));
      void queryClient.invalidateQueries({ queryKey, exact: true });
    },
    onSettled: () => {
      writeLock.current = false;
    },
  });
  function saveChoices(choices: Choice[]) {
    if (writeLock.current || !choices.length) return;
    writeLock.current = true;
    setFeedback(null);
    mutation.mutate(choices);
  }

  const data = preferences.data;
  const capabilities = new Map(
    data?.capabilities.map((cap) => [cap.channel, cap]),
  );
  const emailCapability = capabilities.get(NotificationChannel.EMAIL);
  const reason = (
    channel: NotificationChannel,
    capability?: NotificationChannelCapability,
  ) => {
    if (channel === NotificationChannel.PUSH) {
      return capability?.reason === 'PUSH_ENDPOINT_MISSING'
        ? t('notificationSettings.endpointMissing')
        : t('notificationSettings.pushUnavailable');
    }
    if (channel === NotificationChannel.EMAIL) {
      return capability?.reason === 'EMAIL_VERIFIED_PRIMARY_MISSING'
        ? t('notificationSettings.noAddress')
        : t('notificationSettings.transportUnavailable');
    }
    return t('notificationSettings.unavailable');
  };

  function canConfigure(
    kind: NotificationKind,
    channel: NotificationChannel,
    choice: { configurable: boolean; enabled: boolean },
    capability?: NotificationChannelCapability,
  ) {
    return (
      choice.configurable &&
      (choice.enabled ||
        capability?.available === true ||
        (kind === NotificationKind.COMMENT_CREATED &&
          channel === NotificationChannel.PUSH))
    );
  }

  return (
    <section
      className="notification-settings settings-section"
      aria-labelledby="notification-settings-title"
    >
      <div className="settings-section-head">
        <h2 id="notification-settings-title">
          {t('notificationSettings.title')}
        </h2>
        <p className="settings-section-intro">
          {t('notificationSettings.intro')}
        </p>
      </div>

      {devicePush?.available && (
        <div className="notification-device-push">
          <h3>{t('notificationSettings.deviceTitle')}</h3>
          <p>{t('notificationSettings.deviceIntro')}</p>
          <p role="status" aria-live="polite">
            {t(deviceStatusKey(devicePush))}
          </p>
          <div className="form-actions">
            {deviceAction(devicePush) === 'openSettings' && (
              <button
                type="button"
                className="button-link"
                onClick={() => void devicePush.openSettings()}
              >
                {t('notificationSettings.deviceOpenSettings')}
              </button>
            )}
            {deviceAction(devicePush) === 'enable' && (
              <button
                type="button"
                className="button-link"
                onClick={() => void devicePush.enable()}
              >
                {t('notificationSettings.deviceEnable')}
              </button>
            )}
            {(devicePush.registered ||
              devicePush.state === 'on' ||
              devicePush.state === 'connecting') && (
              <button
                type="button"
                className="button-link secondary-link"
                onClick={() => void devicePush.disable()}
              >
                {t('notificationSettings.deviceDisable')}
              </button>
            )}
          </div>
        </div>
      )}

      {preferences.isPending ? (
        <p role="status">{t('notificationSettings.loading')}</p>
      ) : preferences.error ? (
        <ProblemState
          error={preferences.error}
          onRetry={() => void preferences.refetch()}
        />
      ) : data ? (
        <>
          <div className="notification-destination">
            {emailCapability?.destination ? (
              <p>
                {t('notificationSettings.destination', {
                  email: emailCapability.destination,
                })}
              </p>
            ) : (
              <p>{reason(NotificationChannel.EMAIL, emailCapability)}</p>
            )}
            {!emailCapability?.destination && (
              <Link to={settingsCategoryPath('account')}>
                {t('notificationSettings.changeAddress')}
              </Link>
            )}
          </div>

          {data.items.length === 0 ? (
            <p>{t('notificationSettings.empty')}</p>
          ) : (
            GROUPS.map((group) => {
              const items = group.kinds
                .map((kind) => data.items.find((item) => item.kind === kind))
                .filter((item) => item !== undefined);
              if (!items.length) return null;
              return (
                <div className="notification-settings-group" key={group.key}>
                  <h3>{t(`notificationSettings.${group.key}`)}</h3>
                  <p className="muted">
                    {t(`notificationSettings.${group.key}Description`)}
                  </p>
                  <div className="notification-group-channels">
                    {CHANNELS.map((channel) => {
                      const capability = capabilities.get(channel);
                      const choices = items.flatMap((item) => {
                        const choice = item.channels.find(
                          (candidate) => candidate.channel === channel,
                        );
                        return choice ? [{ kind: item.kind, ...choice }] : [];
                      });
                      if (!choices.length) return null;
                      const enabled = choices.filter(
                        (choice) => choice.enabled,
                      ).length;
                      const mixed = enabled > 0 && enabled < choices.length;
                      const editable = choices.filter((choice) =>
                        canConfigure(choice.kind, channel, choice, capability),
                      );
                      const label = t(
                        `notificationSettings.${CHANNEL_KEYS[channel]}`,
                      );
                      return (
                        <PreferenceSwitch
                          key={channel}
                          label={label}
                          accessibleLabel={`${t(`notificationSettings.${group.key}`)}: ${label}`}
                          description={
                            mixed
                              ? t('notificationSettings.mixed')
                              : !capability?.available
                                ? reason(channel, capability)
                                : undefined
                          }
                          checked={enabled === choices.length}
                          disabled={!editable.length || mutation.isPending}
                          onCheckedChange={(value) =>
                            saveChoices(
                              editable
                                .filter((choice) => choice.enabled !== value)
                                .map((choice) => ({
                                  kind: choice.kind,
                                  channel,
                                  enabled: value,
                                })),
                            )
                          }
                        />
                      );
                    })}
                  </div>
                  <details className="notification-event-details">
                    <summary>{t('notificationSettings.individual')}</summary>
                    {items.map((item) => {
                      const event = t(
                        `notificationSettings.${KIND_KEYS[item.kind as keyof typeof KIND_KEYS]}`,
                      );
                      return (
                        <div className="notification-event" key={item.kind}>
                          <div className="notification-event-copy">
                            <strong>{event}</strong>
                            {item.kind === NotificationKind.COMMENT_CREATED && (
                              <span>
                                {t('notificationSettings.commentDescription')}
                              </span>
                            )}
                          </div>
                          <div className="notification-event-channels">
                            {CHANNELS.map((channel) => {
                              const choice = item.channels.find(
                                (candidate) => candidate.channel === channel,
                              );
                              if (!choice) return null;
                              const capability = capabilities.get(channel);
                              const commentDigestPush =
                                item.kind ===
                                  NotificationKind.COMMENT_CREATED &&
                                channel === NotificationChannel.PUSH;
                              const commentDigestEmail =
                                item.kind ===
                                  NotificationKind.COMMENT_CREATED &&
                                channel === NotificationChannel.EMAIL;
                              const unavailable = !canConfigure(
                                item.kind,
                                channel,
                                choice,
                                capability,
                              );
                              const explanation =
                                !commentDigestEmail &&
                                !choice.configurable &&
                                item.deliveryClass !== 'IMMEDIATE'
                                  ? t('notificationSettings.policyUnavailable')
                                  : commentDigestPush
                                    ? `${t('notificationSettings.commentPushDescription')}${!capability?.available ? ` ${reason(channel, capability)}` : ''}`
                                    : commentDigestEmail
                                      ? `${t('notificationSettings.commentEmailDescription')}${!capability?.available ? ` ${reason(channel, capability)}` : ''}`
                                      : !capability?.available
                                        ? reason(channel, capability)
                                        : undefined;
                              const channelLabel = t(
                                `notificationSettings.${CHANNEL_KEYS[channel]}`,
                              );
                              return (
                                <div
                                  className="notification-channel-choice"
                                  key={channel}
                                >
                                  <PreferenceSwitch
                                    label={channelLabel}
                                    accessibleLabel={`${event}: ${channelLabel}`}
                                    description={explanation}
                                    checked={choice.enabled}
                                    disabled={unavailable || mutation.isPending}
                                    onCheckedChange={(enabled) =>
                                      saveChoices([
                                        { kind: item.kind, channel, enabled },
                                      ])
                                    }
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </details>
                </div>
              );
            })
          )}
          <details className="notification-quiet-hours notification-event-details">
            <summary>
              {t('notificationSettings.quietHoursTitle')}
              <small>
                {data.quietHours.enabled
                  ? t('notificationSettings.quietHoursActive', {
                      start: data.quietHours.start?.slice(0, 5),
                      end: data.quietHours.end?.slice(0, 5),
                    })
                  : t('notificationSettings.quietHoursOff')}
              </small>
            </summary>
            <QuietHoursSettings
              quietHours={data.quietHours}
              notificationsApi={notificationsApi}
              onUpdated={(quietHours) =>
                queryClient.setQueryData<NotificationPreferencesView>(
                  queryKey,
                  (current) => current && { ...current, quietHours },
                )
              }
            />
          </details>
          <p
            className="notification-settings-feedback"
            role="status"
            aria-live="polite"
          >
            {mutation.isPending
              ? t('notificationSettings.groupSaving')
              : feedback}
          </p>
          {mutation.error && (
            <ProblemState
              error={mutation.error}
              onRetry={() => void preferences.refetch()}
            />
          )}
        </>
      ) : null}
    </section>
  );
}
