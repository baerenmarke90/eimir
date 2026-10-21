import { useEffect, useState } from 'react';
import type { AppIconId } from '../api/generated/models/AppIconId';
import {
  applyNativeAppIcon,
  canApplyNativeAppIcon,
  isAndroidApp,
} from './nativeAppIcon';

export function useNativeAppIcon(iconId: AppIconId | undefined) {
  const native = isAndroidApp();
  const available = canApplyNativeAppIcon();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    iconId: AppIconId;
    attempt: number;
    status: 'applied' | 'error';
  } | null>(null);

  useEffect(() => {
    // Only an authorized preference may reach the native adapter. Loading,
    // logout and provider teardown must not reset the installed cosmetic.
    if (!available || !iconId) return;
    let active = true;
    setResult(null);
    void applyNativeAppIcon(iconId).then(
      () => {
        if (active) setResult({ iconId, attempt, status: 'applied' });
      },
      () => {
        if (active) setResult({ iconId, attempt, status: 'error' });
      },
    );
    return () => {
      active = false;
    };
  }, [available, iconId, attempt]);

  return {
    status: !native
      ? ('browser' as const)
      : !available
        ? ('update-required' as const)
        : result && result.iconId === iconId && result.attempt === attempt
          ? result.status
          : ('pending' as const),
    retry: () => setAttempt((value) => value + 1),
  };
}
