/*
 * The garden scene is drawn as stacked SVG depth bands inside one
 * `.garden-scene-stack` (#2063): sky, sky life, back hill, back, front hill,
 * meadow, tint, front, and on top the band with the scene's name and tap
 * targets. All bands share one viewBox and box, so together they read as the
 * single picture the scene used to be, while a moving tuft re-rasters only
 * its own band on the device.
 */

const STACK = '.garden-scene-stack';

/** Every band of the scene that `svg` belongs to, bottom first. */
export function gardenSceneBands(svg: SVGSVGElement): SVGSVGElement[] {
  const stack = svg.closest(STACK);
  if (!stack) return [svg];
  return Array.from(
    stack.querySelectorAll<SVGSVGElement>(':scope > svg.garden-scene'),
  );
}

/** Finds a drawing anywhere in the scene, whichever band holds it. */
export function sceneElement(
  svg: SVGSVGElement | null | undefined,
  selector: string,
): Element | null {
  if (!svg) return null;
  return (svg.closest(STACK) ?? svg).querySelector(selector);
}

/**
 * One standalone copy of the whole scene for an image: each band's clone is
 * prepared by `prepare` (which receives the live original), then the bands'
 * contents are joined bottom first into the copy of the lowest band.
 */
export function flattenGardenScene(
  svg: SVGSVGElement,
  prepare: (original: SVGSVGElement, copy: SVGSVGElement) => void,
): SVGSVGElement {
  const bands = gardenSceneBands(svg);
  const copies = bands.map((band) => {
    const copy = band.cloneNode(true) as SVGSVGElement;
    prepare(band, copy);
    return copy;
  });
  const [base, ...rest] = copies;
  for (const copy of rest)
    while (copy.firstChild) base.appendChild(copy.firstChild);
  base.removeAttribute('data-band');
  return base;
}
