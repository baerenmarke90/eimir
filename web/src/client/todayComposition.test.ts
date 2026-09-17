import { describe, expect, it } from 'vitest';
import type { ActivityItem } from '../api/generated/models/ActivityItem';
import type { DashboardItem } from '../api/generated/models/DashboardItem';
import {
  itemCalendarMonth,
  livingModuleContentId,
  MONTHLY_STRIP_MAX_ITEMS,
  selectLivingModule,
  selectMonthlyStrip,
  selectTodayFocalItem,
} from './todayComposition';

/**
 * Build an `occurredOn` exactly the way the generated client does.
 *
 * The OpenAPI type is `format: date`, so the wire value is a bare
 * `YYYY-MM-DD` string and `new Date(...)` reads it as midnight UTC. Writing
 * the fixture this way — rather than with local `new Date(y, m, d)` — is what
 * makes these assertions encode the date-only contract instead of quietly
 * depending on the test machine running in UTC.
 */
function occurredOn(isoDate: string): Date {
  return new Date(isoDate);
}

const PARTNER_ID = 'partner-1';
const VIEWER_ID = 'viewer-1';

function item(overrides: Partial<DashboardItem> & Pick<DashboardItem, 'id'>) {
  return {
    type: 'MEMORY',
    titleOrText: 'Ein Moment',
    occurredOn: null,
    scheduledAt: null,
    createdAt: null,
    previewAttachmentId: null,
    ...overrides,
  } as DashboardItem;
}

function comment(overrides: Partial<ActivityItem> = {}) {
  return {
    id: 'a1',
    kind: 'COMMENT_CREATED',
    actorId: PARTNER_ID,
    targetType: 'MEMORY',
    targetId: 'm1',
    createdAt: new Date('2026-09-09T10:00:00Z'),
    ...overrides,
  } as ActivityItem;
}

describe('selectTodayFocalItem', () => {
  it('keeps the server-authoritative Keepsake ahead of newer shared text', () => {
    const keepsake = item({
      id: 'keepsake',
      previewAttachmentId: 'attachment-1',
    });
    expect(
      selectTodayFocalItem({
        keepsake,
        recentShared: [item({ id: 'newer-text' })],
      }),
    ).toEqual({ kind: 'keepsake', item: keepsake });
  });

  it('uses real shared story text when no Keepsake exists', () => {
    const memory = item({
      id: 'memory-text',
      titleOrText: 'A single shared sentence',
    });
    expect(
      selectTodayFocalItem({
        keepsake: null,
        recentShared: [item({ id: 'plan', type: 'PLAN' }), memory],
      }),
    ).toEqual({ kind: 'shared_text', item: memory });
  });

  it('does not turn planning or utility data into filler focal content', () => {
    expect(
      selectTodayFocalItem({
        keepsake: null,
        recentShared: [
          item({ id: 'plan', type: 'PLAN' }),
          item({ id: 'place', type: 'PLACE' }),
        ],
      }),
    ).toBeNull();
  });
});

