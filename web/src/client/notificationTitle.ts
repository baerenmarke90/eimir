import { authorDisplayName } from './authorPresentation';
import type { NotificationItem } from '../api/generated/models/NotificationItem';
import type { TFunction } from 'i18next';

export function getNotificationItemTitle(
  item: NotificationItem,
  t: TFunction,
  currentAccountId?: string,
): string {
  const isOwn = Boolean(
    currentAccountId && item.actor?.id === currentAccountId,
  );
  const actorName = isOwn
    ? t('m5s5.activity.you')
    : item.actor
      ? authorDisplayName(item.actor)
      : undefined;
  const targetTitle = item.target?.title;

  if (item.kind === 'COMMENT_CREATED') {
    if (actorName && targetTitle) {
      return t('m5s5.notificationAction.COMMENT_CREATED_WITH_TARGET', {
        name: actorName,
        target: targetTitle,
      });
    }
    if (actorName) {
      return t('m5s5.notificationAction.COMMENT_CREATED', {
        name: actorName,
      });
    }
    if (targetTitle) {
      return `${t('m5s5.notificationKind.COMMENT_CREATED')}: „${targetTitle}“`;
    }
    return t('m5s5.notificationKind.COMMENT_CREATED');
  }

  if (item.kind === 'THINKING_OF_YOU') {
    return actorName
      ? t('m5s5.notificationAction.THINKING_OF_YOU', { name: actorName })
      : t('m5s5.notificationAction.THINKING_OF_YOU_ANON');
  }

  if (item.kind === 'PARTNER_KISS') {
    return actorName
      ? t('m5s5.notificationAction.PARTNER_KISS', { name: actorName })
      : t('m5s5.notificationAction.PARTNER_KISS_ANON');
  }

  if (item.kind === 'PARTNER_CHECK_IN') {
    return actorName
      ? t('m5s5.notificationAction.PARTNER_CHECK_IN', { name: actorName })
      : t('m5s5.notificationAction.PARTNER_CHECK_IN_ANON');
  }

  if (item.kind === 'REMINDER_DUE') {
    return targetTitle
      ? t('m5s5.notificationAction.REMINDER_DUE_WITH_TARGET', {
          target: targetTitle,
        })
      : t('m5s5.notificationAction.REMINDER_DUE');
  }

  return t('m5s5.notificationKind.generic');
}
