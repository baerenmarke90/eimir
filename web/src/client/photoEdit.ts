/**
 * Device-side photo editing before upload (#1907 G1): turn, free crop, pen
 * drawing and text, as in a phone's photo app but limited to these four.
 *
 * The edit is applied before upload, like the avatar crop (#1854): every
 * existing render site shows the result without a server-side edit contract.
 * Unlike the avatar crop, the edited photo keeps the original's EXIF metadata
 * (capture date, place, camera) so date and place enrichment keep working; see
 * `jpegExif.ts`. The photo on the device is never modified.
 *
 * All marks live in coordinates normalized to the turned photo (0..1), and
 * sizes are fractions of the photo's shorter edge, which a quarter turn keeps.
 * One renderer draws the preview and the uploaded file, so what the user sees
 * is what is saved.
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
/** Pen width as a fraction of the photo's shorter edge. */
export const PEN_WIDTH = 0.012;
/** Text size as a fraction of the photo's shorter edge. */
export const TEXT_SIZE = 0.075;
const TEXT_WEIGHT = 700;
/** Keeps light and dark marks readable on any photo. */
const MARK_SHADOW = 'rgb(0 0 0 / 35%)';

/** Clockwise quarter turns. */
export type QuarterTurns = 0 | 1 | 2 | 3;

export interface NormalizedPoint {
  x: number;
  y: number;
}

export interface NormalizedBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PenStroke {
  color: string;
  points: NormalizedPoint[];
}

export interface TextMark {
  id: string;
  text: string;
  color: string;
  /** Centre of the text. */
  x: number;
  y: number;
}

export interface PhotoEdit {
  turns: QuarterTurns;
  crop: NormalizedBox;
  strokes: PenStroke[];
  texts: TextMark[];
}

export const FULL_BOX: NormalizedBox = { x: 0, y: 0, width: 1, height: 1 };

export function emptyEdit(): PhotoEdit {
  return { turns: 0, crop: FULL_BOX, strokes: [], texts: [] };
}

/** The photo's size after `turns`. */
export function turnedSize(
  width: number,
  height: number,
  turns: QuarterTurns,
): { width: number; height: number } {
  return turns % 2 ? { width: height, height: width } : { width, height };
}

function turnPointLeft(point: NormalizedPoint): NormalizedPoint {
  return { x: point.y, y: 1 - point.x };
}

/**
 * Turn the photo a quarter counter-clockwise, as phone photo apps do; the
 * crop, the drawing and the texts turn with it.
 */
export function turnEditLeft(edit: PhotoEdit): PhotoEdit {
  const { crop } = edit;
  return {
    turns: ((edit.turns + 3) % 4) as QuarterTurns,
    crop: {
      x: crop.y,
      y: 1 - (crop.x + crop.width),
      width: crop.height,
      height: crop.width,
    },
    strokes: edit.strokes.map((stroke) => ({
      ...stroke,
      points: stroke.points.map(turnPointLeft),
    })),
    texts: edit.texts.map((text) => ({ ...text, ...turnPointLeft(text) })),
  };
}

function isFullBox(box: NormalizedBox): boolean {
  const epsilon = 0.002;
  return (
    box.x < epsilon &&
    box.y < epsilon &&
    box.width > 1 - epsilon &&
    box.height > 1 - epsilon
  );
}

/** Whether the edit changes anything compared with the original photo. */
export function isUnchangedEdit(edit: PhotoEdit): boolean {
  return (
    edit.turns === 0 &&
    isFullBox(edit.crop) &&
    edit.strokes.length === 0 &&
    edit.texts.every((text) => !text.text.trim())
  );
}

/** Map a point inside a view of `box` (0..1 of the view) to the photo. */
export function photoPoint(
  box: NormalizedBox,
  viewX: number,
  viewY: number,
): NormalizedPoint {
  return {
    x: Math.min(1, Math.max(0, box.x + viewX * box.width)),
    y: Math.min(1, Math.max(0, box.y + viewY * box.height)),
  };
}

let resolvedTextFamily: string | null = null;
/** The product UI font, so text marks match eimir. typography. */
function textFamily(): string {
  if (resolvedTextFamily) return resolvedTextFamily;
  const family =
    typeof document === 'undefined'
      ? ''
      : getComputedStyle(document.documentElement)
          .getPropertyValue('--font-ui')
          .trim();
  resolvedTextFamily = family || 'system-ui, sans-serif';
  return resolvedTextFamily;
}

export function textFont(unit: number): string {
  return `${TEXT_WEIGHT} ${Math.max(1, TEXT_SIZE * unit)}px ${textFamily()}`;
}

