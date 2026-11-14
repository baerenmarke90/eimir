import type { StyleSpecification } from 'maplibre-gl';

/**
 * Basemap palette. The OpenFreeMap "liberty" style is a good cartographic base
 * but leans on saturated orange roads; these values move it to the calm,
 * familiar look people know from consumer map apps: light land, white streets,
 * warm yellow highways, soft park green and pale blue water, grey labels.
 *
 * The values are third-party map-pixel colors, not application UI colors. They
 * live beside the style they adapt instead of the product design tokens, and
 * dark mode inverts the whole canvas in CSS.
 */
const LAND = '#f4f2ed';
const WATER = '#aadaff';
const PARK = '#cfe8c6';
const WOOD = '#bddcb1';
const BUILDING = '#e9e6e0';
const BUILDING_EDGE = '#dcd8d0';
const STREET_EDGE = '#dedbd4';
const ARTERIAL_EDGE = '#d3d6da';
const PRIMARY = '#ffeeb4';
const PRIMARY_EDGE = '#e0c56f';
const HIGHWAY = '#fcd266';
const HIGHWAY_EDGE = '#d9a93f';
const LABEL = '#3c4043';
const LABEL_QUIET = '#5f6368';
const LABEL_WATER = '#4d7fb8';

type Paint = Record<string, string>;

const EXACT: Record<string, Paint> = {
  background: { 'background-color': LAND },
  park: { 'fill-color': PARK, 'fill-outline-color': PARK },
  park_outline: { 'line-color': PARK },
  landcover_wood: { 'fill-color': WOOD },
  landcover_grass: { 'fill-color': PARK },
  landuse_pitch: { 'fill-color': '#d7ebc9' },
  landuse_track: { 'fill-color': '#d7ebc9' },
  landuse_cemetery: { 'fill-color': '#dcebd0' },
  landuse_hospital: { 'fill-color': '#f6e4e4' },
  landuse_school: { 'fill-color': '#ece9df' },
  water: { 'fill-color': WATER },
  waterway_tunnel: { 'line-color': WATER },
  waterway_river: { 'line-color': WATER },
  waterway_other: { 'line-color': WATER },
  building: {
    'fill-color': BUILDING,
    'fill-outline-color': BUILDING_EDGE,
  },
  'building-3d': { 'fill-extrusion-color': BUILDING },
  waterway_line_label: {
    'text-color': LABEL_WATER,
    'text-halo-color': '#ffffff',
  },
  water_name_point_label: {
    'text-color': LABEL_WATER,
    'text-halo-color': '#ffffff',
  },
  water_name_line_label: {
    'text-color': LABEL_WATER,
    'text-halo-color': '#ffffff',
  },
  'highway-name-path': {
    'text-color': LABEL_QUIET,
    'text-halo-color': '#ffffff',
  },
  'highway-name-minor': { 'text-color': LABEL_QUIET },
  'highway-name-major': { 'text-color': LABEL_QUIET },
};

/** Ordered rules over layer ids; the first match wins. */
const RULES: [RegExp, Paint][] = [
  [/motorway(_link)?_casing$/, { 'line-color': HIGHWAY_EDGE }],
  [/motorway(_link)?$/, { 'line-color': HIGHWAY }],
  [/(trunk_primary|link)_casing$/, { 'line-color': PRIMARY_EDGE }],
  [/(trunk_primary|link)$/, { 'line-color': PRIMARY }],
  [/secondary_tertiary_casing$/, { 'line-color': ARTERIAL_EDGE }],
  [/secondary_tertiary$/, { 'line-color': '#ffffff' }],
  [
    /(minor|street|service_track|path_pedestrian)_casing$/,
    { 'line-color': STREET_EDGE },
  ],
  [/^poi_/, { 'text-color': LABEL_QUIET, 'text-halo-color': '#ffffff' }],
  [/^label_(?!state)/, { 'text-color': LABEL, 'text-halo-color': '#ffffff' }],
  [/^label_state/, { 'text-color': LABEL_QUIET, 'text-halo-color': '#ffffff' }],
];

function paintFor(id: string): Paint | undefined {
  return EXACT[id] ?? RULES.find(([pattern]) => pattern.test(id))?.[1];
}

/**
 * `transformStyle` hook for MapLibre: recolors known layers of the fetched
 * style and leaves everything else (including unknown or fixture styles)
 * untouched, so a changed upstream style degrades to its own colors.
 */
export function googleLikeStyle(
  _previous: StyleSpecification | undefined,
  next: StyleSpecification,
): StyleSpecification {
  return {
    ...next,
    layers: next.layers.map((layer) => {
      const paint = paintFor(layer.id);
      return paint
        ? { ...layer, paint: { ...(layer.paint ?? {}), ...paint } }
        : layer;
    }) as StyleSpecification['layers'],
  };
}
