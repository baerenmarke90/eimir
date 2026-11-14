/**
 * Device-side square crop for avatar-shaped uploads (#1854).
 *
 * The chosen section is rendered before upload, so every existing avatar
 * consumer shows it without a server-side crop contract. The browser decodes
 * the photo with its EXIF orientation applied; the export carries no metadata.
 */

/** Longest edge of the uploaded square; avatars are delivered at 512 px. */
export const CROPPED_PHOTO_MAX_EDGE = 1024;
const CROPPED_PHOTO_TYPE = 'image/jpeg';
const CROPPED_PHOTO_QUALITY = 0.9;
// JPEG has no alpha channel; transparent pixels would otherwise turn black.
const CROPPED_PHOTO_BACKDROP = '#ffffff';

export interface PhotoCropSource {
  /** The selected file, uploaded unchanged when cropping is unavailable. */
  file: File;
  image: HTMLImageElement;
  url: string;
  /** Oriented pixel size, as the browser presents the photo. */
  width: number;
  height: number;
  release(): void;
}

export interface PhotoCropRect {
  x: number;
  y: number;
  size: number;
}

interface LayoutBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

/**
 * Map the square frame laid over the transformed photo to source pixels.
 * Layout boxes come from the rendered elements, so the result is independent
 * of how the gesture engine expresses pan and zoom.
 */
export function cropRectFromLayout(
  image: LayoutBox,
  frame: LayoutBox,
  sourceWidth: number,
  sourceHeight: number,
): PhotoCropRect {
  if (!(image.width > 0) || !(image.height > 0) || !(frame.width > 0)) {
    const size = Math.min(sourceWidth, sourceHeight);
    return {
      x: (sourceWidth - size) / 2,
      y: (sourceHeight - size) / 2,
      size,
    };
  }
  const scale = sourceWidth / image.width;
  const size = Math.min(frame.width * scale, sourceWidth, sourceHeight);
  return {
    x: clamp((frame.left - image.left) * scale, 0, sourceWidth - size),
    y: clamp((frame.top - image.top) * scale, 0, sourceHeight - size),
    size,
  };
}

/**
 * Decode a selected photo for the crop step. Resolves to `null` when this
 * device cannot decode it (for example HEIC without platform support); the
 * caller then uploads the file unchanged.
 */
export async function loadPhotoCropSource(
  file: File,
): Promise<PhotoCropSource | null> {
  if (
    typeof Image === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  )
    return null;
  let url: string;
  try {
    url = URL.createObjectURL(file);
  } catch {
    return null;
  }
  const image = new Image();
  image.decoding = 'async';
  image.src = url;
  try {
    await image.decode();
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
  if (!image.naturalWidth || !image.naturalHeight) {
    URL.revokeObjectURL(url);
    return null;
  }
  let released = false;
  return {
    file,
    image,
    url,
    width: image.naturalWidth,
    height: image.naturalHeight,
    release() {
      if (released) return;
      released = true;
      URL.revokeObjectURL(url);
    },
  };
}

function croppedFileName(originalName: string): string {
  const base = originalName.replace(/\.[^./\\]*$/, '').trim() || 'photo';
  return `${base}.jpg`;
}

/** Render the chosen square section as the file to upload. */
export async function renderCroppedPhoto(
  source: PhotoCropSource,
  rect: PhotoCropRect,
): Promise<File> {
  const edge = Math.max(
    1,
    Math.min(CROPPED_PHOTO_MAX_EDGE, Math.round(rect.size)),
  );
  const canvas = document.createElement('canvas');
  canvas.width = edge;
  canvas.height = edge;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable.');
  context.fillStyle = CROPPED_PHOTO_BACKDROP;
  context.fillRect(0, 0, edge, edge);
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    source.image,
    rect.x,
    rect.y,
    rect.size,
    rect.size,
    0,
    0,
    edge,
    edge,
  );
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, CROPPED_PHOTO_TYPE, CROPPED_PHOTO_QUALITY),
  );
  // Release the bitmap memory promptly on memory-constrained WebViews.
  canvas.width = 0;
  canvas.height = 0;
  if (!blob?.size) throw new Error('The cropped photo could not be encoded.');
  return new File([blob], croppedFileName(source.file.name), {
    type: CROPPED_PHOTO_TYPE,
    lastModified: source.file.lastModified,
  });
}
