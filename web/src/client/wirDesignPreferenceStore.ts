import { WirDesignId } from '../api/generated/models/WirDesignId';

const PREFIX = 'eimir-wir-design-v1:';
const MAX_AGE = 30 * 24 * 60 * 60_000;

/** Presentation metadata only. A remembered design never authorizes a Pro action. */
export function wirDesignStorageKey(
  instance: string,
  accountId: string,
  spaceId: string,
): string {
  return (
    PREFIX + JSON.stringify([instance.replace(/\/+$/, ''), accountId, spaceId])
  );
}

export function readWirDesign(key: string): WirDesignId | undefined {
  try {
    const raw = localStorage.getItem(key);
    if (!raw || raw.length > 256) return undefined;
    const value = JSON.parse(raw);
    if (
      value.schema !== 1 ||
      !Object.values(WirDesignId).includes(value.designId) ||
      !Number.isFinite(value.savedAt) ||
      value.savedAt > Date.now() ||
      Date.now() - value.savedAt >= MAX_AGE
    )
      return undefined;
    return value.designId;
  } catch {
    return undefined;
  }
}

export function rememberWirDesign(key: string, designId: WirDesignId): void {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({ schema: 1, designId, savedAt: Date.now() }),
    );
  } catch {
    /* Memory state remains usable when device storage is unavailable. */
  }
}

export function forgetWirDesign(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* No content or grant is stored. */
  }
}

export function clearWirDesignPreferences(): void {
  try {
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const key = localStorage.key(index);
      if (key?.startsWith(PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    /* Presentation metadata cannot grant access. */
  }
}