describe('selectLivingModule', () => {
  const wish = item({ id: 'w1', type: 'WISH' });
  const plan = item({ id: 'p1', type: 'PLAN' });
  const milestone = item({ id: 'ms1', type: 'MILESTONE' });
  const retrospective = item({ id: 'r1' });

  it('returns exactly one module, never a stack, when several candidates qualify', () => {
    const result = selectLivingModule({
      partnerId: PARTNER_ID,
      activityItems: [comment()],
      retrospective,
      recentShared: [wish, plan, milestone],
    });

    expect(result).toEqual({
      kind: 'partner_signal',
      activityItem: comment(),
    });
  });

  it('prefers the partner signal, then the retrospective, then wish, plan, milestone', () => {
    const chain = [
      {
        input: {
          activityItems: [comment()],
          retrospective,
          recentShared: [wish],
        },
        expected: 'partner_signal',
      },
      {
        input: { activityItems: [], retrospective, recentShared: [wish] },
        expected: 'retrospective',
      },
      {
        input: {
          activityItems: [],
          retrospective: null,
          recentShared: [milestone, plan, wish],
        },
        expected: 'wish',
      },
      {
        input: {
          activityItems: [],
          retrospective: null,
          recentShared: [milestone, plan],
        },
        expected: 'plan',
      },
      {
        input: {
          activityItems: [],
          retrospective: null,
          recentShared: [milestone],
        },
        expected: 'milestone',
      },
    ];

    for (const step of chain) {
      expect(
        selectLivingModule({ partnerId: PARTNER_ID, ...step.input })?.kind,
      ).toBe(step.expected);
    }
  });

  it('is deterministic: the same input always yields the same module', () => {
    const input = {
      partnerId: PARTNER_ID,
      activityItems: [],
      retrospective: null,
      recentShared: [milestone, plan, wish],
    };
    const first = selectLivingModule(input);
    for (let i = 0; i < 5; i += 1) {
      expect(selectLivingModule(input)).toEqual(first);
    }
  });

  it('returns null when nothing qualifies, so the section is omitted', () => {
    expect(
      selectLivingModule({
        partnerId: PARTNER_ID,
        activityItems: [],
        retrospective: null,
        recentShared: [item({ id: 'hm1', type: 'HEART_MOMENT' })],
      }),
    ).toBeNull();
  });

  it('never repeats an item the page already features above it', () => {
    expect(
      selectLivingModule({
        partnerId: PARTNER_ID,
        activityItems: [],
        retrospective,
        recentShared: [wish],
        excludeItemIds: [retrospective.id],
      })?.kind,
    ).toBe('wish');
  });

  it('does not treat the viewer’s own comment as a partner signal', () => {
    expect(
      selectLivingModule({
        partnerId: PARTNER_ID,
        activityItems: [comment({ actorId: VIEWER_ID })],
        retrospective: null,
        recentShared: [],
      }),
    ).toBeNull();
  });

  it('does not treat an unattributed comment as a partner signal', () => {
    expect(
      selectLivingModule({
        partnerId: PARTNER_ID,
        activityItems: [comment({ actorId: null })],
        retrospective: null,
        recentShared: [],
      }),
    ).toBeNull();
  });

  it('does not surface a partner signal when the space has no partner', () => {
    expect(
      selectLivingModule({
        partnerId: null,
        activityItems: [comment()],
        retrospective: null,
        recentShared: [],
      }),
    ).toBeNull();
  });

  it('ignores non-comment partner activity', () => {
    expect(
      selectLivingModule({
        partnerId: PARTNER_ID,
        activityItems: [comment({ kind: 'MEMORY_CREATED' })],
        retrospective: null,
        recentShared: [],
      }),
    ).toBeNull();
  });

  it('skips a partner comment about content the page already features, and continues down the chain', () => {
    const featured = 'mem-featured';
    const result = selectLivingModule({
      partnerId: PARTNER_ID,
      activityItems: [comment({ targetId: featured })],
      retrospective,
      recentShared: [wish],
      excludeItemIds: [featured],
    });

    expect(result?.kind).toBe('retrospective');
  });

  it('falls all the way through when the only partner comment is about featured content', () => {
    const featured = 'mem-featured';
    expect(
      selectLivingModule({
        partnerId: PARTNER_ID,
        activityItems: [comment({ targetId: featured })],
        retrospective: null,
        recentShared: [],
        excludeItemIds: [featured],
      }),
    ).toBeNull();
  });

  it('still prefers the next genuine partner comment over the stable candidates', () => {
    const featured = 'mem-featured';
    const result = selectLivingModule({
      partnerId: PARTNER_ID,
      activityItems: [
        comment({ id: 'a1', targetId: featured }),
        comment({ id: 'a2', targetId: 'mem-other' }),
      ],
      retrospective,
      recentShared: [wish],
      excludeItemIds: [featured],
    });

    expect(result).toEqual({
      kind: 'partner_signal',
      activityItem: comment({ id: 'a2', targetId: 'mem-other' }),
    });
  });

  it('keeps an unrelated partner signal winning precedence', () => {
    const result = selectLivingModule({
      partnerId: PARTNER_ID,
      activityItems: [comment({ targetId: 'mem-other' })],
      retrospective,
      recentShared: [wish, plan, milestone],
      excludeItemIds: ['mem-featured'],
    });

    expect(result?.kind).toBe('partner_signal');
  });

  it('suppresses duplicate Wish/Plan fallback when upcoming already owns the planning role', () => {
    expect(
      selectLivingModule({
        partnerId: PARTNER_ID,
        activityItems: [],
        retrospective: null,
        recentShared: [wish, plan, milestone],
        suppressPlanningFallback: true,
      })?.kind,
    ).toBe('milestone');
  });

  it('keeps a partner comment with no target eligible, since it can duplicate nothing', () => {
    const result = selectLivingModule({
      partnerId: PARTNER_ID,
      activityItems: [comment({ targetId: null })],
      retrospective,
      recentShared: [],
      excludeItemIds: ['mem-featured'],
    });

    expect(result?.kind).toBe('partner_signal');
  });
});

