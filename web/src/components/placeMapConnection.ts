/**
 * The decorative connection between two map areas (#1907 H1): a soft arc
 * that draws in once, a glow point that travels along it and back, or, for
 * nearby areas, a heart above both avatars.
 *
 * It is one DOM overlay inside MapLibre's canvas container, placed directly
 * after the canvas so the existing area markers stay on top. The arc is
 * re-projected on map moves; all motion is CSS with the generated motion
 * roles, so no JavaScript runs per frame and reduced motion removes it.
 */

export type MapConnectionTier = 'near' | 'regional' | 'far';

export interface MapConnection {
  /** Area ids at both ends; the arc draws from the first to the second. */
  from: string;
  to: string;
  tier: MapConnectionTier;
  /** An earlier snapshot: muted and without motion. */
  earlier: boolean;
  /** Increment to play the motion again (an explicit "show us"). */
  playRequest?: number;
}

interface ScreenPoint {
  x: number;
  y: number;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Arc bow as a share of the distance between both ends. */
const BOW = { near: 0, regional: 0.18, far: 0.28 } as const;
/** The nearby heart sits this far above the higher avatar. */
const HEART_LIFT_PX = 34;
const HEART_PATH =
  'M12 20.3 4.7 13a4.6 4.6 0 0 1 6.5-6.5l.8.8.8-.8a4.6 4.6 0 0 1 6.5 6.5Z';

/** The glow turns before an avatar instead of hiding under it. */
const AVATAR_CLEARANCE_PX = 30;
/** Trailing points that follow the glow as a short tail. */
const TRAIL_POINTS = 2;

let maskCount = 0;

/** A quadratic arc between two screen points that bows towards the top. */
export function connectionArc(
  from: ScreenPoint,
  to: ScreenPoint,
  tier: MapConnectionTier,
): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const round = (value: number) => Math.round(value * 10) / 10;
  if (!length) return `M ${round(from.x)} ${round(from.y)}`;
  let nx = -dy / length;
  let ny = dx / length;
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  const bow = length * BOW[tier];
  const control = {
    x: (from.x + to.x) / 2 + nx * bow,
    y: (from.y + to.y) / 2 + ny * bow,
  };
  return `M ${round(from.x)} ${round(from.y)} Q ${round(control.x)} ${round(
    control.y,
  )} ${round(to.x)} ${round(to.y)}`;
}

/** Length of the arc between both ends, in screen pixels. */
export function connectionArcLength(
  from: ScreenPoint,
  to: ScreenPoint,
  tier: MapConnectionTier,
): number {
  // In chord units the curve is (t, 2 * bow * t * (1 - t)). Integrating
  // its speed gives the same length factor for every arc of a given tier.
  const chord = Math.hypot(to.x - from.x, to.y - from.y);
  const bend = 2 * BOW[tier];
  if (!bend) return chord;
  return (chord / 2) * (Math.hypot(1, bend) + Math.asinh(bend) / bend);
}

/**
 * Where the glow turns, as a share of the arc: just outside both avatars, so
 * it never disappears under them. Short arcs keep at least the middle fifth.
 */
export function glowTurns(length: number): { start: number; end: number } {
  if (length <= 0) return { start: 0, end: 100 };
  const start = Math.min(40, (AVATAR_CLEARANCE_PX / length) * 100);
  return { start, end: 100 - start };
}

function svgElement<K extends keyof SVGElementTagNameMap>(
  name: K,
  attributes: Record<string, string> = {},
) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes))
    element.setAttribute(key, value);
  return element;
}

export class ConnectionOverlay {
  readonly element: HTMLElement;
  private readonly paths: SVGPathElement[];
  private readonly glows: HTMLElement[];
  private readonly heart: HTMLElement;
  private tier?: MapConnectionTier;
  private earlier?: boolean;
  private dx = Number.NaN;
  private dy = Number.NaN;
  private started = false;
  private paused = false;

