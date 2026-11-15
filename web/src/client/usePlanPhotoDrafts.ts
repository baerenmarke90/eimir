import type { OrderedAttachmentSummary } from '../api/generated/models/OrderedAttachmentSummary';
import type { PlanDetail } from '../api/generated/models/PlanDetail';
export { useOrderedPhotoDrafts as usePlanPhotoDrafts } from './useOrderedPhotoDrafts';
export type { OrderedPhotoDraftController as PlanPhotoDraftController } from './useOrderedPhotoDrafts';

export function planPhotos(plan: PlanDetail): OrderedAttachmentSummary[] {
  const photos = plan.attachments?.length
    ? plan.attachments
    : plan.coverAttachment
      ? [{ ...plan.coverAttachment, position: 0 }]
      : [];
  return photos
    .filter((photo) => photo.status === 'READY')
    .sort((a, b) => a.position - b.position);
}
