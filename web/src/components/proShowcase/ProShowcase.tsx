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

/** A card counts as current once this share of it is in the track. */
const CURRENT_THRESHOLD = 0.6;

export function ProShowcase({ anchor }: { anchor?: ReactNode }) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const [current, setCurrent] = useState(0);
  const trackRef = useRef<HTMLUListElement>(null);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);
  const count = PRO_SCENE_IDS.length;

  useEffect(() => {
    const track = trackRef.current;
    if (!track || typeof IntersectionObserver !== 'function') return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.intersectionRatio < CURRENT_THRESHOLD) continue;
          const index = itemRefs.current.indexOf(
            entry.target as HTMLLIElement,
          );
          if (index >= 0) setCurrent(index);
        }
      },
      { root: track, threshold: CURRENT_THRESHOLD },
    );
    for (const item of itemRefs.current) if (item) observer.observe(item);
    return () => observer.disconnect();
  }, []);

  const show = (index: number) => {
    setCurrent(index);
    itemRefs.current[index]?.scrollIntoView?.({
      behavior: reducedMotion ? 'auto' : 'smooth',
      inline: 'start',
      block: 'nearest',
    });
  };

  return (
    <section className="pro-showcase" aria-label={t('proPaywall.showcase.label')}>
      <ul className="pro-showcase-track" ref={trackRef}>
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
