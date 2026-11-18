import { useEffect, useRef, useState } from 'react';

/*
 * One-shot arrival of a Wir module the first time it is reached.
 *
 * The reveal is presentation only: the content is in the DOM and focusable
 * from the first render, nothing waits on it, and it never replays. A module
 * arrives once per session: returning to Wir from another tab, a refetch, or
 * items being added to or removed from an already seen module show the plain
 * content at once. A module that is new to this session (for example the first
 * plan creates the planning module) arrives the first time it is reached.
 * Modules already in view when Wir opens arrive together as one short, ordered
 * choreography after the hero; modules further down arrive on their own.
 *
 * They also wait, invisibly and in their own place, until the hero and the
 * daily quote above them have stopped changing (or a short cap has passed).
 * The quote and the check-in arrive from the network after the first paint
 * and change the height of what sits above the modules; revealing a module
 * first would let a visible card jump down. Waiting means those late changes
 * only ever move things that are not shown yet.
 */
const INITIAL_BATCH_WINDOW_MS = 1100;
const INITIAL_BATCH_START_MS = 580;
const INITIAL_BATCH_STEP_MS = 130;
const INITIAL_BATCH_MAX_STEPS = 4;
/** The hero and the quote count as settled after this long without a change. */
const SETTLE_QUIET_MS = 300;
/** A slow or failing request never keeps the modules hidden longer than this. */
const SETTLE_MAX_MS = 2200;
const SETTLE_POLL_MS = 80;

type RevealPhase = 'pending' | 'shown' | 'seen';

const seenModules = new Set<string>();
let initialBatchStartedAt: number | null = null;
let initialBatchSize = 0;

/** The delay a module in the opening batch waits before it arrives. */
function takeInitialBatchDelayMs(now: number): number | null {
  if (
    initialBatchStartedAt === null ||
    now - initialBatchStartedAt > INITIAL_BATCH_WINDOW_MS
  ) {
    // A later reveal starts a new batch only while the page has not been
    // scrolled; a module reached by scrolling never waits for a choreography.
    if (initialBatchStartedAt !== null || window.scrollY > 0) return null;
    initialBatchStartedAt = now;
    initialBatchSize = 0;
  }
  const step = Math.min(initialBatchSize, INITIAL_BATCH_MAX_STEPS);
  initialBatchSize += 1;
  return INITIAL_BATCH_START_MS + step * INITIAL_BATCH_STEP_MS;
}

let settled: Promise<void> | null = null;

/** What changes while the hero and the quote above the modules are still loading. */
function stageSignature(): string {
  const height = (element: Element | null) =>
    element ? Math.round(element.getBoundingClientRect().height) : -1;
  const quote = document.querySelector('.daily-quote-card');
  const loading = quote?.querySelector('.is-loading') ? 'loading' : '';
  return `${height(document.querySelector('.wir-stage'))}|${height(quote)}|${loading}`;
}

/**
 * Resolves once what sits above the modules has stopped changing, or after
 * a cap. Answered once per session: later modules never wait again.
 */
function whenStageSettled(): Promise<void> {
  settled ??= new Promise<void>((resolve) => {
    if (!document.querySelector('.wir-stage')) {
      resolve();
      return;
    }
    const startedAt = performance.now();
    let signature = stageSignature();
    let changedAt = startedAt;
    const timer = window.setInterval(() => {
      const now = performance.now();
      const next = stageSignature();
      if (next !== signature) {
        signature = next;
        changedAt = now;
      }
      const quiet =
        now - changedAt >= SETTLE_QUIET_MS && !signature.endsWith('loading');
      if (quiet || now - startedAt >= SETTLE_MAX_MS) {
        window.clearInterval(timer);
        resolve();
      }
    }, SETTLE_POLL_MS);
  });
  return settled;
}

/** Test hook: the next module asks the stage again. */
export function resetWirStageSettleForTests() {
  settled = null;
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
  const [phase, setPhase] = useState<RevealPhase>(() =>
    key && seenModules.has(key) ? 'seen' : 'pending',
  );
  const [delayMs, setDelayMs] = useState(0);

  // Pending: wait until the module is reached, then let it arrive once.
  useEffect(() => {
    const element = ref.current;
    if (!element || phase !== 'pending') return;
    let cancelled = false;
    const show = (delay: number) => {
      if (key) seenModules.add(key);
      setDelayMs(delay);
      setPhase('shown');
    };
    if (typeof IntersectionObserver === 'undefined') {
      show(0);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        const arrive = () => {
          if (!cancelled) show(takeInitialBatchDelayMs(performance.now()) ?? 0);
        };
        // A module reached by scrolling never waits for the hero.
        if (window.scrollY > 0) arrive();
        else void whenStageSettled().then(arrive);
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
      style: { '--wir-reveal-delay': `${delayMs}ms` } as React.CSSProperties,
    },
  };
}
