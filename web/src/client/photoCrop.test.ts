// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CROPPED_PHOTO_MAX_EDGE,
  cropRectFromLayout,
  loadPhotoCropSource,
  type PhotoCropSource,
  renderCroppedPhoto,
} from './photoCrop';

const frame = { left: 100, top: 50, width: 300, height: 300 };

describe('cropRectFromLayout', () => {
  it('maps a centred landscape photo to its middle square', () => {
    // 4000 x 2000 source shown 600 x 300, centred over the 300 px frame.
    expect(
      cropRectFromLayout(
        { left: -50, top: 50, width: 600, height: 300 },
        frame,
        4000,
        2000,
      ),
    ).toEqual({ x: 1000, y: 0, size: 2000 });
  });

  it('follows pan and zoom of the rendered photo', () => {
    // Zoomed 2x (1200 x 600) and moved so the frame sits over the left part.
    const rect = cropRectFromLayout(
      { left: 40, top: -100, width: 1200, height: 600 },
      frame,
      4000,
      2000,
    );
    expect(rect.size).toBeCloseTo(1000);
    expect(rect.x).toBeCloseTo(200);
    expect(rect.y).toBeCloseTo(500);
  });

  it('never leaves the source, even with sub-pixel layout drift', () => {
    const rect = cropRectFromLayout(
      { left: 100.4, top: 49.7, width: 299.6, height: 599.2 },
      frame,
      1000,
      2000,
    );
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.size).toBeLessThanOrEqual(1000);
    expect(rect.y + rect.size).toBeLessThanOrEqual(2000);
  });

  it('falls back to the centred square without measurable layout', () => {
    expect(
      cropRectFromLayout(
        { left: 0, top: 0, width: 0, height: 0 },
        frame,
        900,
        1500,
      ),
    ).toEqual({ x: 0, y: 300, size: 900 });
  });
});

describe('loadPhotoCropSource', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubImage(decode: () => Promise<void>, width = 0, height = 0) {
    vi.stubGlobal(
      'Image',
      class {
        decoding = '';
        src = '';
        naturalWidth = width;
        naturalHeight = height;
        decode = decode;
      },
    );
    const revoke = vi.fn();
    vi.stubGlobal('URL', {
      createObjectURL: () => 'blob:photo',
      revokeObjectURL: revoke,
    });
    return revoke;
  }

  it('reports an undecodable photo as unavailable and frees its URL', async () => {
    const revoke = stubImage(() => Promise.reject(new Error('unsupported')));
    const file = new File(['heic'], 'portrait.heic', { type: 'image/heic' });
    await expect(loadPhotoCropSource(file)).resolves.toBeNull();
    expect(revoke).toHaveBeenCalledWith('blob:photo');
  });

  it('exposes the oriented size and releases the URL exactly once', async () => {
    const revoke = stubImage(() => Promise.resolve(), 3000, 4000);
    const file = new File(['jpeg'], 'portrait.jpg', { type: 'image/jpeg' });
    const source = await loadPhotoCropSource(file);
    expect(source).toMatchObject({ file, width: 3000, height: 4000 });
    source?.release();
    source?.release();
    expect(revoke).toHaveBeenCalledTimes(1);
  });
});

describe('renderCroppedPhoto', () => {
  afterEach(() => vi.restoreAllMocks());

  function stubCanvas(blob: Blob | null) {
    const drawImage = vi.fn();
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        fillRect: vi.fn(),
        drawImage,
        fillStyle: '',
        imageSmoothingQuality: '',
      }),
      toBlob: (done: (result: Blob | null) => void) => done(blob),
    };
    const sizes: number[] = [];
    Object.defineProperty(canvas, 'width', {
      set: (value: number) => sizes.push(value),
      get: () => sizes.at(-1) ?? 0,
    });
    vi.spyOn(document, 'createElement').mockReturnValue(
      canvas as unknown as HTMLCanvasElement,
    );
    return { drawImage, sizes };
  }

  const source = {
    file: new File(['x'], 'us.at.the.lake.HEIC', {
      type: 'image/heic',
      lastModified: 42,
    }),
    image: {} as HTMLImageElement,
    url: 'blob:photo',
    width: 4000,
    height: 3000,
    release() {},
  } satisfies PhotoCropSource;

  it('renders the section as a bounded JPEG named after the original', async () => {
    const { drawImage, sizes } = stubCanvas(
      new Blob(['jpeg'], { type: 'image/jpeg' }),
    );
    const file = await renderCroppedPhoto(source, { x: 500, y: 0, size: 3000 });
    expect(file.name).toBe('us.at.the.lake.jpg');
    expect(file.type).toBe('image/jpeg');
    expect(file.lastModified).toBe(42);
    expect(sizes[0]).toBe(CROPPED_PHOTO_MAX_EDGE);
    expect(drawImage).toHaveBeenCalledWith(
      source.image,
      500,
      0,
      3000,
      3000,
      0,
      0,
      CROPPED_PHOTO_MAX_EDGE,
      CROPPED_PHOTO_MAX_EDGE,
    );
  });

  it('does not upscale a small section', async () => {
    const { sizes } = stubCanvas(new Blob(['jpeg'], { type: 'image/jpeg' }));
    await renderCroppedPhoto(source, { x: 0, y: 0, size: 240.4 });
    expect(sizes[0]).toBe(240);
  });

  it('fails when the browser cannot encode the section', async () => {
    stubCanvas(null);
    await expect(
      renderCroppedPhoto(source, { x: 0, y: 0, size: 100 }),
    ).rejects.toThrow();
  });
});
