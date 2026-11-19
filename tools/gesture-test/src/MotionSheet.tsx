/*
 * Variant C: Motion (motion/react) with LazyMotion and m. Motion's drag
 * tracks the pointer, its elastic constraint rubber-bands the upward edge,
 * and the release velocity goes into Motion's spring. The same dismissal
 * rules and spring as the WAAPI variant.
 */
import {
  animate,
  LazyMotion,
  m,
  MotionConfig,
  type PanInfo,
  useMotionValue,
} from 'motion/react';
import { useEffect, useRef } from 'react';
import { EDGE_RESISTANCE, SPRING, shouldDismiss } from './gesture';
import {
  prefersReducedMotion,
  SheetContent,
  sheetHeight,
} from './scene';

// Drag is in the larger feature bundle; it is loaded on first render.
const loadFeatures = () => import('./motionFeatures').then((m) => m.default);

export function MotionSheet() {
  const y = useMotionValue(0);
  const peak = useRef(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.dataset.ready = '';
  }, []);

  const onDragEnd = (_: PointerEvent, info: PanInfo) => {
    const offset = y.get();
    const velocity = info.velocity.y / 1000;
    const height = sheetHeight();
    const dismiss = shouldDismiss({ offset, peak: peak.current, velocity, height });
    const target = dismiss ? height : 0;
    window.__probe.mark('release', { velocity, dismiss });
    if (prefersReducedMotion()) {
      y.set(target);
      window.__probe.mark('settled');
      return;
    }
    animate(y, target, {
      type: 'spring',
      ...SPRING,
      velocity: info.velocity.y,
      restDelta: 0.5,
      restSpeed: 20,
      onComplete: () => window.__probe.mark('settled'),
    });
  };

  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={loadFeatures} strict>
        <m.div
          className="sheet"
          data-sheet
          ref={ref}
          style={{ y }}
          drag="y"
          dragConstraints={{ top: 0 }}
          dragElastic={{ top: EDGE_RESISTANCE, bottom: 1 }}
          dragMomentum={false}
          onDragStart={() => {
            peak.current = y.get();
          }}
          onDrag={() => {
            peak.current = Math.max(peak.current, y.get());
          }}
          onDragEnd={onDragEnd}
        >
          <SheetContent />
        </m.div>
      </LazyMotion>
    </MotionConfig>
  );
}
