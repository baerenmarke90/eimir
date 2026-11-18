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
  const numbers = connectionArc(from, to, tier).match(/-?\d+(\.\d+)?/g);
  if (!numbers || numbers.length < 6) return 0;
  const [x0, y0, cx, cy, x1, y1] = numbers.map(Number);
  let length = 0;
  let previous = { x: x0, y: y0 };
  const steps = 24;
  for (let step = 1; step <= steps; step++) {
    const t = step / steps;
    const point = {
      x: (1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t ** 2 * x1,
      y: (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t ** 2 * y1,
    };
    length += Math.hypot(point.x - previous.x, point.y - previous.y);
    previous = point;
  }
  return length;
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
  private readonly mask: SVGMaskElement;
  private readonly glows: HTMLElement[];
  private readonly heart: HTMLElement;
  private started = false;

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
    this.mask = mask;
  }

  /** Places the drawing for the current camera and applies its style. */
  update(
    connection: Pick<MapConnection, 'tier' | 'earlier'>,
    from: ScreenPoint,
    to: ScreenPoint,
    size: { width: number; height: number },
  ) {
    const { element } = this;
    element.style.width = `${size.width}px`;
    element.style.height = `${size.height}px`;
    this.mask.setAttribute('width', String(size.width));
    this.mask.setAttribute('height', String(size.height));
    element.classList.toggle('is-near', connection.tier === 'near');
    element.classList.toggle('is-regional', connection.tier === 'regional');
    element.classList.toggle('is-far', connection.tier === 'far');
    element.classList.toggle('is-earlier', connection.earlier);
    if (connection.tier === 'near') {
      this.heart.style.left = `${(from.x + to.x) / 2}px`;
      this.heart.style.top = `${Math.min(from.y, to.y) - HEART_LIFT_PX}px`;
    } else {
      const d = connectionArc(from, to, connection.tier);
      for (const path of this.paths) path.setAttribute('d', d);
      for (const glow of this.glows)
        glow.style.setProperty('offset-path', `path('${d}')`);
      const turns = glowTurns(connectionArcLength(from, to, connection.tier));
      element.style.setProperty(
        '--place-map-connection-start',
        `${turns.start.toFixed(2)}%`,
      );
      element.style.setProperty(
        '--place-map-connection-end',
        `${turns.end.toFixed(2)}%`,
      );
    }
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

  /** Restarts the travelling glow or the heartbeat. */
  play() {
    const { element } = this;
    if (!this.started) return;
    element.classList.remove('is-paused', 'is-playing');
    // Reading layout restarts the CSS animations bound to the class.
    void element.offsetWidth;
    element.classList.add('is-playing');
  }

  /** Holds the motion while the page is hidden. */
  pause() {
    this.element.classList.add('is-paused');
  }

  remove() {
    this.element.remove();
  }
}
