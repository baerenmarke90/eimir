/**
 * The send flight of the own daily check-in ("Dein Tag", Fertig).
 *
 * After the person presses Fertig, the chosen feeling, the battery and the
 * note lift out of the sheet, wait until the server confirmed them and then
 * fly together to the own avatar badge while the sheet closes. A value that
 * could not be saved returns to its place instead.
 *
 * The flight is decoration only: its elements are hidden from assistive
 * technology, take no pointer events, never delay saving or closing and are
 * absent with reduced motion. Every duration and easing is read from the
 * generated motion roles, never written here.
 */

export type FlightKind = 'vibe' | 'energy' | 'note';

export interface FlightItem {
  kind: FlightKind;
  /** The control the item lifts from (the chosen face, the battery, the note). */
  source: Element;
  /** The badge slot the item lands in; measured when the flight starts. */
  target: () => Element | null;
}

export interface FlightHooks {
  /** An item reached its badge slot; reveal the slot now. */
  onLand: (kind: FlightKind) => void;
}

export interface SendFlight {
  /**
   * Fly the confirmed items to the badge and return the failed ones. Resolves
   * when every element is gone again.
   */
  settle: (
    outcome: Readonly<Record<FlightKind, boolean>>,
    hooks: FlightHooks,
  ) => Promise<void>;
  /** Drop every flight element at once, e.g. when the sheet was dismissed. */
  cancel: () => void;
}

export interface Point {
  x: number;
  y: number;
}

/** How far an item grows while it hovers above its place. */
const LIFT_SCALE = 1.18;
/** How high the arc rises above the straight line, in pixels. */
const ARC_RISE = 48;
/** How far the arc leans sideways, in pixels. */
const ARC_LEAN = 36;
const PATH_STEPS = 12;
const NOTE_PREVIEW_LENGTH = 18;

/** A quadratic arc between two points, bulging up and to one side. */
export function arcPoint(
  from: Point,
  to: Point,
  lean: number,
  rise: number,
): (progress: number) => Point {
  const control = {
    x: (from.x + to.x) / 2 + lean,
    y: Math.min(from.y, to.y) - rise,
  };
  return (progress) => ({
    x:
      (1 - progress) ** 2 * from.x +
      2 * (1 - progress) * progress * control.x +
      progress ** 2 * to.x,
    y:
      (1 - progress) ** 2 * from.y +
      2 * (1 - progress) * progress * control.y +
      progress ** 2 * to.y,
  });
}

/** Sampled keyframes along the arc, relative to the starting point. */
export function flightKeyframes(
  from: Point,
  to: Point,
  startScale: number,
  endScale: number,
  lean: number,
  rise: number = ARC_RISE,
  steps: number = PATH_STEPS,
): Keyframe[] {
  const path = arcPoint(from, to, lean, rise);
  const frames: Keyframe[] = [];
  for (let step = 0; step <= steps; step += 1) {
    const progress = step / steps;
    const point = path(progress);
    const scale = startScale + (endScale - startScale) * progress;
    frames.push({
      transform: `translate(${point.x - from.x}px, ${point.y - from.y}px) scale(${scale})`,
    });
  }
  return frames;
}

/** The scale that makes the flying element as wide as its landing slot. */
export function landingScale(ghostWidth: number, slotWidth: number): number {
  return ghostWidth > 0 && slotWidth > 0 ? slotWidth / ghostWidth : 1;
}

interface MotionRoles {
  context: number;
  flight: number;
  stagger: number;
  enter: string;
  standard: string;
}

function readRole(name: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

function readDuration(name: string): number {
  const raw = readRole(name);
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) return 0;
  return raw.endsWith('ms') ? value : value * 1000;
}

/** Null when any role is missing or zero (reduced motion resolves to zero). */
function readMotionRoles(): MotionRoles | null {
  const context = readDuration('--duration-context');
  const flight = readDuration('--duration-send-flight');
  const feedback = readDuration('--duration-feedback');
  const enter = readRole('--easing-enter');
  const standard = readRole('--easing-standard');
  if (context <= 0 || flight <= 0 || !enter || !standard) return null;
  return { context, flight, stagger: feedback / 2, enter, standard };
}

