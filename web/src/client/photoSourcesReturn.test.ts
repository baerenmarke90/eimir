// @vitest-environment jsdom

import { Browser } from '@capacitor/browser';
import { describe, expect, it, vi } from 'vitest';
import * as platform from '../pwa';
import { watchPhotoBrowserReturn } from './photoSources';

vi.mock('@capacitor/browser', () => ({
  Browser: { addListener: vi.fn(), open: vi.fn(), close: vi.fn() },
}));
vi.mock('../pwa', () => ({ isCapacitorNative: vi.fn(() => false) }));

function visibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('return from Google Photos in the app', () => {
  it('counts a finished browser only while eimir. is visible again', async () => {
    vi.mocked(platform.isCapacitorNative).mockReturnValue(true);
    let finished: () => void = () => {};
    const remove = vi.fn();
    vi.mocked(Browser.addListener).mockImplementation(
      async (_event, callback) => {
        finished = callback as () => void;
        return { remove };
      },
    );
    const controller = new AbortController();
    visibility('hidden');
    const returned = watchPhotoBrowserReturn(controller.signal);
    await Promise.resolve();
    expect(returned()).toBe(false);
    // A hidden browser may report "finished" while the person still chooses.
    finished();
    expect(returned()).toBe(false);
    visibility('visible');
    expect(returned()).toBe(true);
    // Going back into the browser resets the return.
    visibility('hidden');
    visibility('visible');
    expect(returned()).toBe(false);
    controller.abort();
    await vi.waitFor(() => expect(remove).toHaveBeenCalled());
  });

  it('never reports a return on the Web', () => {
    vi.mocked(platform.isCapacitorNative).mockReturnValue(false);
    vi.mocked(Browser.addListener).mockClear();
    expect(watchPhotoBrowserReturn(new AbortController().signal)()).toBe(false);
    expect(Browser.addListener).not.toHaveBeenCalled();
  });
});
