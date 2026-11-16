/**
 * Device-side crop and rotation for photos added to a moment (#1907 G1).
 *
 * The edit is applied before upload, like the avatar crop (#1854): every
 * existing render site shows the result without a server-side edit contract.
 * Unlike the avatar crop, the edited photo keeps the original's EXIF metadata
 * (capture date, place, camera) so date and place enrichment keep working; see
 * `jpegExif.ts`. The photo on the device is never modified.
 */
import {
  insertExifSegment,
  readExifSegment,
  uprightExifSegment,
} from './jpegExif';
import type { PhotoCropSource } from './photoCrop';

/** Longest edge of an edited photo; well inside the server image limits. */
export const EDITED_PHOTO_MAX_EDGE = 4096;
const EDITED_PHOTO_TYPE = 'image/jpeg';
const EDITED_PHOTO_QUALITY = 0.92;
const EDITED_PHOTO_BACKDROP = '#ffffff';

/** Clockwise quarter turns. */
export type QuarterTurns = 0 | 1 | 2 | 3;

export type PhotoAspect = 'original' | 'square' | 'classic' | 'wide';

export interface PhotoEditBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LayoutBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Turn counter-clockwise by a quarter, as the phone photo apps do. */
export function turnLeft(turns: QuarterTurns): QuarterTurns {
  return ((turns + 3) % 4) as QuarterTurns;
}

/** The photo's size after `turns`. */
export function turnedSize(
  width: number,
  height: number,
  turns: QuarterTurns,
): { width: number; height: number } {
  return turns % 2 ? { width: height, height: width } : { width, height };
}

/**
 * The frame ratio (width / height) for an aspect choice. Fixed ratios follow
 * the photo's orientation, so a portrait photo gets a portrait 3:4 frame.
 */
export function aspectRatio(
  aspect: PhotoAspect,
  width: number,
  height: number,
): number {
  const portrait = height > width;
  switch (aspect) {
    case 'square':
      return 1;
    case 'classic':
      return portrait ? 3 / 4 : 4 / 3;
    case 'wide':
      return portrait ? 9 / 16 : 16 / 9;
    default:
      return width / height;
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

/**
 * Map the frame over the transformed (already turned) photo to pixels of the
 * turned photo. Layout boxes come from the rendered elements, so the result is
 * independent of how the gesture engine expresses pan and zoom.
 */
export function editBoxFromLayout(
  image: LayoutBox,
  frame: LayoutBox,
  turnedWidth: number,
  turnedHeight: number,
): PhotoEditBox {
  if (!(image.width > 0) || !(frame.width > 0) || !(frame.height > 0))
    return { x: 0, y: 0, width: turnedWidth, height: turnedHeight };
  const scale = turnedWidth / image.width;
  const width = Math.min(frame.width * scale, turnedWidth);
  const height = Math.min(frame.height * scale, turnedHeight);
  return {
    x: clamp((frame.left - image.left) * scale, 0, turnedWidth - width),
    y: clamp((frame.top - image.top) * scale, 0, turnedHeight - height),
    width,
    height,
  };
}

/** Whether the edit changes anything compared with the original photo. */
export function isUnchangedEdit(
  box: PhotoEditBox,
  turns: QuarterTurns,
  width: number,
  height: number,
): boolean {
  return (
    turns === 0 &&
    Math.round(box.x) === 0 &&
    Math.round(box.y) === 0 &&
    Math.round(box.width) >= width - 1 &&
    Math.round(box.height) >= height - 1
  );
}

function editedFileName(originalName: string): string {
  const base = originalName.replace(/\.[^./\\]*$/, '').trim() || 'photo';
  return `${base}.jpg`;
}

async function originalExif(file: File): Promise<Uint8Array | null> {
  if (file.type !== 'image/jpeg') return null;
  try {
    return readExifSegment(new Uint8Array(await file.arrayBuffer()));
  } catch {
    return null;
  }
}

/** Render the edited photo as the file to upload. */
export async function renderEditedPhoto(
  source: PhotoCropSource,
  turns: QuarterTurns,
  box: PhotoEditBox,
): Promise<File> {
  const scale = Math.min(
    1,
    EDITED_PHOTO_MAX_EDGE / Math.max(box.width, box.height),
  );
  const width = Math.max(1, Math.round(box.width * scale));
  const height = Math.max(1, Math.round(box.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable.');
  context.fillStyle = EDITED_PHOTO_BACKDROP;
  context.fillRect(0, 0, width, height);
  context.imageSmoothingQuality = 'high';
  context.scale(scale, scale);
  context.translate(-box.x, -box.y);
  // Draw the original into the turned coordinate space.
  const { width: w, height: h } = source;
  if (turns === 1) context.translate(h, 0);
  else if (turns === 2) context.translate(w, h);
  else if (turns === 3) context.translate(0, w);
  context.rotate((turns * Math.PI) / 2);
  context.drawImage(source.image, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, EDITED_PHOTO_TYPE, EDITED_PHOTO_QUALITY),
  );
  // Release the bitmap memory promptly on memory-constrained WebViews.
  canvas.width = 0;
  canvas.height = 0;
  if (!blob?.size) throw new Error('The edited photo could not be encoded.');
  const exif = await originalExif(source.file);
  const upright = exif ? uprightExifSegment(exif, width, height) : null;
  const bytes = upright
    ? insertExifSegment(new Uint8Array(await blob.arrayBuffer()), upright)
    : null;
  // The bytes are a fresh, non-shared copy.
  return new File(
    [bytes ? (bytes as Uint8Array<ArrayBuffer>) : blob],
    editedFileName(source.file.name),
    {
      type: EDITED_PHOTO_TYPE,
      lastModified: source.file.lastModified,
    },
  );
}
