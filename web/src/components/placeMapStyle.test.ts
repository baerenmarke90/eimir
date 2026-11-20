import type { StyleSpecification } from 'maplibre-gl';
import { expect, it } from 'vitest';
import {
  googleLikeStyle,
  openFreeMapAttribution,
  withLocalizedAttribution,
} from './placeMapStyle';
import m5s3 from '../i18n/locales/m5s3';

const DATA_FROM = m5s3.map.attributionDataFrom;

const style = {
  version: 8,
  sources: {},
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#000' },
    },
    {
      id: 'road_motorway',
      type: 'line',
      source: 's',
      paint: { 'line-color': '#fc8', 'line-width': 3 },
    },
    {
      id: 'road_motorway_casing',
      type: 'line',
      source: 's',
      paint: { 'line-color': '#e9ac77' },
    },
    {
      id: 'road_minor',
      type: 'line',
      source: 's',
      paint: { 'line-color': '#fff' },
    },
    {
      id: 'unknown-layer',
      type: 'line',
      source: 's',
      paint: { 'line-color': '#123456' },
    },
  ],
} as unknown as StyleSpecification;

it('recolors known basemap layers and keeps unrelated paint properties', () => {
  const result = googleLikeStyle(undefined, style);
  const paint = (id: string) =>
    (result.layers.find((layer) => layer.id === id) as { paint: object }).paint;
  expect(paint('background')).toEqual({ 'background-color': '#f4f2ed' });
  expect(paint('road_motorway')).toEqual({
    'line-color': '#fcd266',
    'line-width': 3,
  });
  expect(paint('road_motorway_casing')).toEqual({ 'line-color': '#d9a93f' });
});

it('leaves layers it does not know, and its input, untouched', () => {
  const result = googleLikeStyle(undefined, style);
  expect(result.layers.find((layer) => layer.id === 'unknown-layer')).toBe(
    style.layers[4],
  );
  expect(result.layers.find((layer) => layer.id === 'road_minor')).toBe(
    style.layers[3],
  );
  expect((style.layers[1] as { paint: object }).paint).toEqual({
    'line-color': '#fc8',
    'line-width': 3,
  });
});

it('gives an OpenFreeMap TileJSON source the localized attribution (#2063)', () => {
  const remote = {
    version: 8,
    sources: {
      openmaptiles: {
        type: 'vector',
        url: 'https://tiles.openfreemap.org/planet',
      },
      ne2_shaded: { type: 'raster', tiles: ['https://example.org/{z}.png'] },
    },
    layers: [],
  } as unknown as StyleSpecification;

  const localized = withLocalizedAttribution(remote, DATA_FROM);

  const source = localized.sources.openmaptiles as { attribution?: string };
  expect(source.attribution).toBe(openFreeMapAttribution(DATA_FROM));
  expect(source.attribution).toContain(`${DATA_FROM} <a`);
  expect(source.attribution).not.toContain('Data from');
  for (const name of ['OpenFreeMap', 'OpenMapTiles', 'OpenStreetMap'])
    expect(source.attribution).toContain(name);
  // A source of another origin is left alone, and so is the input.
  expect(localized.sources.ne2_shaded).toBe(remote.sources.ne2_shaded);
  expect(
    (remote.sources.openmaptiles as { attribution?: string }).attribution,
  ).toBeUndefined();
});

it('localizes the connector of an attribution the style already carries', () => {
  const remote = {
    version: 8,
    sources: {
      own: { type: 'vector', attribution: 'X Data from <a>OSM</a>' },
    },
    layers: [],
  } as unknown as StyleSpecification;
  const source = withLocalizedAttribution(remote, DATA_FROM).sources.own as {
    attribution?: string;
  };
  expect(source.attribution).toBe(`X ${DATA_FROM} <a>OSM</a>`);
});