  constructor(container: HTMLElement, after: Element | null) {
    const maskId = `place-map-connection-mask-${++maskCount}`;
    const element = document.createElement('div');
    element.className = 'place-map-connection';
    // The page carries the text alternative; the drawing is decorative.
    element.setAttribute('aria-hidden', 'true');
    const svg = svgElement('svg', {
      class: 'place-map-connection-line',
      focusable: 'false',
    });
    const mask = svgElement('mask', {
      id: maskId,
      maskUnits: 'userSpaceOnUse',
      x: '0',
      y: '0',
      width: '100%',
      height: '100%',
    });
    const reveal = svgElement('path', {
      class: 'place-map-connection-reveal',
      pathLength: '1',
    });
    mask.append(reveal);
    const defs = svgElement('defs');
    defs.append(mask);
    const group = svgElement('g', { mask: `url(#${maskId})` });
    const casing = svgElement('path', {
      class: 'place-map-connection-casing',
    });
    const stroke = svgElement('path', {
      class: 'place-map-connection-stroke',
    });
    group.append(casing, stroke);
    svg.append(defs, group);
    this.paths = [reveal, casing, stroke];
    this.glows = Array.from({ length: TRAIL_POINTS + 1 }, (_, index) => {
      const glow = document.createElement('span');
      glow.className = index
        ? `place-map-connection-glow is-trail is-trail-${index}`
        : 'place-map-connection-glow';
      return glow;
    });
    this.heart = document.createElement('span');
    this.heart.className = 'place-map-connection-heart';
    const heartSvg = svgElement('svg', {
      viewBox: '0 0 24 24',
      focusable: 'false',
    });
    heartSvg.append(svgElement('path', { d: HEART_PATH }));
    this.heart.append(heartSvg);
    // Trailing points first, so the leading glow is drawn on top.
    element.append(svg, ...[...this.glows].reverse(), this.heart);
    if (after?.parentElement === container) after.after(element);
    else container.prepend(element);
    this.element = element;
  }

  /** Places the drawing for the current camera and applies its style. */
  update(
    connection: Pick<MapConnection, 'tier' | 'earlier'>,
    from: ScreenPoint,
    to: ScreenPoint,
  ) {
    const { element } = this;
    const tierChanged = this.tier !== connection.tier;
    if (tierChanged) {
      if (this.tier) element.classList.remove(`is-${this.tier}`);
      this.tier = connection.tier;
      element.classList.add(`is-${this.tier}`);
    }
    if (this.earlier !== connection.earlier) {
      this.earlier = connection.earlier;
      element.classList.toggle('is-earlier', connection.earlier);
    }
    if (connection.tier === 'near') {
      const x = (from.x + to.x) / 2;
      const y = Math.min(from.y, to.y) - HEART_LIFT_PX;
      this.heart.style.translate = `calc(${x}px - 50%) calc(${y}px - 50%)`;
      return;
    }

    // A pan translates both ends together. Keep the SVG and motion paths in
    // local coordinates so only their shared origin moves during the drag.
    element.style.setProperty(
      '--place-map-connection-origin',
      `${from.x}px ${from.y}px`,
    );
    const dx = Math.round((to.x - from.x) * 10) / 10;
    const dy = Math.round((to.y - from.y) * 10) / 10;
    if (!tierChanged && dx === this.dx && dy === this.dy) return;
    this.dx = dx;
    this.dy = dy;
    const origin = { x: 0, y: 0 };
    const end = { x: dx, y: dy };
    const d = connectionArc(origin, end, connection.tier);
    for (const path of this.paths) path.setAttribute('d', d);
    for (const glow of this.glows)
      glow.style.setProperty('offset-path', `path('${d}')`);
    const turns = glowTurns(connectionArcLength(origin, end, connection.tier));
    element.style.setProperty(
      '--place-map-connection-start',
      `${turns.start.toFixed(2)}%`,
    );
    element.style.setProperty(
      '--place-map-connection-end',
      `${turns.end.toFixed(2)}%`,
    );
  }

  /**
   * Shows the drawing and plays it for the first time. Called once the map
   * has drawn its tiles, so the arc never draws in over an empty map.
   */
  start() {
    if (this.started) return;
    this.started = true;
    // The arc draws in once; later plays only repeat the travel or beat.
    this.element.classList.add('is-started', 'is-entering');
    this.play();
  }

  /** Restarts the travelling glow or the heartbeat (an explicit request). */
  play() {
    const { element } = this;
    if (!this.started) return;
    element.classList.remove('is-playing');
    // Reading layout restarts the CSS animations bound to the class.
    void element.offsetWidth;
    element.classList.add('is-playing');
    element.classList.toggle('is-paused', this.paused);
  }

  /** Holds the motion while the drawing is not visible (M8). */
  pause() {
    this.paused = true;
    this.element.classList.add('is-paused');
  }

  /** Continues where it paused; a return never replays it (M4). */
  resume() {
    this.paused = false;
    this.element.classList.remove('is-paused');
  }

  remove() {
    this.element.remove();
  }
}
