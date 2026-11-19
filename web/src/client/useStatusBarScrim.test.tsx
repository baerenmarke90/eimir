// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PAGE_SCROLLED_ATTRIBUTE,
  useStatusBarScrim,
} from './useStatusBarScrim';

function scrollTo(y: number) {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
  window.dispatchEvent(new Event('scroll'));
}

describe('useStatusBarScrim', () => {
  afterEach(() => {
    scrollTo(0);
    vi.restoreAllMocks();
  });

  it('marks the root only while the page is scrolled', () => {
    // Runs the frame at once; returning 0 marks no frame as pending.
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 0;
    });
    const root = document.documentElement;
    const { unmount } = renderHook(() => useStatusBarScrim());
    expect(root.hasAttribute(PAGE_SCROLLED_ATTRIBUTE)).toBe(false);
    act(() => scrollTo(120));
    expect(root.hasAttribute(PAGE_SCROLLED_ATTRIBUTE)).toBe(true);
    act(() => scrollTo(0));
    expect(root.hasAttribute(PAGE_SCROLLED_ATTRIBUTE)).toBe(false);
    act(() => scrollTo(40));
    unmount();
    expect(root.hasAttribute(PAGE_SCROLLED_ATTRIBUTE)).toBe(false);
  });
});
