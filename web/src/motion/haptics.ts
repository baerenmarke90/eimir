/**
 * Haptics adapter (Motion Contract 4.10).
 *
 * All haptics go through `haptic(kind)`. Feature code never calls a haptics
 * plugin or `navigator.vibrate` itself.
 *
 * - Native app only: on the Web this is a no-op, and it never calls a
 *   backend there (the plugin's Web implementation would use
 *   `navigator.vibrate`).
 * - The native backend is registered at start by `registerNativeHaptics()` in
 *   `hapticsNative.ts`: Android system feedback, or `@capacitor/haptics` on
 *   other native platforms. This module itself adds no dependency.
 * - Budget: no two haptics within `--duration-context` (unreduced; haptics do
 *   not follow reduced motion); the later one is dropped. A gesture's
 *   threshold tick is outside that spacing but plays at most once per
 *   crossing (the caller reports crossings).
 * - In-app switch, on by default, stored on this device only.
 */
import { isCapacitorNativePlatform } from '../client/config';
import { now as clockNow } from './choreography';
import { MOTION_CONSTANTS } from './tokens';

export type HapticKind =
  /** Gesture commit threshold crossed (either direction). */
  | 'threshold'
  /** Gesture committed. */
  | 'commit'
  /** Press of a named emphasized action. */
  | 'press'
  /** Confirmed success of a meaningful action. */
  | 'success'
  /** Affectionate beat the person triggered. */
  | 'affection'
  /** First beat of a Moment the person looks at. */
  | 'moment'
  /** Refusal of a direct action, or a failed send returning. */
  | 'refuse';

export interface HapticsBackend {
  selectionChanged(): void;
  impact(style: 'light' | 'medium'): void;
  notification(type: 'success' | 'warning'): void;
}

export const HAPTICS_SETTING_KEY = 'eimir.motion.haptics';

let backend: HapticsBackend | null = null;
let lastHaptic = Number.NEGATIVE_INFINITY;
let isNative: () => boolean = isCapacitorNativePlatform;
let clock: () => number = clockNow;

export function registerHapticsBackend(next: HapticsBackend | null): void {
  backend = next;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** The in-app switch. On by default; device-local. */
export function hapticsEnabled(): boolean {
  try {
    return storage()?.getItem(HAPTICS_SETTING_KEY) !== 'off';
  } catch {
    return true;
  }
}

const settingListeners = new Set<() => void>();

export function setHapticsEnabled(enabled: boolean): void {
  try {
    storage()?.setItem(HAPTICS_SETTING_KEY, enabled ? 'on' : 'off');
  } catch {
    // Storage can be unavailable (private mode); the default stays.
  }
  for (const listener of settingListeners) listener();
}

/** Notifies `listener` when the in-app switch changes on this page. */
export function subscribeHapticsEnabled(listener: () => void): () => void {
  settingListeners.add(listener);
  return () => {
    settingListeners.delete(listener);
  };
}

/** True where the app can offer haptics (and its switch): the native app. */
export function hapticsAvailable(): boolean {
  return isNative();
}

/** Plays one haptic. Returns true when it was handed to the backend. */
export function haptic(kind: HapticKind): boolean {
  if (!backend || !isNative() || !hapticsEnabled()) return false;
  const at = clock();
  if (kind !== 'threshold') {
    if (at - lastHaptic < MOTION_CONSTANTS.haptics.minIntervalMs) return false;
    lastHaptic = at;
  }
  try {
    switch (kind) {
      case 'threshold':
        backend.selectionChanged();
        break;
      case 'commit':
      case 'press':
        backend.impact('light');
        break;
      case 'affection':
      case 'moment':
        backend.impact('medium');
        break;
      case 'success':
        backend.notification('success');
        break;
      case 'refuse':
        backend.notification('warning');
        break;
    }
  } catch {
    return false;
  }
  return true;
}

/** Test support. */
export function configureHapticsForTests(options: {
  native?: boolean;
  now?: () => number;
}): void {
  isNative =
    options.native === undefined
      ? isCapacitorNativePlatform
      : () => !!options.native;
  clock = options.now ?? clockNow;
  lastHaptic = Number.NEGATIVE_INFINITY;
}
