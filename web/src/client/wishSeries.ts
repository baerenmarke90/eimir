import type { WishDetail } from '../api/generated/models/WishDetail';

/** One row of the fulfilled list: a Wish and every time it was experienced. */
export interface WishSeriesRow {
  seriesId: string;
  /** The most recent completed Wish; the row opens it. */
  latest: WishDetail;
  /** Every completed Wish of the series, earliest first. */
  times: WishDetail[];
}

/**
 * Group completed Wishes by series for the fulfilled list (#1816).
 *
 * A row sits where its latest Wish sits in the incoming (already sorted) list,
 * so single Wishes keep their order and a series does not jump around when a
 * further time is added.
 */
export function groupCompletedSeries(wishes: WishDetail[]): WishSeriesRow[] {
  // A Wish without series data (an older cached response) is its own series.
  const keyOf = (wish: WishDetail) => wish.seriesId ?? wish.id;
  const bySeries = new Map<string, WishDetail[]>();
  for (const wish of wishes) {
    const members = bySeries.get(keyOf(wish)) ?? [];
    members.push(wish);
    bySeries.set(keyOf(wish), members);
  }
  const rows = new Map<string, WishSeriesRow>();
  for (const [seriesId, members] of bySeries) {
    const times = [...members].sort(
      (left, right) => (left.seriesPosition ?? 1) - (right.seriesPosition ?? 1),
    );
    rows.set(seriesId, {
      seriesId,
      latest: times[times.length - 1],
      times,
    });
  }
  return wishes
    .map((wish) => rows.get(keyOf(wish)))
    .filter(
      (row, index, all): row is WishSeriesRow =>
        row !== undefined &&
        all.findIndex((candidate) => candidate?.seriesId === row.seriesId) ===
          index,
    )
    .sort((left, right) => {
      const leftIndex = wishes.indexOf(left.latest);
      const rightIndex = wishes.indexOf(right.latest);
      return leftIndex - rightIndex;
    });
}
