// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CART_TARGET_ATTRIBUTE, flyIntoCart } from './cartFlight';

const rect = (left: number, top: number, width: number, height: number) =>
  ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  }) as DOMRect;

describe('flyIntoCart (#1808)', () => {
  let animate: ReturnType<typeof vi.fn>;
  let finish: () => void;

  function addTarget(box: DOMRect) {
    const target = document.createElement('div');
    target.setAttribute(CART_TARGET_ATTRIBUTE, '');
    target.getBoundingClientRect = () => box;
    document.body.append(target);
    return target;
  }

  beforeEach(() => {
    animate = vi.fn(() => ({
      addEventListener: (type: string, listener: () => void) => {
        if (type === 'finish') finish = listener;
      },
    }));
    (HTMLElement.prototype as unknown as { animate: unknown }).animate =
      animate;
    (document.body as unknown as { animate: unknown }).animate = animate;
    Object.defineProperty(window, 'innerHeight', {
      value: 800,
      configurable: true,
    });
  });
  afterEach(() => {
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('style');
    vi.restoreAllMocks();
  });

  const flight = {
    from: rect(20, 100, 300, 48),
    label: 'Milch',
    tone: 'b' as const,
  };

  it('flies a copy of the entry toward the middle of the cart and removes it afterwards', () => {
    addTarget(rect(16, 700, 358, 56));

    expect(flyIntoCart(flight)).toBe(true);

    const ghost = document.querySelector('.shared-list-flight');
    expect(ghost?.textContent).toBe('Milch');
    expect(ghost?.getAttribute('aria-hidden')).toBe('true');
    expect(ghost?.className).toContain('shared-list-flight-b');
    const [keyframes, options] = animate.mock.calls[0] as [
      Keyframe[],
      KeyframeAnimationOptions,
    ];
    // Cart middle (195, 728) minus the entry middle (170, 124).
    expect(keyframes[1].transform).toBe('translate(25px, 604px) scale(0.35)');
    expect(options.duration).toBe(420);
    finish();
    expect(document.querySelector('.shared-list-flight')).toBeNull();
  });

  it('waits when the cart is not on screen yet, so the caller can try again', () => {
    expect(flyIntoCart(flight)).toBe(false);
    expect(document.querySelector('.shared-list-flight')).toBeNull();
  });

  it('ignores a cart that is hidden for this screen size', () => {
    addTarget(rect(0, 0, 0, 0));
    addTarget(rect(16, 300, 400, 80));

    expect(flyIntoCart(flight)).toBe(true);
    expect(animate).toHaveBeenCalledTimes(1);
  });

  it('does not fly when the motion token is 0 ms, which is reduced motion', () => {
    document.documentElement.style.setProperty('--duration-context', '0ms');
    addTarget(rect(16, 700, 358, 56));

    expect(flyIntoCart(flight)).toBe(true);
    expect(animate).not.toHaveBeenCalled();
    expect(document.querySelector('.shared-list-flight')).toBeNull();
  });

  it('does not fly when the system asks for reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    addTarget(rect(16, 700, 358, 56));

    expect(flyIntoCart(flight)).toBe(true);
    expect(animate).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('keeps the flight inside the screen when the cart is below the fold', () => {
    addTarget(rect(16, 5000, 358, 56));

    flyIntoCart(flight);

    const [keyframes] = animate.mock.calls[0] as [Keyframe[]];
    // Clamped to the 800px high screen: 800 - 124.
    expect(keyframes[1].transform).toContain('676px');
  });
});
