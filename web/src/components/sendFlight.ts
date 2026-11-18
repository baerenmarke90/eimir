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

import {
  centre,
  flightKeyframes,
  landingScale,
  openFlightLayer,
  type Point,
} from './flightKit';

export {
  arcPoint,
  flightKeyframes,
  landingScale,
  type Point,
} from './flightKit';

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

/** How far an item grows while it hovers above its place. */
const LIFT_SCALE = 1.18;
/** How far the arc leans sideways, in pixels. */
const ARC_LEAN = 36;
const NOTE_PREVIEW_LENGTH = 18;

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
  if (items.length === 0) return null;
  // A top-layer layer stays visible above the modal sheet and keeps going
  // after the sheet is gone.
  const opened = openFlightLayer();
  if (!opened) return null;
  const { layer, roles, dispose: disposeLayer } = opened;

  const ghosts = items
    .map((item, index) => buildGhost(item, layer, index))
    .filter((ghost): ghost is Ghost => ghost !== null);
  if (ghosts.length === 0) {
    disposeLayer();
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
    disposeLayer();
  };

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
            duration: roles.context,
            easing: roles.standard,
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
        duration: roles.flight,
        delay: ghost.index * roles.stagger,
        easing: roles.standard,
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
