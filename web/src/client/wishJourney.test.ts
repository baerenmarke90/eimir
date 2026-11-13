import { describe, expect, it } from 'vitest';
import type { WishDetail } from '../api/generated/models/WishDetail';
import {
  formatCompactCalendarDate,
  formatCompactWeekdayDate,
} from './formatRecency';
import {
  sortPlannedWishes,
  wishJourneyHint,
  wishJourneyStage,
  wishPlanDateLabel,
} from './wishJourney';

function wish(overrides: Partial<WishDetail>): WishDetail {
  return {
    capabilities: { canComment: false, canDelete: true, canEdit: true },
    createdAt: new Date('2026-11-01T10:00:00Z'),
    createdBy: 'account-lea',
    creator: { id: 'account-lea', displayName: 'Lea' },
    id: 'wish',
    spaceId: 'space-1',
    status: 'OPEN',
    title: 'Wish',
    updatedAt: new Date('2026-11-01T10:00:00Z'),
    version: 1,
    plan: null,
    hasMemory: false,
    ...overrides,
  };
}

const plan = (overrides: Partial<NonNullable<WishDetail['plan']>> = {}) => ({
  id: 'plan',
  status: 'PLANNED' as const,
  plannedOn: null,
  plannedStart: null,
  experiencedOn: null,
  ...overrides,
});

describe('wish journey', () => {
  it('derives the stage from status and a linked memory only', () => {
    expect(wishJourneyStage(wish({ status: 'OPEN', hasMemory: true }))).toBe(
      'wished',
    );
    expect(wishJourneyStage(wish({ status: 'PLANNED' }))).toBe('planned');
    expect(wishJourneyStage(wish({ status: 'COMPLETED' }))).toBe('experienced');
    expect(
      wishJourneyStage(wish({ status: 'COMPLETED', hasMemory: true })),
    ).toBe('remembered');
  });

  it('keeps a date-only plan day and formats an exact start locally', () => {
    const day = new Date('2026-11-21T00:00:00Z');
    const start = new Date('2026-11-24T09:00:00Z');
    expect(wishPlanDateLabel(plan({ plannedOn: day }), 'de-DE')).toBe(
      formatCompactCalendarDate(day, 'de-DE'),
    );
    expect(wishPlanDateLabel(plan({ plannedStart: start }), 'de-DE')).toBe(
      formatCompactWeekdayDate(start, 'de-DE'),
    );
    expect(wishPlanDateLabel(plan(), 'de-DE')).toBeNull();
    expect(wishPlanDateLabel(null, 'de-DE')).toBeNull();
  });

  it('orders planned wishes by their plan date with undated plans last', () => {
    const later = wish({
      id: 'later',
      plan: plan({ plannedStart: new Date('2026-12-01T10:00:00Z') }),
    });
    const sooner = wish({
      id: 'sooner',
      plan: plan({ plannedOn: new Date('2026-11-21T00:00:00Z') }),
    });
    const undated = wish({ id: 'undated', plan: plan() });
    expect(
      sortPlannedWishes([undated, later, sooner], () => 0).map(
        (item) => item.id,
      ),
    ).toEqual(['sooner', 'later', 'undated']);
  });

  it('shows one hint: wishes underway first, then plan memories to capture', () => {
    const planned = wish({ status: 'PLANNED', plan: plan() });
    const waiting = wish({
      status: 'COMPLETED',
      plan: plan({ status: 'COMPLETED' }),
    });
    const remembered = wish({
      status: 'COMPLETED',
      plan: plan({ status: 'COMPLETED' }),
      hasMemory: true,
    });
    const direct = wish({ status: 'COMPLETED' });

    expect(wishJourneyHint([planned, planned, waiting])).toEqual({
      kind: 'underway',
      count: 2,
    });
    expect(wishJourneyHint([waiting, remembered, direct])).toEqual({
      kind: 'awaitingMemory',
      count: 1,
    });
    expect(wishJourneyHint([remembered, direct])).toBeNull();
    expect(wishJourneyHint([])).toBeNull();
  });
});
