/*
 * Variant A: the behaviour of ShortTaskSheet on main (915e97ec8), reduced
 * to the gesture. The drag offset is a CSS custom property, the settle is a
 * 180 ms CSS transition, dismissal is decided by distance only (no
 * velocity), there is no upward rubber-banding (the offset is clamped at
 * 0), and the exit is a 280 ms transition.
 */
import { useEffect, useRef } from 'react';
import { dismissThreshold, REVERSAL_CANCEL_PX, SLOP_PX } from './gesture';
import { SheetContent, sheetHeight } from './scene';

export function CurrentSheet() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sheet = ref.current;
    if (!sheet) return;
    let pointer: number | null = null;
    let startY = 0;
    let offset = 0;
    let peak = 0;
    let claimed = false;

    const down = (event: PointerEvent) => {
      if (pointer !== null) return;
      pointer = event.pointerId;
      sheet.setPointerCapture(event.pointerId);
      startY = event.clientY;
      peak = 0;
      claimed = false;
    };
    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return;
      const delta = event.clientY - startY;
      if (!claimed && Math.abs(delta) < SLOP_PX) return;
      claimed = true;
      sheet.dataset.dragging = '';
      offset = Math.max(0, delta);
      peak = Math.max(peak, offset);
      sheet.style.setProperty('--sheet-offset', `${offset}px`);
    };
    const up = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return;
      pointer = null;
      delete sheet.dataset.dragging;
      const dismiss =
        peak - offset < REVERSAL_CANCEL_PX &&
        offset >= dismissThreshold(sheetHeight());
      window.__probe.mark('release', { velocity: null, dismiss });
      const done = () => window.__probe.mark('settled');
      if (dismiss) sheet.dataset.dismissed = '';
      else sheet.style.setProperty('--sheet-offset', '0px');
      const duration = Number.parseFloat(
        getComputedStyle(sheet).transitionDuration,
      );
      if (!duration || offset === 0) done();
      else sheet.addEventListener('transitionend', done, { once: true });
      offset = 0;
    };

    sheet.addEventListener('pointerdown', down);
    sheet.addEventListener('pointermove', move);
    sheet.addEventListener('pointerup', up);
    sheet.addEventListener('pointercancel', up);
    sheet.dataset.ready = '';
    return () => {
      sheet.removeEventListener('pointerdown', down);
      sheet.removeEventListener('pointermove', move);
      sheet.removeEventListener('pointerup', up);
      sheet.removeEventListener('pointercancel', up);
    };
  }, []);

  return (
    <div className="sheet is-current" data-sheet ref={ref}>
      <SheetContent />
    </div>
  );
}
