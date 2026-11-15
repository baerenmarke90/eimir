// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  rememberWirScroll,
  resetWirScrollMemoryForTests,
  takeColdStartWirScroll,
  WIR_SCROLL_MEMORY_TTL_MS,
} from './wirScrollMemory';

describe('wirScrollMemory', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetWirScrollMemoryForTests();
  });

  it('returns a fresh remembered offset exactly once per process', () => {
    rememberWirScroll('a1', 's1', 420.4, 1_000);
    expect(takeColdStartWirScroll('a1', 's1', 2_000)).toBe(420);
    expect(takeColdStartWirScroll('a1', 's1', 2_000)).toBeNull();
  });

  it('ignores expired, future, malformed and foreign-scope records', () => {
    rememberWirScroll('a1', 's1', 300, 1_000);
    expect(
      takeColdStartWirScroll('a1', 's1', 1_000 + WIR_SCROLL_MEMORY_TTL_MS + 1),
    ).toBeNull();

    resetWirScrollMemoryForTests();
    rememberWirScroll('a1', 's1', 300, 9_000);
    expect(takeColdStartWirScroll('a1', 's1', 1_000)).toBeNull();

    resetWirScrollMemoryForTests();
    window.localStorage.setItem('eimir.wir.scroll.v1:a1:s1', '{nope');
    expect(takeColdStartWirScroll('a1', 's1', 2_000)).toBeNull();

    resetWirScrollMemoryForTests();
    rememberWirScroll('a1', 's1', 300, 1_000);
    expect(takeColdStartWirScroll('a2', 's1', 2_000)).toBeNull();
  });

  it('forgets the position when the person is back at the top', () => {
    rememberWirScroll('a1', 's1', 300, 1_000);
    rememberWirScroll('a1', 's1', 0, 1_500);
    expect(takeColdStartWirScroll('a1', 's1', 2_000)).toBeNull();
  });
});
