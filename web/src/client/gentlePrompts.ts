import {
  type QueryClient,
  queryOptions,
  useQuery,
} from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import type { NotificationsApi } from '../api/generated/apis/NotificationsApi';
import type { AccountView } from '../api/generated/models/AccountView';
import type { NotificationPreferencesView } from '../api/generated/models/NotificationPreferencesView';
import { captureAuthorizedQuery } from './queryIdentity';

export const GENTLE_PROMPT_KIND = 'GENTLE_PROMPT';
export const OWN_USE_COALESCE_MS = 15 * 60 * 1000;

function promptPreferences(api: NotificationsApi, accountId: string) {
  return queryOptions({
    queryKey: ['notification-preferences', accountId],
    queryFn: ({ signal }) => api.getOwnNotificationPreferences({ signal }),
    staleTime: 0,
  });
}

/** Start the read on the user's tap, while the device is being connected. */
export function prepareGentlePrompts(
  queryClient: QueryClient,
  api: NotificationsApi,
  accountId: string,
) {
  return queryClient.prefetchQuery(promptPreferences(api, accountId));
}

/** Only confirmed device registration may complete the user's explicit consent. */
export async function enableGentlePrompts(
  queryClient: QueryClient,
  api: NotificationsApi,
  accountId: string,
) {
  const options = promptPreferences(api, accountId);
  const { queryKey } = options;
  const state = queryClient.getQueryState(queryKey);
  // Join an unfinished read or retry a failed one. A completed read already
  // contains the preferences, even if device registration invalidated the
  // channel capabilities in the meantime.
  const preferences =
    state?.status === 'success' && state.fetchStatus === 'idle'
      ? undefined
      : queryClient.fetchQuery(options);
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
  // The early read can predate the endpoint. Refresh delivery capabilities
  // for an open settings screen without delaying the confirmed consent.
  void queryClient.invalidateQueries({ queryKey, exact: true });
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
