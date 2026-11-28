/**
 * Device-local choice of the Fotoautomat's style in the memory worlds
 * (Momente › Erinnerungen): the classic station cabin of the sixties or the
 * modern enamel machine. Classic by default; never synced.
 */
import { useSyncExternalStore } from 'react';

export type BoothStyle = 'classic' | 'modern';

export const BOOTH_STYLES: readonly BoothStyle[] = ['classic', 'modern'];

export const BOOTH_STYLE_KEY = 'eimir.memoryWorlds.boothStyle';

const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === BOOTH_STYLE_KEY || event.key === null) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** The choice of this visit when storage is unavailable. */
let unstored: BoothStyle | null = null;

function readBoothStyle(): BoothStyle {
  try {
    return window.localStorage.getItem(BOOTH_STYLE_KEY) === 'modern'
      ? 'modern'
      : 'classic';
  } catch {
    return unstored ?? 'classic';
  }
}

export function setBoothStyle(style: BoothStyle): void {
  unstored = style;
  try {
    window.localStorage.setItem(BOOTH_STYLE_KEY, style);
  } catch {
    // Storage unavailable: the choice lasts for this visit.
  }
  notify();
}

/** The Fotoautomat's style on this device. */
export function useBoothStyle(): BoothStyle {
  return useSyncExternalStore(subscribe, readBoothStyle, () => 'classic');
}