describe('livingModuleContentId', () => {
  it('reports the commented item for a partner signal, not the activity entry', () => {
    expect(
      livingModuleContentId({
        kind: 'partner_signal',
        activityItem: comment({ id: 'activity-1', targetId: 'mem-9' }),
      }),
    ).toBe('mem-9');
  });

  it('reports the item id for every stable candidate kind', () => {
    for (const kind of [
      'retrospective',
      'wish',
      'plan',
      'milestone',
    ] as const) {
      expect(
        livingModuleContentId({ kind, item: item({ id: `x-${kind}` }) }),
      ).toBe(`x-${kind}`);
    }
  });

  it('reports nothing when there is no module, or no target to exclude', () => {
    expect(livingModuleContentId(null)).toBeNull();
    expect(
      livingModuleContentId({
        kind: 'partner_signal',
        activityItem: comment({ targetId: null }),
      }),
    ).toBeNull();
  });
});

describe('itemCalendarMonth', () => {
  it('reads a date-only occurredOn as the calendar date the API encoded', () => {
    // A date-only value materializes at midnight UTC, so reading it with
    // local components can only ever shift it *backwards*, to the previous
    // day, for viewers west of Greenwich. The first of the month is therefore
    // the case that breaks: local components report August.
    expect(
      itemCalendarMonth(
        item({ id: 'a', occurredOn: occurredOn('2026-09-01') }),
      ),
    ).toEqual({
      year: 2026,
      month: 8,
    });
    // The other side of the same boundary, pinned so a future change cannot
    // over-correct and pull the previous month in.
    expect(
      itemCalendarMonth(
        item({ id: 'b', occurredOn: occurredOn('2026-08-31') }),
      ),
    ).toEqual({
      year: 2026,
      month: 7,
    });
    expect(
      itemCalendarMonth(
        item({ id: 'c', occurredOn: occurredOn('2026-12-31') }),
      ),
    ).toEqual({
      year: 2026,
      month: 11,
    });
    expect(
      itemCalendarMonth(
        item({ id: 'd', occurredOn: occurredOn('2027-01-01') }),
      ),
    ).toEqual({
      year: 2027,
      month: 0,
    });
  });

  it('reads a createdAt instant with the browser-local semantics used elsewhere', () => {
    const instant = new Date('2026-09-15T12:00:00Z');
    expect(itemCalendarMonth(item({ id: 'e', createdAt: instant }))).toEqual({
      year: instant.getFullYear(),
      month: instant.getMonth(),
    });
  });

  it('prefers occurredOn over createdAt, and reports nothing when neither exists', () => {
    expect(
      itemCalendarMonth(
        item({
          id: 'f',
          occurredOn: occurredOn('2026-09-01'),
          createdAt: new Date('2026-07-04T12:00:00Z'),
        }),
      ),
    ).toEqual({ year: 2026, month: 8 });
    expect(itemCalendarMonth(item({ id: 'g' }))).toBeNull();
  });
});

