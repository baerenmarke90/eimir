import { useCallback, useRef } from 'react';
import { isCapacitorNativePlatform } from './config';
import { postSnackbar } from './snackbar';
import { nativeWishShare } from './sharedWishImport';
import { wishShareOrigin, wishShareUrl } from './wishShareLink';

/** How this runtime can hand a Wish link to another app. */
export type WishShareMode = 'native' | 'webShare' | 'copy';

export type WishShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

export function wishShareMode(): WishShareMode {
  if (isCapacitorNativePlatform()) return 'native';
  return typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function'
    ? 'webShare'
    : 'copy';
}

/** Closing the system chooser is a choice, not an error. */
function isCancellation(failure: unknown): boolean {
  const { name, code, message } = (failure ?? {}) as {
    name?: unknown;
    code?: unknown;
    message?: unknown;
  };
  return (
    name === 'AbortError' ||
    (typeof code === 'string' && /cancel/i.test(code)) ||
    (typeof message === 'string' && /cancel/i.test(message))
  );
}

/**
 * Shares only the neutral Wish address: no title or text, so the chat preview
 * reveals nothing and the server decides who may open it.
 */
export async function shareWish(
  apiBaseUrl: string,
  wishId: string,
  mode: WishShareMode = wishShareMode(),
): Promise<WishShareOutcome> {
  const url = wishShareUrl(wishShareOrigin(apiBaseUrl), wishId);
  try {
    if (mode === 'native') {
      await nativeWishShare.share({ url });
      return 'shared';
    }
    if (mode === 'webShare') {
      await navigator.share({ url });
      return 'shared';
    }
    if (!navigator.clipboard?.writeText) return 'failed';
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch (failure) {
    return isCancellation(failure) ? 'cancelled' : 'failed';
  }
}

/**
 * Menu entry state for "Share wish": the label key follows the runtime (the
 * copy action exists only in a browser without the system share sheet) and
 * feedback goes through the shared snackbar.
 */
export function useWishShare(apiBaseUrl: string) {
  const pending = useRef(false);
  const mode = wishShareMode();
  const share = useCallback(
    async (wishId: string): Promise<WishShareOutcome> => {
      if (pending.current) return 'cancelled';
      pending.current = true;
      try {
        const outcome = await shareWish(apiBaseUrl, wishId);
        if (outcome === 'copied') postSnackbar('wishShare.copied');
        if (outcome === 'failed')
          postSnackbar(
            wishShareMode() === 'copy'
              ? 'wishShare.copyFailed'
              : 'wishShare.shareFailed',
          );
        return outcome;
      } finally {
        pending.current = false;
      }
    },
    [apiBaseUrl],
  );
  return {
    mode,
    labelKey: mode === 'copy' ? 'wishShare.copyLink' : 'wishShare.share',
    share,
  };
}
