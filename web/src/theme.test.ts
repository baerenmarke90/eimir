import { afterEach, describe, expect, it } from 'vitest';
import {
  applyResolvedTheme,
  parseThemePreference,
  resolveTheme,
} from './theme';

const originalDocumentDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  'document',
);
const originalWindowDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  'window',
);

afterEach(() => {
  if (originalDocumentDescriptor) {
    Object.defineProperty(globalThis, 'document', originalDocumentDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, 'document');
  }
  if (originalWindowDescriptor) {
    Object.defineProperty(globalThis, 'window', originalWindowDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, 'window');
  }
});

function installThemeDocument(backgroundByTheme: Record<string, string>) {
  const root = {
    dataset: {} as Record<string, string>,
    style: {} as Record<string, string>,
  };
  const themeColor = { content: 'fallback' };
  const favicon = { tagName: 'LINK', href: '/favicon.svg' };

  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      documentElement: root,
      getElementById: (id: string) => (id === 'app-favicon' ? favicon : null),
      querySelector: (selector: string) => {
        expect(selector).toBe('meta[name="theme-color"]');
        return themeColor;
      },
    },
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      getComputedStyle: (element: unknown) => {
        expect(element).toBe(root);
        return {
          getPropertyValue: (property: string) => {
            expect(property).toBe('--color-background');
            return backgroundByTheme[root.dataset.theme];
          },
        };
      },
    },
  });

  return { root, themeColor, favicon };
}

describe('theme preference', () => {
  it('falls back to system for missing or unknown stored values', () => {
    expect(parseThemePreference(null)).toBe('system');
    expect(parseThemePreference('')).toBe('system');
    expect(parseThemePreference('sepia')).toBe('system');
  });

  it('keeps supported explicit preferences', () => {
    expect(parseThemePreference('system')).toBe('system');
    expect(parseThemePreference('light')).toBe('light');
    expect(parseThemePreference('dark')).toBe('dark');
  });

  it('resolves system against the operating-system preference', () => {
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('system', true)).toBe('dark');
  });

  it('keeps an explicit light or dark override independent of the system', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('derives browser theme-color from the resolved semantic CSS background', () => {
    const { root, themeColor, favicon } = installThemeDocument({
      light: '  #light-token  ',
      dark: '  #dark-token  ',
    });

    applyResolvedTheme('light', 'system');
    expect(root.dataset).toEqual({
      theme: 'light',
      themePreference: 'system',
    });
    expect(root.style.colorScheme).toBe('light');
    expect(themeColor.content).toBe('#light-token');
    expect(favicon.href).toBe('/favicon.svg');

    applyResolvedTheme('dark', 'system');
    expect(root.dataset.theme).toBe('dark');
    expect(root.style.colorScheme).toBe('dark');
    expect(themeColor.content).toBe('#dark-token');
    expect(favicon.href).toBe('/favicon-dark.svg');
  });

  it('keeps the bootstrap fallback when the semantic CSS token is unavailable', () => {
    const { themeColor } = installThemeDocument({ light: '' });

    applyResolvedTheme('light');

    expect(themeColor.content).toBe('fallback');
  });
});
