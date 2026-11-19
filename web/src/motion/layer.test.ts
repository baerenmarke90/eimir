// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_ROLES,
  type FakeAnimation,
  type FakeMediaQuery,
  installFakeAnimate,
  installReducedMotion,
  setMotionRoles,
} from './__fixtures__/fakeAnimation';
import { ambient } from './ambient';
import { AttentionScheduler } from './attention';
import { ScreenBudget } from './budget';
import { Choreography, alignCssAnimations, choreography } from './choreography';
import {
  configureHapticsForTests,
  haptic,
  registerHapticsBackend,
  setHapticsEnabled,
} from './haptics';
import {
  isMediaShown,
  mediaRevealMode,
  markMediaShown,
  resetMediaRevealForTests,
  revealMedia,
} from './mediaReveal';
import { resetMomentsForTests, startMoment } from './moment';
import {
  claimPlay,
  hasPlayed,
  markPlayed,
  resetMotionSession,
  resetPlayRegistryForTests,
} from './playRegistry';
import { prefersReducedMotion, subscribeReducedMotion } from './reducedMotion';
import { ScrollState, navigate, reorder } from './replace';
import { run, runningOn } from './run';
import { durationMs, easing, motionCount, parseDuration } from './tokens';

let fake: ReturnType<typeof installFakeAnimate>;
let reduced: FakeMediaQuery;
let clearRoles: () => void;

beforeEach(() => {
  fake = installFakeAnimate();
  reduced = installReducedMotion(false);
  clearRoles = setMotionRoles(DEFAULT_ROLES);
  resetPlayRegistryForTests();
  resetMediaRevealForTests();
  resetMomentsForTests();
});

