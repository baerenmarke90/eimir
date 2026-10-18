import { useEffect } from 'react';
import { App } from '@capacitor/app';
import { isCapacitorNative } from './pwa';
import { checkAppUpdatesIfDue } from './client/appUpdates';

export function handleNativeBackButton(canGoBack: boolean): void {
  if (canGoBack) {
    window.history.back();
  } else {
    void App.exitApp();
  }
}

export function useCapacitorShell(): void {
  useEffect(() => {
    if (!isCapacitorNative()) return;
    checkAppUpdatesIfDue();

    const backSub = App.addListener('backButton', ({ canGoBack }) => {
      handleNativeBackButton(canGoBack);
    });

    const stateSub = App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        checkAppUpdatesIfDue();
        window.dispatchEvent(new Event('focus'));
      }
    });

    return () => {
      void backSub.then((sub) => sub.remove());
      void stateSub.then((sub) => sub.remove());
    };
  }, []);
}
