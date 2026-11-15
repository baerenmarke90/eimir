import { describe, expect, it } from 'vitest';
import type { WishDetail } from '../api/generated/models/WishDetail';
import { groupCompletedSeries } from './wishSeries';

function wish(
  id: string,
  seriesId: string,
  seriesPosition: number,
  title = id,
): WishDetail {
  return {
    capabilities: { canComment: false, canDelete: true, canEdit: true },
    createdAt: new Date('2026-01-01T00:00:00Z'),
    createdBy: 'a',
    creator: { id: 'a', displayName: 'Anna' },
    followedFromWishId: null,
    hasMemory: false,
    id,
    plan: null,
    seriesId,
    seriesPosition,
    spaceId: 's',
    status: 'COMPLETED',
    title,
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    version: 2,
  };
}

describe('groupCompletedSeries (#1816)', () => {
  it('keeps single wishes as their own rows in order', () => {
    const rows = groupCompletedSeries([wish('a', 'a', 1), wish('b', 'b', 1)]);
    expect(rows.map((row) => row.latest.id)).toEqual(['a', 'b']);
    expect(rows.every((row) => row.times.length === 1)).toBe(true);
  });

  it('folds a series into one row that opens the latest time', () => {
    const first = wish('first', 'series', 1, 'Ostsee');
    const second = wish('second', 'series', 2, 'Ostsee');
    const other = wish('other', 'other', 1, 'Zugfahrt');
    const rows = groupCompletedSeries([second, first, other]);
    expect(rows.map((row) => row.latest.id)).toEqual(['second', 'other']);
    expect(rows[0].times.map((time) => time.id)).toEqual(['first', 'second']);
  });

  it('still groups when the first wish is gone', () => {
    const rows = groupCompletedSeries([
      wish('second', 'gone', 2),
      wish('third', 'gone', 3),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].latest.id).toBe('third');
    expect(rows[0].times).toHaveLength(2);
  });

  it('is empty for no wishes', () => {
    expect(groupCompletedSeries([])).toEqual([]);
  });
});
