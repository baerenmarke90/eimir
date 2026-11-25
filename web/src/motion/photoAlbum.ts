/**
 * The motion layer's page turn for the Fotobuch memory world (#2283).
 *
 * Every page of the book is a paper leaf hinged at the spine. A turn is one
 * angle `a` from 0 (lying flat on the right, unturned) to 180 (turned over
 * onto the left side of the spine), written as `rotateY(-a)` around the
 * leaf's left edge: the outer edge rises towards the viewer, stands edge-on
 * at 90 and lies down on the left. The leaf follows the finger 1:1 while it
 * is dragged; on a tap, a button or a key it turns by itself with a frame
 * loop. Each frame writes transforms and opacities only (the leaf, its
 * shading, a travelling highlight ridge, the reverse's shading and the cast
 * shadow on the page beneath). With reduced motion the page changes at once
 * behind a short crossfade. The values were tuned with the Product Owner in
 * the accepted prototype and are kept unchanged.
 */

/** Timings and geometry of the turn. */
export const ALBUM_TURN = Object.freeze({
  /** The stage's `perspective` in px (set inline on the stage). */
  perspective: 1800,
  /** The leaf rises by this much at the middle of a turn (about 1.01 scale). */
  lift: 18,
  /** A full automatic turn by tap, button or key, in ms. */
  auto: 700,
  /** After the finger lets go: 450 ms plus up to 200 ms for the angle to go. */
  releaseMin: 450,
  releaseSpan: 200,
  /** Reduced motion: an instant page change with a short crossfade. */
  reducedFade: 120,
  /** A forward turn completes once the grabbed point is half way to the spine. */
  forwardCommit: 60,
  /** A turn back completes once the returning leaf is this close to lying down. */
  backCommit: 105,
  /** Forward: the finger holds the leaf at least this far (page widths) from the spine. */
  forwardGrabMin: 0.55,
  /** Back: the finger pulls a point this far (page widths) from the spine. */
  backGrab: 0.42,
  /** Resistance at the first and last page: the page lifts at most this much. */
  rubber: 14,
  rubberSoftness: 40,
  /** The finger holds the refusing page this far (page widths) from the spine. */
  rubberGrab: 0.6,
  /** A refused tap or button: a small lift that falls back. */
  nudge: 9,
  nudgeDuration: 560,
  /** The back of a leaf fades out while it lies down on the unshown left side. */
  backFadeFrom: 140,
  /** Share of the page width covered by the highlight ridge (matches the CSS width). */
  ridgeWidth: 0.34,
  /** Finger speed (px/ms) that decides the outcome regardless of the angle. */
  fling: 0.45,
});

/** CSS-like cubic Bézier timing, solved for the frame-driven turn. */
export function bezierCurve(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    let t = x;
    for (let step = 0; step < 6; step += 1) {
      const error = sampleX(t) - x;
      const slope = slopeX(t);
      if (Math.abs(error) < 1e-4 || Math.abs(slope) < 1e-6) break;
      t -= error / slope;
    }
    return sampleY(Math.min(1, Math.max(0, t)));
  };
}

export type AlbumCurve = (progress: number) => number;

/** The curves of the book. */
export const ALBUM_CURVES = Object.freeze({
  /** An automatic turn: the paper lifts gently, swings and settles softly. */
  turn: bezierCurve(0.45, 0.05, 0.35, 1),
  /** After release: carries the finger's motion on and lands softly. */
  release: bezierCurve(0.22, 0.65, 0.3, 1),
  /** Constant speed (the crossfade, and the nudge, which shapes itself). */
  steady: (progress: number) => progress,
} satisfies Record<string, AlbumCurve>);

/** The elements one turn writes to, collected once when the turn starts. */
export interface AlbumTurn {
  leaf: HTMLElement;
  front: HTMLElement | null;
  back: HTMLElement | null;
  shade: HTMLElement | null;
  ridge: HTMLElement | null;
  backShade: HTMLElement | null;
  /** The cast shadow on the page beneath the turning leaf. */
  cast: HTMLElement | null;
  /** The page width in px. */
  width: number;
}

function acosDeg(value: number) {
  return (Math.acos(Math.max(-1, Math.min(1, value))) * 180) / Math.PI;
}

/**
 * Writes one frame of a 3D turn: the leaf's rotation and lift, the shading
 * that darkens the paper towards the spine as it rises, the highlight ridge
 * travelling across it (the curl), the reverse's shading and the cast shadow
 * beneath, whose edge follows the leaf's projected outer edge.
 */
