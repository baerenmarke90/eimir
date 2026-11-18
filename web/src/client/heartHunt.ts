import type { DistanceBandView } from '../api/generated/models/DistanceBandView';

/**
 * Herzversteck presentation helpers (#1907 H3). The server owns the secret and
 * the found decision; this module only maps its coarse answers to words and
 * motion and turns a found round into a photo for a shared Moment.
 */

/** The photo frame is 4:5; positions are per-mille of that frame. */
export const FRAME_SCALE = 1000;
export const FRAME_ASPECT = 4 / 5;
/** Soft circle one tap clears, as a share of the frame width. */
export const FOG_RADIUS = 0.115;

export type WarmthLevel = 0 | 1 | 2 | 3;
export const WARMTH_KEYS = ['cold', 'lukewarm', 'warm', 'hot'] as const;

export function warmthKey(level: number): (typeof WARMTH_KEYS)[number] {
  return WARMTH_KEYS[Math.min(3, Math.max(0, Math.round(level)))];
}

export interface FramePoint {
  x: number;
  y: number;
}

/** A pointer or keyboard position inside the frame, clamped to per-mille. */
export function framePoint(
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
): FramePoint {
  const x = ((clientX - rect.left) / rect.width) * FRAME_SCALE;
  const y = ((clientY - rect.top) / rect.height) * FRAME_SCALE;
  return {
    x: Math.min(FRAME_SCALE, Math.max(0, Math.round(x))),
    y: Math.min(FRAME_SCALE, Math.max(0, Math.round(y))),
  };
}

export type PlaceKey =
  | 'topLeft'
  | 'top'
  | 'topRight'
  | 'left'
  | 'center'
  | 'right'
  | 'bottomLeft'
  | 'bottom'
  | 'bottomRight';

/** Where in the photo the heart was, in nine soft areas (never a coordinate). */
export function placeKey(point: FramePoint): PlaceKey {
  const col = point.x < 340 ? 0 : point.x > 660 ? 2 : 1;
  const row = point.y < 340 ? 0 : point.y > 660 ? 2 : 1;
  const grid: PlaceKey[][] = [
    ['topLeft', 'top', 'topRight'],
    ['left', 'center', 'right'],
    ['bottomLeft', 'bottom', 'bottomRight'],
  ];
  return grid[row][col];
}

export interface FlightPlan {
  /** Arc height in the 340x96 band, larger means farther apart. */
  height: number;
  /** Share of the connection travel duration token. */
  durationShare: number;
  /** Far flights use the longer travel token. */
  far: boolean;
}

/**
 * The same flight with or without a band: no band (partner does not share, or
 * no own position) gets a medium arc and never a label or a hint (H1 rule).
 */
export function flightPlan(band: DistanceBandView | null): FlightPlan {
  if (!band) return { height: 40, durationShare: 0.45, far: false };
  if (band.kind === 'NEARBY' || band.kind === 'CLOSE')
    return { height: 16, durationShare: 0.28, far: false };
  if (band.kind === 'RANGE') {
    const max = band.maxKm ?? 50;
    return max <= 5
      ? { height: 16, durationShare: 0.28, far: false }
      : { height: 30, durationShare: 0.4, far: false };
  }
  const km = band.approximateKm ?? 500;
  return km <= 500
    ? { height: 52, durationShare: 0.65, far: false }
    : { height: 70, durationShare: 0.5, far: true };
}

/** Sampled points on the quadratic arc between the two avatars. */
export function arcPoints(
  from: FramePoint,
  to: FramePoint,
  lift: number,
  steps = 24,
): FramePoint[] {
  const control = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - lift };
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const u = 1 - t;
    return {
      x: u * u * from.x + 2 * u * t * control.x + t * t * to.x,
      y: u * u * from.y + 2 * u * t * control.y + t * t * to.y,
    };
  });
}

const MAX_EDGE = 1600;

function loadBitmap(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function')
    return createImageBitmap(blob, { imageOrientation: 'from-image' });
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Photo could not be decoded.'));
    };
    image.src = url;
  });
}

function heartPath(context: CanvasRenderingContext2D, size: number) {
  context.beginPath();
  context.moveTo(0, size * 0.9);
  context.bezierCurveTo(
    -size * 1.2,
    size * 0.1,
    -size * 0.6,
    -size * 0.9,
    0,
    -size * 0.35,
  );
  context.bezierCurveTo(
    size * 0.6,
    -size * 0.9,
    size * 1.2,
    size * 0.1,
    0,
    size * 0.9,
  );
  context.closePath();
}

/**
 * The found photo as the couple saw it: cropped to the 4:5 frame, with the heart
 * where it was hidden. A new image, so the round's photo can still be deleted on
 * schedule while the Moment stays.
 */
export async function composeHeartPhoto(
  photo: Blob,
  heart: FramePoint,
  heartColor: string,
): Promise<File> {
  const bitmap = await loadBitmap(photo);
  const width = 'naturalWidth' in bitmap ? bitmap.naturalWidth : bitmap.width;
  const height =
    'naturalHeight' in bitmap ? bitmap.naturalHeight : bitmap.height;
  // `object-fit: cover` crop to the 4:5 frame, centred.
  let cropW = width;
  let cropH = width / FRAME_ASPECT;
  if (cropH > height) {
    cropH = height;
    cropW = height * FRAME_ASPECT;
  }
  const cropX = (width - cropW) / 2;
  const cropY = (height - cropH) / 2;
  const scale = Math.min(1, MAX_EDGE / Math.max(cropW, cropH));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(cropW * scale));
  canvas.height = Math.max(1, Math.round(cropH * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable.');
  context.drawImage(
    bitmap,
    cropX,
    cropY,
    cropW,
    cropH,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  if ('close' in bitmap) bitmap.close();
  const size = canvas.width * 0.045;
  context.save();
  context.translate(
    (heart.x / FRAME_SCALE) * canvas.width,
    (heart.y / FRAME_SCALE) * canvas.height,
  );
  heartPath(context, size);
  context.fillStyle = heartColor;
  context.fill();
  context.lineWidth = size * 0.12;
  context.strokeStyle = '#ffffff';
  context.stroke();
  context.restore();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.88),
  );
  if (!blob) throw new Error('Photo could not be encoded.');
  return new File([blob], 'herzversteck.jpg', { type: 'image/jpeg' });
}
