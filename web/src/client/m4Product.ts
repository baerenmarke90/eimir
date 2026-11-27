import { ActivityApi } from '../api/generated/apis/ActivityApi';
import { NotificationsApi } from '../api/generated/apis/NotificationsApi';
import { RecapsApi } from '../api/generated/apis/RecapsApi';
import { SearchApi } from '../api/generated/apis/SearchApi';
import type { DashboardItemType } from '../api/generated/models/DashboardItemType';
import type { EngagementTarget } from '../api/generated/models/EngagementTarget';
import type { SearchKind } from '../api/generated/models/SearchKind';
import { Configuration } from './apiConfiguration';
import { DashboardApi } from './mediaApis';
import { onceMessagePath } from './onceMessages';
import {
  privateCollectionPath,
  privateGiftIdeaPath,
  privateNotePath,
} from './privateArea';
import {
  appRoutePath,
  chapterDetailPath,
  collectionDetailPath,
  GAMES_GARDEN_ROUTE,
  GAMES_HEART_HUNT_ROUTE,
  GAMES_MOMENTS_ROUTE,
  GAMES_PICTURE_PING_PONG_ROUTE,
  GAMES_WHO_OF_US_ROUTE,
  GAMES_WISH_DETECTIVE_ROUTE,
  heartMomentDetailPath,
  MEMORY_CREATE_ROUTE,
  memoryDetailPath,
  milestoneDetailPath,
  placeDetailPath,
  planDetailPath,
  recapDetailPath,
  reminderDetailPath,
  STORY_RECAPS_ROUTE,
  sharedNoteDetailPath,
  wishDetailPath,
} from './routes';

export interface M4ProductApis {
  activity: ActivityApi;
  dashboard: DashboardApi;
  notifications: NotificationsApi;
  search: SearchApi;
  recaps?: RecapsApi;
}

