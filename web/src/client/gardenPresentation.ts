/**
 * How the shared garden is presented (#1907 H3, concept A, PR 2).
 *
 * Everything here is derived: the season from the couple's calendar month,
 * the lanterns from today's seeds, the reunion from the next anticipated Plan
 * and the sleeping garden from the server's `sleeping` flag. Nothing is stored
 * and no presentation state ever changes growth.
 */

import { seededRandom } from './garden';

export type GardenSeason = 'spring' | 'summer' | 'autumn' | 'winter';

/** The season of the couple's calendar day (`localDate` is a UTC date). */
export function gardenSeason(localDate: Date): GardenSeason {
  const month = localDate.getUTCMonth();
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'autumn';
  return 'winter';
}

export type ReunionPhase = 'none' | 'soon' | 'today';

export function reunionPhase(view: {
  reunionOn?: Date | null;
  reunionToday: boolean;
}): ReunionPhase {
  if (view.reunionToday) return 'today';
  return view.reunionOn ? 'soon' : 'none';
}

/**
 * The stage a plant is drawn at. On the reunion day everything is in bloom;
 * while the garden sleeps, blossoms are closed into buds. The real stage is
 * never changed.
 */
export function shownStage(
  stage: number,
  { reunionToday, asleep }: { reunionToday: boolean; asleep: boolean },
): number {
  if (reunionToday) return 3;
  if (asleep && stage === 3) return 2;
  return stage;
}

export type SleepPhase = 'awake' | 'asleep' | 'waking';

/** Lanterns glow for "today in the garden"; they are dark while it sleeps. */
export function lanternsLit(
  view: { sentToday?: unknown; partnerSentToday: boolean },
  sleep: SleepPhase,
): { own: boolean; partner: boolean } {
  if (sleep === 'asleep') return { own: false, partner: false };
  return { own: view.sentToday != null, partner: view.partnerSentToday };
}

export interface FallingLeaf {
  x: number;
  delay: number;
  duration: number;
  dx: number;
  rotate: number;
  gold: boolean;
}

/** The one-shot autumn moment on open: a few leaves drift down once. */
export function fallingLeaves(width: number, seed = 31): FallingLeaf[] {
  const random = seededRandom(seed);
  return Array.from({ length: Math.round((8 * width) / 340) }, (_, k) => ({
    x: Math.round(random() * (width - 10)),
    delay: Math.round(random() * 1400),
    duration: Math.round(2600 + random() * 1800),
    dx: Math.round(20 + random() * 50),
    rotate: Math.round(random() * 540 - 270),
    gold: k % 2 === 1,
  }));
}

const PAINT_PROPERTIES = [
  'fill',
  'stroke',
  'stop-color',
  'stop-opacity',
  'opacity',
  'fill-opacity',
  'stroke-opacity',
  'display',
  'visibility',
] as const;

/**
 * A still PNG of the garden scene for a Moment. The scene paints with theme
 * variables, which a standalone image cannot resolve, so each element's
 * computed paint is written inline on a clone first.
 */
export async function gardenSceneImage(
  svg: SVGSVGElement,
  pixelWidth = 1080,
): Promise<Blob> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const originals = [svg, ...Array.from(svg.querySelectorAll('*'))];
  const copies = [clone, ...Array.from(clone.querySelectorAll('*'))];
  originals.forEach((original, index) => {
    const copy = copies[index];
    if (!copy) return;
    const computed = window.getComputedStyle(original);
    const paint = PAINT_PROPERTIES.map(
      (name) => `${name}:${computed.getPropertyValue(name)}`,
    ).join(';');
    copy.setAttribute('style', paint);
    copy.removeAttribute('class');
  });
  const box = svg.viewBox.baseVal;
  const height = Math.round((pixelWidth * box.height) / box.width);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(pixelWidth));
  clone.setAttribute('height', String(height));
  const markup = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(
    new Blob([markup], { type: 'image/svg+xml' }),
  );
  try {
    const image = new Image();
    image.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Garden image failed.'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = pixelWidth;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is not available.');
    context.drawImage(image, 0, 0, pixelWidth, height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error('Garden image failed.')),
        'image/png',
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
