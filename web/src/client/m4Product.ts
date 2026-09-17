import { ActivityApi } from '../api/generated/apis/ActivityApi';
import { DashboardApi } from '../api/generated/apis/DashboardApi';
import { NotificationsApi } from '../api/generated/apis/NotificationsApi';
import { SearchApi } from '../api/generated/apis/SearchApi';
import { Configuration } from '../api/generated/runtime';
import type { DashboardItemType } from '../api/generated/models/DashboardItemType';
import type { EngagementTarget } from '../api/generated/models/EngagementTarget';
import type { SearchKind } from '../api/generated/models/SearchKind';
import {
  appRoutePath,
  MORE_PEOPLE_ROUTE,
  chapterDetailPath,
  collectionDetailPath,
  heartMomentDetailPath,
  memoryDetailPath,
  milestoneDetailPath,
  planDetailPath,
  placeDetailPath,
  wishDetailPath,
} from './routes';

export interface M4ProductApis {
  activity: ActivityApi;
  dashboard: DashboardApi;
  notifications: NotificationsApi;
  search: SearchApi;
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
  };
}

export function searchResultPath(type: SearchKind, id: string): string | null {
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
      return appRoutePath('more');
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
      return MORE_PEOPLE_ROUTE;
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
    default:
      return null;
  }
}

export function opaqueNextCursor(page: {
  nextCursor: string | null;
}): string | undefined {
  return page.nextCursor ?? undefined;
}
