import { useEffect } from 'react';

const CONTROLS = 'button, a[href], summary, [role="button"], .file-picker';

/** Touch :active can arrive after release; mirror contact without owning the gesture. */
export function useControlPressFeedback(): void {
  useEffect(() => {
    let pressed: { control: HTMLElement; pointerId: number } | null = null;
    const clear = () => {
      pressed?.control.removeAttribute('data-control-pressed');
      pressed = null;
    };
    const start = (event: PointerEvent) => {
      clear();
      if (!event.isPrimary || event.button !== 0 || event.defaultPrevented)
        return;
      const control =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>(CONTROLS)
          : null;
      if (
        !control ||
        control.matches(':disabled, [aria-disabled="true"]') ||
        control.closest('[inert]')
      )
        return;
      pressed = { control, pointerId: event.pointerId };
      control.setAttribute('data-control-pressed', '');
    };
    const move = (event: PointerEvent) => {
      if (!pressed || event.pointerId !== pressed.pointerId) return;
      const target = document.elementFromPoint(event.clientX, event.clientY);
      if (!target || !pressed.control.contains(target)) clear();
    };
    const end = (event: PointerEvent) => {
      if (event.pointerId === pressed?.pointerId) clear();
    };
    document.addEventListener('pointerdown', start, { passive: true });
    document.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerup', end, true);
    document.addEventListener('pointercancel', end, true);
    document.addEventListener('lostpointercapture', end, true);
    document.addEventListener('scroll', clear, {
      passive: true,
      capture: true,
    });
    document.addEventListener('visibilitychange', clear);
    window.addEventListener('blur', clear);
    return () => {
      clear();
      document.removeEventListener('pointerdown', start);
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', end, true);
      document.removeEventListener('pointercancel', end, true);
      document.removeEventListener('lostpointercapture', end, true);
      document.removeEventListener('scroll', clear, true);
      document.removeEventListener('visibilitychange', clear);
      window.removeEventListener('blur', clear);
    };
  }, []);
}
