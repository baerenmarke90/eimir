/**
 * The native haptics backend (Motion Contract 4.10, #2076).
 *
 * Android uses the project's `SystemHaptics` plugin, so feedback matches the
 * device's keyboard and system controls. Other native platforms use
 * `@capacitor/haptics`, which is loaded only there, so the Web never imports
 * its Web implementation (which would call `navigator.vibrate`) and the entry
 * chunk does not grow. Feature code never calls a plugin; it uses
 * `haptic(kind)` from `haptics.ts`.
 */
import { registerPlugin } from '@capacitor/core';
import { isAndroidApp, isCapacitorNativePlatform } from '../client/config';
import { type HapticsBackend, registerHapticsBackend } from './haptics';

type HapticsPlugin = typeof import('@capacitor/haptics');

type SystemHapticKind = 'tick' | 'tap' | 'emphasis' | 'success' | 'refuse';

export interface SystemHapticsPlugin {
  perform(options: { kind: SystemHapticKind }): Promise<unknown>;
}

const nativeSystemHaptics =
  registerPlugin<SystemHapticsPlugin>('SystemHaptics');

export function systemHapticsBackend(
  plugin: SystemHapticsPlugin,
): HapticsBackend {
  const play = (kind: SystemHapticKind) => {
    void plugin.perform({ kind }).catch(() => {});
  };
  return {
    selectionChanged: () => play('tick'),
    impact: (style) => play(style === 'medium' ? 'emphasis' : 'tap'),
    notification: (type) => play(type === 'warning' ? 'refuse' : 'success'),
  };
}

export function capacitorHapticsBackend(plugin: HapticsPlugin): HapticsBackend {
  const { Haptics, ImpactStyle, NotificationType } = plugin;
  const ignore = () => {};
  return {
    selectionChanged() {
      // The plugin's selection tick needs this sequence. Each call waits for
      // the previous one because bridge calls are asynchronous.
      void Haptics.selectionStart()
        .then(() => Haptics.selectionChanged())
        .then(() => Haptics.selectionEnd())
        .catch(ignore);
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
 * Registers the platform's haptics backend in the native app. Resolves
 * `false` on the Web (nothing is loaded) or when the plugin cannot load.
 */
export function registerNativeHaptics(
  isNative: () => boolean = isCapacitorNativePlatform,
  load: () => Promise<HapticsPlugin> = () => import('@capacitor/haptics'),
  isAndroid: () => boolean = isAndroidApp,
  systemHaptics: SystemHapticsPlugin = nativeSystemHaptics,
): Promise<boolean> {
  if (!isNative()) return Promise.resolve(false);
  if (isAndroid()) {
    registerHapticsBackend(systemHapticsBackend(systemHaptics));
    return Promise.resolve(true);
  }
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
