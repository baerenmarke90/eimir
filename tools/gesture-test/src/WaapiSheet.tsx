/*
 * Variant B: a thin in-house layer on the Web Animations API.
 * 1:1 tracking with direct transform writes, rubber-banding, the release
 * velocity handed to a sampled spring that runs as a compositor animation,
 * and interruption by grabbing the settling sheet.
 */
import { useEffect, useRef } from 'react';
import {
  rubberBand,
  SLOP_PX,
  SPRING,
  shouldDismiss,
  VelocityTracker,
} from './gesture';
import {
  prefersReducedMotion,
  SheetContent,
  sheetHeight,
} from './scene';
import { SPRING_FRAME_MS, sampleSpring } from './spring';

function translateOf(element: HTMLElement): number {
  const { transform } = getComputedStyle(element);
  if (!transform || transform === 'none') return 0;
  return new DOMMatrixReadOnly(transform).m42;
}

export function WaapiSheet() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sheet = ref.current;
    if (!sheet) return;
    const tracker = new VelocityTracker();
    let settle: Animation | null = null;
    let pointer: number | null = null;
    let startY = 0;
    let base = 0;
    let offset = 0;
    let peak = 0;
    let claimed = false;

    const place = (y: number) => {
      sheet.style.transform = `translateY(${y}px)`;
    };

    const down = (event: PointerEvent) => {
      if (pointer !== null) return;
      pointer = event.pointerId;
      sheet.setPointerCapture(event.pointerId);
      // Interruption: stop a running settle where it is and keep tracking.
      base = settle ? translateOf(sheet) : offset;
      if (settle) {
        place(base);
        settle.cancel();
        settle = null;
      }
      startY = event.clientY;
      peak = base;
      claimed = base !== 0;
      tracker.reset();
      tracker.add(event.timeStamp, base);
    };

    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return;
      const delta = event.clientY - startY;
      if (!claimed && Math.abs(delta) < SLOP_PX) return;
      claimed = true;
      offset = rubberBand(base + delta);
      peak = Math.max(peak, offset);
      tracker.add(event.timeStamp, offset);
      place(offset);
    };

    const up = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return;
      pointer = null;
      const velocity = tracker.velocity();
      const height = sheetHeight();
      const dismiss = shouldDismiss({ offset, peak, velocity, height });
      const target = dismiss ? height : 0;
      window.__probe.mark('release', { velocity, dismiss });
      const from = offset;
      offset = target;
      place(target);
      if (prefersReducedMotion() || from === target) {
        window.__probe.mark('settled');
        return;
      }
      const frames = sampleSpring(from, target, velocity * 1000, SPRING, dismiss);
      settle = sheet.animate(
        frames.map((y) => ({ transform: `translateY(${y}px)` })),
        { duration: (frames.length - 1) * SPRING_FRAME_MS, easing: 'linear' },
      );
      const running = settle;
      running.finished.then(
        () => {
          if (settle === running) settle = null;
          window.__probe.mark('settled');
        },
        () => {},
      );
    };

    sheet.addEventListener('pointerdown', down);
    sheet.addEventListener('pointermove', move);
    sheet.addEventListener('pointerup', up);
    sheet.addEventListener('pointercancel', up);
    sheet.dataset.ready = '';
    return () => {
      settle?.cancel();
      sheet.removeEventListener('pointerdown', down);
      sheet.removeEventListener('pointermove', move);
      sheet.removeEventListener('pointerup', up);
      sheet.removeEventListener('pointercancel', up);
    };
  }, []);

  return (
    <div className="sheet" data-sheet ref={ref}>
      <SheetContent />
    </div>
  );
}
