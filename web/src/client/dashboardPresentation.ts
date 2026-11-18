import type { TFunction } from 'i18next';
import type { DashboardItem } from '../api/generated/models/DashboardItem';
import { memoryPreviewTitle } from './memoryProduct';

export function dashboardItemTitle(item: DashboardItem, t: TFunction) {
  return item.type === 'MEMORY' &&
    (item.titleOrText?.trim() || item.occurredOn || item.createdAt)
    ? memoryPreviewTitle(item.titleOrText, item.occurredOn ?? item.createdAt, t)
    : {
        title: item.titleOrText?.trim() || t('m5s5.dashboard.itemFallback'),
        titleIsDate: false,
      };
}
