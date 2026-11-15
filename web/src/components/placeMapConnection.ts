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
  private readonly glow: HTMLElement;
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
    this.glow = document.createElement('span');
    this.glow.className = 'place-map-connection-glow';
    this.heart = document.createElement('span');
    this.heart.className = 'place-map-connection-heart';
    const heartSvg = svgElement('svg', {
      viewBox: '0 0 24 24',
      focusable: 'false',
    });
    heartSvg.append(svgElement('path', { d: HEART_PATH }));
    this.heart.append(heartSvg);
    element.append(svg, this.glow, this.heart);
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
      this.glow.style.setProperty('offset-path', `path('${d}')`);
    }
    if (!this.started) {
      this.started = true;
      // The arc draws in once; later plays only repeat the travel or beat.
      element.classList.add('is-entering');
      this.play();
    }
  }

  /** Restarts the travelling glow or the heartbeat. */
  play() {
    const { element } = this;
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
