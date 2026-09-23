import { describe, expect, it } from 'vitest';

type NodeFs = {
  readFileSync(path: URL, encoding: 'utf8'): string;
};

type NodeProcess = {
  getBuiltinModule(name: 'fs'): NodeFs;
};

type ThemeDocument = {
  documentElement: {
    dataset: Record<string, string>;
    style: Record<string, string>;
  };
  querySelector(selector: string): { content: string } | null;
};

type ThemeWindow = {
  localStorage: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
  };
  matchMedia(query: string): { matches: boolean };
};

function readBootstrap(): string {
  const processRef = (
    globalThis as typeof globalThis & { process?: NodeProcess }
  ).process;
  if (!processRef)
    throw new Error('Node process API is unavailable in the test run.');
  return processRef
    .getBuiltinModule('fs')
    .readFileSync(
      new URL('../public/theme-bootstrap.js', import.meta.url),
      'utf8',
    );
}

function runBootstrap(
  storedPreference: string | null,
  systemPrefersDark: boolean,
  storageThrows = false,
  legacyStoredPreference: string | null = null,
) {
  const dataset: Record<string, string> = {};
  const style: Record<string, string> = {};
  const themeColor = { content: '#e6ebfa' };
  const storage = new Map<string, string>();
  if (storedPreference !== null) storage.set('eimir.theme', storedPreference);
  if (legacyStoredPreference !== null)
    storage.set('sidebyside.theme', legacyStoredPreference);
  const windowMock: ThemeWindow = {
    localStorage: {
      getItem: (key) => {
        if (storageThrows) throw new Error('storage blocked');
        return storage.get(key) ?? null;
      },
      setItem: (key, value) => {
        if (storageThrows) throw new Error('storage blocked');
        storage.set(key, value);
      },
      removeItem: (key) => {
        if (storageThrows) throw new Error('storage blocked');
        storage.delete(key);
      },
    },
    matchMedia: (query) => {
      expect(query).toBe('(prefers-color-scheme: dark)');
      return { matches: systemPrefersDark };
    },
  };
  const documentMock: ThemeDocument = {
    documentElement: { dataset, style },
    querySelector: (selector) => {
      expect(selector).toBe('meta[name="theme-color"]');
      return themeColor;
    },
  };

  const execute = new Function('window', 'document', readBootstrap());
  execute(windowMock, documentMock);

  return { dataset, style, themeColor, storage };
}

describe('theme bootstrap', () => {
  it('keeps an explicit dark preference before app startup even on a light system', () => {
    const result = runBootstrap('dark', false);
    expect(result.dataset).toEqual({ theme: 'dark', themePreference: 'dark' });
    expect(result.style.colorScheme).toBe('dark');
    expect(result.themeColor.content).toBe('#171b2f');
  });

  it('keeps an explicit light preference before app startup even on a dark system', () => {
    const result = runBootstrap('light', true);
    expect(result.dataset).toEqual({
      theme: 'light',
      themePreference: 'light',
    });
    expect(result.style.colorScheme).toBe('light');
    expect(result.themeColor.content).toBe('#e6ebfa');
  });

  it('follows the operating-system preference in system mode', () => {
    const result = runBootstrap('system', true);
    expect(result.dataset).toEqual({
      theme: 'dark',
      themePreference: 'system',
    });
    expect(result.themeColor.content).toBe('#171b2f');
  });

  it('falls back to system for missing or invalid stored values', () => {
    expect(runBootstrap(null, false).dataset).toEqual({
      theme: 'light',
      themePreference: 'system',
    });
    expect(runBootstrap('sepia', true).dataset).toEqual({
      theme: 'dark',
      themePreference: 'system',
    });
  });

  it('falls back to system when localStorage is unavailable', () => {
    const result = runBootstrap(null, true, true);
    expect(result.dataset).toEqual({
      theme: 'dark',
      themePreference: 'system',
    });
    expect(result.style.colorScheme).toBe('dark');
  });

  it('migrates the deprecated preference before app startup', () => {
    const result = runBootstrap(null, false, false, 'dark');
    expect(result.dataset.theme).toBe('dark');
    expect(result.storage.get('eimir.theme')).toBe('dark');
    expect(result.storage.has('sidebyside.theme')).toBe(false);
  });
});
