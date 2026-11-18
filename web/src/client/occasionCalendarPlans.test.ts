import { describe, expect, it, vi } from 'vitest';
import type { PlansApi } from '../api/generated/apis/PlansApi';
import type { PlanDetail } from '../api/generated/models/PlanDetail';
import { PlanStatus } from '../api/generated/models/PlanStatus';
import {
  loadOccasionCalendarPlans,
  occasionCalendarPlansQueryKey,
  planCalendarDays,
} from './occasionCalendarPlans';

const NOW = new Date(2026, 10, 15, 12, 0, 0);

function plan(id: string, schedule: Partial<PlanDetail>): PlanDetail {
  return {
    id,
    spaceId: 'space-1',
    title: id,
    status: PlanStatus.PLANNED,
    plannedOn: null,
    plannedUntil: null,
    plannedStart: null,
    plannedEnd: null,
    ...schedule,
  } as PlanDetail;
}

function api(pages: { items: PlanDetail[]; nextCursor: string | null }[]) {
  const listPlans = vi.fn();
  for (const page of pages) listPlans.mockResolvedValueOnce(page);
  return { listPlans } as unknown as Pick<PlansApi, 'listPlans'> & {
    listPlans: ReturnType<typeof vi.fn>;
  };
}

describe('loadOccasionCalendarPlans', () => {
  it('reads the open overview until the upcoming group ends', async () => {
    const plans = api([
      {
        items: [
          plan('soon', { plannedOn: new Date('2026-11-21T00:00:00Z') }),
          plan('later', { plannedStart: new Date(2026, 11, 5, 18, 0, 0) }),
        ],
        nextCursor: 'page-2',
      },
      {
        items: [
          plan('last', { plannedOn: new Date('2027-01-02T00:00:00Z') }),
          plan('undated', {}),
        ],
        nextCursor: 'page-3',
      },
    ]);

    const result = await loadOccasionCalendarPlans(plans, 'space-1', NOW);

    expect(result.map((item) => item.id)).toEqual(['soon', 'later', 'last']);
    // The second page already left the upcoming group: no third request.
    expect(plans.listPlans).toHaveBeenCalledTimes(2);
    expect(plans.listPlans).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ cursor: 'page-2', overviewScope: 'OPEN' }),
      expect.anything(),
    );
  });

  it('drops ideas and Plans whose day has passed', async () => {
    const plans = api([
      {
        items: [
          plan('idea', {
            status: PlanStatus.IDEA,
            plannedOn: new Date('2026-12-01T00:00:00Z'),
          }),
          plan('past', { plannedOn: new Date('2026-11-01T00:00:00Z') }),
        ],
        nextCursor: null,
      },
    ]);
    expect(await loadOccasionCalendarPlans(plans, 'space-1', NOW)).toEqual([]);
  });

  it('rejects a repeated cursor instead of looping', async () => {
    const page = {
      items: [plan('soon', { plannedOn: new Date('2026-11-21T00:00:00Z') })],
      nextCursor: 'same',
    };
    const plans = api([page, page]);
    await expect(
      loadOccasionCalendarPlans(plans, 'space-1', NOW),
    ).rejects.toThrow(/repeated cursor/);
  });
});

describe('planCalendarDays', () => {
  it('keeps the encoded calendar days of a date-only period', () => {
    expect(
      planCalendarDays(
        plan('trip', {
          plannedOn: new Date('2026-07-30T00:00:00Z'),
          plannedUntil: new Date('2026-08-02T00:00:00Z'),
        }),
      ),
    ).toEqual({
      first: new Date('2026-07-30T00:00:00Z'),
      last: new Date('2026-08-02T00:00:00Z'),
    });
  });

  it('places a timed Plan on its local start day', () => {
    const late = new Date(2026, 10, 21, 23, 30, 0);
    const key = `${late.getFullYear()}-${String(late.getMonth() + 1).padStart(2, '0')}-${String(late.getDate()).padStart(2, '0')}`;
    expect(planCalendarDays(plan('late', { plannedStart: late }))).toEqual({
      first: new Date(`${key}T00:00:00Z`),
      last: new Date(`${key}T00:00:00Z`),
    });
  });

  it('has no days for an undated Plan', () => {
    expect(planCalendarDays(plan('undated', {}))).toBeNull();
  });
});

describe('occasionCalendarPlansQueryKey', () => {
  it('shares the Plan query prefix so Plan writes refresh the calendar', () => {
    expect(occasionCalendarPlansQueryKey('space-1').slice(0, 3)).toEqual([
      'm5-s3',
      'plans',
      'space-1',
    ]);
  });
});
