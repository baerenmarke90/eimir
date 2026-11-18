// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const ready = vi.fn(() => Promise.resolve());
vi.mock('@capacitor/core', () => ({
  Capacitor: { isPluginAvailable: () => true },
  registerPlugin: () => ({ ready }),
}));
vi.mock('./config', () => ({ isAndroidApp: () => true }));

const {
  releaseLaunchScreenWhenPainted,
  resetLaunchScreenForTests,
  useLaunchScreenHold,
} = await import('./launchScreen');

function Hold() {
  useLaunchScreenHold();
  return null;
}

let frames: FrameRequestCallback[] = [];
const flushFrames = () => {
  while (frames.length) {
    const pending = frames;
    frames = [];
    for (const frame of pending) frame(0);
  }
};

beforeEach(() => {
  resetLaunchScreenForTests();
  ready.mockClear();
  frames = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('keeps the launch screen while a startup placeholder is mounted', () => {
  const view = render(<Hold />);
  releaseLaunchScreenWhenPainted();
  flushFrames();
  expect(ready).not.toHaveBeenCalled();

  view.unmount();
  flushFrames();
  expect(ready).toHaveBeenCalledTimes(1);
});

it('releases once after the replacing view has painted', () => {
  releaseLaunchScreenWhenPainted();
  releaseLaunchScreenWhenPainted();
  expect(ready).not.toHaveBeenCalled();
  flushFrames();
  releaseLaunchScreenWhenPainted();
  flushFrames();
  expect(ready).toHaveBeenCalledTimes(1);
});

it('does not release when a placeholder mounts before the paint', () => {
  releaseLaunchScreenWhenPainted();
  render(<Hold />);
  flushFrames();
  expect(ready).not.toHaveBeenCalled();
});