export function paintTurn(turn: AlbumTurn, angle: number) {
  const rad = (angle * Math.PI) / 180;
  const sin = Math.sin(rad);
  const cos = Math.cos(rad);
  const lift = ALBUM_TURN.lift * sin;
  turn.leaf.style.transform = `translateZ(${lift.toFixed(2)}px) rotateY(${(-angle).toFixed(3)}deg)`;

  const rise = Math.min(1, angle / 90);
  if (turn.shade) turn.shade.style.opacity = (rise ** 1.25).toFixed(3);
  if (turn.ridge) {
    // The ridge's centre runs from near the outer edge towards the middle.
    const centre = 0.9 - 0.42 * rise;
    const shift =
      ((centre - ALBUM_TURN.ridgeWidth / 2) / ALBUM_TURN.ridgeWidth) * 100;
    turn.ridge.style.transform = `translate3d(${shift.toFixed(2)}%, 0, 0)`;
    turn.ridge.style.opacity = Math.sin(rise * Math.PI).toFixed(3);
  }
  if (turn.backShade)
    turn.backShade.style.opacity = (
      angle <= 90 ? 1 : ((180 - angle) / 90) ** 1.1
    ).toFixed(3);
  if (turn.back)
    turn.back.style.opacity =
      angle <= ALBUM_TURN.backFadeFrom
        ? '1'
        : Math.max(0, (180 - angle) / (180 - ALBUM_TURN.backFadeFrom)).toFixed(
            3,
          );
  if (turn.cast) {
    // Project the leaf's outer edge (x = w·cos a, z = w·sin a + lift) through
    // the stage's centred perspective to find where the shadow begins.
    const w = turn.width;
    const half = w / 2;
    const depth = Math.max(1, ALBUM_TURN.perspective - w * sin - lift);
    const edge = Math.max(
      0,
      Math.min(w, half + (w * cos - half) * (ALBUM_TURN.perspective / depth)),
    );
    const spread = 0.06 + 0.4 * sin;
    turn.cast.style.transform = `translate3d(${edge.toFixed(1)}px, 0, 0) scaleX(${spread.toFixed(3)})`;
    turn.cast.style.opacity = (angle <= 90 ? sin ** 0.55 : sin ** 1.4).toFixed(
      3,
    );
  }
}

/** Reduced motion: the leaving page fades out, or the returning one fades in. */
export function paintFade(turn: AlbumTurn, forward: boolean, progress: number) {
  if (forward) {
    if (turn.front) turn.front.style.opacity = (1 - progress).toFixed(3);
    return;
  }
  turn.leaf.style.transform = 'none';
  if (turn.front) turn.front.style.opacity = progress.toFixed(3);
}

/** The small lift of a refused turn at `progress` (0 to 1) of the nudge. */
export function nudgeAngle(progress: number) {
  return Math.sin(Math.PI * ALBUM_CURVES.turn(progress)) * ALBUM_TURN.nudge;
}

/** What a drag turns: forward or back, or a refusing page at the book's end. */
export interface AlbumDrag {
  forward: boolean;
  rubber: boolean;
  /** Distance (px) from the spine of the leaf point the finger holds. */
  grab: number;
}

/** The grab distance of a drag that starts `fromSpine` px from the spine. */
export function dragGrab(
  forward: boolean,
  rubber: boolean,
  fromSpine: number,
  width: number,
) {
  if (rubber) return ALBUM_TURN.rubberGrab * width;
  if (forward)
    return Math.min(
      width,
      Math.max(ALBUM_TURN.forwardGrabMin * width, fromSpine),
    );
  return ALBUM_TURN.backGrab * width;
}

/**
 * The turn angle for a finger offset `dx`. Forward, the finger holds the
 * leaf point under it: that point's projection (grab · cos a) stays under
 * the finger. Back, the finger pulls a point of the returning leaf that
 * starts `backGrab` page widths left of the spine. Without a page, the leaf
 * only lifts against a growing resistance.
 */
export function dragAngle(drag: AlbumDrag, dx: number) {
  if (drag.rubber) {
    const pull = Math.max(0, drag.forward ? -dx : dx);
    const raw = acosDeg(1 - pull / drag.grab);
    return ALBUM_TURN.rubber * (1 - Math.exp(-raw / ALBUM_TURN.rubberSoftness));
  }
  if (drag.forward) return acosDeg(1 + Math.min(0, dx) / drag.grab);
  return acosDeg(-1 + Math.max(0, dx) / drag.grab);
}

/** Whether a drag at `angle` has crossed the point where the turn completes. */
export function dragCommitted(forward: boolean, angle: number) {
  return forward
    ? angle >= ALBUM_TURN.forwardCommit
    : angle <= ALBUM_TURN.backCommit;
}

/** Whether a released drag completes: a fling decides, otherwise the angle. */
export function releaseCompletes(forward: boolean, angle: number, vx: number) {
  const fling = ALBUM_TURN.fling;
  return forward
    ? vx < -fling || (vx <= fling && dragCommitted(true, angle))
    : vx > fling || (vx >= -fling && dragCommitted(false, angle));
}

/** How long a released leaf takes to travel from `from` to `to` degrees. */
export function releaseDuration(from: number, to: number) {
  return Math.round(
    ALBUM_TURN.releaseMin +
      (ALBUM_TURN.releaseSpan * Math.abs(to - from)) / 180,
  );
}

/**
 * Runs one value from `from` to `to` over `ms` with `curve`, handing it to
 * `paint` every frame, then calls `done`. Returns a cancel function. Without
 * `requestAnimationFrame` (or without a duration) it paints the end at once.
 */
export function runAlbumTween(
  from: number,
  to: number,
  ms: number,
  curve: AlbumCurve,
  paint: (value: number) => void,
  done: () => void,
): () => void {
  if (ms <= 0 || typeof requestAnimationFrame !== 'function') {
    paint(to);
    done();
    return () => undefined;
  }
  let frame: number | undefined;
  // Start and frames read the same clock (a frame's own timestamp may come
  // from another one in some engines).
  const start = performance.now();
  const step = () => {
    const progress = Math.min(1, Math.max(0, (performance.now() - start) / ms));
    paint(from + (to - from) * curve(progress));
    if (progress < 1) {
      frame = requestAnimationFrame(step);
      return;
    }
    frame = undefined;
    done();
  };
  frame = requestAnimationFrame(step);
  return () => {
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
  };
}
