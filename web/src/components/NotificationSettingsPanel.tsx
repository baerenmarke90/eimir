import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { NotificationsApi } from '../api/generated/apis/NotificationsApi';
import { NotificationChannel } from '../api/generated/models/NotificationChannel';
import type { NotificationChannelCapability } from '../api/generated/models/NotificationChannelCapability';
import { NotificationKind } from '../api/generated/models/NotificationKind';
import type { NotificationPreferencesView } from '../api/generated/models/NotificationPreferencesView';
import { assertOnlineWrite } from '../client/connectivity';
import type { DevicePushController } from '../client/devicePush';
import {
  devicePushAction,
  devicePushStatusKey,
} from '../client/devicePushPresentation';
import { normalizeClientError } from '../client/problemDetails';
import { captureAuthorizedQuery } from '../client/queryIdentity';
import { settingsCategoryPath } from '../client/routes';
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
    kinds: [
      NotificationKind.COMMENT_CREATED,
      NotificationKind.REMINDER_CREATED,
      NotificationKind.REMINDER_DUE,
    ],
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
  [NotificationKind.REMINDER_CREATED]: 'reminderCreated',
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

function DevicePushSetting({
  devicePush,
}: {
  devicePush: DevicePushController;
}) {
  const { t } = useTranslation();
  const { state, error, registered } = devicePush;
  const action = devicePushAction(devicePush);
  const connecting = state === 'connecting';
  const disableFailed = error === 'PUSH_DEVICE_DISABLE_FAILED';
  const checked =
    state === 'on' ||
    (!connecting && state !== 'loading' && (registered || disableFailed));
  const disabled =
    state === 'loading' ||
    connecting ||
    state === 'disconnecting' ||
    (!checked && action !== 'enable');
  const status =
    error || (state !== 'on' && state !== 'off')
      ? t(devicePushStatusKey(devicePush))
      : null;
  let secondaryAction: { label: string; run: () => Promise<void> } | undefined;
  if (connecting) {
    secondaryAction = { label: t('common.cancel'), run: devicePush.disable };
  } else if (action === 'openSettings') {
    secondaryAction = {
      label: t('notificationSettings.deviceOpenSettings'),
      run: devicePush.openSettings,
    };
  } else if (checked && action === 'enable' && !disableFailed) {
    secondaryAction = { label: t('common.retry'), run: devicePush.enable };
  }

  return (
    <div className="notification-device-push">
      <PreferenceSwitch
        label={t(
          devicePush.browser
            ? 'notificationSettings.browserToggle'
            : 'notificationSettings.deviceToggle',
        )}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(enabled) => {
          if (enabled) void devicePush.enable();
          else void devicePush.disable();
        }}
      />
      <p
        className={status ? undefined : 'sr-only'}
        role="status"
        aria-live="polite"
      >
        {status}
      </p>
      {secondaryAction ? (
        <div className="form-actions">
          <button
            type="button"
            className="secondary"
            onClick={() => void secondaryAction.run()}
          >
            {secondaryAction.label}
          </button>
        </div>
      ) : null}
    </div>
  );
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
    onSuccess: (isCurrent, choices) => {
      if (!isCurrent) return;
      setFeedback(t('notificationSettings.groupSaved'));
      if (
        choices.some(
          (choice) =>
            choice.kind === NotificationKind.GENTLE_PROMPT && choice.enabled,
        ) &&
        devicePush?.available &&
        devicePushAction(devicePush) === 'enable'
      )
        void devicePush.enable();
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
      </div>

      {devicePush?.available && <DevicePushSetting devicePush={devicePush} />}

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

          {data.items.some(
            (item) => item.kind === NotificationKind.GENTLE_PROMPT,
          ) ? (
            <div className="notification-settings-group">
              <PreferenceSwitch
                label={t('gentlePrompts.label')}
                description={t('gentlePrompts.description')}
                checked={
                  data.items
                    .find(
                      (item) => item.kind === NotificationKind.GENTLE_PROMPT,
                    )
                    ?.channels.find(
                      (channel) => channel.channel === NotificationChannel.PUSH,
                    )?.enabled === true
                }
                disabled={mutation.isPending}
                onCheckedChange={(enabled) =>
                  saveChoices([
                    {
                      kind: NotificationKind.GENTLE_PROMPT,
                      channel: NotificationChannel.PUSH,
                      enabled,
                    },
                  ])
                }
              />
              {!capabilities.get(NotificationChannel.PUSH)?.available ? (
                <p className="muted">{t('gentlePrompts.permissionHint')}</p>
              ) : null}
            </div>
          ) : null}

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
