import { describe, expect, it } from 'vitest';
import type { DashboardItem } from '../api/generated/models/DashboardItem';
import type { StoryLifelineView } from '../api/generated/models/StoryLifelineView';
import {
  buildLifeline,
  MAX_LIFELINE_STACK,
  monthTicks,
  nearestColumn,
} from './storyLifeline';

const day = (value: string) => new Date(`${value}T00:00:00Z`);

function item(id: string, photo = false): DashboardItem {
  return {
    type: 'MEMORY',
    id,
    titleOrText: id,
    occurredOn: null,
    scheduledAt: null,
    createdAt: null,
    previewAttachmentId: photo ? `att-${id}` : null,
    previewIsSensitive: false,
    previewHasThumbnail: false,
  };
}

function week(
  start: string,
  memories: number,
  heartMoments = 0,
  milestones = 0,
  photo = false,
) {
  return {
    weekStart: day(start),
    memories,
    heartMoments,
    milestones,
    highlight: item(start, photo),
  };
}

describe('buildLifeline', () => {
  it('keeps every count and draws one dot per entry for a half-year story', () => {
    const view: StoryLifelineView = {
      startsOn: day('2026-05-13'),
      today: day('2026-11-10'),
      weeks: [
        week('2026-05-11', 1, 0, 1),
        week('2026-07-13', 3, 1),
        week('2026-11-09', 1, 0, 1),
      ],
    };
    const model = buildLifeline(view);
    expect(model.unit).toBe('week');
    expect(model.totals).toEqual({
      memories: 5,
      heartMoments: 1,
      milestones: 2,
      total: 8,
    });
    expect(model.drawable).toBe(true);
    expect(model.columns.map((column) => column.dots)).toEqual([
      ['memories', 'milestones'],
      ['memories', 'memories', 'memories', 'heartMoments'],
      ['memories', 'milestones'],
    ]);
    const positions = model.columns.map((column) => column.position);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(positions[0]).toBeGreaterThanOrEqual(0);
    expect(positions[2]).toBeLessThanOrEqual(1);
    // The range starts at the relationship start, not the first Monday.
    expect(model.rangeStart.toISOString().slice(0, 10)).toBe('2026-05-11');
  });

  it('groups long stories into months and prefers a photo for the preview', () => {
    const weeks = [
      week('2024-01-01', 1, 0, 0, true),
      week('2024-01-08', 1),
      ...Array.from({ length: 30 }, (_, index) =>
        week(
          new Date(Date.UTC(2024, 1 + index, 5)).toISOString().slice(0, 10),
          1,
        ),
      ),
    ];
    const model = buildLifeline({
      startsOn: null,
      today: day('2026-11-10'),
      weeks,
    });
    expect(model.unit).toBe('month');
    expect(model.columns[0].key).toBe('2024-01-01');
    expect(model.columns[0].total).toBe(2);
    expect(model.columns[0].highlight.id).toBe('2024-01-01');
    expect(model.totals.total).toBe(32);
  });

  it('caps busy columns at the band height while keeping every type visible', () => {
    const model = buildLifeline({
      startsOn: null,
      today: day('2026-11-10'),
      weeks: [week('2026-08-03', 1), week('2026-11-02', 20, 4, 1)],
    });
    const busy = model.columns[1];
    expect(busy.total).toBe(25);
    expect(busy.dots.length).toBeLessThanOrEqual(MAX_LIFELINE_STACK);
    expect(new Set(busy.dots)).toEqual(
      new Set(['memories', 'heartMoments', 'milestones']),
    );
    expect(model.columns[0].dots).toEqual(['memories']);
  });

  it('does not draw a band without enough history', () => {
    const recent = buildLifeline({
      startsOn: null,
      today: day('2026-11-10'),
      weeks: [week('2026-11-02', 6)],
    });
    expect(recent.drawable).toBe(false);
    const empty = buildLifeline({
      startsOn: day('2026-01-01'),
      today: day('2026-11-10'),
      weeks: [],
    });
    expect(empty.drawable).toBe(false);
    expect(empty.totals.total).toBe(0);
  });
});

describe('lifeline helpers', () => {
  it('finds the nearest column and the month boundaries', () => {
    const model = buildLifeline({
      startsOn: day('2026-05-13'),
      today: day('2026-11-10'),
      weeks: [week('2026-05-11', 3), week('2026-11-09', 3)],
    });
    expect(nearestColumn(model.columns, 0)).toBe(0);
    expect(nearestColumn(model.columns, 0.97)).toBe(1);
    expect(nearestColumn([], 0.5)).toBe(-1);
    const ticks = monthTicks(model);
    expect(ticks.map((tick) => tick.start.getUTCMonth())).toEqual([
      4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(ticks[0].position).toBe(0);
  });
});