describe('selectMonthlyStrip', () => {
  // Mid-month, so `now`'s browser-local month is September at every real UTC
  // offset and the suite never depends on where it runs.
  const now = new Date('2026-09-10T12:00:00Z');
  const thisMonth = (day: number) =>
    occurredOn(`2026-09-${String(day).padStart(2, '0')}`);

  const photo = (id: string, day: number) =>
    item({
      id,
      type: 'MEMORY',
      previewAttachmentId: `att-${id}`,
      occurredOn: thisMonth(day),
    });

  it('shows at most three photos', () => {
    const result = selectMonthlyStrip({
      recentShared: [1, 2, 3, 4, 5].map((n) => photo(`m${n}`, n)),
      now,
    });
    expect(result).toHaveLength(MONTHLY_STRIP_MAX_ITEMS);
    expect(result.map((i) => i.id)).toEqual(['m1', 'm2', 'm3']);
  });

  it('composes one and two photos rather than padding to three', () => {
    expect(
      selectMonthlyStrip({ recentShared: [photo('m1', 1)], now }),
    ).toHaveLength(1);
    expect(
      selectMonthlyStrip({
        recentShared: [photo('m1', 1), photo('m2', 2)],
        now,
      }),
    ).toHaveLength(2);
  });

  it('is empty when the month has no shared photo, so the section is omitted', () => {
    expect(selectMonthlyStrip({ recentShared: [], now })).toEqual([]);
  });

  it('excludes entries from other months so the heading stays true', () => {
    const lastMonth = item({
      id: 'old',
      type: 'MEMORY',
      previewAttachmentId: 'att-old',
      occurredOn: occurredOn('2026-08-20'),
    });
    const lastYear = item({
      id: 'ancient',
      type: 'MEMORY',
      previewAttachmentId: 'att-ancient',
      occurredOn: occurredOn('2025-09-20'),
    });

    expect(
      selectMonthlyStrip({
        recentShared: [lastMonth, lastYear, photo('m1', 3)],
        now,
      }).map((i) => i.id),
    ).toEqual(['m1']);
  });

  it('shows only real photos, never a placeholder for a text-only entry', () => {
    const noPhoto = item({
      id: 'm-nophoto',
      type: 'MEMORY',
      occurredOn: thisMonth(4),
    });
    const notAMemory = item({
      id: 'hm1',
      type: 'HEART_MOMENT',
      previewAttachmentId: 'att-hm1',
      occurredOn: thisMonth(5),
    });

    expect(
      selectMonthlyStrip({
        recentShared: [noPhoto, notAMemory, photo('m1', 6)],
        now,
      }).map((i) => i.id),
    ).toEqual(['m1']);
  });

  it('falls back to the creation date when a memory has no happened-on date', () => {
    const created = item({
      id: 'm-created',
      type: 'MEMORY',
      previewAttachmentId: 'att-created',
      // A real instant, mid-month, so its browser-local month is September
      // at every real UTC offset.
      createdAt: new Date('2026-09-07T12:00:00Z'),
    });
    expect(
      selectMonthlyStrip({ recentShared: [created], now }).map((i) => i.id),
    ).toEqual(['m-created']);
  });

  /*
   * The date-only boundary contract.
   *
   * `occurredOn` arrives as `YYYY-MM-DD` and materializes as midnight UTC, so
   * browser-local components can only shift it backwards a day — which moved
   * the first of the month into the previous month for every viewer west of
   * Greenwich. These cases pin both edges of the boundary and hold wherever
   * the suite runs, rather than passing only because CI happens to be UTC.
   */
  it('keeps the first day of the month in the month the API encoded', () => {
    const firstOfMonth = item({
      id: 'm-first',
      type: 'MEMORY',
      previewAttachmentId: 'att-first',
      occurredOn: occurredOn('2026-09-01'),
    });
    expect(itemCalendarMonth(firstOfMonth)).toEqual({ year: 2026, month: 8 });
    expect(
      selectMonthlyStrip({ recentShared: [firstOfMonth], now }).map(
        (i) => i.id,
      ),
    ).toEqual(['m-first']);
  });

  it('excludes the last day of the previous month', () => {
    const lastOfPrevious = item({
      id: 'm-prev',
      type: 'MEMORY',
      previewAttachmentId: 'att-prev',
      occurredOn: occurredOn('2026-08-31'),
    });
    expect(itemCalendarMonth(lastOfPrevious)).toEqual({ year: 2026, month: 7 });
    expect(selectMonthlyStrip({ recentShared: [lastOfPrevious], now })).toEqual(
      [],
    );
  });

  it('keeps an ordinary middle-of-month date', () => {
    const middle = item({
      id: 'm-middle',
      type: 'MEMORY',
      previewAttachmentId: 'att-middle',
      occurredOn: occurredOn('2026-09-15'),
    });
    expect(
      selectMonthlyStrip({ recentShared: [middle], now }).map((i) => i.id),
    ).toEqual(['m-middle']);
  });

  it('never repeats the photo already shown large as Euer Moment', () => {
    const featured = photo('m1', 2);
    expect(
      selectMonthlyStrip({
        recentShared: [featured, photo('m2', 3)],
        now,
        excludeItemIds: [featured.id],
      }).map((i) => i.id),
    ).toEqual(['m2']);
  });
});
