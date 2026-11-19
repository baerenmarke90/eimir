import { registerPlugin } from '@capacitor/core';
import { isAndroidApp } from './config';

/*
 * Landscape for a full-screen view (#2048, the full-screen garden).
 *
 * In the Android app the in-house `ScreenOrientation` plugin turns the
 * Activity to landscape and back. In a browser the standard Fullscreen and
 * Screen Orientation APIs are used where the browser allows them (Android
 * Chrome); elsewhere nothing is locked and the view asks the person to turn
 * the phone. Every failure is quiet: the view stays usable in portrait.
 */

interface ScreenOrientationPlugin {
  lockLandscape(): Promise<void>;
  release(): Promise<void>;
}

const nativeOrientation =
  registerPlugin<ScreenOrientationPlugin>('ScreenOrientation');

type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: 'landscape') => Promise<void>;
  unlock?: () => void;
};

export type LandscapeResult = 'locked' | 'unsupported';

/** Asks for landscape; `element` becomes the browser's full-screen element. */
export async function enterLandscape(
  element: HTMLElement | null,
  native: boolean = isAndroidApp(),
): Promise<LandscapeResult> {
  if (native) {
    try {
      await nativeOrientation.lockLandscape();
      return 'locked';
    } catch {
      return 'unsupported';
    }
  }
  const orientation =
    typeof screen !== 'undefined'
      ? (screen.orientation as LockableOrientation | undefined)
      : undefined;
  if (!element || typeof orientation?.lock !== 'function') return 'unsupported';
  try {
    // Browsers only lock the orientation of a full-screen document.
    if (!document.fullscreenElement && element.requestFullscreen) {
      await element.requestFullscreen({ navigationUI: 'hide' });
    }
    await orientation.lock('landscape');
    return 'locked';
  } catch {
    if (document.fullscreenElement === element) {
      await document.exitFullscreen().catch(() => undefined);
    }
    return 'unsupported';
  }
}

/** Gives the orientation (and the browser's full screen) back. */
export async function leaveLandscape(
  native: boolean = isAndroidApp(),
): Promise<void> {
  if (native) {
    await nativeOrientation.release().catch(() => undefined);
    return;
  }
  const orientation =
    typeof screen !== 'undefined'
      ? (screen.orientation as LockableOrientation | undefined)
      : undefined;
  try {
    orientation?.unlock?.();
  } catch {
    // Nothing was locked.
  }
  if (typeof document !== 'undefined' && document.fullscreenElement) {
    await document.exitFullscreen().catch(() => undefined);
  }
}
