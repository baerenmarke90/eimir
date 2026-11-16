/**
 * Real orientation of a photo, from the dimensions the server already sends.
 *
 * A Polaroid must show the whole picture, so its frame follows the photo
 * instead of a fixed layout rhythm. Without dimensions the frame falls back to
 * landscape, which is the most common camera shape.
 */
export type PhotoShape = 'portrait' | 'landscape' | 'square';

export function photoShape(
  attachment:
    | { width?: number | null; height?: number | null }
    | null
    | undefined,
): PhotoShape {
  const width = attachment?.width;
  const height = attachment?.height;
  if (!width || !height || width <= 0 || height <= 0) return 'landscape';
  const ratio = width / height;
  if (ratio < 0.9) return 'portrait';
  if (ratio > 1.1) return 'landscape';
  return 'square';
}
