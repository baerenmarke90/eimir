import type { ObjectUrlSource } from './objectUrlResource';

/**
 * The stored original of a saved photo as a File for the edit step
 * (#1907 G1). A JPEG stored with preserved metadata carries its EXIF, which
 * the edit step copies onto the edited photo. The caller's object URL lease
 * is released once the bytes are read.
 */
export async function savedPhotoFile(
  source: ObjectUrlSource,
  name: string,
): Promise<File> {
  let blob: Blob;
  if (source instanceof Blob) {
    blob = source;
  } else {
    const url = typeof source === 'string' ? source : source.url;
    try {
      blob = await (await fetch(url)).blob();
    } finally {
      if (typeof source !== 'string') source.dispose();
    }
  }
  return new File([blob], name, { type: blob.type || 'image/jpeg' });
}
