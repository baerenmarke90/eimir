import { Capacitor } from '@capacitor/core';

export function isCapacitorNative(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function canRegisterProductionServiceWorker(
  isProduction: boolean,
  serviceWorkerSupported: boolean,
  isNative: boolean = isCapacitorNative(),
): boolean {
  return isProduction && serviceWorkerSupported && !isNative;
}

export function registerProductionServiceWorker(): void {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return;
  }

  if (
    !canRegisterProductionServiceWorker(
      import.meta.env.PROD,
      'serviceWorker' in navigator,
    )
  ) {
    return;
  }

  window.addEventListener(
    'load',
    () => {
      void navigator.serviceWorker
        .register('/service-worker.js', { scope: '/' })
        .catch(() => undefined);
    },
    { once: true },
  );
}
