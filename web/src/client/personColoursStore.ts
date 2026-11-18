import type { PersonColourPairId } from './personColours';
import { PERSON_COLOUR_PAIRS } from './personColours';

const PREFIX = 'eimir-person-colours-v1:';
const MAX_AGE = 30 * 24 * 60 * 60_000;

/**
 * Presentation metadata only: the last colour pair this device saw, so the
 * first screen paints in the chosen colours instead of flipping after the read.
 * It never authorizes anything and is cleared on sign-out.
 */
export function personColoursStorageKey(
  instance: string,
  accountId: string,
  spaceId: string,
): string {
  return (
    PREFIX + JSON.stringify([instance.replace(/\/+$/, ''), accountId, spaceId])
  );
}

/** `undefined` means nothing usable is remembered; `null` means automatic. */
export function readPersonColours(
  key: string,
): PersonColourPairId | null | undefined {
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
    if (value.colours === null) return null;
    return PERSON_COLOUR_PAIRS.includes(value.colours)
      ? value.colours
      : undefined;
  } catch {
    return undefined;
  }
}

export function rememberPersonColours(
  key: string,
  colours: PersonColourPairId | null,
): void {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({ schema: 1, colours, savedAt: Date.now() }),
    );
  } catch {
    /* Memory state remains usable when device storage is unavailable. */
  }
}

export function forgetPersonColours(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* Nothing sensitive is stored. */
  }
}

export function clearPersonColourPreferences(): void {
  try {
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const key = localStorage.key(index);
      if (key?.startsWith(PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    /* Presentation metadata cannot grant access. */
  }
}
