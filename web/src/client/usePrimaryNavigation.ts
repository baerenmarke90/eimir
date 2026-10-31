import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isCapacitorNative } from '../pwa';
import { PRIMARY_APP_ROUTES } from './routes';
import { useTaskOrigin } from './taskOrigin';

/** One destination/history/context contract for primary links and gestures. */
export function usePrimaryNavigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const { captureOrigin, primaryDestination } = useTaskOrigin();
  const isRoot = PRIMARY_APP_ROUTES.some(
    (route) => route.path === location.pathname,
  );

  const destinationFor = useCallback(
    (root: string) => {
      const destination = primaryDestination(root);
      return {
        to: destination.to,
        state: destination.returnKey
          ? { taskReturnKey: destination.returnKey }
          : undefined,
        replace: isCapacitorNative() && isRoot,
      };
    },
    [primaryDestination, isRoot],
  );
  const captureCurrent = useCallback(() => {
    if (isRoot) captureOrigin();
  }, [captureOrigin, isRoot]);
  const navigatePrimary = useCallback(
    (root: string) => {
      if (root === location.pathname) return;
      const { to, ...options } = destinationFor(root);
      captureCurrent();
      // Main-content motion is owned by the shell; navigation remains
      // immediately interactive even during rapid consecutive tab switches.
      void navigate(to, options);
    },
    [captureCurrent, destinationFor, location.pathname, navigate],
  );

  return { destinationFor, captureCurrent, navigatePrimary };
}
