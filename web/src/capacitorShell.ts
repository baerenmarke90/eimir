import { useEffect } from 'react';
import { App } from '@capacitor/app';
import { focusManager } from '@tanstack/react-query';
import { isCapacitorNative } from './pwa';
import { checkAppUpdatesIfDue } from './client/appUpdates';

export function handleNativeBackButton(canGoBack: boolean): void {
  if (canGoBack) {
    window.history.back();
  } else {
    // Root Back follows Android task behavior and retains the live WebView.
    void App.minimizeApp();
  }
}

export function useCapacitorShell(): void {
  useEffect(() => {
    if (!isCapacitorNative()) return;
    let disposed = false;
    checkAppUpdatesIfDue();

    const backSub = App.addListener('backButton', ({ canGoBack }) => {
      if (disposed) return;
      handleNativeBackButton(canGoBack);
    });

    const stateSub = App.addListener('appStateChange', ({ isActive }) => {
      if (disposed) return;
      if (isActive) {
        checkAppUpdatesIfDue();
        // Session refresh still consumes focus; Query v5 uses its focus manager.
        window.dispatchEvent(new Event('focus'));
      }
      focusManager.setFocused(isActive);
    });

    return () => {
      disposed = true;
      focusManager.setFocused(undefined);
      void backSub.then((sub) => sub.remove());
      void stateSub.then((sub) => sub.remove());
    };
  }, []);
}
