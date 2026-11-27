import type { StyleSpecification } from 'maplibre-gl';

/*
 * The basemap's style, with each source's TileJSON already inlined, kept on
 * the device (#2063). Without it, every first map of an app start waited for
 * the style, then the TileJSON, then sprites and glyphs, one round trip after
 * another, before the first tile could load. A stored style lets the map ask
 * for tiles straight away; it is refreshed in the background so the next
 * start follows the provider's newest tile set.
 *
 * The style is public provider data and holds nothing about the couple.
 */

const STORAGE_KEY = 'eimir-basemap-style-v1';
/**
 * Older styles are not used: the provider moves to new tile sets. The tile set
 * changes weekly and the provider serves a removed version as the latest one,
 * so a stored style that is a few days old still draws a correct map. It is
 * refreshed in the background every time a map is opened, so a week is the
 * longest a device can go without a fresh copy.
 */
export const BASEMAP_STYLE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** A stored style younger than this is not fetched again. */
const REFRESH_AFTER_MS = 6 * 60 * 60 * 1000;

interface StoredStyle {
  savedAt: number;
  styleUrl: string;
  style: StyleSpecification;
}

function read(styleUrl: string): StoredStyle | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredStyle;
    if (
      stored.styleUrl !== styleUrl ||
      typeof stored.savedAt !== 'number' ||
      Date.now() - stored.savedAt > BASEMAP_STYLE_MAX_AGE_MS ||
      !stored.style?.sources ||
      !Array.isArray(stored.style.layers)
    )
      return null;
    return stored;
  } catch {
    return null;
  }
}

/** The stored style for `styleUrl`, when it is recent enough to use. */
export function cachedBasemapStyle(
  styleUrl: string,
): StyleSpecification | null {
  return read(styleUrl)?.style ?? null;
}

/** Drops the stored style, for example when its tile set has gone. */
export function forgetBasemapStyle(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage may be unavailable; nothing was kept then.
  }
}

const TILEJSON_FIELDS = [
  'tiles',
  'minzoom',
  'maxzoom',
  'bounds',
  'scheme',
  'tileSize',
  'encoding',
  'attribution',
] as const;

async function json(url: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal });
  if (!response.ok)
    throw new Error(`Basemap request failed: ${response.status}`);
  return response.json();
}

/**
 * Fetches the style and inlines each referenced TileJSON, then stores it.
 * Skipped while the stored copy is recent. Failures leave the stored copy as
 * it was.
 */
export async function refreshBasemapStyle(
  styleUrl: string,
  signal?: AbortSignal,
): Promise<void> {
  const stored = read(styleUrl);
  if (stored && Date.now() - stored.savedAt < REFRESH_AFTER_MS) return;
  const style = (await json(styleUrl, signal)) as StyleSpecification;
  if (!style?.sources || !Array.isArray(style.layers)) return;
  const sources: Record<string, unknown> = {};
  for (const [id, source] of Object.entries(style.sources)) {
    if (!('url' in source) || typeof source.url !== 'string') {
      sources[id] = source;
      continue;
    }
    const tileJson = (await json(source.url, signal)) as Record<
      string,
      unknown
    >;
    if (!Array.isArray(tileJson.tiles) || tileJson.tiles.length === 0) return;
    const { url: _url, ...rest } = source;
    const inlined: Record<string, unknown> = { ...rest };
    for (const field of TILEJSON_FIELDS)
      if (tileJson[field] !== undefined && !(field in rest))
        inlined[field] = tileJson[field];
    sources[id] = inlined;
  }
  const value: StoredStyle = {
    savedAt: Date.now(),
    styleUrl,
    style: { ...style, sources } as StyleSpecification,
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // A full or blocked storage only means the next start fetches again.
  }
}