afterEach(() => {
  fake.restore();
  reduced.restore();
  clearRoles();
  document.body.innerHTML = '';
  vi.useRealTimers();
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('token adapter and reduced-motion source', () => {
  it('reads roles, re-reads them after a change, and has no literal fallback', () => {
    expect(durationMs('context')).toBe(280);
    expect(easing('standard')).toBe('cubic-bezier(0.2, 0, 0, 1)');
    expect(motionCount('ambient-repeat')).toBe(4);
    document.documentElement.style.setProperty('--duration-context', '0ms');
    expect(durationMs('context')).toBe(0);
    document.documentElement.style.removeProperty('--duration-context');
    expect(durationMs('context')).toBe(0);
    expect(parseDuration('0.4s')).toBe(400);
    expect(parseDuration('180')).toBe(0);
  });

  it('follows a reduced-motion change at runtime', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeReducedMotion(listener);
    expect(prefersReducedMotion()).toBe(false);
    reduced.set(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(prefersReducedMotion()).toBe(true);
    unsubscribe();
    reduced.set(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('play registry', () => {
  it('plays once per identity and scope; the same owner may resume', () => {
    const owner = {};
    expect(claimPlay('wir.stage', 'app-start', owner)).toBe(true);
    expect(claimPlay('wir.stage', 'app-start', owner)).toBe(true);
    expect(claimPlay('wir.stage', 'app-start', {})).toBe(false);
    expect(hasPlayed('wir.stage', 'session')).toBe(false);
    markPlayed('today.quote', 'session');
    resetMotionSession();
    expect(hasPlayed('today.quote', 'session')).toBe(false);
    expect(hasPlayed('wir.stage', 'app-start')).toBe(true);
  });
});

describe('run (own clock, interruption)', () => {
  it('returns null and shows the final state without a duration', () => {
    const element = document.createElement('div');
    expect(
      run(element, [{ opacity: 0 }, { opacity: 1 }], { duration: 0 }),
    ).toBeNull();
  });

  it('converges: a new motion on the channel commits and cancels the older one', () => {
    const element = document.createElement('div');
    const first = run(
      element,
      [{ translate: '0 10px' }, { translate: '0 0' }],
      {
        duration: 280,
        channel: 'position',
      },
    ) as unknown as FakeAnimation;
    const second = run(
      element,
      [{ translate: '0 4px' }, { translate: '0 0' }],
      {
        duration: 280,
        channel: 'position',
        interrupt: 'commit',
      },
    ) as unknown as FakeAnimation;
    expect(first.committed).toBe(true);
    expect(first.playState).toBe('idle');
    expect(runningOn(element, 'position')).toBe(second);
    // Another channel is independent.
    run(element, [{ opacity: 0 }, { opacity: 1 }], {
      duration: 180,
      channel: 'opacity',
    });
    expect(second.playState).toBe('running');
  });

  it('sets will-change only while it runs', async () => {
    const element = document.createElement('div');
    const animation = run(element, [{ opacity: 0 }, { opacity: 1 }], {
      duration: 180,
      willChange: 'opacity',
    }) as unknown as FakeAnimation;
    expect(element.style.willChange).toBe('opacity');
    animation.finish();
    await flush();
    expect(element.style.willChange).toBe('');
    expect(runningOn(element)).toBeUndefined();
  });
});

describe('replace', () => {
  it('navigates forward from the inline end and mirrors in right-to-left', () => {
    const element = document.createElement('div');
    document.body.append(element);
    const forward = navigate(element, 'forward') as unknown as FakeAnimation;
    expect((forward.keyframes as Keyframe[])[0].transform).toBe(
      'translateX(32px)',
    );
    element.style.direction = 'rtl';
    const mirrored = navigate(element, 'forward') as unknown as FakeAnimation;
    expect((mirrored.keyframes as Keyframe[])[0].transform).toBe(
      'translateX(-32px)',
    );
  });

  it('replaces a bulk reorder without motion', () => {
    const container = document.createElement('div');
    const before = new Map<string, DOMRect>();
    for (let index = 0; index < 13; index += 1) {
      const node = document.createElement('div');
      node.dataset.motionKey = `k${index}`;
      container.append(node);
      before.set(`k${index}`, new DOMRect(0, 40, 10, 10));
    }
    expect(reorder(container, before)).toEqual([]);
  });

  it('keeps a scroll state with hysteresis', () => {
    const tuck = new ScrollState(24, 12);
    expect([0, 10, 30, 40, 32, 27].map((y) => tuck.update(y))).toEqual([
      false,
      false,
      true,
      true,
      true,
      false,
    ]);
  });
});

describe('ambient', () => {
  it('is finite: it runs the token repeat count and then rests', async () => {
    const element = document.createElement('div');
    document.body.append(element);
    const handle = ambient(element, { kind: 'breath' });
    const animation = fake.animations[0];
    expect(animation.options.iterations).toBe(4);
    animation.finish();
    await handle.finished;
    expect(runningOn(element, 'ambient')).toBeUndefined();
  });

  it('pauses while its kept tab is hidden and continues where it paused', async () => {
    const panel = document.createElement('section');
    panel.dataset.primaryTab = '/wir';
    const ring = document.createElement('div');
    panel.append(ring);
    document.body.append(panel);
    ambient(ring, { kind: 'breath' });
    const animation = fake.animations[0];
    animation.currentTime = 1234;
    panel.hidden = true;
    await flush();
    expect(animation.playState).toBe('paused');
    panel.hidden = false;
    await flush();
    expect(animation.playState).toBe('running');
    expect(animation.currentTime).toBe(1234);
    expect(fake.animations).toHaveLength(1);
  });

  it('pauses while the page is hidden', () => {
    const ring = document.createElement('div');
    document.body.append(ring);
    ambient(ring, { kind: 'twinkle' });
    const animation = fake.animations[0];
    const state = vi
      .spyOn(document, 'visibilityState', 'get')
      .mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(animation.playState).toBe('paused');
    state.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(animation.playState).toBe('running');
    state.mockRestore();
  });

  it('starts only after the entrance ended, and is absent with reduced motion', async () => {
    const ring = document.createElement('div');
    let entered: () => void = () => {};
    ambient(ring, {
      kind: 'breath',
      after: new Promise<void>((r) => {
        entered = r;
      }),
    });
    expect(fake.animations).toHaveLength(0);
    entered();
    await flush();
    expect(fake.animations).toHaveLength(1);

    reduced.set(true);
    expect(fake.animations[0].playState).toBe('idle');
    ambient(document.createElement('div'), { kind: 'breath' });
    expect(fake.animations).toHaveLength(1);
  });

  it('rejects an infinite repeat', () => {
    ambient(document.createElement('div'), {
      kind: 'breath',
      iterations: Infinity,
    });
    expect(fake.animations).toHaveLength(0);
  });
});

describe('choreography clock', () => {
  it('aligns late members, shows final state after the slot, and reports its end', () => {
    const clock = new Choreography('wir.opening');
    clock.start(1000);
    expect(clock.timing({ offset: 0, duration: 400 }, 1000)).toEqual({
      kind: 'play',
      delay: 0,
    });
    expect(clock.timing({ offset: 200, duration: 400 }, 1300)).toEqual({
      kind: 'play',
      delay: -100,
    });
    expect(clock.timing({ offset: 200, duration: 400 }, 1600)).toEqual({
      kind: 'final',
    });
    expect(clock.finished(1599)).toBe(false);
    expect(clock.finished(1600)).toBe(true);
  });

  it('keeps one clock per identity across remounts', () => {
    const first = choreography('wir.opening.test', 'app-start');
    first.start(500);
    expect(choreography('wir.opening.test', 'app-start').startTime).toBe(500);
  });

  it('pins matching CSS animations to the start time', () => {
    const matching = { animationName: 'wir-intro-heart', startTime: 900 };
    const other = { animationName: 'gesture-pulse', startTime: 900 };
    const root = {
      getAnimations: () => [matching, other],
    } as unknown as Element;
    alignCssAnimations(root, 400, 'wir-intro-');
    expect(matching.startTime).toBe(400);
    expect(other.startTime).toBe(900);
  });
});

describe('screen budget', () => {
  it('allows one emphasized motion; a second waits or shows its final state', () => {
    let now = 0;
    const budget = new ScreenBudget({ now: () => now, maxWait: () => 280 });
    const first = budget.requestEmphasis(1800);
    expect(first?.delay).toBe(0);
    now = 1600;
    expect(budget.requestEmphasis(900)?.delay).toBe(200);
    now = 1700;
    // The second now holds the screen until 2700: 1000 ms away.
    expect(budget.requestEmphasis(900)).toBeNull();
  });

  it('caps animating elements at 12 and blocks while dragging or typing', () => {
    const budget = new ScreenBudget();
    expect(budget.reserveElements(10)).toBe(10);
    expect(budget.reserveElements(5)).toBe(2);
    budget.releaseElements(12);
    budget.setInput('drag', true);
    expect(budget.reserveElements(1)).toBe(0);
    expect(budget.requestEmphasis(280)).toBeNull();
    budget.setInput('drag', false);
    expect(budget.reserveElements(1)).toBe(1);
  });
});

describe('attention scheduler', () => {
  function scheduler(now: { value: number }) {
    return new AttentionScheduler({
      budget: new ScreenBudget(),
      now: () => now.value,
      sameKindInterval: 30_000,
    });
  }

  it('lets a higher kind take over and drops a lower one, never queueing it', () => {
    const now = { value: 0 };
    const attention = scheduler(now);
    const onPreempt = vi.fn();
    const arrival = attention.request('arrival', { onPreempt });
    expect(arrival).not.toBeNull();
    expect(attention.request('hint')).toBeNull();
    const moment = attention.request('moment');
    expect(moment).not.toBeNull();
    expect(onPreempt).toHaveBeenCalledTimes(1);
    moment?.release();
    // The dropped hint does not come back on its own.
    expect(attention.activeKind).toBeNull();
  });

  it('rate-limits the same kind to once per interval', () => {
    const now = { value: 0 };
    const attention = scheduler(now);
    attention.request('arrival')?.release();
    now.value = 29_999;
    expect(attention.request('arrival')).toBeNull();
    now.value = 30_000;
    expect(attention.request('arrival')).not.toBeNull();
  });

  it('plays nothing while hidden, during input or with a sheet open', () => {
    const now = { value: 0 };
    const attention = scheduler(now);
    expect(attention.request('enter', { visible: false })).toBeNull();
    attention.setSheetOpen(true);
    expect(attention.request('enter')).toBeNull();
    attention.setSheetOpen(false);
    expect(attention.request('enter')).not.toBeNull();
  });
});

describe('moment', () => {
  it('plays once per item and counts as the one emphasized motion', () => {
    const budget = new ScreenBudget({ now: () => 0, maxWait: () => 280 });
    const gesture = {};
    const ticket = startMoment('wir.gesture-receipt', gesture, { budget });
    expect(ticket).not.toBeNull();
    expect(startMoment('wir.gesture-receipt', gesture, { budget })).toBeNull();
    expect(startMoment('wir.gesture-receipt', {}, { budget })).toBeNull();
  });

  it('shows its final state with reduced motion and never plays that item later', () => {
    reduced.set(true);
    expect(
      startMoment('wir.important-day', '2026-11-20|anniversary'),
    ).toBeNull();
    reduced.set(false);
    expect(
      startMoment('wir.important-day', '2026-11-20|anniversary'),
    ).toBeNull();
  });
});

describe('media reveal', () => {
  it('fades only the first time a URL is shown, never again after a remount', async () => {
    const url = 'blob:avatar-own';
    expect(isMediaShown(url)).toBe(false);
    let clock = 0;
    const image = document.createElement('img');
    image.decode = () => {
      clock += 40;
      return Promise.resolve();
    };
    expect(await revealMedia(image, url, () => clock)).toBe('fade');
    expect(isMediaShown(url)).toBe(true);
    // A remounted avatar with the same URL appears at once.
    expect(
      await revealMedia(document.createElement('img'), url, () => clock),
    ).toBe('instant');
    expect(mediaRevealMode(url, 200)).toBe('instant');
  });

  it('shows a cached decode at once, and everything at once with reduced motion', () => {
    expect(mediaRevealMode('blob:cached', 5)).toBe('instant');
    reduced.set(true);
    expect(mediaRevealMode('blob:new', 200)).toBe('instant');
    markMediaShown('blob:new');
    expect(isMediaShown('blob:new')).toBe(true);
  });
});

describe('haptics adapter', () => {
  const backend = {
    selectionChanged: vi.fn(),
    impact: vi.fn(),
    notification: vi.fn(),
  };

  beforeEach(() => {
    for (const fn of Object.values(backend)) fn.mockClear();
    registerHapticsBackend(backend);
    localStorage.clear();
  });

  afterEach(() => {
    registerHapticsBackend(null);
    configureHapticsForTests({});
  });

  it('is a no-op on the Web, even with a backend', () => {
    configureHapticsForTests({ native: false });
    expect(haptic('commit')).toBe(false);
    expect(backend.impact).not.toHaveBeenCalled();
  });

  it('keeps the budget and the in-app switch in the native app', () => {
    let now = 0;
    configureHapticsForTests({ native: true, now: () => now });
    expect(haptic('press')).toBe(true);
    now = 100;
    expect(haptic('success')).toBe(false);
    expect(haptic('threshold')).toBe(true);
    now = 400;
    expect(haptic('success')).toBe(true);
    expect(backend.notification).toHaveBeenCalledWith('success');
    setHapticsEnabled(false);
    now = 1000;
    expect(haptic('commit')).toBe(false);
  });
});