export function createM4ProductApis(
  apiBaseUrl: string,
  accessToken: string,
): M4ProductApis {
  const configuration = new Configuration({
    basePath: apiBaseUrl,
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  return {
    activity: new ActivityApi(configuration),
    dashboard: new DashboardApi(configuration),
    notifications: new NotificationsApi(configuration),
    search: new SearchApi(configuration),
    recaps: new RecapsApi(configuration),
  };
}

export function searchResultPath(
  type: SearchKind,
  id: string,
  parentId: string | null = null,
): string | null {
  switch (type) {
    case 'MEMORY':
      return memoryDetailPath(id);
    case 'HEART_MOMENT':
      return heartMomentDetailPath(id);
    case 'MILESTONE':
      return milestoneDetailPath(id);
    case 'WISH':
      return wishDetailPath(id);
    case 'PLAN':
      return planDetailPath(id);
    case 'PLACE':
      return placeDetailPath(id);
    case 'CHAPTER':
      return chapterDetailPath(id);
    case 'COLLECTION':
      return collectionDetailPath(id);
    case 'COLLECTION_ITEM':
      // An entry opens its list when the parent is known; otherwise the
      // Listen destination, where Lists and Notes live.
      return parentId ? collectionDetailPath(parentId) : appRoutePath('shared');
    case 'SHARED_NOTE':
      return sharedNoteDetailPath(id);
    case 'PRIVATE_NOTE':
      return privateNotePath(id);
    case 'GIFT_IDEA':
      return privateGiftIdeaPath(id);
    case 'PRIVATE_COLLECTION':
      return privateCollectionPath(id);
    case 'PRIVATE_COLLECTION_ITEM':
      return parentId ? privateCollectionPath(parentId) : null;
    default:
      return null;
  }
}

export function dashboardItemPath(
  type: DashboardItemType,
  id: string,
): string | null {
  switch (type) {
    case 'MEMORY':
      return memoryDetailPath(id);
    case 'HEART_MOMENT':
      return heartMomentDetailPath(id);
    case 'MILESTONE':
      return milestoneDetailPath(id);
    case 'WISH':
      return wishDetailPath(id);
    case 'PLAN':
      return planDetailPath(id);
    case 'PLACE':
      return placeDetailPath(id);
    case 'CHAPTER':
      return chapterDetailPath(id);
    case 'COLLECTION':
      return collectionDetailPath(id);
    case 'IMPORTANT_DATE':
    case 'BIRTHDAY':
    case 'ANNIVERSARY':
      return `${appRoutePath('plan')}#dates`;
    default:
      return null;
  }
}

export function engagementTargetPath(
  targetType: EngagementTarget | null,
  targetId: string | null,
): string | null {
  if (!targetType || !targetId) return null;

  switch (targetType) {
    case 'ONCE_MESSAGE':
      return onceMessagePath(targetId);
    case 'REMINDER':
      return reminderDetailPath(targetId);
    case 'MEMORY':
      return memoryDetailPath(targetId);
    case 'HEART_MOMENT':
      return heartMomentDetailPath(targetId);
    case 'MILESTONE':
      return milestoneDetailPath(targetId);
    case 'WISH':
      return wishDetailPath(targetId);
    case 'PLAN':
      return planDetailPath(targetId);
    case 'PLACE':
      return placeDetailPath(targetId);
    case 'CHAPTER':
      return chapterDetailPath(targetId);
    case 'COLLECTION':
      return collectionDetailPath(targetId);
    case 'PICTURE_GAME':
      return GAMES_PICTURE_PING_PONG_ROUTE;
    // A remote couple game opens its own page; the page reads the current game.
    case 'WHO_OF_US_GAME':
      return GAMES_WHO_OF_US_ROUTE;
    case 'WISH_DETECTIVE_GAME':
      return GAMES_WISH_DETECTIVE_ROUTE;
    case 'OUR_MOMENTS_GAME':
      return GAMES_MOMENTS_ROUTE;
    case 'SHARED_NOTE':
      return sharedNoteDetailPath(targetId);
    case 'GARDEN_SEED':
    case 'GARDEN_BOUQUET':
      return GAMES_GARDEN_ROUTE;
    case 'RECAP':
      return recapDetailPath(targetId);
    case 'WISH_SELECTION':
      return '/plan/choose';
    default:
      return null;
  }
}

// An operator notice (#2314) names a ServerAdmin page, never another route.
const SERVER_ADMIN_ROUTE = /^\/server-admin(?:[?#]|$)/;

// The ServerAdmin page of an operator topic code a tapped device notice carries
// (#2337). Mirrors the server's topic routes; any other code opens Monitoring.
const OPERATOR_TOPIC_PATHS: Readonly<Record<string, string>> = {
  FAILED_JOBS: '/server-admin?section=jobs',
  SUPPORT_REPORTS: '/server-admin?section=reports&state=NEW',
  SPACE_QUOTA_PRESSURE: '/server-admin?section=overview',
};

export function operatorTopicPath(topic?: string | null): string | null {
  if (!topic || !/^[A-Z_]{1,32}$/.test(topic)) return null;
  return OPERATOR_TOPIC_PATHS[topic] ?? '/server-admin?section=monitoring';
}

export function notificationPath(item: {
  kind: string;
  targetType: EngagementTarget | null;
  targetId: string | null;
  operatorRoute?: string | null;
}): string | null {
  if (item.kind === 'OPERATOR_ALERT')
    return item.operatorRoute && SERVER_ADMIN_ROUTE.test(item.operatorRoute)
      ? item.operatorRoute
      : null;
  if (
    (item.kind === 'WISH_DATE_PROPOSED' ||
      item.kind === 'WISH_DATE_COUNTERED') &&
    item.targetType === 'WISH' &&
    item.targetId
  )
    return `${wishDetailPath(item.targetId)}#terminvorschlag`;

  if (item.kind === 'HEART_HUNT_HIDDEN' || item.kind === 'HEART_HUNT_FOUND')
    return GAMES_HEART_HUNT_ROUTE;

  return (
    engagementTargetPath(item.targetType, item.targetId) ??
    (item.kind === 'GENTLE_PROMPT'
      ? MEMORY_CREATE_ROUTE
      : item.kind === 'PLAN_CANCELLED'
        ? '/plan'
        : item.kind === 'PARTNER_JOINED'
          ? '/today'
          : // Several earlier recaps at once open the overview (#1744).
            item.kind === 'RECAP_READY'
            ? STORY_RECAPS_ROUTE
            : null)
  );
}

export function opaqueNextCursor(page: {
  nextCursor: string | null;
}): string | undefined {
  return page.nextCursor ?? undefined;
}
