// @vitest-environment jsdom

import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { describe, expect, it, vi } from 'vitest';
import * as platform from '../pwa';
import {
  confirmGoogleAccessInApp,
  readGoogleAppReturn,
  watchGoogleAppReturn,
  watchPhotoBrowserReturn,
} from './photoSources';

vi.mock('@capacitor/browser', () => ({
  Browser: { addListener: vi.fn(), open: vi.fn(), close: vi.fn() },
}));
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn() } }));
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

describe('Google sign-in returning to the app link', () => {
  it('reads only the fixed state/code or denial and ignores everything else', () => {
    expect(
      readGoogleAppReturn('de.eimir.app://photos/google?state=s1&code=c1'),
    ).toEqual({ state: 's1', code: 'c1' });
    expect(
      readGoogleAppReturn(
        'de.eimir.app://photos/google?state=s1&outcome=denied',
      ),
    ).toBe('denied');
    for (const url of [
      'de.eimir.app://photos/google?code=c1',
      'de.eimir.app://photos/google?state=s1',
      'de.eimir.app://photos/google?state=s1&code=c1&token=x',
      'de.eimir.app://calendar/google?state=s1&code=c1',
      'de.eimir.app://photos/other?state=s1&code=c1',
      'https://photos/google?state=s1&code=c1',
      'not a url',
    ])
      expect(readGoogleAppReturn(url)).toBeNull();
  });

  function appLinkListeners() {
    let open: (event: { url: string }) => void = () => {};
    let finished: () => void = () => {};
    const remove = vi.fn();
    vi.mocked(App.addListener).mockImplementation((async (
      _event: string,
      callback: (event: { url: string }) => void,
    ) => {
      open = callback;
      return { remove };
    }) as never);
    vi.mocked(Browser.addListener).mockImplementation((async (
      _event: string,
      callback: () => void,
    ) => {
      finished = callback;
      return { remove };
    }) as never);
    return {
      open: (url: string) => open({ url }),
      finished: () => finished(),
      remove,
    };
  }

  it('resolves with the link and removes both listeners', async () => {
    const listeners = appLinkListeners();
    const result = watchGoogleAppReturn(new AbortController().signal);
    await Promise.resolve();
    listeners.open('de.eimir.app://calendar/google?calendarGoogle=connected');
    listeners.open('de.eimir.app://photos/google?state=s1&code=c1');
    await expect(result).resolves.toEqual({ state: 's1', code: 'c1' });
    await vi.waitFor(() => expect(listeners.remove).toHaveBeenCalledTimes(2));
  });

  it('gives up only after the closed browser stays closed while eimir. is visible', async () => {
    vi.useFakeTimers();
    try {
      const listeners = appLinkListeners();
      visibility('visible');
      const result = watchGoogleAppReturn(new AbortController().signal);
      await vi.advanceTimersByTimeAsync(0);
      listeners.finished();
      let settled = false;
      void result.then(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(3_000);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(2_000);
      await expect(result).resolves.toBe('abandoned');
    } finally {
      vi.useRealTimers();
    }
  });

  it('lets a link that arrives right after the browser closed win', async () => {
    vi.useFakeTimers();
    try {
      const listeners = appLinkListeners();
      visibility('visible');
      const result = watchGoogleAppReturn(new AbortController().signal);
      await vi.advanceTimersByTimeAsync(0);
      listeners.finished();
      await vi.advanceTimersByTimeAsync(1_000);
      listeners.open('de.eimir.app://photos/google?state=s1&outcome=denied');
      await expect(result).resolves.toBe('denied');
    } finally {
      vi.useRealTimers();
    }
  });

  it('abandons when the task is cancelled', async () => {
    appLinkListeners();
    const controller = new AbortController();
    const result = watchGoogleAppReturn(controller.signal);
    controller.abort();
    await expect(result).resolves.toBe('abandoned');
  });
});

describe('confirming Google access once in the app', () => {
  function api() {
    return {
      startPhotoSelection: vi.fn().mockResolvedValue({
        id: 'selection',
        status: 'AUTHORIZING',
        authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?s=1',
      }),
      authorizePhotoSelection: vi
        .fn()
        .mockResolvedValue({ id: 'selection', status: 'PICKING' }),
      cancelPhotoSelection: vi.fn().mockResolvedValue(undefined),
    };
  }

  function prepare(url: string) {
    vi.mocked(platform.isCapacitorNative).mockReturnValue(true);
    vi.mocked(Browser.close).mockResolvedValue(undefined);
    let open: (event: { url: string }) => void = () => {};
    vi.mocked(App.addListener).mockImplementation((async (
      _event: string,
      callback: (event: { url: string }) => void,
    ) => {
      open = callback;
      return { remove: vi.fn() };
    }) as never);
    vi.mocked(Browser.addListener).mockImplementation((async () => ({
      remove: vi.fn(),
    })) as never);
    vi.mocked(Browser.open).mockImplementation((async () => {
      queueMicrotask(() => open({ url }));
    }) as never);
  }

  it('signs in through the app link, authorizes and drops the temporary task', async () => {
    prepare('de.eimir.app://photos/google?state=s1&code=c1');
    const photoApi = api();
    await expect(
      confirmGoogleAccessInApp(
        photoApi as never,
        'space',
        new AbortController().signal,
      ),
    ).resolves.toBe('confirmed');
    expect(photoApi.startPhotoSelection.mock.calls[0][0]).toMatchObject({
      photoSelectionCreate: { source: 'google', returnTo: 'app', maxItems: 1 },
    });
    expect(photoApi.authorizePhotoSelection.mock.calls[0][0]).toEqual({
      spaceId: 'space',
      selectionId: 'selection',
      photoSelectionAuthorize: { state: 's1', code: 'c1' },
    });
    expect(photoApi.cancelPhotoSelection).toHaveBeenCalledWith({
      spaceId: 'space',
      selectionId: 'selection',
    });
  });

  it('reports a denial without authorizing and still drops the task', async () => {
    prepare('de.eimir.app://photos/google?state=s1&outcome=denied');
    const photoApi = api();
    await expect(
      confirmGoogleAccessInApp(
        photoApi as never,
        'space',
        new AbortController().signal,
      ),
    ).resolves.toBe('denied');
    expect(photoApi.authorizePhotoSelection).not.toHaveBeenCalled();
    expect(photoApi.cancelPhotoSelection).toHaveBeenCalledTimes(1);
  });
});
