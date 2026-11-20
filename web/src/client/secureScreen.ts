import { registerPlugin } from '@capacitor/core';
import { isAndroidApp } from './config';

/*
 * Screenshot, screen-recording and Recents-preview protection for private
 * surfaces (#683, once messages).
 *
 * In the Android app the in-house `SecureScreen` plugin sets FLAG_SECURE on
 * the app window while at least one private surface holds it. Browsers offer
 * no such control, so outside the app a hold is a no-op that resolves at once.
 *
 * A hold's `ready` resolves only after the window reports the flag as set, so
 * a caller can keep private content unpainted until then and refuse to show
 * it when protection is not confirmed (fail closed). Releasing the last hold
 * waits one task, so navigating from one private surface to the next does not
 * drop the flag in between.
 */

interface SecureScreenPlugin {
  setSecure(options: { secure: boolean }): Promise<{ secure: boolean }>;
}

const nativeSecureScreen = registerPlugin<SecureScreenPlugin>('SecureScreen');

export class SecureScreenUnavailable extends Error {
  constructor() {
    super('Screen protection is not confirmed');
    this.name = 'SecureScreenUnavailable';
  }
}

export interface SecureScreenHold {
  /** Resolves once private content may render; rejects when it must not. */
  readonly ready: Promise<void>;
  /** Gives the hold back; repeated calls are ignored. */
  release(): void;
}

let holders = 0;
let requested = false;
let applied: Promise<boolean> = Promise.resolve(false);
let pendingRelease: ReturnType<typeof setTimeout> | undefined;

function request(
  plugin: SecureScreenPlugin,
  secure: boolean,
): Promise<boolean> {
  requested = secure;
  // Requests stay ordered, so a late release can never undo a newer hold.
  const next = applied
    .catch(() => false)
    .then(() => plugin.setSecure({ secure }))
    .then((result) => result.secure === true);
  applied = next;
  next.then(
    (actual) => {
      if (applied === next) requested = actual;
    },
    () => {
      // The window state is unknown; the next hold asks again.
      if (applied === next) requested = false;
    },
  );
  return next;
}

const released: SecureScreenHold = {
  ready: Promise.resolve(),
  release: () => undefined,
};

/** Holds screen protection for one private surface. */
export function holdSecureScreen(
  native: boolean = isAndroidApp(),
  plugin: SecureScreenPlugin = nativeSecureScreen,
): SecureScreenHold {
  if (!native) return released;
  holders++;
  if (pendingRelease !== undefined) {
    clearTimeout(pendingRelease);
    pendingRelease = undefined;
  }
  const state = requested ? applied : request(plugin, true);
  const ready = state.then(
    (secure) => {
      if (!secure) throw new SecureScreenUnavailable();
    },
    () => {
      throw new SecureScreenUnavailable();
    },
  );
  // Callers that only render may ignore the outcome.
  ready.catch(() => undefined);
  let held = true;
  return {
    ready,
    release() {
      if (!held) return;
      held = false;
      holders--;
      if (holders > 0) return;
      pendingRelease = setTimeout(() => {
        pendingRelease = undefined;
        if (holders === 0) void request(plugin, false).catch(() => undefined);
      }, 0);
    },
  };
}

/** Test seam: forgets all holds without touching the window. */
export function resetSecureScreenForTests(): void {
  holders = 0;
  requested = false;
  applied = Promise.resolve(false);
  if (pendingRelease !== undefined) clearTimeout(pendingRelease);
  pendingRelease = undefined;
}
