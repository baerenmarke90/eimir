import type { PlanDetail } from '../api/generated/models/PlanDetail';
import { PlanStatus } from '../api/generated/models/PlanStatus';
import {
  groupPlanningOverviewPlans,
  selectUpcomingPlans,
} from './planningOverview';

const NOW = new Date('2026-09-08T12:00:00Z');

function plan(
  overrides: Pick<PlanDetail, 'id' | 'status'> & Partial<PlanDetail>,
): PlanDetail {
  const { id, status, ...rest } = overrides;
  const createdAt = rest.createdAt ?? new Date('2026-08-01T10:00:00Z');
  return {
    capabilities: { canComment: true, canDelete: true, canEdit: true },
    createdAt,
    createdBy: 'account-lea',
    creator: { id: 'account-lea', displayName: 'Lea' },
    description: null,
    experiencedOn: null,
    id,
    placeId: null,
    plannedEnd: null,
    plannedOn: null,
    plannedStart: null,
    sourceWishId: null,
    spaceId: 'space-lea-alex',
    status,
    title: id,
    updatedAt: createdAt,
    version: 1,
    ...rest,
  };
}

describe('planning overview selectors', () => {
  it('keeps only future PLANNED items in Dashboard order', () => {
    const convertedWishPlan = plan({
      id: 'plan-b',
      status: PlanStatus.PLANNED,
      plannedStart: new Date('2026-09-18T18:00:00Z'),
      sourceWishId: 'wish-autumn-hike',
      createdAt: new Date('2026-06-01T10:00:00Z'),
    });
    const plans = [
      plan({
        id: 'plan-later',
        status: PlanStatus.PLANNED,
        plannedStart: new Date('2026-09-25T09:00:00Z'),
        createdAt: new Date('2026-05-01T10:00:00Z'),
      }),
      convertedWishPlan,
      plan({
        id: 'plan-idea',
        status: PlanStatus.IDEA,
        plannedStart: null,
      }),
      plan({
        id: 'plan-completed',
        status: PlanStatus.COMPLETED,
        plannedStart: new Date('2026-09-30T09:00:00Z'),
        experiencedOn: new Date('2026-07-26T00:00:00Z'),
      }),
      plan({
        id: 'plan-a',
        status: PlanStatus.PLANNED,
        plannedStart: new Date('2026-09-18T18:00:00Z'),
        createdAt: new Date('2026-07-01T10:00:00Z'),
      }),
      plan({
        id: 'plan-past',
        status: PlanStatus.PLANNED,
        plannedStart: new Date('2026-09-01T09:00:00Z'),
      }),
    ];
    const inputOrder = plans.map((item) => item.id);

    expect(selectUpcomingPlans(plans, NOW).map((item) => item.id)).toEqual([
      'plan-a',
      'plan-b',
      'plan-later',
    ]);
    expect(convertedWishPlan.sourceWishId).toBe('wish-autumn-hike');
    expect(plans.map((item) => item.id)).toEqual(inputOrder);
  });

  it('keeps date-only calendar days upcoming and orders them before timed plans on the same day', () => {
    const plans = [
      plan({
        id: 'timed-same-day',
        status: PlanStatus.PLANNED,
        plannedStart: new Date('2026-09-18T18:00:00Z'),
      }),
      plan({
        id: 'date-only-same-day',
        status: PlanStatus.PLANNED,
        plannedOn: new Date('2026-09-18T00:00:00Z'),
      }),
      plan({
        id: 'date-only-today',
        status: PlanStatus.PLANNED,
        plannedOn: new Date('2026-09-08T00:00:00Z'),
      }),
      plan({
        id: 'timed-earlier-today',
        status: PlanStatus.PLANNED,
        plannedStart: new Date('2026-09-08T09:00:00Z'),
      }),
      plan({
        id: 'date-only-past',
        status: PlanStatus.PLANNED,
        plannedOn: new Date('2026-09-07T00:00:00Z'),
      }),
    ];

    expect(selectUpcomingPlans(plans, NOW).map((item) => item.id)).toEqual([
      'date-only-today',
      'date-only-same-day',
      'timed-same-day',
    ]);
  });

  it('composes focal, later, undated, past, and completed Plan groups', () => {
    const focal = plan({
      id: 'focal',
      status: PlanStatus.PLANNED,
      plannedStart: new Date('2026-09-09T18:00:00Z'),
    });
    const later = plan({
      id: 'later',
      status: PlanStatus.PLANNED,
      plannedOn: new Date('2026-09-10T00:00:00Z'),
    });
    const undated = plan({
      id: 'undated',
      status: PlanStatus.IDEA,
      updatedAt: new Date('2026-09-07T18:00:00Z'),
    });
    const past = plan({
      id: 'past',
      status: PlanStatus.PLANNED,
      plannedStart: new Date('2026-09-01T18:00:00Z'),
    });
    const completed = plan({
      id: 'completed',
      status: PlanStatus.COMPLETED,
      experiencedOn: new Date('2026-08-20T00:00:00Z'),
    });

    const groups = groupPlanningOverviewPlans(
      [completed, past, undated, later, focal],
      NOW,
    );

    expect(groups.focal?.id).toBe('focal');
    expect(groups.later.map((item) => item.id)).toEqual(['later']);
    expect(groups.undated.map((item) => item.id)).toEqual(['undated']);
    expect(groups.past.map((item) => item.id)).toEqual(['past']);
    expect(groups.completed.map((item) => item.id)).toEqual(['completed']);
  });
});
