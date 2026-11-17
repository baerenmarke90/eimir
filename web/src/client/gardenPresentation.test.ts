import { describe, expect, it } from 'vitest';
import {
  fallingLeaves,
  gardenSeason,
  lanternsLit,
  reunionPhase,
  shownStage,
} from './gardenPresentation';

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe('gardenPresentation', () => {
  it('follows the calendar month for the season', () => {
    expect(gardenSeason(day('2026-03-01'))).toBe('spring');
    expect(gardenSeason(day('2026-05-31'))).toBe('spring');
    expect(gardenSeason(day('2026-06-01'))).toBe('summer');
    expect(gardenSeason(day('2026-08-31'))).toBe('summer');
    expect(gardenSeason(day('2026-09-01'))).toBe('autumn');
    expect(gardenSeason(day('2026-11-30'))).toBe('autumn');
    expect(gardenSeason(day('2026-12-01'))).toBe('winter');
    expect(gardenSeason(day('2027-02-28'))).toBe('winter');
  });

  it('draws everything in bloom on the reunion day and buds while asleep', () => {
    expect(shownStage(0, { reunionToday: true, asleep: false })).toBe(3);
    expect(shownStage(3, { reunionToday: false, asleep: true })).toBe(2);
    expect(shownStage(1, { reunionToday: false, asleep: true })).toBe(1);
    expect(shownStage(2, { reunionToday: false, asleep: false })).toBe(2);
  });

  it('lights lanterns for today only and never while asleep', () => {
    const view = { sentToday: { id: 'mine' }, partnerSentToday: false };
    expect(lanternsLit(view, 'awake')).toEqual({ own: true, partner: false });
    expect(lanternsLit(view, 'waking')).toEqual({ own: true, partner: false });
    expect(lanternsLit(view, 'asleep')).toEqual({ own: false, partner: false });
    expect(
      lanternsLit({ sentToday: null, partnerSentToday: true }, 'awake'),
    ).toEqual({ own: false, partner: true });
  });

  it('names the reunion phase from the view', () => {
    expect(reunionPhase({ reunionOn: null, reunionToday: false })).toBe('none');
    expect(
      reunionPhase({ reunionOn: day('2026-11-20'), reunionToday: false }),
    ).toBe('soon');
    expect(
      reunionPhase({ reunionOn: day('2026-11-16'), reunionToday: true }),
    ).toBe('today');
  });

  it('lets a deterministic handful of leaves fall across the width', () => {
    const leaves = fallingLeaves(340);
    expect(leaves).toHaveLength(8);
    expect(fallingLeaves(340)).toEqual(leaves);
    expect(fallingLeaves(680)).toHaveLength(16);
    expect(leaves.every((leaf) => leaf.x >= 0 && leaf.x <= 330)).toBe(true);
  });
});
