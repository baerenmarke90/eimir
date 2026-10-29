import { DashboardViewFromJSON } from '../api/generated/models/DashboardView';
import { PlanDetailFromJSON } from '../api/generated/models/PlanDetail';

export function decodeDashboardOverview(payload: unknown, spaceId: string) {
  const value = DashboardViewFromJSON(payload);
  if (
    !value ||
    value.space?.spaceId !== spaceId ||
    !Array.isArray(value.upcoming) ||
    !Array.isArray(value.recentShared) ||
    !value.sharedStorySummary ||
    ![
      value.sharedStorySummary.memories,
      value.sharedStorySummary.heartMoments,
      value.sharedStorySummary.milestones,
    ].every((count) => Number.isSafeInteger(count) && count >= 0)
  ) {
    throw new Error('Invalid shared Dashboard snapshot');
  }
  return value;
}

export function decodePlansOverview(payload: unknown, spaceId: string) {
  if (!Array.isArray(payload))
    throw new Error('Invalid Plan overview snapshot');
  const items = payload.map(PlanDetailFromJSON);
  if (
    !items.every(
      (plan) =>
        plan &&
        plan.spaceId === spaceId &&
        typeof plan.id === 'string' &&
        typeof plan.title === 'string' &&
        ['IDEA', 'PLANNED', 'COMPLETED'].includes(plan.status) &&
        [plan.createdAt, plan.updatedAt].every((date) =>
          Number.isFinite(date.getTime()),
        ) &&
        [
          plan.plannedOn,
          plan.plannedStart,
          plan.plannedEnd,
          plan.experiencedOn,
        ].every((date) => !date || Number.isFinite(date.getTime())),
    )
  ) {
    throw new Error('Invalid Plan overview snapshot');
  }
  return { pages: [{ items, nextCursor: null }], pageParams: [null] };
}
