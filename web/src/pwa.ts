export function canRegisterProductionServiceWorker(
  isProduction: boolean,
  serviceWorkerSupported: boolean,
): boolean {
  return isProduction && serviceWorkerSupported;
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
