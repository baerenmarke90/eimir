// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeControl } from '../components/ThemeControl';
import {
  reportSystemPrefersDark,
  resetReportedSystemThemeForTests,
  storeThemePreference,
} from '../theme';
import { isAndroidApp } from './config';
import {
  startNativeSystemTheme,
  stopNativeSystemThemeForTests,
} from './nativeSystemTheme';

const native = vi.hoisted(() => ({
  changeListener: null as ((appearance: { dark: boolean }) => void) | null,
  current: vi.fn(async () => ({ dark: false })),
  remove: vi.fn(async () => undefined),
  setStyle: vi.fn(async () => undefined),
  pluginAvailable: true,
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isPluginAvailable: () => native.pluginAvailable },
  registerPlugin: () => ({
    current: native.current,
    addListener: async (
      _event: 'change',
      callback: (appearance: { dark: boolean }) => void,
    ) => {
      native.changeListener = callback;
      return { remove: native.remove };
    },
  }),
  SystemBars: { setStyle: native.setStyle },
  SystemBarsStyle: { Dark: 'DARK', Light: 'LIGHT', Default: 'DEFAULT' },
}));

vi.mock('./config', () => ({ isAndroidApp: vi.fn(() => true) }));

function mockStaleWebViewMedia(prefersDark: boolean) {
  // The Android WebView keeps its launch-time value and never fires change.
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('dark') ? prefersDark : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  native.changeListener = null;
  native.pluginAvailable = true;
  native.current.mockResolvedValue({ dark: false });
  vi.mocked(isAndroidApp).mockReturnValue(true);
  window.localStorage.clear();
  mockStaleWebViewMedia(false);
  delete document.documentElement.dataset.theme;
});

afterEach(() => {
  cleanup();
  stopNativeSystemThemeForTests();
  resetReportedSystemThemeForTests();
});

describe('native system theme', () => {
  it('follows a device appearance change the WebView media query misses', async () => {
    render(<ThemeControl />);
    startNativeSystemTheme();
    await flush();
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(native.setStyle).toHaveBeenLastCalledWith({ style: 'LIGHT' });

    act(() => native.changeListener?.({ dark: true }));
    await flush();

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(native.setStyle).toHaveBeenLastCalledWith({ style: 'DARK' });

    act(() => native.changeListener?.({ dark: false }));
    await flush();
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('corrects a stale launch value from the reported current appearance', async () => {
    native.current.mockResolvedValue({ dark: true });
    render(<ThemeControl />);
    startNativeSystemTheme();
    await flush();

    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('keeps an explicit in-app choice and aligns the system bars with it', async () => {
    render(<ThemeControl />);
    startNativeSystemTheme();
    await flush();

    act(() => storeThemePreference('dark'));
    await flush();
    act(() => native.changeListener?.({ dark: false }));
    await flush();

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(native.setStyle).toHaveBeenLastCalledWith({ style: 'DARK' });
  });

  it('updates the Profile selector preview for the System choice', async () => {
    render(<ThemeControl variant="inline" />);
    act(() => reportSystemPrefersDark(true));
    await flush();

    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('leaves browsers to their own media query', async () => {
    vi.mocked(isAndroidApp).mockReturnValue(false);
    startNativeSystemTheme();
    await flush();

    expect(native.changeListener).toBeNull();
    expect(native.current).not.toHaveBeenCalled();
    expect(native.setStyle).not.toHaveBeenCalled();
  });

  it('tolerates an older shell without the SystemTheme plugin', async () => {
    native.pluginAvailable = false;
    render(<ThemeControl />);
    startNativeSystemTheme();
    await flush();

    expect(native.current).not.toHaveBeenCalled();
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(native.setStyle).toHaveBeenLastCalledWith({ style: 'LIGHT' });
  });
});
