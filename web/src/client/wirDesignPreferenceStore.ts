import { WirDesignId } from '../api/generated/models/WirDesignId';
import { DEFAULT_APP_DESIGN } from '../design/appDesigns.generated';

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

/** Resolve preferences written by older clients and servers. */
export function parseWirDesignId(value: unknown): WirDesignId | undefined {
  if (value === 'handwriting' || value === 'together_index')
    return DEFAULT_APP_DESIGN;
  return parseDesignPaletteId(value);
}

export function parseDesignPaletteId(value: unknown): WirDesignId | undefined {
  return Object.values(WirDesignId).find((design) => design === value);
}

export function readWirDesign(
  key: string,
): { designId: WirDesignId; paletteId?: WirDesignId } | undefined {
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
    const designId = parseWirDesignId(value.designId);
    if (!designId) return undefined;
    return { designId, paletteId: parseDesignPaletteId(value.paletteId) };
  } catch {
    return undefined;
  }
}

export function rememberWirDesign(
  key: string,
  designId: WirDesignId,
  paletteId?: WirDesignId,
): void {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({ schema: 1, designId, paletteId, savedAt: Date.now() }),
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
