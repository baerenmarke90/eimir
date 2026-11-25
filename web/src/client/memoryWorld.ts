import type { MemoryWorldId } from '../api/generated/models/MemoryWorldId';
import { APP_ICON_CAPABILITY } from './appIcon';

/**
 * Erinnerungswelten (#2283): the personal presentation of Momente ›
 * Erinnerungen. Story is the default; Story and Stapel are Free, every other
 * world is a Pro presentation choice (`theme.bespoke_packs`). A saved world
 * stays in effect after Pro ends; only choosing another Pro world needs Pro.
 */
export type MemoryWorld = `${MemoryWorldId}`;

/** Order of the worlds in the settings sheet. */
export const MEMORY_WORLDS: readonly MemoryWorld[] = [
  'story',
  'stack',
  'cloud',
  'booth',
  'album',
  'crate',
  'fridge',
];

export const DEFAULT_MEMORY_WORLD: MemoryWorld = 'story';

const FREE_MEMORY_WORLDS: ReadonlySet<MemoryWorld> = new Set([
  'story',
  'stack',
]);

/** Choosing an alternative world is part of the bespoke personalization pack. */
export const MEMORY_WORLD_CAPABILITY = APP_ICON_CAPABILITY;

export function isMemoryWorld(value: unknown): value is MemoryWorld {
  return (
    typeof value === 'string' &&
    (MEMORY_WORLDS as readonly string[]).includes(value)
  );
}

export function isProMemoryWorld(world: MemoryWorld): boolean {
  return !FREE_MEMORY_WORLDS.has(world);
}

const PREFIX = 'eimir-memory-world-v1:';
const MAX_AGE = 30 * 24 * 60 * 60_000;

/**
 * Presentation metadata only: the last world this device saw, so Erinnerungen
 * paints the chosen world first instead of flipping after the read. It never
 * authorizes anything and is cleared on sign-out.
 */
export function memoryWorldStorageKey(
  instance: string,
  accountId: string,
  spaceId: string,
): string {
  return (
    PREFIX + JSON.stringify([instance.replace(/\/+$/, ''), accountId, spaceId])
  );
}

export function readMemoryWorld(key: string): MemoryWorld | undefined {
  try {
    const raw = localStorage.getItem(key);
    if (!raw || raw.length > 256) return undefined;
    const value = JSON.parse(raw);
    if (
      value.schema !== 1 ||
      !Number.isFinite(value.savedAt) ||
      value.savedAt > Date.now() ||
      Date.now() - value.savedAt >= MAX_AGE
    )
      return undefined;
    return isMemoryWorld(value.world) ? value.world : undefined;
  } catch {
    return undefined;
  }
}

export function rememberMemoryWorld(key: string, world: MemoryWorld): void {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({ schema: 1, world, savedAt: Date.now() }),
    );
  } catch {
    /* Memory state remains usable when device storage is unavailable. */
  }
}

export function forgetMemoryWorld(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* Nothing sensitive is stored. */
  }
}

export function clearMemoryWorldPreferences(): void {
  try {
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const key = localStorage.key(index);
      if (key?.startsWith(PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    /* Presentation metadata cannot grant access. */
  }
}
