import { Capacitor, registerPlugin } from '@capacitor/core';
import { useLayoutEffect } from 'react';
import { isAndroidApp } from './config';

interface LaunchScreenPlugin {
  ready(): Promise<void>;
}

const launchScreen = registerPlugin<LaunchScreenPlugin>('LaunchScreen');

let holds = 0;
let released = false;
let scheduled = false;

function afterNextPaint(callback: () => void): void {
  // The second frame runs after the first one has been composited.
  requestAnimationFrame(() => requestAnimationFrame(callback));
}

/**
 * Ends the Android system launch screen once no startup placeholder is
 * mounted and the replacing view has painted. The native side bounds the
 * hold, so a slow restoration still reaches the Web startup state.
 */
export function releaseLaunchScreenWhenPainted(): void {
  if (released || scheduled || holds > 0) return;
  scheduled = true;
  afterNextPaint(() => {
    scheduled = false;
    if (released || holds > 0) return;
    released = true;
    if (!isAndroidApp() || !Capacitor.isPluginAvailable('LaunchScreen')) return;
    // An older shell without the plugin dismisses on its own timeout.
    void launchScreen.ready().catch(() => undefined);
  });
}

/** Startup placeholders keep the launch screen up instead of a second logo. */
export function useLaunchScreenHold(): void {
  useLayoutEffect(() => {
    holds += 1;
    return () => {
      holds -= 1;
      releaseLaunchScreenWhenPainted();
    };
  }, []);
}

export function resetLaunchScreenForTests(): void {
  holds = 0;
  released = false;
  scheduled = false;
}
