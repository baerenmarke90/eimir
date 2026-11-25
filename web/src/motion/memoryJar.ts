/**
 * The motion layer's frame-driven motion for the Glas memory world (#2283):
 * the jar that follows the finger sideways or rocks by itself, the loose
 * slips that lag behind, hop and hit the glass, the gingham lid that loosens
 * and clinks on the rim, the tag that keeps hanging while the jar tilts, and
 * the drawn slip that folds in thirds while it is carried back up into the
 * jar's mouth.
 *
 * Each frame writes transforms and opacities only: to at most seven elements
 * of the jar (the pile moves as three layers, never slip by slip), or to the
 * drawn slip's paper, its two flaps and its two attachments. The world owns
 * the elements and hands them in; a loop stops as soon as everything rests.
 * With reduced motion the world never starts any of this and shows each
 * result at once. The one-shot effects (the lid popping, the slip jumping
 * out, the unfolding on the stage, the drop back into the pile) and the
 * candle's ambient loops are CSS (`memory-worlds.css`, jar roles). The values
 * were tuned with the Product Owner in the accepted prototype and are kept
 * unchanged.
 */

/** Timings of the Glas in ms (the CSS lengths are the jar roles). */
export const JAR_TIMING = Object.freeze({
  /** The commit haptic as the lid jumps up. */
  popHaptic: 300,
  /** The slip jumps out (`--memory-jar-jump-delay` + `-duration`), then the stage opens. */
  popToStage: 1400,
  /** On the stage the top flap lands (`--memory-jar-top-delay` + `--memory-jar-unfold-duration`)… */
  stageTopLand: 1860,
  /** … then the bottom one (`--memory-jar-bottom-delay` + `--memory-jar-unfold-duration`). */
  stageBottomLand: 2460,
  /** Both flaps lie flat: the real sheet takes over. */
  stageUnfolded: 2520,
  /** The stage fades out (`--memory-jar-close-duration`). */
  stageClose: 420,
  /** From closing the stage until the page has settled and the slip goes back. */
  stageToReturn: 760,
  /** The page's slip is brought into view once the jar has shrunk. */
  revealPage: 640,
  /** Folding the whole slip when it is not pulled by hand. */
  fold: 1000,
  /** A slip pulled not far enough springs back open. */
  springBack: 360,
  /** The folded slip flies into the jar's mouth. */
  carry: 820,
  /** It lands in the pile (`--memory-jar-drop-duration`), and the return is done. */
  dropLand: 480,
  dropDone: 900,
  /** After this pause without rattling, the lid settles tight again. */
  relax: 2200,
  /** After today's draw a rattle is refused gently, a beat later. */
  refuseDelay: 320,
  /** A hard shake (the tag, a shaken phone) rocks the jar this long first. */
  hardShake: 1360,
  /** A click right after a drag is not a tap. */
  clickReset: 80,
});

/** A scripted shake: amplitude in px, period and length in s. */
export interface JarShake {
  amp: number;
  period: number;
  duration: number;
}

/** A tap is one gentle shake; the tag or a shaken phone a good one. */
export const JAR_SHAKES = Object.freeze({
  tap: Object.freeze({ amp: 16, period: 0.38, duration: 0.76 }),
  hard: Object.freeze({ amp: 24, period: 0.44, duration: 1.32 }),
});

/** The jar's artwork box (one unit is 1 px of the 240 × 330 jar). */
export const JAR_GEOMETRY = Object.freeze({
  width: 240,
  /** The jar's mouth, where a returning slip disappears. */
  mouthY: 30,
  /** The folded slip's width when it reaches the mouth. */
  mouthSlip: 38,
  /** The neck a jumping slip passes, and where it leaves on the left. */
  neckX: 92,
  neckY: 92,
  exitX: 62,
  exitY: -34,
});

/** Half the free play of the slips inside the jar, in px. */
export const JAR_WALL = 9;

/**
 * The pile moves as three layers (bottom, middle, top): sideways play in px,
 * turn in deg and lift in px at full slosh, and how high a rattle throws it.
 */
export const JAR_GROUPS = Object.freeze([
  Object.freeze({ k: 4, kr: 2.5, lift: 0, hop: 0.45 }),
  Object.freeze({ k: 7, kr: -4, lift: 2.5, hop: 0.8 }),
  Object.freeze({ k: 11, kr: 6, lift: 5, hop: 1.25 }),
]);

