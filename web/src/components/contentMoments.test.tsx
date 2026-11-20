// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetScreenBudgetForTests } from '../motion/budget';
import { resetMomentsForTests } from '../motion/moment';
import { invalidateMotionTokens } from '../motion/tokens';
import { ConnectedMoment, connectedMomentPlays } from './ConnectedMoment';
import { receiptMoment } from './PartnerGestureReceipt';
import { keepsakeRest, keepsakeSwayKeyframes } from './useKeepsakeSway';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function motionPreference(reduce: boolean) {
  vi.stubGlobal('matchMedia', () => ({
    matches: reduce,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  invalidateMotionTokens();
}

beforeEach(() => {
  vi.useFakeTimers();
  motionPreference(false);
  for (const [role, value] of [
    ['--duration-gesture-moment', '900ms'],
    ['--duration-gesture-sequence', '1800ms'],
    ['--duration-sequence-beat', '200ms'],
    ['--duration-context', '280ms'],
  ])
    document.documentElement.style.setProperty(role, value);
  invalidateMotionTokens();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('style');
  resetMomentsForTests();
  resetScreenBudgetForTests();
  invalidateMotionTokens();
});

describe('the received gesture Moment (#2077)', () => {
  it('plays once per received item and keeps playing while it renders again', () => {
    expect(receiptMoment('item-1:event-1', true)).toBe('playing');
    // A second render of the same item (StrictMode, a re-render) keeps it.
    expect(receiptMoment('item-1:event-1', true)).toBe('playing');
    vi.runAllTimers();
    // After its beats ended, a later showing of the same item is final.
    expect(receiptMoment('item-1:event-1', true)).toBe('final');
  });

  it('shows the settled badge with reduced motion', () => {
    motionPreference(true);
    expect(receiptMoment('item-2:event-1', true)).toBe('final');
  });

  it('settles instead of waiting behind another emphasized Moment', () => {
    expect(receiptMoment('item-3:event-1', true)).toBe('playing');
    expect(receiptMoment('item-4:event-1', true)).toBe('final');
  });
});

describe('the connected moment (#2077)', () => {
  it('plays its beats once per session', () => {
    expect(connectedMomentPlays(false)).toBe(false);
    expect(connectedMomentPlays(true)).toBe(true);
    vi.runAllTimers();
    expect(connectedMomentPlays(true)).toBe(false);
  });

  it('keeps the first showing and its announcement with reduced motion', () => {
    motionPreference(true);
    const { container } = render(<ConnectedMoment playing />);
    const moment = container.querySelector('.connected-moment');
    expect(moment?.getAttribute('data-playing')).toBe('true');
    expect(moment?.getAttribute('data-moment')).toBe('final');
    expect(
      container
        .querySelector('.connected-moment-title')
        ?.getAttribute('aria-live'),
    ).toBe('polite');
  });

  it('a remount in the same session shows the settled state', () => {
    const first = render(<ConnectedMoment playing />);
    expect(
      first.container
        .querySelector('.connected-moment')
        ?.hasAttribute('data-moment'),
    ).toBe(false);
    first.unmount();
    vi.runAllTimers();
    const second = render(<ConnectedMoment playing />);
    expect(
      second.container
        .querySelector('.connected-moment')
        ?.getAttribute('data-moment'),
    ).toBe('final');
  });
});

describe('the keepsake sway (#2077)', () => {
  it('starts and ends each cycle in the rest pose', () => {
    expect(keepsakeSwayKeyframes(-1.4)).toEqual([
      { rotate: '-1.4deg' },
      { rotate: '-2.4deg' },
      { rotate: '-0.4deg' },
      { rotate: '-1.4deg' },
    ]);
  });

  it('reads the rest pose from the keepsake, not from a running swing', () => {
    const element = document.createElement('div');
    element.style.setProperty('--keepsake-rest', '-1.4deg');
    element.style.rotate = '16deg';
    document.body.append(element);
    expect(keepsakeRest(element)).toBe(-1.4);
    element.style.removeProperty('--keepsake-rest');
    expect(keepsakeRest(element)).toBe(0);
    element.remove();
  });
});
