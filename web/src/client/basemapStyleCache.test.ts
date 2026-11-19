// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  BASEMAP_STYLE_MAX_AGE_MS,
  cachedBasemapStyle,
  forgetBasemapStyle,
  refreshBasemapStyle,
} from './basemapStyleCache';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const TILEJSON_URL = 'https://tiles.openfreemap.org/planet';
const responses = new Map<string, unknown>();
const requested: string[] = [];

beforeEach(() => {
  forgetBasemapStyle();
  responses.clear();
  requested.length = 0;
  responses.set(STYLE_URL, {
    version: 8,
    sources: {
      openmaptiles: { type: 'vector', url: TILEJSON_URL },
      shaded: { type: 'raster', tiles: ['https://example.org/{z}.png'] },
    },
    layers: [{ id: 'background', type: 'background' }],
  });
  responses.set(TILEJSON_URL, {
    tiles: ['https://tiles.openfreemap.org/planet/20261118/{z}/{x}/{y}.pbf'],
    minzoom: 0,
    maxzoom: 14,
    attribution: 'OpenFreeMap Data from OpenStreetMap',
  });
  vi.stubGlobal('fetch', async (url: string) => {
    requested.push(url);
    const body = responses.get(url);
    return body
      ? { ok: true, json: async () => body }
      : { ok: false, status: 404, json: async () => ({}) };
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('stores the style with its TileJSON inlined, without the round trip', async () => {
  expect(cachedBasemapStyle(STYLE_URL)).toBeNull();
  await refreshBasemapStyle(STYLE_URL);
  const style = cachedBasemapStyle(STYLE_URL);
  const source = style?.sources.openmaptiles as Record<string, unknown>;
  expect(source.url).toBeUndefined();
  expect(source.tiles).toEqual([
    'https://tiles.openfreemap.org/planet/20261118/{z}/{x}/{y}.pbf',
  ]);
  expect(source.maxzoom).toBe(14);
  expect(source.attribution).toBe('OpenFreeMap Data from OpenStreetMap');
  expect(style?.sources.shaded).toEqual({
    type: 'raster',
    tiles: ['https://example.org/{z}.png'],
  });
  // A recent copy is not fetched again.
  requested.length = 0;
  await refreshBasemapStyle(STYLE_URL);
  expect(requested).toEqual([]);
});

it('uses no stored style once it is too old', async () => {
  vi.useFakeTimers({ now: Date.parse('2026-11-19T10:00:00Z') });
  await refreshBasemapStyle(STYLE_URL);
  expect(cachedBasemapStyle(STYLE_URL)).not.toBeNull();
  vi.setSystemTime(Date.now() + BASEMAP_STYLE_MAX_AGE_MS + 1);
  expect(cachedBasemapStyle(STYLE_URL)).toBeNull();
});

it('keeps nothing when the provider fails or the TileJSON has no tiles', async () => {
  responses.delete(TILEJSON_URL);
  await expect(refreshBasemapStyle(STYLE_URL)).rejects.toThrow();
  expect(cachedBasemapStyle(STYLE_URL)).toBeNull();
  responses.set(TILEJSON_URL, { tiles: [] });
  await refreshBasemapStyle(STYLE_URL);
  expect(cachedBasemapStyle(STYLE_URL)).toBeNull();
});

it('forgets the stored style', async () => {
  await refreshBasemapStyle(STYLE_URL);
  forgetBasemapStyle();
  expect(cachedBasemapStyle(STYLE_URL)).toBeNull();
});
