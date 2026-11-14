/**
 * Query structural sharing that also treats equal `Date` values as unchanged.
 *
 * TanStack's default only keeps references for plain objects and arrays, so a
 * refetch of identical data holding decoded dates produced a brand-new tree and
 * re-rendered every consumer. Only genuinely changed branches get new
 * references here; equal branches keep the previous one.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function share(previous: unknown, next: unknown, depth: number): unknown {
  if (previous === next) return previous;
  if (depth > 64) return next;
  if (previous instanceof Date && next instanceof Date) {
    return previous.getTime() === next.getTime() ? previous : next;
  }
  if (Array.isArray(previous) && Array.isArray(next)) {
    const merged = next.map((item, index) =>
      index < previous.length ? share(previous[index], item, depth + 1) : item,
    );
    return merged.length === previous.length &&
      merged.every((item, index) => item === previous[index])
      ? previous
      : merged;
  }
  if (isPlainObject(previous) && isPlainObject(next)) {
    const nextKeys = Object.keys(next);
    const merged: Record<string, unknown> = {};
    let identical = nextKeys.length === Object.keys(previous).length;
    for (const key of nextKeys) {
      merged[key] = share(previous[key], next[key], depth + 1);
      if (!(key in previous) || merged[key] !== previous[key])
        identical = false;
    }
    return identical ? previous : merged;
  }
  return next;
}

export function dateAwareStructuralSharing<T>(previous: unknown, next: T): T {
  return share(previous, next, 0) as T;
}
