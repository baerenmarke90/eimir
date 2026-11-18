import { type ReactNode, useLayoutEffect, useRef } from 'react';

/** Minimum clear space between the distance chip and a name, in pixels. */
const NAME_CLEARANCE_PX = 8;

/**
 * The distance on the Verbunden hero's middle axis (#1792), in the place of
 * the ampersand between the two names. When the chip would come closer to a
 * name than the clearance (a narrow screen, larger text or a longer word,
 * #1907 H4), it moves to its own line below the daily marks instead of
 * touching the name.
 */
export function WirStageDistance({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const slot = ref.current;
    const hero = slot?.closest('.today-hero');
    if (!slot || !hero) return;
    const update = () => {
      const value = slot.firstElementChild?.getBoundingClientRect();
      // Moving down keeps the centre, so the horizontal check stays stable.
      const crowded =
        Boolean(value?.width) &&
        [...hero.querySelectorAll('.wir-stage-name')].some((name) => {
          const box = name.getBoundingClientRect();
          return (
            value != null &&
            box.width > 0 &&
            box.right + NAME_CLEARANCE_PX > value.left &&
            box.left - NAME_CLEARANCE_PX < value.right
          );
        });
      slot.classList.toggle('is-below-marks', crowded);
    };
    const observer = new ResizeObserver(update);
    observer.observe(hero);
    observer.observe(slot);
    update();
    return () => observer.disconnect();
  }, []);
  return (
    <span ref={ref} className="wir-stage-distance">
      {children}
    </span>
  );
}
