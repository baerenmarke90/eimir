import { useEffect, useRef, useState } from 'react';
import { choreography, now } from '../motion/choreography';
import { staggerDelay } from '../motion/enter';
import { claimPlay, hasPlayed, markPlayed } from '../motion/playRegistry';
import {
  stageDuration,
  stageFinished,
  stagePhase,
  stageStartTime,
} from '../motion/stage';
import { durationMs } from '../motion/tokens';
import { WIR_STAGE, wirIntroBeat, wirModuleSlot } from './wirStageMotion';

/*
 * One-shot arrival of a Wir module the first time it is reached.
 *
 * The reveal is presentation only: the content is in the DOM and focusable
 * from the first render, nothing waits on it, and it never replays. A module
 * arrives once per session: returning to Wir from another tab, a refetch, or
 * items being added to or removed from an already seen module show the plain
 * content at once. A module that is new to this session (for example the first
 * plan creates the planning module) arrives the first time it is reached.
 *
 * With the Wir opening (#2147) the modules already in view are part of it: they
 * arrive on the opening's clock, in reading order, and end with it. The
 * opening waits for the late data above them, so nothing above a shown module
 * changes its height afterwards. A module that mounts after its slot joins in
 * the time that is left, or, after the opening, is simply there. Modules
 * further down arrive on their own when they are first reached by scrolling.
 * Without an opening (another Wir design, or none this app start) the modules
 * in view arrive together as one short, ordered batch.
 */

type RevealPhase = 'pending' | 'shown' | 'seen';

/** Play identities: `wir.module.<section class>`, scope `session`. */
const MODULE_SCOPE = 'session';
const moduleIdentity = (key: string) => `wir.module.${key}`;
/** The modules already in view share one choreography clock (M15). */
const MODULE_BATCH = 'wir.modules';
let batchSize = 0;
/** The modules that took a slot in this app start's opening. */
let openingModules = 0;

/** How the module arrives: its delay and a factor on its own beats. */
export interface ModuleArrival {
  delay: number;
  /** 1 = its usual beats; below 1 = joined late, compressed into what is left. */
  scale: number;
}

/**
 * Without an opening: after the hero has landed (2.75 beats), one module step
 * (`--duration-stagger-module`) after the other, within one batch window
 * (2.5 beats). Unchanged from #2074.
 */
function takeBatchArrival(): ModuleArrival {
  const batch = choreography(MODULE_BATCH, MODULE_SCOPE);
  const beat = wirIntroBeat();
  if (batch.startTime === null) {
    batch.start(now());
    batchSize = 0;
  } else if (now() - batch.startTime > beat * 2.5)
    return { delay: 0, scale: 1 };
  const delay = beat * 2.75 + staggerDelay(batchSize, 'module');
  batchSize += 1;
  return { delay, scale: 1 };
}

/**
 * On the opening's clock: the module's slot, joined late in what is left, or
 * `null` when too little is left (the module is simply there).
 */
function takeOpeningArrival(start: number): ModuleArrival | null {
  const slot = wirModuleSlot(openingModules);
  openingModules += 1;
  const at = now();
  const slotStart = start + slot.offset;
  if (at <= slotStart) return { delay: slotStart - at, scale: 1 };
  const left = start + stageDuration(WIR_STAGE) - at;
  if (left < durationMs('transition') || slot.length <= 0) return null;
  return { delay: 0, scale: Math.min(1, left / slot.length) };
}

/**
 * Decides how a module that is reached at the top of Wir arrives. `undefined`
 * means: it is simply there (the opening ended, or too little is left).
 */
async function initialArrival(): Promise<ModuleArrival | undefined> {
  if (stagePhase(WIR_STAGE) === 'waiting') {
    await new Promise<void>((resolve) => {
      const poll = () => {
        if (stagePhase(WIR_STAGE) !== 'waiting') resolve();
        else requestAnimationFrame(poll);
      };
      void stageFinished(WIR_STAGE).then(resolve);
      requestAnimationFrame(poll);
    });
  }
  const phase = stagePhase(WIR_STAGE);
  const start = stageStartTime(WIR_STAGE);
  if (phase === 'playing' && start !== null)
    return takeOpeningArrival(start) ?? undefined;
  // The opening already ran this app start: what is in view is at rest.
  if (phase === 'ended' && start !== null) return undefined;
  return takeBatchArrival();
}

/** Test hook: a new app start for the module arrival. */
export function resetWirRevealForTests() {
  batchSize = 0;
  openingModules = 0;
}

/** The module's stable identity for "already seen": its section class. */
function moduleKey(className: string | undefined): string | undefined {
  return className
    ?.split(/\s+/)
    .find((name) => name.startsWith('today-section-'));
}

export function useWirReveal<T extends HTMLElement>(className?: string) {
  const key = moduleKey(className);
  const ref = useRef<T>(null);
  const owner = useRef<object>({});
  const [phase, setPhase] = useState<RevealPhase>(() =>
    key && hasPlayed(moduleIdentity(key), MODULE_SCOPE) ? 'seen' : 'pending',
  );
  const [arrival, setArrival] = useState<ModuleArrival>({
    delay: 0,
    scale: 1,
  });

  // Pending: wait until the module is reached, then let it arrive once.
  useEffect(() => {
    const element = ref.current;
    if (!element || phase !== 'pending') return;
    let cancelled = false;
    const show = (next: ModuleArrival | undefined) => {
      // One play per module and session (M3); another mount of the same
      // module that already claimed it shows the plain content.
      if (key && !claimPlay(moduleIdentity(key), MODULE_SCOPE, owner.current)) {
        setPhase('seen');
        return;
      }
      if (key) markPlayed(moduleIdentity(key), MODULE_SCOPE);
      if (!next) {
        setPhase('seen');
        return;
      }
      setArrival(next);
      setPhase('shown');
    };
    if (typeof IntersectionObserver === 'undefined') {
      show({ delay: 0, scale: 1 });
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        // A module reached by scrolling arrives on its own, at once.
        if (window.scrollY > 0) {
          show({ delay: 0, scale: 1 });
          return;
        }
        void initialArrival().then((next) => {
          if (!cancelled) show(next);
        });
      },
      // A module arrives a little before it is fully inside the viewport.
      { rootMargin: '0px 0px -8% 0px', threshold: 0.01 },
    );
    observer.observe(element);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [phase, key]);

  // Shown: once its own animations have landed, the module is settled and
  // later additions or removals inside it carry no leftover delay.
  useEffect(() => {
    const element = ref.current;
    if (!element || phase !== 'shown') return;
    let cancelled = false;
    const animations =
      typeof element.getAnimations === 'function'
        ? element
            .getAnimations({ subtree: true })
            // Scroll-driven animations follow the finger and never "finish".
            .filter((animation) => animation.timeline === document.timeline)
        : [];
    Promise.allSettled(animations.map((animation) => animation.finished)).then(
      () => {
        if (!cancelled) setPhase('seen');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [phase]);

  return {
    ref,
    revealProps: {
      'data-wir-reveal': phase,
      style: {
        '--wir-reveal-delay': `${Math.round(arrival.delay)}ms`,
        '--wir-reveal-scale': Math.round(arrival.scale * 100) / 100,
      } as React.CSSProperties,
    },
  };
}
