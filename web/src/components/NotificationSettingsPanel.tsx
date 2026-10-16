import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { NotificationsApi } from '../api/generated/apis/NotificationsApi';
import { NotificationChannel } from '../api/generated/models/NotificationChannel';
import type { NotificationChannelCapability } from '../api/generated/models/NotificationChannelCapability';
import { NotificationKind } from '../api/generated/models/NotificationKind';
import type { NotificationPreferencesView } from '../api/generated/models/NotificationPreferencesView';
import { normalizeClientError } from '../client/problemDetails';
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
    kinds: [NotificationKind.COMMENT_CREATED, NotificationKind.REMINDER_DUE],
  },
  {
    key: 'closeness',
    kinds: [
      NotificationKind.THINKING_OF_YOU,
      NotificationKind.PARTNER_KISS,
      NotificationKind.PARTNER_CHECK_IN,
    ],
  },
] as const;

const KIND_KEYS = {
  [NotificationKind.COMMENT_CREATED]: 'comment',
  [NotificationKind.REMINDER_DUE]: 'reminder',
  [NotificationKind.THINKING_OF_YOU]: 'thinking',
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

export function NotificationSettingsPanel({
  notificationsApi,
  accountId,
}: {
  notificationsApi: NotificationsApi;
  accountId: string;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const queryKey = ['notification-preferences', accountId];
  const [feedback, setFeedback] = useState<string | null>(null);
  const preferences = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      notificationsApi.getOwnNotificationPreferences({ signal }),
    retry: false,
    gcTime: 0,
  });
  const mutation = useMutation({
    mutationFn: async (choice: Choice) => {
      try {
        return await notificationsApi.updateOwnNotificationPreference({
          kind: choice.kind,
          channel: choice.channel,
          notificationPreferenceUpdate: { enabled: choice.enabled },
        });
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<NotificationPreferencesView>(
        queryKey,
        (current) =>
          current && {
            ...current,
            items: current.items.map((item) =>
              item.kind === updated.kind
                ? {
                    ...item,
                    channels: item.channels.map((choice) =>
                      choice.channel === updated.channel
                        ? { ...choice, enabled: updated.enabled }
                        : choice,
                    ),
                  }
                : item,
            ),
          },
      );
      const event = t(`notificationSettings.${KIND_KEYS[updated.kind]}`);
      const channel = t(
        `notificationSettings.${CHANNEL_KEYS[updated.channel]}`,
      );
      setFeedback(t('notificationSettings.saved', { event, channel }));
    },
    onError: () => setFeedback(t('notificationSettings.failed')),
  });

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
                  {items.map((item) => {
                    const event = t(
                      `notificationSettings.${KIND_KEYS[item.kind]}`,
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
                              item.kind === NotificationKind.COMMENT_CREATED &&
                              channel === NotificationChannel.PUSH;
                            const commentDigestEmail =
                              item.kind === NotificationKind.COMMENT_CREATED &&
                              channel === NotificationChannel.EMAIL;
                            const unavailable =
                              !choice.configurable ||
                              (!commentDigestPush &&
                                !choice.enabled &&
                                !capability?.available);
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
                                  onCheckedChange={(enabled) => {
                                    setFeedback(null);
                                    mutation.reset();
                                    mutation.mutate({
                                      kind: item.kind,
                                      channel,
                                      enabled,
                                    });
                                  }}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
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
          <p
            className="notification-settings-feedback"
            role="status"
            aria-live="polite"
          >
            {mutation.isPending && mutation.variables
              ? t('notificationSettings.saving', {
                  event: t(
                    `notificationSettings.${KIND_KEYS[mutation.variables.kind]}`,
                  ),
                  channel: t(
                    `notificationSettings.${CHANNEL_KEYS[mutation.variables.channel]}`,
                  ),
                })
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
