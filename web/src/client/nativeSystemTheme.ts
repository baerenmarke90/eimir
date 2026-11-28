import {
  Capacitor,
  type PluginListenerHandle,
  registerPlugin,
  SystemBars,
  SystemBarsStyle,
} from '@capacitor/core';
import { reportSystemPrefersDark } from '../theme';
import { isAndroidApp } from './config';

interface SystemAppearance {
  dark: boolean;
}

interface SystemThemePlugin {
  current(): Promise<SystemAppearance>;
  addListener(
    event: 'change',
    callback: (appearance: SystemAppearance) => void,
  ): Promise<PluginListenerHandle>;
}

const systemTheme = registerPlugin<SystemThemePlugin>('SystemTheme');

let stop: (() => void) | null = null;
let appliedBarStyle: SystemBarsStyle | null = null;

function syncSystemBars(root: HTMLElement): void {
  // Status and gesture bar content follows the effective document theme,
  // which may be an explicit in-app choice that differs from the device.
  const style =
    root.dataset.theme === 'dark'
      ? SystemBarsStyle.Dark
      : SystemBarsStyle.Light;
  if (style === appliedBarStyle) return;
  appliedBarStyle = style;
  void SystemBars.setStyle({ style }).catch(() => {
    appliedBarStyle = null;
  });
}

/**
 * Keeps the Android app's System theme live. The shell keeps its activity on a
 * uiMode change, so the WebView's prefers-color-scheme stays at its launch
 * value; the native SystemTheme plugin reports the device appearance instead.
 */
export function startNativeSystemTheme(
  root: HTMLElement = document.documentElement,
): void {
  if (stop || !isAndroidApp()) return;
  let disposed = false;
  let listener: Promise<PluginListenerHandle> | null = null;

  const refresh = () => {
    void systemTheme
      .current()
      .then(({ dark }) => {
        if (!disposed) reportSystemPrefersDark(dark);
      })
      .catch(() => undefined);
  };
  const refreshWhenVisible = () => {
    if (document.visibilityState === 'visible') refresh();
  };

  if (Capacitor.isPluginAvailable('SystemTheme')) {
    listener = systemTheme.addListener('change', ({ dark }) => {
      if (!disposed) reportSystemPrefersDark(dark);
    });
    refresh();
    // A device change while the app was in the background must show on the
    // first return, not only after the next one.
    document.addEventListener('visibilitychange', refreshWhenVisible);
  }

  syncSystemBars(root);
  const observer = new MutationObserver(() => syncSystemBars(root));
  observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });

  stop = () => {
    disposed = true;
    document.removeEventListener('visibilitychange', refreshWhenVisible);
    observer.disconnect();
    appliedBarStyle = null;
    void listener?.then((handle) => handle.remove()).catch(() => undefined);
    stop = null;
  };
}

export function stopNativeSystemThemeForTests(): void {
  stop?.();
}
