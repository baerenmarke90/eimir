// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startGestureFlight } from './gestureFlight';

describe('startGestureFlight', () => {
  const rect = {
    x: 10,
    y: 10,
    left: 10,
    top: 10,
    right: 50,
    bottom: 50,
    width: 40,
    height: 40,
    toJSON: () => ({}),
  };
  const roles = {
    '--duration-context': '280ms',
    '--duration-send-flight': '560ms',
    '--duration-gesture-moment': '900ms',
    '--duration-feedback': '120ms',
    '--easing-enter': 'cubic-bezier(0, 0, 0.2, 1)',
    '--easing-standard': 'cubic-bezier(0.2, 0, 0, 1)',
  };

  function elements() {
    const source = document.createElement('span');
    source.innerHTML = '<svg><path /></svg>';
    const target = document.createElement('button');
    const own = document.createElement('span');
    document.body.append(source, target, own);
    return { source, target, own };
  }

  let animate: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    animate = vi.fn(() => ({ finished: Promise.resolve(), cancel: vi.fn() }));
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
      rect as never,
    );
    Object.assign(HTMLElement.prototype, {
      animate,
      showPopover: vi.fn(),
      hidePopover: vi.fn(),
    });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: () => ({ matches: false }),
    });
    for (const [name, value] of Object.entries(roles))
      document.documentElement.style.setProperty(name, value);
  });
  afterEach(() => {
    for (const name of Object.keys(roles))
      document.documentElement.style.removeProperty(name);
    const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
    delete proto.animate;
    delete proto.showPopover;
    delete proto.hidePopover;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('is not started with reduced motion or without top-layer support', () => {
    const { source, target, own } = elements();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: () => ({ matches: true }),
    });
    expect(
      startGestureFlight({ kind: 'THINKING', source, target, own }),
    ).toBeNull();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: () => ({ matches: false }),
    });
    delete (HTMLElement.prototype as unknown as Record<string, unknown>)
      .showPopover;
    expect(
      startGestureFlight({ kind: 'THINKING', source, target, own }),
    ).toBeNull();
  });

  it('lifts the symbol into a hidden top-layer layer and returns it after a failure', async () => {
    const { source, target, own } = elements();
    const flight = startGestureFlight({
      kind: 'THINKING',
      source,
      target,
      own,
    });
    expect(flight).not.toBeNull();
    const layer = document.querySelector('[popover="manual"]');
    expect(layer?.getAttribute('aria-hidden')).toBe('true');
    expect(layer?.querySelectorAll('.is-gesture')).toHaveLength(1);
    expect(source.getAttribute('data-flight-source')).toBe('true');
    await flight?.settle(false);
    expect(document.querySelector('[popover]')).toBeNull();
    expect(source.getAttribute('data-flight-source')).toBeNull();
  });

  it('flies a confirmed gesture to the partner avatar and cleans up', async () => {
    for (const kind of ['THINKING', 'KISS', 'CHECK_IN'] as const) {
      const { source, target, own } = elements();
      const flight = startGestureFlight({ kind, source, target, own });
      await flight?.settle(true);
      expect(document.querySelector('[popover]')).toBeNull();
      expect(document.querySelector('.wir-checkin-flight-ghost')).toBeNull();
      expect(source.getAttribute('data-flight-source')).toBeNull();
      document.body.innerHTML = '';
    }
  });

  it('sends the second heart of a kiss from the own avatar', async () => {
    const waiting: Array<() => void> = [];
    animate.mockImplementation(() => ({
      finished: new Promise<void>((resolve) => waiting.push(resolve)),
      cancel: vi.fn(),
    }));
    const { source, target, own } = elements();
    const flight = startGestureFlight({ kind: 'KISS', source, target, own });
    const pending = flight?.settle(true);
    const hearts = () =>
      document.querySelectorAll('.wir-checkin-flight-ghost.is-kiss').length;
    // Let the animations end step by step until the second heart appears.
    for (let step = 0; step < 20 && hearts() < 2; step += 1) {
      for (const release of waiting.splice(0)) release();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(hearts()).toBe(2);
    for (let step = 0; step < 20; step += 1) {
      for (const release of waiting.splice(0)) release();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    await pending;
    expect(document.querySelector('[popover]')).toBeNull();
  });

  it('reads durations and easings from the motion roles', () => {
    const { source, target, own } = elements();
    startGestureFlight({ kind: 'THINKING', source, target, own });
    const lift = animate.mock.calls[0] as unknown as [
      unknown,
      KeyframeAnimationOptions,
    ];
    expect(lift[1].duration).toBe(280);
    expect(lift[1].easing).toBe('cubic-bezier(0, 0, 0.2, 1)');
  });

  it('drops everything when cancelled', () => {
    const { source, target, own } = elements();
    const flight = startGestureFlight({
      kind: 'CHECK_IN',
      source,
      target,
      own,
    });
    flight?.cancel();
    expect(document.querySelector('[popover]')).toBeNull();
    expect(source.getAttribute('data-flight-source')).toBeNull();
  });
});
