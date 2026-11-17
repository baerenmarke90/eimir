// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  arcPoint,
  flightKeyframes,
  landingScale,
  startSendFlight,
} from './sendFlight';

describe('flight geometry', () => {
  it('starts and ends exactly on its two points', () => {
    const path = arcPoint({ x: 10, y: 200 }, { x: 150, y: 40 }, 30, 50);
    expect(path(0)).toEqual({ x: 10, y: 200 });
    const end = path(1);
    expect(end.x).toBeCloseTo(150);
    expect(end.y).toBeCloseTo(40);
  });

  it('rises above the straight line between the points', () => {
    const path = arcPoint({ x: 0, y: 200 }, { x: 100, y: 100 }, 0, 60);
    expect(path(0.5).y).toBeLessThan(150);
  });

  it('samples relative keyframes that shrink onto the slot', () => {
    const frames = flightKeyframes(
      { x: 20, y: 300 },
      { x: 120, y: 60 },
      1.18,
      0.4,
      20,
      40,
      4,
    );
    expect(frames).toHaveLength(5);
    expect(frames[0].transform).toBe('translate(0px, 0px) scale(1.18)');
    expect(frames[4].transform).toBe('translate(100px, -240px) scale(0.4)');
  });

  it('scales a flying element to the width of its slot', () => {
    expect(landingScale(48, 24)).toBe(0.5);
    expect(landingScale(0, 24)).toBe(1);
    expect(landingScale(48, 0)).toBe(1);
  });
});

describe('startSendFlight', () => {
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

  function setRoles(roles: Record<string, string>) {
    for (const [name, value] of Object.entries(roles))
      document.documentElement.style.setProperty(name, value);
  }
  const roles = {
    '--duration-context': '280ms',
    '--duration-send-flight': '560ms',
    '--duration-feedback': '120ms',
    '--easing-enter': 'cubic-bezier(0, 0, 0.2, 1)',
    '--easing-standard': 'cubic-bezier(0.2, 0, 0, 1)',
  };

  function source(kind: 'face' | 'note') {
    const element = document.createElement(
      kind === 'face' ? 'span' : 'textarea',
    );
    if (kind === 'face') element.innerHTML = '<svg></svg>';
    else (element as HTMLTextAreaElement).value = 'Hi';
    document.body.append(element);
    return element;
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
    setRoles(roles);
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

  it('is not started without items, motion roles or top-layer support', () => {
    expect(startSendFlight([])).toBeNull();
    document.documentElement.style.removeProperty('--duration-send-flight');
    expect(
      startSendFlight([
        { kind: 'vibe', source: source('face'), target: () => null },
      ]),
    ).toBeNull();
    setRoles(roles);
    delete (HTMLElement.prototype as unknown as Record<string, unknown>)
      .showPopover;
    expect(
      startSendFlight([
        { kind: 'vibe', source: source('face'), target: () => null },
      ]),
    ).toBeNull();
  });

  it('is not started with reduced motion, and reduced motion zeroes the roles', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: () => ({ matches: true }),
    });
    expect(
      startSendFlight([
        { kind: 'vibe', source: source('face'), target: () => null },
      ]),
    ).toBeNull();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: () => ({ matches: false }),
    });
    setRoles({ '--duration-send-flight': '0ms' });
    expect(
      startSendFlight([
        { kind: 'vibe', source: source('face'), target: () => null },
      ]),
    ).toBeNull();
  });

  it('lifts into a top-layer, hidden, non-interactive layer and cleans up', async () => {
    const slot = document.createElement('span');
    document.body.append(slot);
    const flight = startSendFlight([
      { kind: 'vibe', source: source('face'), target: () => slot },
      { kind: 'note', source: source('note'), target: () => slot },
    ]);
    expect(flight).not.toBeNull();
    const layer = document.querySelector('[popover="manual"]');
    expect(layer?.getAttribute('aria-hidden')).toBe('true');
    expect(layer?.querySelectorAll('.wir-checkin-flight-ghost')).toHaveLength(
      2,
    );
    const landed: string[] = [];
    await flight?.settle(
      { vibe: true, energy: false, note: false },
      { onLand: (kind) => landed.push(kind) },
    );
    // The confirmed value landed; the failed one returned and does not land.
    expect(landed).toEqual(['vibe']);
    expect(document.querySelector('[popover]')).toBeNull();
    expect(document.querySelector('[data-flight-source]')).toBeNull();
  });

  it('reads every duration and easing from the motion roles', () => {
    const slot = document.createElement('span');
    document.body.append(slot);
    startSendFlight([
      { kind: 'vibe', source: source('face'), target: () => slot },
    ]);
    const lift = animate.mock.calls[0] as unknown as [
      unknown,
      KeyframeAnimationOptions,
    ];
    expect(lift[1].duration).toBe(280);
    expect(lift[1].easing).toBe('cubic-bezier(0, 0, 0.2, 1)');
  });

  it('drops everything when cancelled', () => {
    const flight = startSendFlight([
      { kind: 'vibe', source: source('face'), target: () => null },
    ]);
    flight?.cancel();
    expect(document.querySelector('[popover]')).toBeNull();
    expect(document.querySelector('[data-flight-source]')).toBeNull();
  });
});
