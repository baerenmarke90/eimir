/**
 * Carry a photo's EXIF block over to an edited JPEG (#1907 G1).
 *
 * A canvas export carries no metadata. Memory, Plan and HeartMoment photos are
 * uploaded with preserved metadata so the server can read the capture date and
 * the selected-photo place (#1459); an edit must not lose them. The original
 * APP1 Exif segment is copied byte for byte with three bounded patches:
 *
 * - Orientation becomes 1 (upright): the edited pixels are already upright, so
 *   a kept rotation tag would turn the photo a second time.
 * - PixelXDimension/PixelYDimension describe the edited size when present.
 * - The IFD1 thumbnail link is cleared, so viewers do not show the old framing.
 *
 * Nothing else is parsed or rewritten; unknown segments of the original are
 * never copied.
 */

const SOI = 0xd8;
const APP0 = 0xe0;
const APP1 = 0xe1;
const SOS = 0xda;
const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"
const TAG_ORIENTATION = 0x0112;
const TAG_EXIF_IFD = 0x8769;
const TAG_PIXEL_X = 0xa002;
const TAG_PIXEL_Y = 0xa003;
const TYPE_SHORT = 3;
const TYPE_LONG = 4;

interface Segment {
  marker: number;
  /** Offset of the 0xFF marker byte. */
  start: number;
  /** Offset after the segment. */
  end: number;
}

function segments(bytes: Uint8Array): Segment[] {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== SOI) return [];
  const found: Segment[] = [];
  let offset = 2;
  while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1];
    if (marker === SOS) break;
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2 || offset + 2 + length > bytes.length) break;
    found.push({ marker, start: offset, end: offset + 2 + length });
    offset += 2 + length;
  }
  return found;
}

function isExifSegment(bytes: Uint8Array, segment: Segment): boolean {
  if (segment.marker !== APP1) return false;
  const header = segment.start + 4;
  return EXIF_HEADER.every((value, index) => bytes[header + index] === value);
}

/** The original APP1 Exif segment (marker included), or `null`. */
export function readExifSegment(bytes: Uint8Array): Uint8Array | null {
  const segment = segments(bytes).find((entry) => isExifSegment(bytes, entry));
  return segment ? bytes.slice(segment.start, segment.end) : null;
}

class TiffView {
  readonly little: boolean;
  constructor(
    private readonly view: DataView,
    private readonly base: number,
  ) {
    this.little = view.getUint16(base) === 0x4949;
  }
  inRange(offset: number, size: number): boolean {
    return offset >= 0 && this.base + offset + size <= this.view.byteLength;
  }
  u16(offset: number): number {
    return this.view.getUint16(this.base + offset, this.little);
  }
  u32(offset: number): number {
    return this.view.getUint32(this.base + offset, this.little);
  }
  setU16(offset: number, value: number) {
    this.view.setUint16(this.base + offset, value, this.little);
  }
  setU32(offset: number, value: number) {
    this.view.setUint32(this.base + offset, value, this.little);
  }
}

/** Visit the entries of one IFD; returns the offset of its next-IFD link. */
function visitIfd(
  tiff: TiffView,
  offset: number,
  visit: (tag: number, type: number, valueOffset: number) => void,
): number | null {
  if (!tiff.inRange(offset, 2)) return null;
  const count = tiff.u16(offset);
  const linkOffset = offset + 2 + count * 12;
  if (!tiff.inRange(linkOffset, 4)) return null;
  for (let index = 0; index < count; index += 1) {
    const entry = offset + 2 + index * 12;
    visit(tiff.u16(entry), tiff.u16(entry + 2), entry + 8);
  }
  return linkOffset;
}

function setDimension(
  tiff: TiffView,
  type: number,
  valueOffset: number,
  value: number,
) {
  if (type === TYPE_SHORT && value <= 0xffff) tiff.setU16(valueOffset, value);
  else if (type === TYPE_LONG) tiff.setU32(valueOffset, value);
}

/**
 * A copy of `segment` describing an upright photo of `width` x `height`.
 * Returns `null` when the block is not a readable TIFF structure.
 */
export function uprightExifSegment(
  segment: Uint8Array,
  width: number,
  height: number,
): Uint8Array | null {
  const copy = segment.slice();
  const view = new DataView(copy.buffer, copy.byteOffset, copy.byteLength);
  const base = 4 + EXIF_HEADER.length;
  if (copy.byteLength < base + 8) return null;
  const order = view.getUint16(base);
  if (order !== 0x4949 && order !== 0x4d4d) return null;
  const tiff = new TiffView(view, base);
  if (tiff.u16(2) !== 42) return null;
  const ifd0 = tiff.u32(4);
  const pointers = { exifIfd: -1 };
  const ifd0Link = visitIfd(tiff, ifd0, (tag, type, valueOffset) => {
    if (tag === TAG_ORIENTATION && type === TYPE_SHORT)
      tiff.setU16(valueOffset, 1);
    else if (tag === TAG_EXIF_IFD && type === TYPE_LONG)
      pointers.exifIfd = tiff.u32(valueOffset);
  });
  if (ifd0Link === null) return null;
  // Drop the link to the embedded thumbnail (IFD1) with the old framing.
  tiff.setU32(ifd0Link, 0);
  if (pointers.exifIfd >= 0)
    visitIfd(tiff, pointers.exifIfd, (tag, type, valueOffset) => {
      if (tag === TAG_PIXEL_X) setDimension(tiff, type, valueOffset, width);
      else if (tag === TAG_PIXEL_Y)
        setDimension(tiff, type, valueOffset, height);
    });
  return copy;
}

/**
 * Insert `exif` into an encoded JPEG after its JFIF header, replacing any
 * Exif block it already has. Returns the input unchanged when it is not JPEG.
 */
export function insertExifSegment(
  jpeg: Uint8Array,
  exif: Uint8Array,
): Uint8Array {
  const found = segments(jpeg);
  if (!found.length && !(jpeg[0] === 0xff && jpeg[1] === SOI)) return jpeg;
  const kept = found.filter((segment) => !isExifSegment(jpeg, segment));
  const jfif = kept[0]?.marker === APP0 ? kept[0] : null;
  const insertAt = jfif ? jfif.end : 2;
  const parts: Uint8Array[] = [jpeg.subarray(0, insertAt), exif];
  let cursor = insertAt;
  for (const segment of found) {
    if (segment.start < insertAt) continue;
    if (isExifSegment(jpeg, segment)) {
      parts.push(jpeg.subarray(cursor, segment.start));
      cursor = segment.end;
    }
  }
  parts.push(jpeg.subarray(cursor));
  const size = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}