/** Where the finger has pulled the jar: a soft limit of 46 px. */
export function jarFollow(dx: number): number {
  return 46 * Math.tanh(dx / 70);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** The cubic ease-in-out of the fold and the carry. */
export function jarEaseInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/* ---------- The jar ---------- */

interface Spring {
  y: number;
  v: number;
}

export interface JarSim {
  /** The jar's sideways offset (px) and speed, and its tilt (deg). */
  x: number;
  v: number;
  tilt: number;
  /** The slips' slosh inside the glass (px) and its speed. */
  s: number;
  sv: number;
  /** A shaken phone's push and tilt. */
  ext: number;
  extTilt: number;
  /** Where the finger holds the jar. */
  target: number;
  dragging: boolean;
  script: (JarShake & { start: number }) | null;
  lastImpact: number;
  hops: Spring[];
  lid: Spring;
  lidTurn: Spring;
  /** How loose the lid sits (0 tight … 1 about to pop). */
  loose: number;
  looseTarget: number;
  tag: Spring;
  last: number;
}

export function createJarSim(): JarSim {
  return {
    x: 0,
    v: 0,
    tilt: 0,
    s: 0,
    sv: 0,
    ext: 0,
    extTilt: 0,
    target: 0,
    dragging: false,
    script: null,
    lastImpact: Number.NEGATIVE_INFINITY,
    hops: [
      { y: 0, v: 0 },
      { y: 0, v: 0 },
      { y: 0, v: 0 },
    ],
    lid: { y: 0, v: 0 },
    lidTurn: { y: 0, v: 0 },
    loose: 0,
    looseTarget: 0,
    tag: { y: 0, v: 0 },
    last: 0,
  };
}

function spring(
  sp: Spring,
  goal: number,
  stiffness: number,
  damping: number,
  dt: number,
) {
  sp.v += (stiffness * (goal - sp.y) - damping * sp.v) * dt;
  sp.y += sp.v * dt;
}

function still(sp: Spring) {
  return Math.abs(sp.y) < 0.05 && Math.abs(sp.v) < 0.5;
}

/** How a frame ends: still moving, at rest, or resting with a loosened lid. */
export type JarRest = 'moving' | 'rest' | 'loose';

/**
 * One frame of the jar at `now` (ms). A held jar follows the hand closely;
 * let go, it rocks back and settles. The slips are loose: they lag behind
 * the jar, slide downhill and hit the wall, which calls `onImpact` with the
 * impact's strength (0..1). At rest everything is set exactly to zero.
 */
export function stepJar(
  m: JarSim,
  now: number,
  onImpact: (intensity: number) => void = () => undefined,
): JarRest {
  const dt = m.last ? clamp((now - m.last) / 1000, 0.001, 0.034) : 1 / 60;
  m.last = now;
  let target = 0;
  let held = false;
  if (m.dragging) {
    target = m.target;
    held = true;
  } else if (m.script) {
    const t = (now - m.script.start) / 1000;
    if (t >= m.script.duration) m.script = null;
    else {
      target =
        m.script.amp *
        Math.sin((2 * Math.PI * t) / m.script.period) *
        (1 - t / m.script.duration);
      held = true;
    }
  }
  const k = held ? 700 : 160;
  const c = held ? 45 : 7;
  const a = k * (target - m.x) - c * m.v;
  m.v += a * dt;
  m.x += m.v * dt;
  m.ext *= 0.82;
  m.extTilt *= 0.9;
  m.tilt = clamp(m.x * 0.25 + m.extTilt, -14, 14);
  const downhill = 900 * Math.sin((m.tilt * Math.PI) / 180);
  const sa = -(a + m.ext) - 49 * m.s - 4 * m.sv + downhill;
  m.sv += sa * dt;
  m.s += m.sv * dt;
  if (Math.abs(m.s) > JAR_WALL) {
    const side = Math.sign(m.s);
    m.s = side * JAR_WALL;
    if (Math.sign(m.sv) === side) {
      const speed = Math.abs(m.sv);
      m.sv = -m.sv * 0.25;
      if (speed > 110 && now - m.lastImpact > 90) {
        m.lastImpact = now;
        // Visual feedback only; the count comes from the finger.
        onImpact(Math.min(1, speed / 420));
      }
    }
  }
  for (const hop of m.hops) spring(hop, 0, 500, 22, dt);
  spring(m.lid, 0, 700, 26, dt);
  spring(m.lidTurn, 0, 600, 24, dt);
  // The tag keeps hanging while the jar tilts, and swings a little.
  spring(m.tag, -m.tilt * 0.8, 120, 6, dt);
  m.loose += (m.looseTarget - m.loose) * Math.min(1, dt * 8);
  const settled =
    !held &&
    Math.abs(m.x) < 0.05 &&
    Math.abs(m.v) < 0.5 &&
    Math.abs(m.s) < 0.05 &&
    Math.abs(m.sv) < 0.5 &&
    Math.abs(m.ext) < 1 &&
    Math.abs(m.extTilt) < 0.05 &&
    m.hops.every(still) &&
    still(m.lid) &&
    still(m.lidTurn) &&
    still(m.tag) &&
    Math.abs(m.loose - m.looseTarget) < 0.002;
  if (!settled) return 'moving';
  m.last = 0;
  if (m.looseTarget !== 0) return 'loose';
  m.x = 0;
  m.v = 0;
  m.s = 0;
  m.sv = 0;
  m.ext = 0;
  m.extTilt = 0;
  m.tilt = 0;
  m.loose = 0;
  return 'rest';
}

/** The transforms of one frame, for the parts of the jar. */
export interface JarPose {
  body: string;
  shadow: string;
  groups: string[];
  lid: string;
  tag: string;
}

export function jarPose(m: JarSim): JarPose {
  const sl = m.s / JAR_WALL;
  const lift = Math.abs(sl);
  return {
    body: `translate3d(${m.x.toFixed(2)}px, 0, 0) rotate(${m.tilt.toFixed(2)}deg)`,
    shadow: `translate3d(${(m.x * 0.85).toFixed(2)}px, 0, 0)`,
    groups: JAR_GROUPS.map((g, index) => {
      const y = -lift * g.lift + m.hops[index].y;
      return `translate3d(${(sl * g.k).toFixed(2)}px, ${y.toFixed(2)}px, 0) rotate(${(sl * g.kr).toFixed(2)}deg)`;
    }),
    lid: `translate3d(0, ${(-3 * m.loose + m.lid.y).toFixed(2)}px, 0) rotate(${(2.5 * m.loose + m.lidTurn.y).toFixed(2)}deg)`,
    tag: `rotate(${(-18 + m.tag.y).toFixed(2)}deg)`,
  };
}

/** The jar's moving parts, owned by the world. */
export interface JarParts {
  jar: HTMLElement | null;
  body: HTMLElement | null;
  shadow: HTMLElement | null;
  groups: readonly (HTMLElement | null)[];
  lid: HTMLElement | null;
  tag: HTMLElement | null;
}

export interface JarDriver {
  /** Starts the loop if it is not running. */
  kick(): void;
  /** The finger holds the jar this far sideways (px). */
  hold(target: number): void;
  /** The finger lets go. */
  release(): void;
  /** Whether the finger or a scripted shake moves the jar. */
  busy(): boolean;
  /** Rocks the jar by itself. */
  shake(script: JarShake): void;
  /** The slips hop, and the lid clinks on the rim when `lid` is set. */
  clink(intensity: number, lid: boolean): void;
  /** The lid loosens towards `target` (0..1). */
  loosen(target: number): void;
  /** Ends a shake at once and lets the lid settle (the lid pops now). */
  calm(): void;
  /** A shaken phone's sideways acceleration (m/s², gravity removed). */
  push(lateral: number): void;
  /** Stops the loop and leaves every part untransformed. */
  stop(): void;
}

/**
 * The jar's frame loop. `parts` is read every frame; `onImpact` hears the
 * slips hit the glass. `clock` and `random` are injectable for tests.
 */
export function createJarDriver(
  parts: () => JarParts,
  onImpact: (intensity: number) => void,
  {
    clock = () => performance.now(),
    random = Math.random,
  }: { clock?: () => number; random?: () => number } = {},
): JarDriver {
  const m = createJarSim();
  let handle = 0;
  /** A frame is being computed: an impact's clink must not start a second loop. */
  let stepping = false;

  const write = () => {
    const p = parts();
    const pose = jarPose(m);
    if (p.body) p.body.style.transform = pose.body;
    if (p.shadow) p.shadow.style.transform = pose.shadow;
    p.groups.forEach((el, index) => {
      if (el) el.style.transform = pose.groups[index];
    });
    if (p.lid) p.lid.style.transform = pose.lid;
    if (p.tag) p.tag.style.transform = pose.tag;
  };

  const clear = () => {
    const p = parts();
    for (const el of [p.body, p.shadow, ...p.groups, p.lid, p.tag])
      if (el) el.style.transform = '';
    if (p.jar) delete p.jar.dataset.shaking;
  };

  const frame = () => {
    handle = 0;
    stepping = true;
    let rest: JarRest;
    try {
      rest = stepJar(m, clock(), onImpact);
    } finally {
      stepping = false;
    }
    if (rest === 'rest') {
      clear();
      return;
    }
    write();
    if (rest === 'loose') {
      // Resting with a loosened lid: keep the pose, stop the loop.
      const jar = parts().jar;
      if (jar) delete jar.dataset.shaking;
      return;
    }
    handle = requestAnimationFrame(frame);
  };

  const kick = () => {
    if (handle || stepping) return;
    const jar = parts().jar;
    if (jar) jar.dataset.shaking = 'true';
    m.last = 0;
    handle = requestAnimationFrame(frame);
  };

  return {
    kick,
    hold(target) {
      m.script = null;
      m.dragging = true;
      m.target = target;
      kick();
    },
    release() {
      m.dragging = false;
    },
    busy() {
      return m.dragging || m.script !== null;
    },
    shake(script) {
      m.dragging = false;
      m.script = { ...script, start: clock() };
      kick();
    },
    clink(intensity, lid) {
      m.hops.forEach((hop, index) => {
        hop.v -=
          (60 + 150 * intensity) *
          JAR_GROUPS[index].hop *
          (0.7 + random() * 0.6);
      });
      if (lid) {
        m.lid.v -= 70 + 150 * intensity;
        m.lidTurn.v += (random() - 0.5) * 80 * intensity;
      }
      kick();
    },
    loosen(target) {
      m.looseTarget = target;
      kick();
    },
    calm() {
      m.script = null;
      m.dragging = false;
      m.looseTarget = 0;
      kick();
    },
    push(lateral) {
      if (m.dragging || m.script) return;
      m.ext = lateral * 320;
      m.extTilt = m.extTilt * 0.6 + clamp(lateral * 0.5, -8, 8) * 0.4;
      kick();
    },
    stop() {
      if (handle) cancelAnimationFrame(handle);
      handle = 0;
      clear();
    },
  };
}

/* ---------- The slip that jumps out, and the stage ---------- */

/** A slip's box and turn inside the jar's artwork. */
export interface JarSlipBox {
  left: number;
  top: number;
  w: number;
  h: number;
  rot: number;
}

/**
 * The jump of a slip (the `--memory-jar-*` values of the CSS jump): up
 * through the neck, then out on the left, where the tipped lid leaves the
 * mouth open.
 */
export function jumpVars(slip: JarSlipBox): Record<string, string> {
  const cx = slip.left + slip.w / 2;
  const cy = slip.top + slip.h / 2;
  return {
    '--memory-jar-r0': `${slip.rot}deg`,
    '--memory-jar-nx': `${JAR_GEOMETRY.neckX - cx}px`,
    '--memory-jar-ny': `${JAR_GEOMETRY.neckY - cy}px`,
    '--memory-jar-ax': `${JAR_GEOMETRY.exitX - cx}px`,
    '--memory-jar-ay': `${JAR_GEOMETRY.exitY - cy}px`,
  };
}

/** Where the jumping slip was on screen, and how wide it was there. */
export interface JarFlightStart {
  cx: number;
  cy: number;
  w: number;
}

/**
 * The stage's slip flies in from where the jumping slip was (the
 * `--memory-jar-f*` values of the CSS flight); without a start it rises
 * from below, without a measured sheet from a third of the way down.
 */
export function stageFlightVars(
  sheet: DOMRect | null,
  start: JarFlightStart | null,
  viewportHeight: number,
): Record<string, string> {
  let fx = 0;
  let fy = viewportHeight * 0.35;
  let fs = 0.14;
  if (sheet && sheet.width > 0) {
    const cx = sheet.left + sheet.width / 2;
    const cy = sheet.top + sheet.height / 2;
    if (start) {
      fx = start.cx - cx;
      fy = start.cy - cy;
      fs = Math.max(0.05, start.w / sheet.width);
    } else fy = viewportHeight - cy;
  }
  return {
    '--memory-jar-fx': `${fx.toFixed(1)}px`,
    '--memory-jar-fy': `${fy.toFixed(1)}px`,
    '--memory-jar-fs': fs.toFixed(3),
    '--memory-jar-fr': '-10deg',
  };
}

/* ---------- Putting the slip back: it folds as it goes up ---------- */

/** The way from the slip in the page to the jar's mouth. */
export interface FoldTrack {
  /** 0 = open, 1 = folded in thirds. */
  p: number;
  /** Where the hand has pulled the slip, in px (negative = up). */
  dragY: number;
  tx: number;
  ty: number;
  ts: number;
  /** Distance from the slip to the jar's mouth, in px. */
  dist: number;
}

/** A pulled slip folds on once it is this far folded; less springs back. */
export const FOLD_COMMIT = 0.45;
/** The finger moves this far before the slip follows it. */
export const FOLD_SLOP = 8;

/** Measures the way from the slip to the jar's mouth, before anything moves. */
export function measureFold(paper: DOMRect, jar: DOMRect): FoldTrack | null {
  if (paper.width === 0) return null;
  const scale = jar.width / JAR_GEOMETRY.width;
  const ty =
    jar.top + JAR_GEOMETRY.mouthY * scale - (paper.top + paper.height / 2);
  return {
    p: 0,
    dragY: 0,
    tx: jar.left + jar.width / 2 - (paper.left + paper.width / 2),
    ty,
    ts: (JAR_GEOMETRY.mouthSlip * scale) / paper.width,
    dist: Math.max(120, -ty),
  };
}

/** The slip follows the hand towards the jar and folds on the way. */
export function dragFold(track: FoldTrack, dy: number): void {
  track.dragY = clamp(dy, -track.dist * 1.05, 30);
  track.p = clamp(-track.dragY / (track.dist * 0.6), 0, 1);
}

/** The two flaps for a fold `p`: the bottom third folds first, then the top. */
export function foldFlaps(p: number): { bottom: number; top: number } {
  return { bottom: clamp(p * 2, 0, 1), top: clamp(p * 2 - 1, 0, 1) };
}

/** The drawn slip's moving parts, owned by the world. */
export interface FoldParts {
  paper: HTMLElement;
  top: HTMLElement | null;
  bottom: HTMLElement | null;
  diary: HTMLElement | null;
  back: HTMLElement | null;
}

/**
 * Paints the slip folded `p` (0 open … 1 folded) and carried `carry` of the
 * way (0 where the hand left it … 1 in the jar's mouth).
 */
export function paintFold(
  parts: FoldParts,
  track: FoldTrack,
  p: number,
  carry: number,
): void {
  const flaps = foldFlaps(p);
  if (parts.bottom)
    parts.bottom.style.transform = `rotateX(${(flaps.bottom * 180).toFixed(2)}deg)`;
  if (parts.top)
    parts.top.style.transform = `rotateX(${(-flaps.top * 180).toFixed(2)}deg)`;
  if (parts.diary) parts.diary.style.opacity = String(clamp(1 - p * 5, 0, 1));
  if (parts.back)
    parts.back.style.opacity = String(clamp(1 - (p - 0.35) * 5, 0, 1));
  const e = jarEaseInOut(carry);
  const s0 = 1 - 0.12 * p;
  const x = track.tx * e;
  const y =
    track.dragY + (track.ty - track.dragY) * e - 56 * Math.sin(Math.PI * e);
  const s = s0 + (track.ts - s0) * e;
  const r = 6 * Math.sin(Math.PI * e) - 4 * e;
  parts.paper.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${s.toFixed(4)}) rotate(${r.toFixed(2)}deg)`;
  parts.paper.style.opacity =
    carry > 0.82 ? String(clamp(1 - (carry - 0.82) / 0.18, 0, 1)) : '';
}

export function clearFold(parts: FoldParts): void {
  for (const el of [
    parts.paper,
    parts.top,
    parts.bottom,
    parts.diary,
    parts.back,
  ]) {
    if (!el) continue;
    el.style.transform = '';
    el.style.opacity = '';
  }
}

/**
 * Runs `onFrame(t)` with `t` from 0 to 1 over `ms`, then `onDone`. Returns a
 * cancel function. Without a duration it paints the end at once.
 */
export function runJarTween(
  ms: number,
  onFrame: (t: number) => void,
  onDone: () => void,
  clock: () => number = () => performance.now(),
): () => void {
  if (ms <= 0) {
    onFrame(1);
    onDone();
    return () => undefined;
  }
  let handle = 0;
  const start = clock();
  const frame = () => {
    const t = clamp((clock() - start) / ms, 0, 1);
    onFrame(t);
    if (t >= 1) {
      handle = 0;
      onDone();
      return;
    }
    handle = requestAnimationFrame(frame);
  };
  handle = requestAnimationFrame(frame);
  return () => {
    if (handle) cancelAnimationFrame(handle);
    handle = 0;
  };
}
