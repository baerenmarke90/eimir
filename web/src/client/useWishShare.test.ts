// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const plugin = vi.hoisted(() => ({ share: vi.fn() }));
const runtime = vi.hoisted(() => ({ native: false }));
vi.mock('@capacitor/core', () => ({
  registerPlugin: () => plugin,
  Capacitor: { isNativePlatform: () => runtime.native },
}));

import { shareWish, wishShareMode } from './useWishShare';

const API = 'https://api.example/';
const BROWSER_URL = `${window.location.origin}/plan/wishes/wish-1`;
const NATIVE_URL = 'https://api.example/plan/wishes/wish-1';

beforeEach(() => {
  runtime.native = false;
  plugin.share.mockResolvedValue({ shared: true });
});
afterEach(() => {
  vi.unstubAllGlobals();
  plugin.share.mockReset();
});

describe('shareWish', () => {
  it('shares only the neutral address through the system sheet in a browser', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share });
    expect(wishShareMode()).toBe('webShare');
    expect(await shareWish(API, 'wish-1')).toBe('shared');
    expect(share).toHaveBeenCalledWith({ url: BROWSER_URL });
  });

  it('copies the address when the browser has no share sheet', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    expect(wishShareMode()).toBe('copy');
    expect(await shareWish(API, 'wish-1')).toBe('copied');
    expect(writeText).toHaveBeenCalledWith(BROWSER_URL);
  });

  it('fails closed when neither sharing nor clipboard exist', async () => {
    vi.stubGlobal('navigator', {});
    expect(await shareWish(API, 'wish-1')).toBe('failed');
  });

  it('treats closing the share sheet as a cancellation', async () => {
    const share = vi
      .fn()
      .mockRejectedValue(new DOMException('closed', 'AbortError'));
    vi.stubGlobal('navigator', { share });
    expect(await shareWish(API, 'wish-1')).toBe('cancelled');
  });

  it('reports a real share failure', async () => {
    const share = vi.fn().mockRejectedValue(new Error('boom'));
    vi.stubGlobal('navigator', { share });
    expect(await shareWish(API, 'wish-1')).toBe('failed');
  });

  it('uses the native chooser with the instance address and no text', async () => {
    runtime.native = true;
    expect(wishShareMode()).toBe('native');
    expect(await shareWish(API, 'wish-1')).toBe('shared');
    expect(plugin.share).toHaveBeenCalledTimes(1);
    expect(plugin.share).toHaveBeenCalledWith({ url: NATIVE_URL });
  });

  it('treats a cancelled native chooser as a cancellation', async () => {
    runtime.native = true;
    plugin.share.mockRejectedValue({ code: 'CANCELLED' });
    expect(await shareWish(API, 'wish-1')).toBe('cancelled');
  });
});