function centre(rect: DOMRect): Point {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

interface Ghost {
  kind: FlightKind;
  source: Element;
  target: () => Element | null;
  element: HTMLElement;
  origin: Point;
  index: number;
  lift: Animation | null;
}

function buildGhost(item: FlightItem, layer: HTMLElement, index: number) {
  const rect = item.source.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  const element = document.createElement('div');
  element.className = `wir-checkin-flight-ghost is-${item.kind}`;
  element.setAttribute('aria-hidden', 'true');
  if (item.kind === 'note') {
    const text =
      item.source instanceof HTMLTextAreaElement
        ? item.source.value.trim()
        : '';
    if (!text) return null;
    element.textContent =
      text.length > NOTE_PREVIEW_LENGTH
        ? `${text.slice(0, NOTE_PREVIEW_LENGTH)}…`
        : text;
  } else {
    const glyph =
      item.source instanceof SVGSVGElement
        ? item.source
        : item.source.querySelector('svg');
    if (!glyph) return null;
    element.append(glyph.cloneNode(true));
  }
  layer.append(element);
  const origin = centre(rect);
  element.style.left = `${origin.x - element.offsetWidth / 2}px`;
  element.style.top = `${origin.y - element.offsetHeight / 2}px`;
  const ghost: Ghost = {
    kind: item.kind,
    source: item.source,
    target: item.target,
    element,
    origin,
    index,
    lift: null,
  };
  return ghost;
}

/**
 * Start lifting the items. Returns null when a flight is not possible or not
 * wanted (reduced motion, no animation or top-layer support): the caller then
 * closes the sheet with a calm state change instead.
 */
export function startSendFlight(items: FlightItem[]): SendFlight | null {
  if (typeof document === 'undefined' || items.length === 0) return null;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
    return null;
  const found = readMotionRoles();
  if (!found) return null;
  const roles: MotionRoles = found;
  const probe = document.createElement('div');
  if (
    typeof probe.animate !== 'function' ||
    typeof probe.showPopover !== 'function'
  )
    return null;

  // A popover lives in the top layer, so the flight stays visible above the
  // modal sheet and keeps going after the sheet is gone.
  const layer = document.createElement('div');
  layer.className = 'wir-checkin-flight-layer';
  layer.setAttribute('popover', 'manual');
  layer.setAttribute('aria-hidden', 'true');
  document.body.append(layer);
  try {
    layer.showPopover();
  } catch {
    layer.remove();
    return null;
  }

  const ghosts = items
    .map((item, index) => buildGhost(item, layer, index))
    .filter((ghost): ghost is Ghost => ghost !== null);
  if (ghosts.length === 0) {
    layer.remove();
    return null;
  }
  for (const ghost of ghosts) {
    ghost.source.setAttribute('data-flight-source', 'true');
    ghost.lift = ghost.element.animate(
      [{ transform: 'scale(1)' }, { transform: `scale(${LIFT_SCALE})` }],
      {
        duration: roles.context,
        delay: ghost.index * roles.stagger,
        easing: roles.enter,
        fill: 'forwards',
      },
    );
  }

  let cancelled = false;
  const lifted = Promise.all(
    ghosts.map((ghost) => ghost.lift?.finished.catch(() => undefined)),
  );

  const dispose = (ghost: Ghost) => {
    ghost.source.removeAttribute('data-flight-source');
    ghost.element.remove();
  };
  const cleanup = () => {
    for (const ghost of ghosts) dispose(ghost);
    try {
      layer.hidePopover();
    } catch {
      // The layer may already be gone.
    }
    layer.remove();
  };

  const motion = roles;

  async function fly(
    ghost: Ghost,
    ok: boolean,
    hooks: FlightHooks,
  ): Promise<void> {
    const targetElement = ok ? ghost.target() : null;
    const slot = targetElement?.getBoundingClientRect();
    if (!ok || !slot || (slot.width === 0 && slot.height === 0)) {
      // Back to its place, then the control shows its own state again.
      await ghost.element
        .animate(
          [{ transform: `scale(${LIFT_SCALE})` }, { transform: 'scale(1)' }],
          {
            duration: motion.context,
            easing: motion.standard,
            fill: 'forwards',
          },
        )
        .finished.catch(() => undefined);
      if (!cancelled) {
        dispose(ghost);
        if (ok) hooks.onLand(ghost.kind);
      }
      return;
    }
    const end = centre(slot);
    const scale = landingScale(ghost.element.offsetWidth, slot.width);
    const lean = ghost.kind === 'note' ? -ARC_LEAN : ARC_LEAN / 2;
    await ghost.element
      .animate(flightKeyframes(ghost.origin, end, LIFT_SCALE, scale, lean), {
        duration: motion.flight,
        delay: ghost.index * motion.stagger,
        easing: motion.standard,
        fill: 'forwards',
      })
      .finished.catch(() => undefined);
    if (cancelled) return;
    dispose(ghost);
    hooks.onLand(ghost.kind);
  }

  return {
    async settle(outcome, hooks) {
      await lifted;
      if (cancelled) return;
      await Promise.all(
        ghosts.map((ghost) => fly(ghost, outcome[ghost.kind], hooks)),
      );
      if (!cancelled) cleanup();
    },
    cancel() {
      if (cancelled) return;
      cancelled = true;
      for (const ghost of ghosts)
        for (const animation of ghost.element.getAnimations?.() ?? [])
          animation.cancel();
      cleanup();
    },
  };
}
