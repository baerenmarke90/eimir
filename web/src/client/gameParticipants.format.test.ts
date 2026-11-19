import { describe, expect, it } from 'vitest';
import { formatBytes } from './formatBytes';
import { orderParticipants } from './gameParticipants';

describe('participant order and localized storage sizes', () => {
  it('preserves IDs when display names tie, and keeps source order without an owner', () => {
    const a = { id: 'a', displayName: 'Sam' };
    const b = { id: 'b', displayName: 'Sam' };
    expect(orderParticipants([], 'a')).toBeNull();
    expect(orderParticipants([a], 'a')).toBeNull();
    expect(orderParticipants([a, b], 'b')).toEqual([b, a]);
    expect(orderParticipants([a, b], 'absent')).toEqual([a, b]);
  });

  it('formats the exact unit boundaries in the requested locale', () => {
    expect(formatBytes(0, 'en')).toBe('0 B');
    expect(formatBytes(1023, 'en')).toBe('1,023 B');
    expect(formatBytes(1024, 'en')).toBe('1 KB');
    expect(formatBytes(1024 ** 2, 'en')).toBe('1 MB');
    expect(formatBytes(1536, 'de')).toBe('1,5 KB');
    expect(formatBytes(1536, 'en')).toBe('1.5 KB');
  });
});
