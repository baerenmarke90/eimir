export function notificationUnreadCountQueryKey(spaceId: string) {
  return ['m5-s5', 'notification-unread-count', spaceId] as const;
}

export function notificationsListQueryKey(spaceId: string) {
  return ['m5-s5', 'notifications', spaceId] as const;
}
