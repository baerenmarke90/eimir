import type { PictureColour } from '../api/generated/models/PictureColour';
import type { PartnerDistanceLine } from './partnerDistance';

/**
 * Picture ping-pong (#1907 H3, concept B): geometry, limits and the distance
 * flight. The server validates the same limits; the client keeps them so a
 * rejected stroke never has to be explained.
 */

/** Strokes live on a 0..GRID square, whatever the screen size is. */
export const GRID = 1000;
export const MAX_TURNS = 6;
export const MAX_STROKES_PER_TURN = 3;
/** Server limit is 480 numbers (240 points); stay clearly below it. */
export const MAX_POINTS_PER_STROKE = 220;
/** Minimum travel between two kept points, in grid units. */
const MIN_POINT_STEP = 5;
export const STROKE_WIDTH = 12;

export function picturePingPongQueryKey(accountId: string, spaceId: string) {
  return ['games', 'picture-ping-pong', accountId, spaceId] as const;
}

export interface DrawnStroke {
  colour: PictureColour;
  points: number[];
}

function clampGrid(value: number): number {
  return Math.max(0, Math.min(GRID, Math.round(value)));
}

/** Map a pointer position to the grid; a degenerate box maps to the origin. */
export function toGridPoint(
  clientX: number,
  clientY: number,
  box: { left: number; top: number; width: number; height: number },
): [number, number] {
  if (box.width <= 0 || box.height <= 0) return [0, 0];
  return [
    clampGrid(((clientX - box.left) / box.width) * GRID),
    clampGrid(((clientY - box.top) / box.height) * GRID),
  ];
}

/** Add a point unless it barely moved; the stroke length stays bounded. */
export function appendPoint(points: number[], x: number, y: number): number[] {
  if (points.length >= MAX_POINTS_PER_STROKE * 2) return points;
  if (points.length >= 2) {
    const dx = x - points[points.length - 2];
    const dy = y - points[points.length - 1];
    if (dx * dx + dy * dy < MIN_POINT_STEP * MIN_POINT_STEP) return points;
  }
  return [...points, x, y];
}

/** A tap becomes a dot: the server expects at least two points per stroke. */
export function finishStroke(points: number[]): number[] | null {
  if (points.length < 2) return null;
  if (points.length >= 4) return points;
  return [...points, clampGrid(points[0] + 1), clampGrid(points[1] + 1)];
}

/** Smooth SVG path through the points (quadratic midpoints). */
export function strokePath(points: number[]): string {
  if (points.length < 4) return '';
  const pairs: Array<[number, number]> = [];
  for (let index = 0; index + 1 < points.length; index += 2) {
    pairs.push([points[index], points[index + 1]]);
  }
  let path = `M${pairs[0][0]} ${pairs[0][1]}`;
  for (let index = 1; index < pairs.length - 1; index += 1) {
    const [x, y] = pairs[index];
    const [nextX, nextY] = pairs[index + 1];
    path += ` Q${x} ${y} ${(x + nextX) / 2} ${(y + nextY) / 2}`;
  }
  const last = pairs[pairs.length - 1];
  return `${path} L${last[0]} ${last[1]}`;
}

/** The three colour slots resolved to concrete colours at render time. */
export interface PictureInks {
  paper: string;
  person: (authorId: string | null) => string;
  ink: string;
  sun: string;
}

export function strokeInk(
  inks: PictureInks,
  stroke: { colour: PictureColour; authorId?: string | null },
): string {
  if (stroke.colour === 'INK') return inks.ink;
  if (stroke.colour === 'SUN') return inks.sun;
  return inks.person(stroke.authorId ?? null);
}

/**
 * Render the finished picture for Momente. Only used on an explicit save; the
 * server never stores this image.
 */
export async function renderPictureBlob(
  strokes: ReadonlyArray<{
    colour: PictureColour;
    authorId?: string | null;
    points: number[];
  }>,
  inks: PictureInks,
  size = 1080,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is not available.');
  context.fillStyle = inks.paper;
  context.fillRect(0, 0, size, size);
  context.scale(size / GRID, size / GRID);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = STROKE_WIDTH;
  for (const stroke of strokes) {
    context.strokeStyle = strokeInk(inks, stroke);
    context.stroke(new Path2D(strokePath(stroke.points)));
  }
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('Image export failed.')),
      'image/png',
    );
  });
}

/** Three tap-only title suggestions, stable for one picture. */
export const TITLE_SUGGESTION_COUNT = 6;

export function titleSuggestionIndexes(pictureId: string): number[] {
  let hash = 0;
  for (const character of pictureId) {
    hash = (hash * 31 + character.charCodeAt(0)) % 9973;
  }
  const first = hash % TITLE_SUGGESTION_COUNT;
  return [
    first,
    (first + 2) % TITLE_SUGGESTION_COUNT,
    (first + 4) % TITLE_SUGGESTION_COUNT,
  ];
}

export interface FlightProfile {
  /** Multiplies the one-shot gesture duration. */
  durationScale: number;
  /** Arc height as a fraction of the flight width. */
  arcHeight: number;
  /** The H4 word key (short form) when the band may be named. */
  label: PartnerDistanceLine | null;
}

const DEFAULT_FLIGHT: FlightProfile = {
  durationScale: 1,
  arcHeight: 0.3,
  label: null,
};

/**
 * Arc height and duration follow the server distance band only (a longer
 * distance means a longer, higher flight). Without a shared distance the flight
 * is the same default one and carries no label and no hint.
 */
export function flightProfile(
  line: PartnerDistanceLine | undefined,
): FlightProfile {
  if (!line || line.kind !== 'distance') return DEFAULT_FLIGHT;
  const { band } = line;
  let durationScale: number;
  if (band.kind === 'NEARBY') durationScale = 0.6;
  else if (band.kind === 'RANGE') {
    const max = band.maxKm ?? 25;
    durationScale = max <= 5 ? 0.7 : max <= 10 ? 0.85 : max <= 25 ? 1 : 1.15;
  } else {
    const km = band.approximateKm ?? band.maxKm ?? band.minKm ?? 100;
    durationScale = km < 200 ? 1.3 : km < 1000 ? 1.5 : 1.8;
  }
  return {
    durationScale,
    arcHeight: Number((0.12 + durationScale * 0.14).toFixed(2)),
    label: line,
  };
}
