/**
 * Turns a garden drawing (a bouquet, the garden of the year) into a PNG that
 * the existing Memory/media path can store (#1907 H3, PR 3). The drawing uses
 * CSS variables for Light and Dark, which a standalone image cannot resolve,
 * so the computed colours are written onto a copy before it is rasterized.
 * Nothing leaves the device until the person taps to save it in Momente.
 */

import { flattenGardenScene } from './gardenSceneLayers';

const PAINT = [
  'fill',
  'stroke',
  'opacity',
  'fill-opacity',
  'stroke-opacity',
  'stop-color',
  'stop-opacity',
  'stroke-width',
  'font-family',
  'font-size',
  'font-weight',
  'visibility',
  'display',
] as const;

/** A self-contained SVG string with every paint value resolved. */
export function inlineSvg(
  source: SVGSVGElement,
  width: number,
  height: number,
  background?: string,
): string {
  // The garden scene is several stacked bands; its image joins them all.
  const copy = flattenGardenScene(source, (band, bandCopy) => {
    const originals = [band, ...band.querySelectorAll('*')];
    const copies = [bandCopy, ...bandCopy.querySelectorAll('*')];
    originals.forEach((element, index) => {
      const target = copies[index] as SVGElement;
      const computed = window.getComputedStyle(element);
      const declarations = PAINT.map((name) => {
        const value = computed.getPropertyValue(name);
        return value ? `${name}:${value}` : '';
      })
        .filter(Boolean)
        .join(';');
      target.setAttribute('style', declarations);
      target.removeAttribute('class');
    });
  });
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  copy.setAttribute('width', String(width));
  copy.setAttribute('height', String(height));
  copy.removeAttribute('aria-label');
  if (background) {
    copy.setAttribute(
      'style',
      `${copy.getAttribute('style') ?? ''};background:${background}`,
    );
  }
  return new XMLSerializer().serializeToString(copy);
}

/** Rasterizes a drawing into a PNG blob at the given pixel size. */
export async function renderSvgPng(
  source: SVGSVGElement,
  width: number,
  height: number,
  background: string,
): Promise<Blob> {
  const markup = inlineSvg(source, width, height);
  const url = URL.createObjectURL(
    new Blob([markup], { type: 'image/svg+xml' }),
  );
  try {
    const image = new Image();
    image.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('The drawing could not be read.'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The drawing could not be painted.');
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(new Error('The drawing could not be saved.')),
        'image/png',
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
