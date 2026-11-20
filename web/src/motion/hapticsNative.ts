/**
 * The native haptics backend (Motion Contract 4.10, #2076).
 *
 * `@capacitor/haptics` is loaded only inside the native app, so the Web never
 * imports its Web implementation (which would call `navigator.vibrate`) and
 * the entry chunk does not grow. Feature code never calls the plugin; it uses
 * `haptic(kind)` from `haptics.ts`.
 *
 * On Android the plugin's `selectionChanged()` vibrates only between
 * `selectionStart()` and `selectionEnd()`, so the threshold tick sends the
 * three calls in order over the bridge.
 */
import { isCapacitorNativePlatform } from '../client/config';
import { type HapticsBackend, registerHapticsBackend } from './haptics';

type HapticsPlugin = typeof import('@capacitor/haptics');

export function capacitorHapticsBackend(plugin: HapticsPlugin): HapticsBackend {
  const { Haptics, ImpactStyle, NotificationType } = plugin;
  const ignore = () => {};
  return {
    selectionChanged() {
      void Haptics.selectionStart().catch(ignore);
      void Haptics.selectionChanged().catch(ignore);
      void Haptics.selectionEnd().catch(ignore);
    },
    impact(style) {
      void Haptics.impact({
        style: style === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light,
      }).catch(ignore);
    },
    notification(type) {
      void Haptics.notification({
        type:
          type === 'warning'
            ? NotificationType.Warning
            : NotificationType.Success,
      }).catch(ignore);
    },
  };
}

let registration: Promise<boolean> | null = null;

/**
 * Registers the plugin as the haptics backend in the native app. Resolves
 * `false` on the Web (nothing is loaded) or when the plugin cannot load.
 */
export function registerNativeHaptics(
  isNative: () => boolean = isCapacitorNativePlatform,
  load: () => Promise<HapticsPlugin> = () => import('@capacitor/haptics'),
): Promise<boolean> {
  if (!isNative()) return Promise.resolve(false);
  registration ??= load().then(
    (plugin) => {
      registerHapticsBackend(capacitorHapticsBackend(plugin));
      return true;
    },
    () => {
      registration = null;
      return false;
    },
  );
  return registration;
}

/** Test support. */
export function resetNativeHapticsForTests(): void {
  registration = null;
  registerHapticsBackend(null);
}
