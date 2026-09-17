import { describe, expect, it } from 'vitest';
import {
  computeScrollNavStep,
  createInitialScrollNavState,
  isHideOnScrollRoute,
} from './useHideOnScrollNav';

describe('isHideOnScrollRoute', () => {
  it('enables hide-on-scroll for Momente / Timeline and Entdecken feeds', () => {
    expect(isHideOnScrollRoute('/story')).toBe(true);
    expect(isHideOnScrollRoute('/story/years')).toBe(true);
    expect(isHideOnScrollRoute('/story/years/2026')).toBe(true);
  });

  it('keeps Heute, Planen, Mehr and Games persistent by default', () => {
    expect(isHideOnScrollRoute('/today')).toBe(false);
    expect(isHideOnScrollRoute('/plan')).toBe(false);
    expect(isHideOnScrollRoute('/more')).toBe(false);
    expect(isHideOnScrollRoute('/games')).toBe(false);
    expect(isHideOnScrollRoute('/search')).toBe(false);
  });

  it('keeps create/edit form flows persistent', () => {
    expect(isHideOnScrollRoute('/story/memories/new')).toBe(false);
    expect(isHideOnScrollRoute('/story/memories/111-222/edit')).toBe(false);
    expect(isHideOnScrollRoute('/story/heart-moments/new')).toBe(false);
    expect(isHideOnScrollRoute('/story/milestones/new')).toBe(false);
    expect(isHideOnScrollRoute('/plan/chapters/new')).toBe(false);
  });
});

describe('computeScrollNavStep', () => {
  const scrollablePage = { maxScrollY: 1000 };

  it('starts visible and stays visible during small downward scroll (< 50px)', () => {
    let state = createInitialScrollNavState(0);
    expect(state.isVisible).toBe(true);

    // Scroll from 0 to 25px
    state = computeScrollNavStep(state, {
      currentScrollY: 25,
      ...scrollablePage,
    });
    expect(state.isVisible).toBe(true);
    expect(state.accumulatedDown).toBe(25);

    // Scroll further to 45px (total 45px, threshold 50px)
    state = computeScrollNavStep(state, {
      currentScrollY: 45,
      ...scrollablePage,
    });
    expect(state.isVisible).toBe(true);
    expect(state.accumulatedDown).toBe(45);
  });

  it('hides after roughly 50px of deliberate cumulative downward scroll', () => {
    let state = createInitialScrollNavState(0);

    // Scroll to 30px
    state = computeScrollNavStep(state, {
      currentScrollY: 30,
      ...scrollablePage,
    });
    expect(state.isVisible).toBe(true);

    // Scroll to 55px (+25px, cumulative 55px >= 50px)
    state = computeScrollNavStep(state, {
      currentScrollY: 55,
      ...scrollablePage,
    });
    expect(state.isVisible).toBe(false);
    expect(state.accumulatedDown).toBe(55);
  });

  it('reveals quickly after 15px of upward scroll', () => {
    // Start with hidden state at scrollY = 200
    let state = {
      isVisible: false,
      lastScrollY: 200,
      accumulatedDown: 100,
      accumulatedUp: 0,
    };

    // Small upward scroll: 200 -> 190 (10px, < 15px)
    state = computeScrollNavStep(state, {
      currentScrollY: 190,
      ...scrollablePage,
    });
    expect(state.isVisible).toBe(false);
    expect(state.accumulatedUp).toBe(10);

    // Further upward scroll: 190 -> 180 (additional 10px, cumulative 20px >= 15px)
    state = computeScrollNavStep(state, {
      currentScrollY: 180,
      ...scrollablePage,
    });
    expect(state.isVisible).toBe(true);
  });

  it('ignores subpixel jitter below JITTER_TOLERANCE_PX', () => {
    let state = {
      isVisible: true,
      lastScrollY: 100,
      accumulatedDown: 20,
      accumulatedUp: 0,
    };

    // 1px delta should be ignored
    state = computeScrollNavStep(state, {
      currentScrollY: 101,
      ...scrollablePage,
    });
    expect(state.accumulatedDown).toBe(20);
    expect(state.lastScrollY).toBe(101);

    // 1px upward delta should also be ignored
    state = computeScrollNavStep(state, {
      currentScrollY: 100,
      ...scrollablePage,
    });
    expect(state.accumulatedDown).toBe(20);
    expect(state.accumulatedUp).toBe(0);
  });

  it('resets accumulated downward direction on meaningful reversal', () => {
    let state = createInitialScrollNavState(100);

    // User scrolls down 30px
    state = computeScrollNavStep(state, {
      currentScrollY: 130,
      ...scrollablePage,
    });
    expect(state.accumulatedDown).toBe(30);

    // User reverses and scrolls up by 8px (>= DIRECTION_REVERSAL_TOLERANCE_PX = 6px)
    state = computeScrollNavStep(state, {
      currentScrollY: 122,
      ...scrollablePage,
    });
    expect(state.accumulatedDown).toBe(0);
    expect(state.accumulatedUp).toBe(8);
  });

  it('always restores navigation near top of page (scrollY <= 20px) and overscroll', () => {
    const hiddenState = {
      isVisible: false,
      lastScrollY: 150,
      accumulatedDown: 100,
      accumulatedUp: 0,
    };

    const atTop = computeScrollNavStep(hiddenState, {
      currentScrollY: 15,
      ...scrollablePage,
    });
    expect(atTop.isVisible).toBe(true);
    expect(atTop.accumulatedDown).toBe(0);
    expect(atTop.accumulatedUp).toBe(0);

    const overscrollBounce = computeScrollNavStep(hiddenState, {
      currentScrollY: -10,
      ...scrollablePage,
    });
    expect(overscrollBounce.isVisible).toBe(true);
  });

  it('never hides on short or non-scrollable pages', () => {
    let state = createInitialScrollNavState(0);

    // maxScrollY is only 20px
    state = computeScrollNavStep(state, {
      currentScrollY: 20,
      maxScrollY: 20,
    });
    expect(state.isVisible).toBe(true);
    expect(state.accumulatedDown).toBe(0);
  });

  it('keeps navigation visible when an element is focused', () => {
    const hiddenState = {
      isVisible: false,
      lastScrollY: 200,
      accumulatedDown: 100,
      accumulatedUp: 0,
    };

    const state = computeScrollNavStep(hiddenState, {
      currentScrollY: 250,
      isFocused: true,
      ...scrollablePage,
    });
    expect(state.isVisible).toBe(true);
  });

  it('keeps navigation visible when a modal dialog is open', () => {
    const hiddenState = {
      isVisible: false,
      lastScrollY: 200,
      accumulatedDown: 100,
      accumulatedUp: 0,
    };

    const state = computeScrollNavStep(hiddenState, {
      currentScrollY: 250,
      hasOpenModal: true,
      ...scrollablePage,
    });
    expect(state.isVisible).toBe(true);
  });
});
