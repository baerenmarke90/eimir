/**
 * Test support: a controllable stand-in for the Web Animations API in jsdom,
 * which has no `Element.animate`. Tests finish, cancel, pause and resume the
 * returned animations by hand.
 */
import { vi } from 'vitest';

export class FakeAnimation {
  playState: AnimationPlayState = 'running';
  currentTime = 0;
  startTime: number | null = 0;
  committed = false;
  readonly finished: Promise<FakeAnimation>;
  private resolve!: (value: FakeAnimation) => void;
  private reject!: (reason: unknown) => void;

  constructor(
    readonly element: Element,
    readonly keyframes: Keyframe[] | PropertyIndexedKeyframes,
    readonly options: KeyframeAnimationOptions,
  ) {
    this.finished = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
    this.finished.catch(() => {});
  }

  finish() {
    if (this.playState === 'finished' || this.playState === 'idle') return;
    this.playState = 'finished';
    this.resolve(this);
  }

  cancel() {
    if (this.playState === 'finished' || this.playState === 'idle') return;
    this.playState = 'idle';
    this.reject(new DOMException('cancelled', 'AbortError'));
  }

  commitStyles() {
    this.committed = true;
  }

  pause() {
    if (this.playState === 'running') this.playState = 'paused';
  }

  play() {
    if (this.playState === 'paused') this.playState = 'running';
  }
}

export function installFakeAnimate() {
  const animations: FakeAnimation[] = [];
  const proto = HTMLElement.prototype as unknown as {
    animate?: (
      keyframes: Keyframe[],
      options: KeyframeAnimationOptions,
    ) => unknown;
  };
  const original = proto.animate;
  proto.animate = vi.fn(function (
    this: Element,
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions,
  ) {
    const animation = new FakeAnimation(this, keyframes, options);
    animations.push(animation);
    return animation;
  });
  return {
    animations,
    restore() {
      if (original) proto.animate = original;
      else delete proto.animate;
    },
  };
}

export interface FakeMediaQuery {
  set(matches: boolean): void;
  restore(): void;
}

/** A controllable `prefers-reduced-motion` media query. */
export function installReducedMotion(initial: boolean): FakeMediaQuery {
  let matches = initial;
  const listeners = new Set<() => void>();
  const original = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      media: query,
      get matches() {
        return matches;
      },
      addEventListener: (_: string, listener: () => void) =>
        listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) =>
        listeners.delete(listener),
    }),
  });
  return {
    set(next) {
      matches = next;
      for (const listener of [...listeners]) listener();
    },
    restore() {
      if (original) Object.defineProperty(window, 'matchMedia', original);
      else delete (window as { matchMedia?: unknown }).matchMedia;
    },
  };
}

/** Sets motion roles on the root element as the generated CSS would. */
export function setMotionRoles(roles: Record<string, string>) {
  for (const [name, value] of Object.entries(roles))
    document.documentElement.style.setProperty(name, value);
  return () => {
    for (const name of Object.keys(roles))
      document.documentElement.style.removeProperty(name);
  };
}

export const DEFAULT_ROLES: Record<string, string> = {
  '--duration-feedback': '120ms',
  '--duration-transition': '180ms',
  '--duration-context': '280ms',
  '--duration-sequence-beat': '200ms',
  '--duration-gesture-sequence': '1800ms',
  '--duration-connection-travel': '3200ms',
  '--duration-connection-draw': '700ms',
  '--duration-handwriting': '1200ms',
  '--duration-send-flight': '560ms',
  '--duration-gesture-moment': '900ms',
  '--duration-stagger-item': '60ms',
  '--duration-stagger-module': '220ms',
  '--motion-stagger-max-items': '4',
  '--motion-ambient-repeat': '4',
  '--easing-standard': 'cubic-bezier(0.2, 0, 0, 1)',
  '--easing-enter': 'cubic-bezier(0, 0, 0.2, 1)',
  '--easing-travel': 'cubic-bezier(0.45, 0, 0.55, 1)',
};
