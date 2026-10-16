// @vitest-environment jsdom

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeControl } from './ThemeControl';

type MediaChangeListener = (event: MediaQueryListEvent) => void;

function controllableDarkMode(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<MediaChangeListener>();
  const media = {
    get matches() {
      return matches;
    },
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: (_type: string, listener: MediaChangeListener) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: MediaChangeListener) => {
      listeners.delete(listener);
    },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => true,
    setMatches(nextMatches: boolean) {
      matches = nextMatches;
      for (const listener of listeners) {
        listener({ matches } as MediaQueryListEvent);
      }
    },
  } as unknown as MediaQueryList & {
    setMatches(nextMatches: boolean): void;
  };

  return media;
}

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-theme-preference');
  document.documentElement.removeAttribute('style');
  document.head.innerHTML = '<meta name="theme-color" content="fallback">';
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: () => null,
      setItem: () => {},
    },
  });
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
    const theme = (element as HTMLElement).dataset.theme;
    return {
      getPropertyValue: () =>
        theme === 'dark' ? '#dark-semantic-token' : '#light-semantic-token',
    } as unknown as CSSStyleDeclaration;
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ThemeControl runtime synchronization', () => {
  it('updates browser theme-color when the system theme changes after startup', () => {
    const media = controllableDarkMode(false);
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => media),
    );

    render(<ThemeControl />);

    const themeColor = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(themeColor?.content).toBe('#light-semantic-token');

    act(() => media.setMatches(true));

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(themeColor?.content).toBe('#dark-semantic-token');
  });
});
