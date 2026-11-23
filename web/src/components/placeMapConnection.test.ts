// @vitest-environment jsdom
import {
  ConnectionOverlay,
  connectionArc,
  connectionArcLength,
  glowTurns,
} from './placeMapConnection';

describe('connectionArc', () => {
  it('bows towards the top, more for far connections', () => {
    const from = { x: 100, y: 400 };
    const to = { x: 100, y: 100 };
    const control = (d: string) => Number(d.split(' ')[4]);
    const regional = connectionArc(from, to, 'regional');
    const far = connectionArc(from, to, 'far');
    expect(regional).toMatch(/^M 100 400 Q .* 100 100$/);
    // A vertical connection bows sideways; the far arc bows further.
    expect(Math.abs(control(far) - 100)).toBeGreaterThan(
      Math.abs(control(regional) - 100),
    );
    const horizontal = connectionArc(
      { x: 0, y: 200 },
      { x: 300, y: 200 },
      'far',
    );
    expect(Number(horizontal.split(' ')[5])).toBeLessThan(200);
  });
});

describe('glowTurns', () => {
  it('keeps the glow clear of the avatars, also on short arcs', () => {
    expect(glowTurns(300)).toEqual({ start: 10, end: 90 });
    expect(glowTurns(40)).toEqual({ start: 40, end: 60 });
    expect(glowTurns(0)).toEqual({ start: 0, end: 100 });
    const straight = connectionArcLength(
      { x: 0, y: 0 },
      { x: 0, y: 300 },
      'regional',
    );
    expect(straight).toBeGreaterThan(300);
  });
});

describe('ConnectionOverlay', () => {
  function setup() {
    const container = document.createElement('div');
    const canvas = document.createElement('canvas');
    const marker = document.createElement('div');
    container.append(canvas, marker);
    return { container, canvas, marker };
  }

  it('sits between the canvas and the markers and stays decorative', () => {
    const { container, canvas, marker } = setup();
    const overlay = new ConnectionOverlay(container, canvas);
    expect(canvas.nextElementSibling).toBe(overlay.element);
    expect(overlay.element.nextElementSibling).toBe(marker);
    expect(overlay.element.getAttribute('aria-hidden')).toBe('true');
  });

  it('draws in once and replays only the motion', () => {
    const { container, canvas } = setup();
    const overlay = new ConnectionOverlay(container, canvas);
    overlay.update(
      { tier: 'regional', earlier: false },
      { x: 50, y: 400 },
      { x: 300, y: 80 },
    );
    const { classList } = overlay.element;
    // Nothing plays before the map is drawn.
    expect(classList.contains('is-started')).toBe(false);
    overlay.play();
    expect(classList.contains('is-playing')).toBe(false);
    overlay.start();
    expect([...classList]).toEqual(
      expect.arrayContaining([
        'is-regional',
        'is-started',
        'is-entering',
        'is-playing',
      ]),
    );
    // The glow and its tail turn just outside both avatars.
    expect(
      overlay.element.querySelectorAll('.place-map-connection-glow'),
    ).toHaveLength(3);
    const length = connectionArcLength(
      { x: 50, y: 400 },
      { x: 300, y: 80 },
      'regional',
    );
    expect(
      overlay.element.style.getPropertyValue('--place-map-connection-start'),
    ).toBe(`${glowTurns(length).start.toFixed(2)}%`);
    const path = overlay.element.querySelector('.place-map-connection-stroke');
    expect(path?.getAttribute('d')).toBe(
      connectionArc({ x: 0, y: 0 }, { x: 250, y: -320 }, 'regional'),
    );
    overlay.pause();
    expect(classList.contains('is-paused')).toBe(true);
    // An explicit replay while hidden stays held until the drawing is seen.
    overlay.play();
    expect(classList.contains('is-paused')).toBe(true);
    expect(classList.contains('is-playing')).toBe(true);
    overlay.resume();
    expect(classList.contains('is-paused')).toBe(false);
    expect(classList.contains('is-playing')).toBe(true);
  });

  it('translates a pan without rebuilding the curve, and redraws it for a zoom', () => {
    const { container, canvas } = setup();
    const overlay = new ConnectionOverlay(container, canvas);
    const connection = { tier: 'far', earlier: false } as const;
    overlay.update(connection, { x: -30, y: 85 }, { x: 210, y: 175 });
    const path = overlay.element.querySelector('.place-map-connection-reveal');
    if (!path) throw new Error('Expected a connection path');
    const writes = vi.spyOn(path, 'setAttribute');
    for (let step = 1; step <= 60; step++) {
      overlay.update(
        connection,
        { x: -30 + step, y: 85 },
        { x: 210 + step, y: 175 },
      );
    }
    expect(writes).not.toHaveBeenCalled();
    expect(
      overlay.element.style.getPropertyValue('--place-map-connection-origin'),
    ).toBe('30px 85px');
    overlay.update(connection, { x: 30, y: 85 }, { x: 510, y: 265 });
    expect(writes).toHaveBeenCalledWith(
      'd',
      connectionArc({ x: 0, y: 0 }, { x: 480, y: 180 }, 'far'),
    );
  });

  it('resumes where it paused instead of replaying (M4)', () => {
    const { container, canvas } = setup();
    const overlay = new ConnectionOverlay(container, canvas);
    overlay.start();
    const { classList } = overlay.element;
    const remove = vi.spyOn(classList, 'remove');
    overlay.pause();
    overlay.resume();
    // Only the pause is lifted; the playing state is never reset.
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith('is-paused');
    expect([...classList]).toEqual(
      expect.arrayContaining(['is-started', 'is-entering', 'is-playing']),
    );
  });

  it('switches to the heart nearby and mutes an earlier snapshot', () => {
    const { container, canvas } = setup();
    const overlay = new ConnectionOverlay(container, canvas);
    overlay.update(
      { tier: 'near', earlier: false },
      { x: 100, y: 200 },
      { x: 160, y: 180 },
    );
    const heart = overlay.element.querySelector<HTMLElement>(
      '.place-map-connection-heart',
    );
    expect(overlay.element.classList.contains('is-near')).toBe(true);
    const expected = document.createElement('span').style;
    expected.translate = 'calc(130px - 50%) calc(146px - 50%)';
    expect(heart?.style.translate).toBe(expected.translate);
    overlay.update(
      { tier: 'far', earlier: true },
      { x: 100, y: 200 },
      { x: 300, y: 20 },
    );
    expect(overlay.element.classList.contains('is-near')).toBe(false);
    expect(overlay.element.classList.contains('is-earlier')).toBe(true);
    overlay.remove();
    expect(container.contains(overlay.element)).toBe(false);
  });
});
