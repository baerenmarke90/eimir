// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MOMENT_CLIP_MAX_MS,
  MOMENT_PHOTO_DWELL_MS,
  useMomentRotation,
} from './useMomentRotation';

function Probe({ count, clips = [] }: { count: number; clips?: number[] }) {
  const rotation = useMomentRotation(count, (index) => clips.includes(index));
  return (
    <div ref={rotation.frameRef} {...rotation.engagement}>
      <output data-testid="state">
        {JSON.stringify({
          index: rotation.index,
          previous: rotation.previous,
          rotates: rotation.rotates,
          running: rotation.running,
        })}
      </output>
    </div>
  );
}

const state = () => JSON.parse(screen.getByTestId('state').textContent ?? '{}');

let observerCallbacks: ((entries: { isIntersecting: boolean }[]) => void)[] =
  [];

function stubEnvironment({ reducedMotion = false } = {}) {
  observerCallbacks = [];
  class FakeObserver {
    constructor(callback: (typeof observerCallbacks)[number]) {
      observerCallbacks.push(callback);
    }
    observe() {}
    disconnect() {}
  }
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  vi.stubGlobal('matchMedia', () => ({
    matches: reducedMotion,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

const seen = (isIntersecting: boolean) =>
  act(() => {
    for (const callback of observerCallbacks) callback([{ isIntersecting }]);
  });

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useMomentRotation', () => {
  it('stays on the first picture until it is on screen, then rotates and wraps', () => {
    stubEnvironment();
    render(<Probe count={3} />);
    act(() => vi.advanceTimersByTime(MOMENT_PHOTO_DWELL_MS * 2));
    expect(state()).toMatchObject({ index: 0, running: false });

    seen(true);
    expect(state().running).toBe(true);
    act(() => vi.advanceTimersByTime(MOMENT_PHOTO_DWELL_MS));
    expect(state()).toMatchObject({ index: 1, previous: 0 });
    act(() => vi.advanceTimersByTime(MOMENT_PHOTO_DWELL_MS));
    expect(state()).toMatchObject({ index: 2, previous: 1 });
    act(() => vi.advanceTimersByTime(MOMENT_PHOTO_DWELL_MS));
    expect(state()).toMatchObject({ index: 0, previous: 2 });
  });

  it('lets a clip play longer than a photograph, but not forever', () => {
    stubEnvironment();
    render(<Probe count={2} clips={[0]} />);
    seen(true);
    act(() => vi.advanceTimersByTime(MOMENT_PHOTO_DWELL_MS));
    expect(state().index).toBe(0);
    act(() =>
      vi.advanceTimersByTime(MOMENT_CLIP_MAX_MS - MOMENT_PHOTO_DWELL_MS),
    );
    expect(state().index).toBe(1);
  });

  it('pauses when it leaves the screen and resumes when it returns', () => {
    stubEnvironment();
    render(<Probe count={3} />);
    seen(true);
    expect(state().running).toBe(true);
    seen(false);
    expect(state().running).toBe(false);
    act(() => vi.advanceTimersByTime(MOMENT_PHOTO_DWELL_MS * 3));
    expect(state().index).toBe(0);
    seen(true);
    expect(state().running).toBe(true);
  });

  it('pauses while the page is hidden', () => {
    stubEnvironment();
    render(<Probe count={3} />);
    seen(true);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(state().running).toBe(false);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(state().running).toBe(true);
  });

  it('never starts with reduced motion and never rotates a single picture', () => {
    stubEnvironment({ reducedMotion: true });
    render(<Probe count={3} />);
    seen(true);
    act(() => vi.advanceTimersByTime(MOMENT_PHOTO_DWELL_MS * 4));
    expect(state()).toMatchObject({ index: 0, rotates: false, running: false });
    cleanup();

    stubEnvironment();
    render(<Probe count={1} />);
    seen(true);
    act(() => vi.advanceTimersByTime(MOMENT_PHOTO_DWELL_MS * 4));
    expect(state()).toMatchObject({ index: 0, rotates: false });
  });
});
