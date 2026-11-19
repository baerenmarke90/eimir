/**
 * Replace / Exit departures with `collapse-gap` (Motion Contract 4.2; moved
 * from `components/useDepartingItems.ts` in #2073, now reading roles through
 * the token adapter).
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MAX_ANIMATED_ELEMENTS } from './budget';
import { run } from './run';
import { durationMs, easing } from './tokens';

/** A bulk change (filter swap, wipe) is replaced, not animated item by item. */
const MAX_ANIMATED_DEPARTURES = MAX_ANIMATED_ELEMENTS;

export interface DepartingEntry<T> {
  item: T;
  key: string;
  departing: boolean;
}

/**
 * Lets items that a refreshed list no longer contains leave with motion
 * instead of vanishing: each departed item stays rendered, inert, for the
 * context duration (marked `departing`) and the remaining items then slide
 * into the gap. A changed `resetKey` (other filter, Space or account), a
 * bulk change or reduced motion (zero duration) replaces the list at once.
 * Elements carry `data-motion-key` inside the returned container.
 * `onRemoved` runs once per removal, after any departure motion ended, so a
 * departing item never changes its content while it leaves.
 */
export function useDepartingItems<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  resetKey: string,
  onRemoved?: (items: readonly T[]) => void,
) {
  const onRemovedRef = useRef(onRemoved);
  onRemovedRef.current = onRemoved;
  const containerRef = useRef<HTMLDivElement>(null);
  const previous = useRef<{ resetKey: string; items: readonly T[] }>({
    resetKey,
    items,
  });
  const [departing, setDeparting] = useState<
    ReadonlyMap<string, { item: T; index: number }>
  >(new Map());
  const flipFrom = useRef<Map<string, DOMRect> | null>(null);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = { resetKey, items };
    if (before.resetKey !== resetKey) {
      setDeparting(new Map());
      return;
    }
    const present = new Set(items.map(keyOf));
    const removed = before.items
      .map((item, index) => ({ item, index, key: keyOf(item) }))
      .filter(({ key }) => !present.has(key));
    if (removed.length === 0) return;
    const removedItems = removed.map(({ item }) => item);
    const duration = durationMs('context');
    if (
      removed.length > MAX_ANIMATED_DEPARTURES ||
      removed.length === before.items.length ||
      duration <= 0
    ) {
      onRemovedRef.current?.(removedItems);
      return;
    }
    setDeparting((current) => {
      const next = new Map(current);
      for (const { item, index, key } of removed)
        next.set(key, { item, index });
      return next;
    });
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      const rects = new Map<string, DOMRect>();
      for (const node of containerRef.current?.querySelectorAll<HTMLElement>(
        '[data-motion-key]',
      ) ?? [])
        rects.set(node.dataset.motionKey ?? '', node.getBoundingClientRect());
      flipFrom.current = rects;
      setDeparting((current) => {
        const next = new Map(current);
        for (const { key } of removed) next.delete(key);
        return next;
      });
      onRemovedRef.current?.(removedItems);
    }, duration);
    timers.current.add(timer);
  }, [items, resetKey, keyOf]);

  // Remaining items slide from their old place into the gap. It runs after
  // every commit and acts only on the commit that removed departed items.
  useLayoutEffect(() => {
    const from = flipFrom.current;
    if (!from) return;
    flipFrom.current = null;
    const duration = durationMs('context');
    if (duration <= 0) return;
    const settle = easing('standard');
    if (!settle) return;
    for (const node of containerRef.current?.querySelectorAll<HTMLElement>(
      '[data-motion-key]',
    ) ?? []) {
      const old = from.get(node.dataset.motionKey ?? '');
      if (!old) continue;
      const now = node.getBoundingClientRect();
      const dx = old.left - now.left;
      const dy = old.top - now.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      run(
        node,
        [
          { transform: `translate(${dx}px, ${dy}px)` },
          { transform: 'translate(0, 0)' },
        ],
        { duration, easing: settle, channel: 'position' },
      );
    }
  });

  useEffect(
    () => () => {
      for (const timer of timers.current) clearTimeout(timer);
      timers.current.clear();
    },
    [],
  );

  const entries: DepartingEntry<T>[] = items.map((item) => ({
    item,
    key: keyOf(item),
    departing: false,
  }));
  const present = new Set(entries.map(({ key }) => key));
  const leaving = [...departing]
    .filter(([key]) => !present.has(key))
    .sort(([, a], [, b]) => a.index - b.index);
  for (const [key, { item, index }] of leaving)
    entries.splice(Math.min(index, entries.length), 0, {
      item,
      key,
      departing: true,
    });
  return { entries, containerRef };
}
