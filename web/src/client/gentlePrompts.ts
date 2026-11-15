import { useQuery, type QueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import type { NotificationsApi } from '../api/generated/apis/NotificationsApi';
import type { AccountView } from '../api/generated/models/AccountView';
import type { NotificationPreferencesView } from '../api/generated/models/NotificationPreferencesView';
import { captureAuthorizedQuery } from './queryIdentity';

export const GENTLE_PROMPT_KIND = 'GENTLE_PROMPT';
export const OWN_USE_COALESCE_MS = 15 * 60 * 1000;

/** Explicit onboarding consent; token refresh/registration never invokes this. */
export async function enableGentlePrompts(
  queryClient: QueryClient,
  api: NotificationsApi,
  accountId: string,
) {
  const queryKey = ['notification-preferences', accountId];
  const preferences = queryClient.fetchQuery({
    queryKey,
    queryFn: ({ signal }) => api.getOwnNotificationPreferences({ signal }),
    staleTime: 0,
  });
  const current = captureAuthorizedQuery(queryClient, queryKey);
  await preferences;
  if (!current()) throw new Error('Notification preference owner changed.');
  const updated = await api.updateOwnNotificationPreference({
    kind: GENTLE_PROMPT_KIND,
    channel: 'PUSH',
    notificationPreferenceUpdate: { enabled: true },
  });
  if (!current()) return;
  queryClient.setQueryData<NotificationPreferencesView>(
    queryKey,
    (value) =>
      value && {
        ...value,
        items: value.items.map((item) =>
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

export function gentleSuggestionKey(accountId: string, spaceId: string) {
  return ['gentle-suggestion', accountId, spaceId] as const;
}

/** Subscribe to confirmed settings without adding another consent request. */
export function useGentleConsent(
  account: AccountView | null | undefined,
  api?: NotificationsApi,
) {
  const preferences = useQuery<NotificationPreferencesView>({
    queryKey: ['notification-preferences', account?.id ?? ''],
    enabled: false,
    queryFn: ({ signal }) => {
      if (!api) throw new Error('Notification preferences are unavailable.');
      return api.getOwnNotificationPreferences({ signal });
    },
  });
  const choice = preferences.data?.items
    .find((item) => item.kind === GENTLE_PROMPT_KIND)
    ?.channels.find((item) => item.channel === 'PUSH');
  return choice?.enabled ?? account?.gentlePromptsEnabled === true;
}

export function useGentleUse({
  account,
  spaceId,
  api,
}: {
  account: AccountView;
  spaceId: string;
  api: NotificationsApi;
}) {
  const consent = useGentleConsent(account, api);
  const owner = `${account.id}:${spaceId}`;
  const lastAttempt = useRef({ owner, at: 0 });
  const inFlight = useRef<string | null>(null);

  useEffect(() => {
    if (lastAttempt.current.owner !== owner || !consent)
      lastAttempt.current = { owner, at: 0 };
    if (!consent) return;
    let active = true;
    const interacted = (event: Event) => {
      if (
        !active ||
        !event.isTrusted ||
        document.visibilityState !== 'visible' ||
        navigator.onLine === false ||
        inFlight.current === owner ||
        Date.now() - lastAttempt.current.at < OWN_USE_COALESCE_MS
      )
        return;
      // Bound failed requests too. No timer, background heartbeat or replay.
      lastAttempt.current = { owner, at: Date.now() };
      inFlight.current = owner;
      void api
        .recordGentleUse({ spaceId, gentleUseReceipt: { kind: 'FOREGROUND' } })
        .catch(() => undefined)
        .finally(() => {
          if (inFlight.current === owner) inFlight.current = null;
        });
    };
    document.addEventListener('pointerup', interacted, { passive: true });
    document.addEventListener('keydown', interacted, { passive: true });
    return () => {
      active = false;
      document.removeEventListener('pointerup', interacted);
      document.removeEventListener('keydown', interacted);
    };
  }, [owner, spaceId, consent, api]);
}