/**
 * The turned photo drawn for a view of `box` into `width` x `height` pixels.
 * Used as the cached base layer of the preview and for the upload.
 */
export function drawPhoto(
  context: CanvasRenderingContext2D,
  source: Pick<PhotoCropSource, 'image' | 'width' | 'height'>,
  turns: QuarterTurns,
  box: NormalizedBox,
  width: number,
  height: number,
) {
  const turned = turnedSize(source.width, source.height, turns);
  context.save();
  context.fillStyle = EDITED_PHOTO_BACKDROP;
  context.fillRect(0, 0, width, height);
  context.imageSmoothingQuality = 'high';
  context.scale(
    width / (box.width * turned.width),
    height / (box.height * turned.height),
  );
  context.translate(-box.x * turned.width, -box.y * turned.height);
  const { width: w, height: h } = source;
  if (turns === 1) context.translate(h, 0);
  else if (turns === 2) context.translate(w, h);
  else if (turns === 3) context.translate(0, w);
  context.rotate((turns * Math.PI) / 2);
  context.drawImage(source.image, 0, 0, w, h);
  context.restore();
}

/** Strokes and texts of `edit` for the same view as `drawPhoto`. */
export function drawMarks(
  context: CanvasRenderingContext2D,
  edit: Pick<PhotoEdit, 'strokes' | 'texts'>,
  turned: { width: number; height: number },
  box: NormalizedBox,
  width: number,
  height: number,
  options: { hiddenTextId?: string } = {},
) {
  const scaleX = width / (box.width * turned.width);
  const scaleY = height / (box.height * turned.height);
  // The photo's shorter edge in view pixels: the unit of pen and text size.
  const unit = Math.min(turned.width, turned.height) * scaleX;
  const toView = (point: NormalizedPoint) => ({
    x: (point.x - box.x) * turned.width * scaleX,
    y: (point.y - box.y) * turned.height * scaleY,
  });
  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.shadowColor = MARK_SHADOW;
  context.shadowBlur = unit * 0.006;
  for (const stroke of edit.strokes) {
    if (!stroke.points.length) continue;
    context.strokeStyle = stroke.color;
    context.lineWidth = Math.max(1, PEN_WIDTH * unit);
    context.beginPath();
    const [first, ...rest] = stroke.points.map(toView);
    context.moveTo(first.x, first.y);
    // A dot for a single tap; otherwise a smoothed path through midpoints.
    if (!rest.length) context.lineTo(first.x + 0.01, first.y);
    let previous = first;
    for (const point of rest) {
      context.quadraticCurveTo(
        previous.x,
        previous.y,
        (previous.x + point.x) / 2,
        (previous.y + point.y) / 2,
      );
      previous = point;
    }
    context.lineTo(previous.x, previous.y);
    context.stroke();
  }
  context.font = textFont(unit);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.shadowBlur = unit * 0.012;
  for (const text of edit.texts) {
    if (text.id === options.hiddenTextId || !text.text.trim()) continue;
    const at = toView(text);
    context.fillStyle = text.color;
    context.fillText(text.text, at.x, at.y);
  }
  context.restore();
}

/** The text mark under a view point, topmost first. */
export function textAt(
  context: CanvasRenderingContext2D,
  texts: readonly TextMark[],
  turned: { width: number; height: number },
  box: NormalizedBox,
  viewWidth: number,
  point: NormalizedPoint,
): TextMark | null {
  const scale = viewWidth / (box.width * turned.width);
  const unit = Math.min(turned.width, turned.height) * scale;
  context.save();
  context.font = textFont(unit);
  try {
    for (const text of [...texts].reverse()) {
      if (!text.text.trim()) continue;
      const halfWidth =
        context.measureText(text.text).width / 2 / (turned.width * scale);
      const halfHeight = (TEXT_SIZE * unit * 0.7) / (turned.height * scale);
      if (
        Math.abs(point.x - text.x) <= halfWidth &&
        Math.abs(point.y - text.y) <= halfHeight
      )
        return text;
    }
    return null;
  } finally {
    context.restore();
  }
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
  edit: PhotoEdit,
): Promise<File> {
  const turned = turnedSize(source.width, source.height, edit.turns);
  const cropWidth = edit.crop.width * turned.width;
  const cropHeight = edit.crop.height * turned.height;
  const scale = Math.min(
    1,
    EDITED_PHOTO_MAX_EDGE / Math.max(cropWidth, cropHeight),
  );
  const width = Math.max(1, Math.round(cropWidth * scale));
  const height = Math.max(1, Math.round(cropHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable.');
  drawPhoto(context, source, edit.turns, edit.crop, width, height);
  drawMarks(context, edit, turned, edit.crop, width, height);
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
