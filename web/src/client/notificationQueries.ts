export function notificationUnreadCountQueryKey(spaceId: string) {
  return ['m5-s5', 'notification-unread-count', spaceId] as const;
}

export function notificationsListQueryKey(spaceId: string) {
  return ['m5-s5', 'notifications', spaceId] as const;
}

/**
 * The Wir "new for you" notices. They live under the notification list key,
 * so a prefix refresh of the list also refreshes Wir (#2345 B). Exact list
 * refreshes name this key on its own.
 */
export function wirNoticesQueryKey(spaceId: string) {
  return [...notificationsListQueryKey(spaceId), 'wir'] as const;
}
