import type { StyleSpecification } from 'maplibre-gl';
import { expect, it } from 'vitest';
import { googleLikeStyle } from './placeMapStyle';

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
