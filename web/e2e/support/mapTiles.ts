import type { Page } from '@playwright/test';

/** Origin of the vector basemap; the production CSP allows exactly this host. */
export const MAP_TILE_ORIGIN = 'https://tiles.openfreemap.org';

const FIXTURE_STYLE = {
  version: 8,
  sources: {
    fixture: {
      type: 'vector',
      tiles: [`${MAP_TILE_ORIGIN}/fixture/{z}/{x}/{y}.pbf`],
      minzoom: 0,
      maxzoom: 14,
      // Mirrors the provider's TileJSON attribution, which MapLibre displays.
      attribution:
        '<a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener noreferrer">&copy; OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
    },
  },
  // MapLibre only requests tiles of a source that a layer draws. These flat
  // fills are test data, not a proposed map style.
  layers: [
    {
      id: 'fixture-background',
      type: 'background',
      paint: { 'background-color': '#9bbf8a' },
    },
    {
      id: 'fixture-land',
      type: 'fill',
      source: 'fixture',
      'source-layer': 'land',
      paint: { 'fill-color': '#b7d3a8' },
    },
  ],
};

export interface MapTileMock {
  /** Zoom level of every tile request made so far, in request order. */
  zooms: () => number[];
  /** Number of tile requests made so far. */
  reads: () => number;
}

/**
 * Serve the basemap style and an empty vector tile for every request, and
 * record the requested tile zooms. Pass `fail` to make the basemap unreachable.
 */
export async function mockMapTiles(
  page: Page,
  { fail = false }: { fail?: boolean } = {},
): Promise<MapTileMock> {
  const zooms: number[] = [];
  await page.route(`${MAP_TILE_ORIGIN}/**`, (route) => {
    if (fail) return route.abort();
    const { pathname } = new URL(route.request().url());
    if (pathname.startsWith('/styles/'))
      return route.fulfill({ json: FIXTURE_STYLE });
    const tile = /^\/fixture\/(\d+)\//.exec(pathname);
    if (tile) zooms.push(Number(tile[1]));
    return route.fulfill({
      status: 200,
      contentType: 'application/x-protobuf',
      body: Buffer.alloc(0),
    });
  });
  return { zooms: () => [...zooms], reads: () => zooms.length };
}
