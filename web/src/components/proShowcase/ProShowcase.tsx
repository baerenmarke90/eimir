/**
 * The swipeable Pro highlight gallery on the general paywall (#2310).
 *
 * Four cards in a horizontal scroll-snap list, each with its decorative
 * scene, a heading and copy, so screen readers read all four in order
 * without swiping. The gallery never advances on its own. The page
 * indicator buttons scroll to their card (instantly with reduced motion)
 * and mark the current card with `aria-current`. Only the current card's
 * scene animates (see `ProScene`).
 */
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from '../../i18n';
import { useReducedMotion } from '../../motion/reducedMotion';
import { PRO_SCENE_IDS, ProScene } from './ProScene';

/** Scrolling has settled once no scroll event came for this long. */
const SETTLE_MS = 150;

/**
 * The card a settled track shows first: the card whose start is nearest to
 * the scroll position, or the last card once the track is scrolled to its
 * end (in Expanded the last card can never reach the start).
 */
function settledCard(
  track: HTMLElement,
  items: readonly (HTMLElement | null)[],
): number | null {
  const cards = items.filter((item): item is HTMLElement => item !== null);
  if (cards.length === 0 || track.scrollWidth <= track.clientWidth) return null;
  if (track.scrollLeft + track.clientWidth >= track.scrollWidth - 1)
    return cards.length - 1;
  const origin = cards[0].offsetLeft;
  let nearest = 0;
  cards.forEach((card, index) => {
    const distance = Math.abs(card.offsetLeft - origin - track.scrollLeft);
    const best = Math.abs(
      cards[nearest].offsetLeft - origin - track.scrollLeft,
    );
    if (distance < best) nearest = index;
  });
  return nearest;
}

export function ProShowcase({ anchor }: { anchor?: ReactNode }) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const [current, setCurrent] = useState(0);
  const trackRef = useRef<HTMLUListElement>(null);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);
  const count = PRO_SCENE_IDS.length;

  // The current card changes only once scrolling settled, so a smooth
  // scroll to a chosen card never makes the cards it passes current.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let timer: number | undefined;
    const onScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const index = settledCard(track, itemRefs.current);
        if (index !== null) setCurrent(index);
      }, SETTLE_MS);
    };
    track.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.clearTimeout(timer);
      track.removeEventListener('scroll', onScroll);
    };
  }, []);

  const show = (index: number) => {
    const track = trackRef.current;
    const card = itemRefs.current[index];
    const first = itemRefs.current[0];
    setCurrent(index);
    if (!track || !card || !first) return;
    // Only the track scrolls; the page itself never moves.
    track.scrollTo?.({
      left: card.offsetLeft - first.offsetLeft,
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
  };

  return (
    <section
      className="pro-showcase"
      aria-label={t('proPaywall.showcase.label')}
    >
      <ul
        className="pro-showcase-track"
        ref={trackRef}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the scrolling track takes focus so the arrow keys scroll the cards (WCAG 2.1.1, axe scrollable-region-focusable).
        tabIndex={0}
      >
        {PRO_SCENE_IDS.map((id, index) => (
          <li
            key={id}
            className="pro-showcase-card"
            ref={(node) => {
              itemRefs.current[index] = node;
            }}
          >
            <ProScene id={id} active={current === index} />
            <div className="pro-showcase-copy">
              <h2>{t(`proPaywall.showcase.scenes.${id}.title`)}</h2>
              <p>{t(`proPaywall.showcase.scenes.${id}.body`)}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="pro-showcase-indicator">
        {PRO_SCENE_IDS.map((id, index) => (
          <button
            key={id}
            type="button"
            aria-label={t('proPaywall.showcase.indicator', {
              index: index + 1,
              count,
            })}
            aria-current={current === index || undefined}
            onClick={() => show(index)}
          />
        ))}
      </div>
      {anchor ? <p className="pro-showcase-anchor">{anchor}</p> : null}
    </section>
  );
}
