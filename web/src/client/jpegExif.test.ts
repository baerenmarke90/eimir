import { describe, expect, it } from 'vitest';
import {
  insertExifSegment,
  readExifSegment,
  uprightExifSegment,
} from './jpegExif';

const CAPTURED_AT = '2026:08:14 18:42:07';

/**
 * A small Exif APP1 segment: IFD0 with Orientation 6 and the Exif IFD link,
 * an IFD1 link, an Exif IFD with PixelX (LONG) and PixelY (SHORT), and the
 * capture date as trailing payload that must survive unchanged.
 */
function exifSegment(little = true): Uint8Array {
  const tiff = new DataView(new ArrayBuffer(68 + CAPTURED_AT.length + 1));
  const u16 = (at: number, value: number) => tiff.setUint16(at, value, little);
  const u32 = (at: number, value: number) => tiff.setUint32(at, value, little);
  tiff.setUint16(0, little ? 0x4949 : 0x4d4d);
  u16(2, 42);
  u32(4, 8);
  // IFD0
  u16(8, 2);
  u16(10, 0x0112);
  u16(12, 3);
  u32(14, 1);
  u16(18, 6);
  u16(22, 0x8769);
  u16(24, 4);
  u32(26, 1);
  u32(30, 38);
  u32(34, 0x1234);
  // Exif IFD
  u16(38, 2);
  u16(40, 0xa002);
  u16(42, 4);
  u32(44, 1);
  u32(48, 4000);
  u16(52, 0xa003);
  u16(54, 3);
  u32(56, 1);
  u16(60, 3000);
  u32(64, 0);
  for (let index = 0; index < CAPTURED_AT.length; index += 1)
    tiff.setUint8(68 + index, CAPTURED_AT.charCodeAt(index));
  const body = new Uint8Array(tiff.buffer);
  const length = 2 + 6 + body.length;
  return Uint8Array.from([
    0xff,
    0xe1,
    length >> 8,
    length & 0xff,
    ...[0x45, 0x78, 0x69, 0x66, 0, 0],
    ...body,
  ]);
}

const JFIF = Uint8Array.from([
  0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00,
  0x01, 0x00, 0x01, 0x00, 0x00,
]);
const SCAN = Uint8Array.from([0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0xd9]);

function jpeg(...segments: Uint8Array[]): Uint8Array {
  return Uint8Array.from([0xff, 0xd8, ...segments.flatMap((s) => [...s])]);
}

function tiffOf(segment: Uint8Array, little = true) {
  const view = new DataView(segment.buffer, segment.byteOffset + 10);
  return {
    u16: (at: number) => view.getUint16(at, little),
    u32: (at: number) => view.getUint32(at, little),
  };
}

function text(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes);
}

describe('readExifSegment', () => {
  it('finds the Exif block after the JFIF header', () => {
    const exif = exifSegment();
    expect(readExifSegment(jpeg(JFIF, exif, SCAN))).toEqual(exif);
  });

  it('returns nothing for a JPEG without Exif or for other files', () => {
    expect(readExifSegment(jpeg(JFIF, SCAN))).toBeNull();
    expect(readExifSegment(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toBe(
      null,
    );
  });
});

describe('uprightExifSegment', () => {
  for (const little of [true, false]) {
    it(`keeps the metadata, marks the photo upright and describes its new size (${little ? 'little' : 'big'} endian)`, () => {
      const original = exifSegment(little);
      const upright = uprightExifSegment(original, 1200, 900);
      if (!upright) throw new Error('Expected a readable Exif block.');
      const tiff = tiffOf(upright, little);
      expect(tiff.u16(18)).toBe(1);
      expect(tiff.u32(34)).toBe(0);
      expect(tiff.u32(48)).toBe(1200);
      expect(tiff.u16(60)).toBe(900);
      expect(text(upright)).toContain(CAPTURED_AT);
      expect(upright.length).toBe(original.length);
      // The original block is copied, never changed.
      expect(tiffOf(original, little).u16(18)).toBe(6);
    });
  }

  it('leaves a SHORT dimension alone when the new size does not fit', () => {
    const upright = uprightExifSegment(exifSegment(), 70000, 70000);
    if (!upright) throw new Error('Expected a readable Exif block.');
    expect(tiffOf(upright).u16(60)).toBe(3000);
    expect(tiffOf(upright).u32(48)).toBe(70000);
  });

  it('rejects a block that is not a TIFF structure', () => {
    const broken = exifSegment();
    broken[10] = 0x00;
    expect(uprightExifSegment(broken, 10, 10)).toBeNull();
    expect(uprightExifSegment(broken.slice(0, 12), 10, 10)).toBeNull();
  });
});

describe('insertExifSegment', () => {
  it('places the Exif block right after the JFIF header', () => {
    const exif = exifSegment();
    const result = insertExifSegment(jpeg(JFIF, SCAN), exif);
    expect(result).toEqual(jpeg(JFIF, exif, SCAN));
  });

  it('replaces an Exif block the encoder already wrote', () => {
    const stale = exifSegment();
    const fresh = uprightExifSegment(exifSegment(), 10, 10);
    if (!fresh) throw new Error('Expected a readable Exif block.');
    const result = insertExifSegment(jpeg(JFIF, stale, SCAN), fresh);
    expect(result).toEqual(jpeg(JFIF, fresh, SCAN));
  });

  it('inserts after the start marker when there is no JFIF header', () => {
    const exif = exifSegment();
    expect(insertExifSegment(jpeg(SCAN), exif)).toEqual(jpeg(exif, SCAN));
  });

  it('returns anything that is not a JPEG unchanged', () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);
    expect(insertExifSegment(png, exifSegment())).toBe(png);
  });
});
