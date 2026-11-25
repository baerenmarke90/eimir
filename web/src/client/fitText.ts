/**
 * Fits a text into a fixed box (a note, a card) so it is never clipped. The
 * text first shrinks from its CSS size down to `minPx`; long single words may
 * then wrap with hyphens; only a text that still does not fit is shortened at
 * a word boundary with an ellipsis. The full text stays available to
 * assistive technology through `aria-label`.
 *
 * The text node is written outside React: render the text element empty and
 * pass both refs (see `useFitText`).
 */
import { useLayoutEffect, useRef } from 'react';

/** Steps of the font-size bisection (enough for sub-pixel precision). */
const SIZE_STEPS = 7;

/** The text cut after `count` words, without trailing punctuation, plus " …". */
export function shortenAtWord(words: readonly string[], count: number): string {
  return `${words
    .slice(0, count)
    .join(' ')
    .replace(/[\s,;:.!?–-]+$/u, '')} …`;
}

function overflows(box: HTMLElement, element: HTMLElement): boolean {
  return (
    box.scrollHeight > box.clientHeight + 1 ||
    element.scrollWidth > element.clientWidth + 1 ||
    box.scrollWidth > box.clientWidth + 1
  );
}

export type FitResult = 'fits' | 'shrunk' | 'wrapped' | 'shortened' | 'skipped';

/** Fits `text` into `box` by writing `element` (a child of `box`). */
export function fitTextInto(
  box: HTMLElement,
  element: HTMLElement,
  text: string,
  minPx: number,
): FitResult {
  // A box without layout (hidden, not yet laid out) keeps the plain text
  // until it is resized.
  if (box.clientHeight === 0) {
    if (element.textContent !== text) element.textContent = text;
    return 'skipped';
  }
  element.style.removeProperty('font-size');
  // First try without breaking words: a word wider than the line shows up
  // as horizontal overflow and makes the text shrink.
  element.style.overflowWrap = 'normal';
  element.style.hyphens = 'manual';
  element.textContent = text;
  element.removeAttribute('aria-label');
  const base = Number.parseFloat(getComputedStyle(element).fontSize) || 16;
  if (!overflows(box, element)) return 'fits';
  let low = Math.min(base, minPx);
  let high = base;
  for (let step = 0; step < SIZE_STEPS; step += 1) {
    const mid = (low + high) / 2;
    element.style.fontSize = `${mid}px`;
    if (overflows(box, element)) high = mid;
    else low = mid;
  }
  element.style.fontSize = `${low}px`;
  if (!overflows(box, element)) return 'shrunk';
  // At the smallest size: let long words wrap with hyphens.
  element.style.overflowWrap = 'break-word';
  element.style.hyphens = 'auto';
  if (!overflows(box, element)) return 'wrapped';
  // Still too long: shorten at a word boundary.
  const words = text.trim().split(/\s+/u);
  let keep = 1;
  let lo = 1;
  let hi = words.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    element.textContent = shortenAtWord(words, mid);
    if (overflows(box, element)) hi = mid - 1;
    else {
      keep = mid;
      lo = mid + 1;
    }
  }
  element.textContent = shortenAtWord(words, keep);
  element.setAttribute('aria-label', text);
  return 'shortened';
}

/** Keeps `text` fitted into the box while the box or the fonts change. */
export function useFitText<Box extends HTMLElement, Text extends HTMLElement>(
  text: string,
  minPx: number,
) {
  const boxRef = useRef<Box>(null);
  const textRef = useRef<Text>(null);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const element = textRef.current;
    if (!box || !element) return;
    let cancelled = false;
    const refit = () => {
      if (!cancelled) fitTextInto(box, element, text, minPx);
    };
    refit();
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(refit);
    observer?.observe(box);
    void document.fonts?.ready.then(refit);
    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [text, minPx]);

  return { boxRef, textRef };
}
