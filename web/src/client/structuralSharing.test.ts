import { describe, expect, it } from 'vitest';
import { dateAwareStructuralSharing } from './structuralSharing';

describe('dateAwareStructuralSharing', () => {
  it('keeps the previous reference when decoded dates are equal', () => {
    const previous = {
      viewerLocalDate: new Date('2026-11-13T00:00:00Z'),
      upcoming: [{ id: 'a', at: new Date('2026-11-20T10:00:00Z') }],
    };
    const next = {
      viewerLocalDate: new Date('2026-11-13T00:00:00Z'),
      upcoming: [{ id: 'a', at: new Date('2026-11-20T10:00:00Z') }],
    };
    expect(dateAwareStructuralSharing(previous, next)).toBe(previous);
  });

  it('replaces only the changed branch and keeps sibling references', () => {
    const previous = {
      stable: { at: new Date('2026-11-13T00:00:00Z') },
      list: [{ id: 'a' }, { id: 'b' }],
    };
    const next = {
      stable: { at: new Date('2026-11-13T00:00:00Z') },
      list: [{ id: 'a' }, { id: 'c' }],
    };
    const result = dateAwareStructuralSharing(previous, next);
    expect(result).not.toBe(previous);
    expect(result.stable).toBe(previous.stable);
    expect(result.list[0]).toBe(previous.list[0]);
    expect(result.list[1]).toEqual({ id: 'c' });
  });

  it('adopts a changed date, a removed key and a longer list', () => {
    expect(
      dateAwareStructuralSharing(
        { at: new Date('2026-11-13T00:00:00Z') },
        { at: new Date('2026-11-14T00:00:00Z') },
      ).at.toISOString(),
    ).toBe('2026-11-14T00:00:00.000Z');
    expect(dateAwareStructuralSharing({ a: 1, b: 2 }, { a: 1 })).toEqual({
      a: 1,
    });
    expect(dateAwareStructuralSharing([1], [1, 2])).toEqual([1, 2]);
  });

  it('never reuses a previous value of a different shape', () => {
    expect(dateAwareStructuralSharing(undefined, { a: 1 })).toEqual({ a: 1 });
    expect(dateAwareStructuralSharing([1], { a: 1 })).toEqual({ a: 1 });
    expect(dateAwareStructuralSharing(null, null)).toBeNull();
  });
});
